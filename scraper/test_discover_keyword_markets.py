from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from scraper.discover_keyword_markets import (
    COUNTRY_NAMES,
    SUPPORTED_MARKETS,
    discover_keyword_markets,
    load_cached_result,
    save_cached_result,
)


class FakeSeries:
    def __init__(self, values, indexes=None):
        self.values = list(values)
        self.indexes = list(indexes or range(len(self.values)))

    def __iter__(self):
        return iter(self.values)

    def items(self):
        return zip(self.indexes, self.values)


class FakeFrame:
    def __init__(self, keyword, values, indexes=None):
        self.columns = [keyword]
        self.empty = False
        self.series = FakeSeries(values, indexes)

    def __getitem__(self, key):
        if key not in self.columns:
            raise KeyError(key)
        return self.series


class RateLimitError(RuntimeError):
    def __init__(self):
        super().__init__("429 Too Many Requests")
        self.response = type("Response", (), {"status_code": 429, "headers": {"Retry-After": "120"}})()


class FakeTrendRequest:
    def __init__(self, keyword="linen", failures=None, global_failure=None):
        self.keyword = keyword
        self.geo = ""
        self.calls = 0
        self.failures = dict(failures or {})
        self.global_failure = global_failure

    def build_payload(self, keywords, **kwargs):
        self.keyword = keywords[0]
        self.geo = kwargs.get("geo", "")

    def interest_by_region(self, **_kwargs):
        self.calls += 1
        if self.global_failure:
            raise self.global_failure()
        values = [90 - index * 4 for index in range(len(SUPPORTED_MARKETS))]
        return FakeFrame(self.keyword, values, [COUNTRY_NAMES[market] for market in SUPPORTED_MARKETS])

    def interest_over_time(self):
        self.calls += 1
        remaining = self.failures.get(self.geo, 0)
        if remaining:
            self.failures[self.geo] = remaining - 1
            raise RuntimeError("temporary provider failure")
        offset = SUPPORTED_MARKETS.index(self.geo)
        return FakeFrame(self.keyword, [20 + offset + value for value in range(12)])


class KeywordMarketDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 7, 20, tzinfo=timezone.utc)

    def test_all_twelve_markets_are_bounded_and_structured(self):
        provider = FakeTrendRequest()
        result = discover_keyword_markets(
            " Linen ",
            provider,
            now=self.now,
            sleeper=lambda _seconds: None,
            request_delay_seconds=0,
        )
        self.assertEqual(result["canonicalKeyword"], "linen")
        self.assertEqual([item["market"] for item in result["markets"]], list(SUPPORTED_MARKETS))
        self.assertEqual(result["providerCalls"], 13)
        self.assertLessEqual(result["providerCalls"], result["maximumProviderCalls"])
        self.assertEqual(result["markets"][0]["normalizedInterest"], 90)
        for market in result["markets"]:
            self.assertEqual(market["observationCompleteness"], 1)
            self.assertEqual(market["confidence"], 1)
            self.assertIsNone(market["failureReason"])
            self.assertEqual(market["providerTimestamp"], "2026-07-20T00:00:00Z")
            self.assertIn("attempts", market["retryInformation"])

    def test_one_market_failure_does_not_discard_other_markets(self):
        provider = FakeTrendRequest(failures={"DE": 3})
        result = discover_keyword_markets(
            "linen",
            provider,
            now=self.now,
            sleeper=lambda _seconds: None,
            request_delay_seconds=0,
        )
        germany = next(item for item in result["markets"] if item["market"] == "DE")
        france = next(item for item in result["markets"] if item["market"] == "FR")
        japan = next(item for item in result["markets"] if item["market"] == "JP")
        self.assertRegex(germany["failureReason"], r"google_trends_unavailable")
        self.assertEqual(germany["confidence"], 0)
        self.assertIsNone(france["failureReason"])
        self.assertIsNone(japan["failureReason"])
        self.assertEqual(len(result["markets"]), 12)
        self.assertLessEqual(result["providerCalls"], 18)

    def test_global_rate_limit_opens_circuit_and_returns_retry_for_every_market(self):
        provider = FakeTrendRequest(global_failure=RateLimitError)
        result = discover_keyword_markets(
            "linen",
            provider,
            now=self.now,
            sleeper=lambda _seconds: None,
            request_delay_seconds=0,
        )
        self.assertEqual(result["providerCalls"], 3)
        self.assertEqual(len(result["markets"]), 12)
        self.assertTrue(all(item["failureReason"] == "google_trends_rate_limited" for item in result["markets"]))
        self.assertTrue(all(item["retryInformation"]["rateLimited"] for item in result["markets"]))
        self.assertTrue(all(item["retryInformation"]["retryAfterSeconds"] == 120 for item in result["markets"]))

    def test_cache_avoids_provider_calls_for_fresh_exact_market_result(self):
        result = discover_keyword_markets(
            "linen",
            FakeTrendRequest(),
            now=self.now,
            sleeper=lambda _seconds: None,
            request_delay_seconds=0,
        )
        with tempfile.TemporaryDirectory() as directory:
            cache_directory = Path(directory)
            save_cached_result(cache_directory, result)
            cached = load_cached_result(cache_directory, "linen", self.now, 24)
        self.assertIsNotNone(cached)
        self.assertTrue(cached["cacheHit"])
        self.assertEqual(cached["providerCalls"], 0)


if __name__ == "__main__":
    unittest.main()
