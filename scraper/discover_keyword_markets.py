from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import os
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable


logger = logging.getLogger("keyword-market-discovery")

SUPPORTED_MARKETS = ("IN", "US", "GB", "FR", "IT", "DE", "JP", "KR", "AU", "BR", "SG", "AE")
COUNTRY_NAMES = {
    "IN": "India",
    "US": "United States",
    "GB": "United Kingdom",
    "FR": "France",
    "IT": "Italy",
    "DE": "Germany",
    "JP": "Japan",
    "KR": "South Korea",
    "AU": "Australia",
    "BR": "Brazil",
    "SG": "Singapore",
    "AE": "United Arab Emirates",
}
DEFAULT_MAX_PROVIDER_CALLS = 18
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_REQUEST_DELAY_SECONDS = 12.0
DEFAULT_CACHE_TTL_HOURS = 24
MINIMUM_GLOBAL_QUOTA_DEFERRAL_SECONDS = 6 * 60 * 60
MAXIMUM_IN_RUN_RETRY_SLEEP_SECONDS = 60


class ProviderCallBudgetExceeded(RuntimeError):
    pass


@dataclass
class CallBudget:
    maximum: int
    used: int = 0

    def consume(self) -> None:
        if self.used >= self.maximum:
            raise ProviderCallBudgetExceeded("provider_call_budget_exhausted")
        self.used += 1


def canonicalize_keyword(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    normalized = "".join(character for character in normalized if not unicodedata.combining(character))
    return " ".join(normalized.strip().lower().split())


def utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _status_code(error: BaseException) -> int | None:
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    try:
        return int(status) if status is not None else None
    except (TypeError, ValueError):
        return None


def is_rate_limit_error(error: BaseException) -> bool:
    message = str(error).lower()
    return _status_code(error) == 429 or "429" in message or "too many requests" in message or "rate limit" in message


def retry_after_seconds(error: BaseException, attempt: int, now: datetime) -> int:
    response = getattr(error, "response", None)
    headers = getattr(response, "headers", {}) or {}
    value = headers.get("Retry-After") or headers.get("retry-after")
    if value:
        try:
            return max(1, min(86400, int(float(value))))
        except (TypeError, ValueError):
            try:
                parsed = parsedate_to_datetime(str(value))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return max(1, min(86400, math.ceil((parsed - now).total_seconds())))
            except (TypeError, ValueError, OverflowError):
                pass
    return min(900, 5 * (3 ** max(0, attempt - 1)))


def _retry_info(*, attempts: int, maximum: int, rate_limited: bool, retry_seconds: int | None, now: datetime) -> dict[str, Any]:
    return {
        "attempts": attempts,
        "maxAttempts": maximum,
        "rateLimited": rate_limited,
        "retryAfterSeconds": retry_seconds,
        "nextRetryAt": utc_iso(now + timedelta(seconds=retry_seconds)) if retry_seconds else None,
    }


def _call_with_retry(
    operation: Callable[[], Any],
    *,
    budget: CallBudget,
    maximum_attempts: int,
    now: datetime,
    sleeper: Callable[[float], None],
) -> tuple[Any | None, dict[str, Any], str | None]:
    last_error: BaseException | None = None
    for attempt in range(1, maximum_attempts + 1):
        try:
            budget.consume()
            value = operation()
            return value, _retry_info(attempts=attempt, maximum=maximum_attempts, rate_limited=False, retry_seconds=None, now=now), None
        except ProviderCallBudgetExceeded:
            return None, _retry_info(attempts=attempt - 1, maximum=maximum_attempts, rate_limited=False, retry_seconds=3600, now=now), "provider_call_budget_exhausted"
        except Exception as error:  # pytrends exposes requests errors and generic ResponseError
            last_error = error
            rate_limited = is_rate_limit_error(error)
            delay = retry_after_seconds(error, attempt, now)
            if attempt < maximum_attempts:
                # A workflow run may make a few bounded retries, but it must never
                # sleep until the next shared-provider quota window.
                sleeper(min(delay, MAXIMUM_IN_RUN_RETRY_SLEEP_SECONDS))
                continue
            if rate_limited:
                delay = max(delay, MINIMUM_GLOBAL_QUOTA_DEFERRAL_SECONDS)
            reason = "google_trends_rate_limited" if rate_limited else f"google_trends_unavailable:{type(error).__name__}"
            return None, _retry_info(attempts=attempt, maximum=maximum_attempts, rate_limited=rate_limited, retry_seconds=delay, now=now), reason
    raise AssertionError(f"unreachable retry state: {last_error}")


def _numeric_values(series: Any) -> list[float]:
    values: list[float] = []
    for value in list(series):
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            values.append(number)
    return values


def _series_metrics(dataframe: Any, keyword: str) -> tuple[float, float]:
    if dataframe is None or getattr(dataframe, "empty", True) or keyword not in dataframe.columns:
        return 0.0, 0.0
    values = _numeric_values(dataframe[keyword])
    if not values:
        return 0.0, 0.0
    completeness = min(1.0, len(values) / 12.0)
    recent = values[-4:]
    previous = values[-8:-4]
    recent_average = sum(recent) / len(recent)
    if not previous:
        momentum = 0.0
    else:
        previous_average = sum(previous) / len(previous)
        if previous_average <= 0:
            momentum = 100.0 if recent_average > 0 else 0.0
        else:
            momentum = max(-100.0, min(100.0, ((recent_average - previous_average) / previous_average) * 100.0))
    return round(momentum, 4), round(completeness, 4)


def _cross_market_interest(dataframe: Any, keyword: str, market: str) -> float | None:
    if dataframe is None or getattr(dataframe, "empty", True) or keyword not in dataframe.columns:
        return None
    wanted = {market.casefold(), COUNTRY_NAMES[market].casefold()}
    for index, value in dataframe[keyword].items():
        if str(index).strip().casefold() not in wanted:
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return round(max(0.0, min(100.0, number)), 4) if math.isfinite(number) else None
    return None


def _empty_market_result(market: str, now: datetime, retry: dict[str, Any], failure_reason: str) -> dict[str, Any]:
    return {
        "market": market,
        "normalizedInterest": 0.0,
        "recentMomentum": 0.0,
        "confidence": 0.0,
        "observationCompleteness": 0.0,
        "providerTimestamp": utc_iso(now),
        "retryInformation": retry,
        "failureReason": failure_reason,
    }


def discover_keyword_markets(
    keyword: str,
    trend_request: Any,
    *,
    now: datetime | None = None,
    sleeper: Callable[[float], None] = time.sleep,
    maximum_provider_calls: int = DEFAULT_MAX_PROVIDER_CALLS,
    maximum_attempts: int = DEFAULT_MAX_ATTEMPTS,
    request_delay_seconds: float = DEFAULT_REQUEST_DELAY_SECONDS,
) -> dict[str, Any]:
    canonical_keyword = canonicalize_keyword(keyword)
    if not canonical_keyword or len(canonical_keyword) > 120:
        raise ValueError("keyword must contain 1-120 normalized characters")
    if maximum_provider_calls < 1 or maximum_provider_calls > 36:
        raise ValueError("maximum_provider_calls must be between 1 and 36")
    if maximum_attempts < 1 or maximum_attempts > 3:
        raise ValueError("maximum_attempts must be between 1 and 3")

    observed_at = now or datetime.now(timezone.utc)
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)
    budget = CallBudget(maximum_provider_calls)

    def fetch_regions() -> Any:
        trend_request.build_payload([canonical_keyword], cat=0, timeframe="today 3-m", geo="", gprop="")
        return trend_request.interest_by_region(resolution="COUNTRY", inc_low_vol=True, inc_geo_code=False)

    cross_data, cross_retry, cross_failure = _call_with_retry(
        fetch_regions,
        budget=budget,
        maximum_attempts=maximum_attempts,
        now=observed_at,
        sleeper=sleeper,
    )
    results: list[dict[str, Any]] = []

    # A global 429 is a circuit breaker: consuming another twelve geo requests in the
    # same run is unsafe. Every market is still returned with explicit retry metadata.
    if cross_failure == "google_trends_rate_limited":
        for market in SUPPORTED_MARKETS:
            results.append(_empty_market_result(market, observed_at, cross_retry, cross_failure))
        return {
            "schemaVersion": "repo-pytrends-market-discovery-v1",
            "provider": "google_trends_pytrends",
            "canonicalKeyword": canonical_keyword,
            "generatedAt": utc_iso(observed_at),
            "cacheHit": False,
            "providerCalls": budget.used,
            "maximumProviderCalls": budget.maximum,
            "markets": results,
        }

    circuit_retry: dict[str, Any] | None = None
    circuit_reason: str | None = None
    for index, market in enumerate(SUPPORTED_MARKETS):
        if circuit_reason:
            results.append(_empty_market_result(market, observed_at, circuit_retry or cross_retry, circuit_reason))
            continue

        def fetch_timeline() -> Any:
            trend_request.build_payload([canonical_keyword], cat=0, timeframe="today 3-m", geo=market, gprop="")
            return trend_request.interest_over_time()

        timeline, local_retry, local_failure = _call_with_retry(
            fetch_timeline,
            budget=budget,
            maximum_attempts=maximum_attempts,
            now=observed_at,
            sleeper=sleeper,
        )
        if local_failure:
            results.append(_empty_market_result(market, observed_at, local_retry, local_failure))
            if local_failure in ("google_trends_rate_limited", "provider_call_budget_exhausted"):
                circuit_retry, circuit_reason = local_retry, local_failure
            continue

        momentum, completeness = _series_metrics(timeline, canonical_keyword)
        normalized_interest = _cross_market_interest(cross_data, canonical_keyword, market)
        failure_reason = cross_failure
        if normalized_interest is None:
            local_values = _numeric_values(timeline[canonical_keyword]) if timeline is not None and canonical_keyword in timeline.columns else []
            normalized_interest = round(sum(local_values[-4:]) / max(1, len(local_values[-4:])), 4)
            failure_reason = cross_failure or "cross_market_interest_unavailable"
        confidence_ceiling = 1.0 if cross_failure is None else 0.7
        confidence = round(min(confidence_ceiling, (0.45 if cross_failure is None else 0.2) + completeness * 0.55), 4)
        results.append({
            "market": market,
            "normalizedInterest": normalized_interest,
            "recentMomentum": momentum,
            "confidence": confidence,
            "observationCompleteness": completeness,
            "providerTimestamp": utc_iso(observed_at),
            "retryInformation": local_retry,
            "failureReason": failure_reason,
        })
        if request_delay_seconds > 0 and index < len(SUPPORTED_MARKETS) - 1:
            sleeper(request_delay_seconds)

    return {
        "schemaVersion": "repo-pytrends-market-discovery-v1",
        "provider": "google_trends_pytrends",
        "canonicalKeyword": canonical_keyword,
        "generatedAt": utc_iso(observed_at),
        "cacheHit": False,
        "providerCalls": budget.used,
        "maximumProviderCalls": budget.maximum,
        "markets": results,
    }


def _cache_path(cache_directory: Path, canonical_keyword: str) -> Path:
    digest = hashlib.sha256(canonical_keyword.encode("utf-8")).hexdigest()
    return cache_directory / f"{digest}.json"


def load_cached_result(cache_directory: Path, canonical_keyword: str, now: datetime, ttl_hours: int) -> dict[str, Any] | None:
    path = _cache_path(cache_directory, canonical_keyword)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        generated_at = datetime.fromisoformat(str(payload["generatedAt"]).replace("Z", "+00:00"))
        markets = [item.get("market") for item in payload.get("markets", [])]
        if payload.get("canonicalKeyword") != canonical_keyword or markets != list(SUPPORTED_MARKETS):
            return None
        if now - generated_at > timedelta(hours=ttl_hours):
            return None
        payload["cacheHit"] = True
        payload["providerCalls"] = 0
        return payload
    except (OSError, ValueError, KeyError, TypeError):
        return None


def save_cached_result(cache_directory: Path, payload: dict[str, Any]) -> None:
    cache_directory.mkdir(parents=True, exist_ok=True)
    path = _cache_path(cache_directory, payload["canonicalKeyword"])
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
    temporary.replace(path)


def build_trend_request() -> Any:
    from pytrends.request import TrendReq

    # Retry is intentionally owned by this module so provider calls stay inside one
    # explicit budget. urllib3 retries here would multiply the bounded outer retry.
    return TrendReq(hl="en-US", tz=330, timeout=(10, 30), retries=0, backoff_factor=0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Discover isolated Google Trends market interest for one arbitrary fashion keyword.")
    parser.add_argument("--keyword", required=True)
    parser.add_argument("--cache-dir", default=".cache/trend-styling-market-discovery")
    parser.add_argument("--cache-ttl-hours", type=int, default=int(os.getenv("TREND_MARKET_DISCOVERY_CACHE_TTL_HOURS", str(DEFAULT_CACHE_TTL_HOURS))))
    parser.add_argument("--max-provider-calls", type=int, default=int(os.getenv("TREND_MARKET_DISCOVERY_MAX_PROVIDER_CALLS", str(DEFAULT_MAX_PROVIDER_CALLS))))
    parser.add_argument("--max-attempts", type=int, default=int(os.getenv("TREND_MARKET_DISCOVERY_MAX_ATTEMPTS", str(DEFAULT_MAX_ATTEMPTS))))
    parser.add_argument("--request-delay-seconds", type=float, default=float(os.getenv("TREND_MARKET_DISCOVERY_REQUEST_DELAY_SECONDS", str(DEFAULT_REQUEST_DELAY_SECONDS))))
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = parse_args()
    now = datetime.now(timezone.utc)
    canonical_keyword = canonicalize_keyword(args.keyword)
    cache_directory = Path(args.cache_dir)
    cached = load_cached_result(cache_directory, canonical_keyword, now, args.cache_ttl_hours)
    if cached:
        print(json.dumps(cached, separators=(",", ":")))
        return 0
    payload = discover_keyword_markets(
        canonical_keyword,
        build_trend_request(),
        now=now,
        maximum_provider_calls=args.max_provider_calls,
        maximum_attempts=args.max_attempts,
        request_delay_seconds=args.request_delay_seconds,
    )
    save_cached_result(cache_directory, payload)
    print(json.dumps(payload, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
