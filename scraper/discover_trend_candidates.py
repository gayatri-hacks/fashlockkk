from __future__ import annotations

import argparse
import hashlib
import logging
import os
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import requests
from dotenv import load_dotenv
from supabase import create_client


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("trend-candidates")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
NOW = datetime.now(timezone.utc)

COLOR_WORDS = {
    "black", "white", "grey", "gray", "beige", "brown", "cream", "ivory", "camel", "tan",
    "charcoal", "blue", "navy", "cobalt", "teal", "denim", "sky", "powder", "ice",
    "green", "olive", "khaki", "sage", "mint", "forest", "bottle", "lime", "emerald", "pista",
    "red", "pink", "maroon", "burgundy", "wine", "rust", "coral", "salmon", "blush", "rose",
    "fuchsia", "magenta", "cherry", "crimson", "brick", "tomato", "yellow", "orange",
    "mustard", "gold", "amber", "peach", "apricot", "lemon", "saffron", "marigold",
    "butter", "purple", "lavender", "violet", "lilac", "mauve", "plum", "silver",
}

GENERIC_SINGLE_WORDS = {
    "dress", "top", "fashion", "style", "women", "woman", "men", "man", "look", "outfit",
    "clothing", "apparel", "wardrobe", "trend", "trends", "new", "latest", "editorial",
    "article", "story", "news", "summer", "winter", "autumn", "fall", "spring",
    "shop", "shopping", "piece", "pieces", "wear", "collection",
}

NOISE_TOKENS = {
    "sale", "discount", "offer", "under", "price", "prices", "buy", "viral", "must", "best",
    "gift", "today", "2026", "2025", "2024", "pack", "combo", "fabric", "material",
}

PRODUCT_NOISE_TOKENS = {
    "solid", "classic", "premium", "vintage", "smooth", "misty", "midnight", "graffito",
    "sacramento", "trail", "linear", "elegance", "luxury", "smart", "formal", "casual",
    "party", "daily", "double", "single", "regular", "comfort", "soft", "rich", "bold",
    "timeless", "essential", "signature", "heritage", "finish", "wash", "washed",
}

FASHION_SIGNAL_WORDS = {
    "core", "aesthetic", "silhouette", "sheer", "suede", "linen", "capri", "mini", "maxi",
    "oversized", "cargo", "utility", "layering", "tailoring", "tonal", "monochrome",
    "mesh", "crochet", "satin", "denim", "velvet", "leather", "ballet", "fisherman",
    "barrel", "wide", "kitten", "coquette", "siren", "luxury", "romcom", "office",
    "draped", "boxy", "oxford", "striped", "east", "west",
}

GARMENT_HEADS = {
    "pants", "trousers", "jeans", "skirt", "dress", "coat", "jacket", "blazer", "shirt",
    "shorts", "cardigan", "knit", "tee", "tshirt", "top", "waistcoat", "hoodie", "sweater",
    "kurta", "saree", "sari", "lehenga", "overshirt", "waistcoat", "co-ord", "coord", "vest",
}

ACCESSORY_HEADS = {
    "bag", "bags", "flats", "sandals", "heels", "loafers", "boots", "sneakers", "trainer",
    "trainers", "belt", "scarf", "necklace", "earrings", "ring", "rings", "bangles",
    "jewellery", "jewelry", "clutch", "mule", "mules", "pumps",
}

FABRIC_WORDS = {
    "linen", "suede", "mesh", "denim", "satin", "silk", "cotton", "velvet", "leather",
    "crochet", "lace", "chiffon", "organza", "tweed", "corduroy", "oxford", "crepe",
}

PRINT_WORDS = {"striped", "floral", "polka", "checked", "check", "paisley", "tie-dye", "tiedye"}
SILHOUETTE_PHRASES = {
    "boxy fit", "wide leg", "straight leg", "relaxed fit", "slim fit", "oversized fit",
    "cropped fit", "barrel leg", "barrel jeans", "mini skirt", "maxi dress", "capri pants",
}
STYLING_PHRASES = {
    "sheer layering", "soft tailoring", "tonal dressing", "power dressing", "monochrome styling",
}
AESTHETIC_PHRASES = {
    "office siren", "quiet luxury", "soft power", "old money", "clean girl", "tomato girl",
    "mob wife", "coastal grandma", "indie sleaze", "fisherman aesthetic", "balletcore",
    "blokecore", "coquette", "romcom core", "moto boho",
}
ACCESSORY_PHRASES = {"east west bag", "kitten heels", "fisherman sandals", "ballet flats", "suede bag"}
COLOR_TREND_PHRASES = {
    "butter yellow", "powder pink", "powder blue", "cherry red", "tomato red", "olive green",
    "sage green", "sky blue", "ice blue", "pista green", "burgundy red",
}

ALLOWED_TWO_TOKEN_GARMENTS = {
    "oxford shirt", "striped kurta", "cropped jacket", "cropped shirt", "cropped blazer",
    "cargo pants", "utility jacket", "utility skirt", "corduroy overshirt", "denim overshirt",
    "mesh flats", "satin skirt", "suede bag", "linen shirt", "linen trousers", "boxy blazer",
    "barrel jeans", "mini dress", "maxi skirt",
}

ALLOWED_THREE_TOKEN_GARMENTS = {
    "wide leg trousers", "wide leg jeans", "straight leg trousers", "straight leg jeans",
    "boxy fit shirt", "boxy fit kurta", "cropped fit shirt", "east west bag", "butter yellow bag",
    "powder pink dress", "sage green shirt", "olive green jacket", "sheer lace top",
}

BRAND_BLOCKLIST = {
    "zara", "mango", "uniqlo", "cos", "arket", "toteme", "massimo", "dutti", "dior",
    "chanel", "prada", "gucci", "miu", "myntra", "ajio", "nykaa", "flipkart",
}

SERPER_EXPANSION_SUFFIXES = [
    "outfit formula fashion",
    "street style fashion",
    "emerging aesthetic fashion",
    "this season fashion trend",
    "2026 fashion trend",
    "India fashion trend",
]

SERPER_DISCOVERY_QUERIES = [
    ("fashion week runway silhouette trend 2026", "runway_report"),
    ("street style fashion week outfit formula 2026", "runway_report"),
    ("celebrity wore fashion trend 2026", "celebrity_style"),
    ("celebrity street style outfit formula 2026", "celebrity_style"),
    ("emerging fashion aesthetic this season 2026", "fashion_news"),
    ("how people are styling fashion trend this season", "fashion_news"),
    ("India fashion trend 2026 outfit styling", "fashion_news"),
    ("Indian wedding festive trend 2026 fashion", "fashion_news"),
]

SERPER_REDDIT_QUERIES = [
    ("site:reddit.com/r/IndianFashionAddicts India fashion trend outfit styling", "reddit"),
    ("site:reddit.com/r/femalefashionadvice outfit formula aesthetic trend", "reddit"),
    ("site:reddit.com/r/malefashionadvice street style silhouette trend", "reddit"),
    ("site:reddit.com/r/streetwear emerging aesthetic street style", "reddit"),
    ("site:reddit.com/r/handbags east west bag suede bag trend", "reddit"),
    ("site:reddit.com/r/IndianFashionAddicts wedding festive styling trend", "reddit"),
    ("site:reddit.com/r/femalefashionadvice college casual styling outfit", "reddit"),
]

SERPER_FORUM_QUERIES = [
    ("site:thefashionspot.com forum runway trend silhouette styling", "fashion_forum"),
    ("site:purseblog.com forum emerging bag trend east west suede", "fashion_forum"),
    ("site:styleforum.net outfit formula street style trend", "fashion_forum"),
    ("site:styleforum.net summer 2026 fashion trend styling", "fashion_forum"),
]

PHRASE_NORMALIZATION_ALIASES = {
    "eastwest": "east west bag",
    "eastwest bag": "east west bag",
    "eastwest bags": "east west bag",
    "east west": "east west bag",
    "east west bag": "east west bag",
    "east west bags": "east west bag",
    "east west clutch": "east west bag",
    "suede bags": "suede bag",
    "boxyfit": "boxy fit",
    "sagegreen": "sage green",
    "bluecrepe shirt": "blue crepe shirt",
    "bluestriped kurta": "blue striped kurta",
    "silkdress": "silk dress",
}


@dataclass
class SourceDocument:
    source_type: str
    source_name: str
    source_url: str | None
    text: str
    evidence_kind: str
    observed_at: datetime
    metadata: dict[str, object] = field(default_factory=dict)
    is_title: bool = False
    is_product: bool = False
    is_new_arrival: bool = False
    is_related_query: bool = False
    is_reddit: bool = False


@dataclass
class Evidence:
    phrase: str
    normalized_phrase: str
    category: str
    source_type: str
    source_name: str
    source_url: str | None
    source_key: str
    context: str
    evidence_kind: str
    observed_at: datetime
    metadata: dict[str, object] = field(default_factory=dict)
    is_title: bool = False
    is_product: bool = False
    is_new_arrival: bool = False
    is_related_query: bool = False
    is_reddit: bool = False


@dataclass
class CandidateAggregate:
    phrase: str
    normalized_phrase: str
    category: str
    evidence_items: list[Evidence] = field(default_factory=list)
    source_types: set[str] = field(default_factory=set)
    evidence_count: int = 0
    title_hits: int = 0
    product_hits: int = 0
    new_arrival_hits: int = 0
    related_query_hits: int = 0
    reddit_hits: int = 0
    editorial_hits: int = 0
    fashion_news_hits: int = 0
    runway_hits: int = 0
    celebrity_hits: int = 0
    first_seen_at: datetime | None = None
    latest_seen_at: datetime | None = None
    best_evidence: Evidence | None = None
    confidence_score: float = 0.0
    source_diversity: int = 0
    growth_velocity: float = 0.0
    recency_score: float = 0.0
    emergence_stage: str = "emerging"
    supporting_evidence: list[dict[str, object]] = field(default_factory=list)


def load_environment() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / ".env.local", override=True)
    load_dotenv(SCRIPT_DIR / ".env", override=True)


def get_supabase():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("Missing Supabase environment variables.")
    return create_client(url, key)


def normalize_phrase(value: str) -> str:
    value = value.lower().replace("&", " and ").replace("/", " ")
    value = value.replace("’", "'").replace("-", " ")
    value = re.sub(r"[^a-z0-9' ]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return PHRASE_NORMALIZATION_ALIASES.get(value, value)


def tokenize(text: str) -> list[str]:
    return [token for token in normalize_phrase(text).split() if token]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_timestamp(value: str | None) -> datetime:
    if not value:
        return NOW
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return ensure_utc(parsed)
    except ValueError:
        return NOW


def infer_existing_evidence_flags(row: dict) -> tuple[bool, bool, bool, bool, bool]:
    source_type = str(row.get("source_type") or "")
    evidence_kind = str(row.get("evidence_kind") or "")
    observed_at = parse_timestamp(str(row.get("observed_at") or ""))
    recent_cutoff = NOW - timedelta(days=45)
    is_product = source_type == "product_catalog"
    is_new_arrival = is_product and observed_at >= recent_cutoff
    is_related_query = source_type == "google_related_query" or evidence_kind == "related_query"
    is_reddit = source_type == "reddit"
    is_title = evidence_kind in {
        "headline",
        "post",
        "product_title",
        "related_query",
        "search_result",
        "title",
        "subtitle",
    }
    return is_title, is_product, is_new_arrival, is_related_query, is_reddit


def evidence_from_stored_row(row: dict) -> Evidence:
    normalized = normalize_phrase(str(row.get("normalized_phrase") or row.get("phrase") or ""))
    phrase = normalize_phrase(str(row.get("phrase") or normalized))
    observed_at = parse_timestamp(str(row.get("observed_at") or ""))
    is_title, is_product, is_new_arrival, is_related_query, is_reddit = infer_existing_evidence_flags(row)
    return Evidence(
        phrase=phrase,
        normalized_phrase=normalized,
        category=category_for_phrase(normalized),
        source_type=str(row.get("source_type") or ""),
        source_name=str(row.get("source_name") or ""),
        source_url=row.get("source_url"),
        source_key=str(row.get("source_key") or ""),
        context=str(row.get("context") or ""),
        evidence_kind=str(row.get("evidence_kind") or ""),
        observed_at=observed_at,
        metadata=row.get("metadata") or {},
        is_title=is_title,
        is_product=is_product,
        is_new_arrival=is_new_arrival,
        is_related_query=is_related_query,
        is_reddit=is_reddit,
    )


def clean_phrase_tokens(tokens: list[str]) -> list[str]:
    cleaned = [token for token in tokens if token not in PRODUCT_NOISE_TOKENS and token not in BRAND_BLOCKLIST]
    while cleaned and cleaned[0] in COLOR_WORDS and len(cleaned) > 2 and cleaned[-1] not in GARMENT_HEADS and cleaned[-1] not in ACCESSORY_HEADS:
        cleaned = cleaned[1:]
    return cleaned


def category_for_phrase(phrase: str) -> str:
    normalized = normalize_phrase(phrase)
    if normalized in AESTHETIC_PHRASES or normalized.endswith(" core") or normalized.endswith(" aesthetic"):
        return "aesthetic"
    if normalized in COLOR_TREND_PHRASES:
        return "color"
    if normalized in STYLING_PHRASES:
        return "styling"
    if normalized in SILHOUETTE_PHRASES:
        return "silhouette"
    if normalized in ACCESSORY_PHRASES:
        return "accessory"

    tokens = normalized.split()
    if not tokens:
        return "other"
    if tokens[-1] in ACCESSORY_HEADS:
        return "accessory"
    if tokens[-1] in GARMENT_HEADS:
        return "garment"
    if any(token in FABRIC_WORDS for token in tokens):
        return "fabric"
    if "fit" in tokens or any(token in {"wide", "straight", "boxy", "barrel", "cropped"} for token in tokens):
        return "silhouette"
    if any(token in COLOR_WORDS for token in tokens):
        return "color"
    return "other"


def looks_like_noise(phrase: str) -> bool:
    tokens = tokenize(phrase)
    if not tokens:
        return True
    if len(tokens) == 1 and tokens[0] in GENERIC_SINGLE_WORDS:
        return True
    if any(token in NOISE_TOKENS for token in tokens):
        return True
    if all(token in COLOR_WORDS for token in tokens) and normalize_phrase(phrase) not in COLOR_TREND_PHRASES:
        return True
    if len(tokens) > 4:
        return True
    return False


def has_fashion_signal(phrase: str) -> bool:
    normalized = normalize_phrase(phrase)
    tokens = set(normalized.split())
    return bool(
        tokens & FASHION_SIGNAL_WORDS
        or normalized in AESTHETIC_PHRASES
        or normalized in STYLING_PHRASES
        or normalized in SILHOUETTE_PHRASES
        or normalized in ACCESSORY_PHRASES
        or normalized in COLOR_TREND_PHRASES
        or normalized.endswith(" core")
        or normalized.endswith(" aesthetic")
    )


def is_brand_noise(phrase: str, brand_terms: set[str]) -> bool:
    tokens = set(tokenize(phrase))
    if not tokens:
        return True
    if tokens <= brand_terms and not has_fashion_signal(phrase):
        return True
    return False


def is_valid_structured_phrase(tokens: list[str]) -> bool:
    phrase = " ".join(tokens)
    if phrase in AESTHETIC_PHRASES or phrase in COLOR_TREND_PHRASES or phrase in STYLING_PHRASES or phrase in SILHOUETTE_PHRASES or phrase in ACCESSORY_PHRASES:
        return True
    if phrase in ALLOWED_TWO_TOKEN_GARMENTS or phrase in ALLOWED_THREE_TOKEN_GARMENTS:
        return True
    if len(tokens) == 2 and tokens[-1] in GARMENT_HEADS | ACCESSORY_HEADS:
        return tokens[0] in FABRIC_WORDS | PRINT_WORDS | {"oxford", "cargo", "utility", "striped", "capri", "mini", "maxi", "cropped", "boxy", "ballet", "fisherman", "suede", "linen", "corduroy"}
    if len(tokens) == 2 and phrase in {"boxy fit", "wide leg", "straight leg", "relaxed fit", "slim fit", "east west"}:
        return True
    if len(tokens) == 3:
        if phrase in ALLOWED_THREE_TOKEN_GARMENTS:
            return True
        if tokens[-1] in GARMENT_HEADS | ACCESSORY_HEADS:
            allowed_modifiers = FABRIC_WORDS | PRINT_WORDS | COLOR_WORDS | {"wide", "straight", "boxy", "capri", "mini", "maxi", "cropped", "east", "west", "cargo", "utility", "sheer", "oxford", "ballet", "fisherman"}
            return all(token in allowed_modifiers for token in tokens[:-1]) and any(token in FASHION_SIGNAL_WORDS or token in FABRIC_WORDS or token in PRINT_WORDS for token in tokens[:-1])
        return phrase in {"boxy fit shirt", "wide leg jeans", "wide leg trousers", "straight leg jeans", "straight leg trousers"}
    if len(tokens) == 4:
        return phrase in {"wide leg linen trousers", "butter yellow suede bag", "sheer lace cropped top"}
    return False


def extract_candidate_phrases(text: str) -> set[str]:
    normalized_text = normalize_phrase(text)
    results: set[str] = set()

    for phrase in AESTHETIC_PHRASES | COLOR_TREND_PHRASES | STYLING_PHRASES | SILHOUETTE_PHRASES | ACCESSORY_PHRASES:
        if re.search(rf"\b{re.escape(phrase)}\b", normalized_text):
            results.add(phrase)

    core_matches = re.findall(r"\b[a-z]+core\b", normalized_text)
    for match in core_matches:
        results.add(match)

    tokens = tokenize(normalized_text)
    for size in (2, 3, 4):
        for index in range(len(tokens) - size + 1):
            window = clean_phrase_tokens(tokens[index:index + size])
            if len(window) != size:
                continue
            phrase = " ".join(window)
            if is_valid_structured_phrase(window):
                results.add(phrase)

    return {phrase for phrase in results if phrase}


def candidate_allowed(phrase: str, existing_keywords: set[str], brand_terms: set[str]) -> bool:
    normalized = normalize_phrase(phrase)
    tokens = normalized.split()
    if not normalized or normalized in existing_keywords:
        return False
    if looks_like_noise(normalized):
        return False
    if is_brand_noise(normalized, brand_terms):
        return False
    if len(tokens) == 1:
        return normalized in {"coquette", "balletcore", "blokecore"}
    if not is_valid_structured_phrase(tokens):
        return False
    return has_fashion_signal(normalized) or category_for_phrase(normalized) != "other"


def evidence_key(source_type: str, source_url: str | None, phrase: str, context: str) -> str:
    raw = f"{source_type}|{source_url or ''}|{normalize_phrase(phrase)}|{normalize_phrase(context)[:180]}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def evidence_weight(evidence: Evidence) -> float:
    weight = 10.0
    if evidence.source_type in {"runway_report", "celebrity_style"}:
        weight += 10.0
    if evidence.source_type in {"fashion_news", "editorial_article"}:
        weight += 8.0
    if evidence.source_type == "google_related_query":
        weight += 9.0
    if evidence.source_type == "reddit":
        weight += 5.0
    if evidence.is_title:
        weight += 8.0
    if evidence.is_product:
        weight += 5.0
    if evidence.is_new_arrival:
        weight += 7.0
    if evidence.is_related_query:
        weight += 7.0
    if has_fashion_signal(evidence.normalized_phrase):
        weight += 6.0
    return weight


def score_candidate(candidate: CandidateAggregate) -> float:
    product_only = candidate.source_types == {"product_catalog"}
    strong_fashion_specificity = (
        has_fashion_signal(candidate.normalized_phrase)
        or candidate.category in {"aesthetic", "styling", "silhouette", "accessory"}
    )

    score = 8.0
    score += min(18.0, candidate.evidence_count * 2.2)
    score += min(30.0, max(0, candidate.source_diversity - 1) * 12.0)
    score += min(10.0, candidate.title_hits * 3.0)
    score += min(7.0, candidate.product_hits * 1.5)
    score += min(8.0, candidate.new_arrival_hits * 2.0)
    score += min(16.0, candidate.related_query_hits * 6.0)
    score += min(10.0, candidate.reddit_hits * 3.0)
    score += min(16.0, candidate.editorial_hits * 4.0)
    score += min(16.0, candidate.fashion_news_hits * 4.0)
    score += min(18.0, candidate.runway_hits * 6.0)
    score += min(18.0, candidate.celebrity_hits * 6.0)
    score += min(10.0, candidate.growth_velocity * 0.10)
    score += min(8.0, candidate.recency_score * 0.08)
    if candidate.category == "other":
        score -= 12.0
    if product_only:
        score -= 12.0
        if not strong_fashion_specificity:
            score -= 10.0
        if candidate.evidence_count < 5:
            score = min(score, 28.0)
        elif candidate.evidence_count < 10:
            score = min(score, 42.0)
        else:
            score = min(score, 54.0 if strong_fashion_specificity else 48.0)
    return round(clamp(score, 1.0, 100.0), 2)


def calculate_recency_score(candidate: CandidateAggregate) -> float:
    if not candidate.latest_seen_at:
        return 0.0
    age_days = max(0.0, (NOW - ensure_utc(candidate.latest_seen_at)).total_seconds() / 86400)
    freshness = max(0.0, 100.0 - age_days * 3.0)
    freshness += min(20.0, candidate.new_arrival_hits * 5.0)
    freshness += min(15.0, candidate.related_query_hits * 5.0)
    return round(clamp(freshness, 1.0, 100.0), 2)


def calculate_growth_velocity(candidate: CandidateAggregate, previous_evidence_count: int) -> float:
    baseline = previous_evidence_count if previous_evidence_count > 0 else 1
    raw_growth = (candidate.evidence_count / baseline) * 35.0
    raw_growth += max(0, candidate.source_diversity - 1) * 8.0
    raw_growth += candidate.related_query_hits * 6.0
    raw_growth += candidate.new_arrival_hits * 4.0
    return round(clamp(raw_growth, 1.0, 100.0), 2)


def emergence_stage(confidence_score: float, growth_velocity: float, source_diversity: int, recency_score: float) -> str:
    if source_diversity <= 1:
        return "emerging" if recency_score >= 20 else "declining"
    if source_diversity == 2:
        if confidence_score >= 68 and growth_velocity >= 45:
            return "rising"
        return "emerging" if recency_score < 20 else "rising"
    if confidence_score >= 84 and source_diversity >= 4 and growth_velocity < 32:
        return "mainstream"
    if confidence_score >= 74 and growth_velocity >= 55 and source_diversity >= 3:
        return "peaking"
    if confidence_score >= 52 and growth_velocity >= 30 and source_diversity >= 2:
        return "rising"
    if recency_score < 20 and growth_velocity < 15:
        return "declining"
    return "emerging"


def add_evidence(aggregate_map: dict[str, CandidateAggregate], evidence: Evidence) -> None:
    candidate = aggregate_map.get(evidence.normalized_phrase)
    if not candidate:
        candidate = CandidateAggregate(
            phrase=evidence.phrase,
            normalized_phrase=evidence.normalized_phrase,
            category=evidence.category,
        )
        aggregate_map[evidence.normalized_phrase] = candidate

    candidate.evidence_items.append(evidence)
    candidate.source_types.add(evidence.source_type)
    candidate.evidence_count += 1
    candidate.title_hits += 1 if evidence.is_title else 0
    candidate.product_hits += 1 if evidence.is_product else 0
    candidate.new_arrival_hits += 1 if evidence.is_new_arrival else 0
    candidate.related_query_hits += 1 if evidence.is_related_query else 0
    candidate.reddit_hits += 1 if evidence.is_reddit else 0
    candidate.editorial_hits += 1 if evidence.source_type == "fashion_editorial" else 0
    candidate.fashion_news_hits += 1 if evidence.source_type == "fashion_news" else 0
    candidate.runway_hits += 1 if evidence.source_type == "runway_report" else 0
    candidate.celebrity_hits += 1 if evidence.source_type == "celebrity_style" else 0
    candidate.first_seen_at = min(filter(None, [candidate.first_seen_at, evidence.observed_at]), default=evidence.observed_at)
    candidate.latest_seen_at = max(filter(None, [candidate.latest_seen_at, evidence.observed_at]), default=evidence.observed_at)


def finalize_candidate(candidate: CandidateAggregate, previous_evidence_count: int) -> CandidateAggregate:
    candidate.source_diversity = len(candidate.source_types)
    candidate.growth_velocity = calculate_growth_velocity(candidate, previous_evidence_count)
    candidate.recency_score = calculate_recency_score(candidate)
    candidate.confidence_score = score_candidate(candidate)
    candidate.emergence_stage = emergence_stage(
        candidate.confidence_score,
        candidate.growth_velocity,
        candidate.source_diversity,
        candidate.recency_score,
    )
    supporting = []
    for evidence in sorted(candidate.evidence_items, key=evidence_weight, reverse=True)[:5]:
        supporting.append(
            {
                "phrase": evidence.phrase,
                "source_type": evidence.source_type,
                "source_name": evidence.source_name,
                "source_url": evidence.source_url,
                "context": evidence.context[:160],
                "score_contribution": evidence_weight(evidence),
            }
        )
    candidate.supporting_evidence = supporting
    return candidate


def build_candidate_payload_from_aggregate(candidate: CandidateAggregate, existing: dict, evidence_count: int, now_iso: str) -> dict:
    payload = {
        "phrase": candidate.phrase,
        "normalized_phrase": candidate.normalized_phrase,
        "source": candidate.best_evidence.source_name if candidate.best_evidence else None,
        "source_url": candidate.best_evidence.source_url if candidate.best_evidence else None,
        "context": candidate.best_evidence.context if candidate.best_evidence else None,
        "category": candidate.category,
        "confidence_score": candidate.confidence_score,
        "evidence_count": evidence_count,
        "source_diversity": candidate.source_diversity,
        "growth_velocity": candidate.growth_velocity,
        "recency_score": candidate.recency_score,
        "emergence_stage": candidate.emergence_stage,
        "supporting_evidence": candidate.supporting_evidence,
        "status": existing.get("status") or "pending",
        "first_seen_at": existing.get("first_seen_at") or (candidate.first_seen_at.isoformat() if candidate.first_seen_at else now_iso),
        "last_seen_at": candidate.latest_seen_at.isoformat() if candidate.latest_seen_at else now_iso,
        "last_discovered_at": candidate.latest_seen_at.isoformat() if candidate.latest_seen_at else now_iso,
        "updated_at": now_iso,
    }
    if existing.get("id"):
        payload["id"] = existing["id"]
    return payload

    if candidate.category == "other" and evidence.category != "other":
        candidate.category = evidence.category

    if candidate.best_evidence is None or evidence_weight(evidence) > evidence_weight(candidate.best_evidence):
        candidate.best_evidence = evidence
        candidate.phrase = evidence.phrase


def fetch_rows(client, table: str, columns: str, *, order_by: str | None = None, limit: int = 200) -> list[dict]:
    query = client.table(table).select(columns)
    if order_by:
        query = query.order(order_by, desc=True)
    response = query.limit(limit).execute()
    return response.data or []


def load_existing_keywords(client) -> set[str]:
    rows = fetch_rows(client, "trend_keywords", "keyword", limit=1500)
    return {normalize_phrase(str(row.get("keyword") or "")) for row in rows if row.get("keyword")}


def load_existing_candidates(client) -> dict[str, dict]:
    try:
        rows = fetch_rows(
            client,
            "trend_candidates",
            "id, phrase, normalized_phrase, confidence_score, source_diversity, evidence_count, emergence_stage, status, recency_score, growth_velocity, updated_at, created_at, first_seen_at",
            limit=5000,
        )
    except Exception:
        return {}
    existing: dict[str, dict] = {}
    for row in rows:
        normalized = normalize_phrase(str(row.get("normalized_phrase") or ""))
        if normalized:
            existing.setdefault(normalized, row)
    return existing


def load_existing_candidate_groups(client) -> defaultdict[str, list[dict]]:
    groups: defaultdict[str, list[dict]] = defaultdict(list)
    try:
        rows = fetch_rows(
            client,
            "trend_candidates",
            "id, phrase, normalized_phrase, confidence_score, source_diversity, evidence_count, emergence_stage, status, recency_score, growth_velocity, updated_at, created_at, first_seen_at",
            limit=5000,
        )
    except Exception:
        return groups
    for row in rows:
        normalized = normalize_phrase(str(row.get("normalized_phrase") or ""))
        if normalized:
            groups[normalized].append(row)
    return groups


def load_existing_evidence_rows(client) -> dict[str, dict]:
    try:
        rows = fetch_rows(
            client,
            "trend_candidate_evidence",
            "id, candidate_id, phrase, normalized_phrase, source_type, source_name, source_url, source_key, context, evidence_kind, observed_at, score_contribution, metadata",
            limit=25000,
        )
    except Exception:
        return {}
    existing: dict[str, dict] = {}
    for row in rows:
        normalized = normalize_phrase(str(row.get("normalized_phrase") or ""))
        source_key = row.get("source_key")
        if normalized and source_key:
            existing.setdefault(f"{normalized}::{source_key}", row)
    return existing


def group_existing_evidence_rows(client) -> defaultdict[str, list[dict]]:
    grouped: defaultdict[str, list[dict]] = defaultdict(list)
    for row in load_existing_evidence_rows(client).values():
        normalized = normalize_phrase(str(row.get("normalized_phrase") or ""))
        if normalized:
            grouped[normalized].append(row)
    return grouped


def collect_brand_terms(products: Iterable[dict]) -> set[str]:
    terms = set(BRAND_BLOCKLIST)
    for row in products:
        brand = normalize_phrase(str(row.get("brand") or ""))
        if brand:
            terms.update(brand.split())
            terms.add(brand)
    return terms


def get_latest_snapshot_keyword_seeds(client, limit: int) -> list[str]:
    try:
        snapshot_rows = fetch_rows(client, "trend_snapshots", "keyword_id, snapshot_date, blended_score, google_score", order_by="snapshot_date", limit=300)
        if snapshot_rows:
            latest_date = snapshot_rows[0].get("snapshot_date")
            latest_rows = [row for row in snapshot_rows if row.get("snapshot_date") == latest_date]
            keyword_ids = [row.get("keyword_id") for row in latest_rows if row.get("keyword_id")]
            keyword_ids = keyword_ids[: max(limit * 3, 20)]
            if keyword_ids:
                result = client.table("trend_keywords").select("id, keyword").in_("id", keyword_ids).execute()
                keyword_map = {row["id"]: row["keyword"] for row in result.data or []}
                ranked = sorted(
                    latest_rows,
                    key=lambda row: float(row.get("blended_score") or row.get("google_score") or 0),
                    reverse=True,
                )
                seeds: list[str] = []
                seen: set[str] = set()
                for row in ranked:
                    keyword = normalize_phrase(str(keyword_map.get(row.get("keyword_id")) or ""))
                    if keyword and keyword not in seen:
                        seeds.append(keyword)
                        seen.add(keyword)
                    if len(seeds) >= limit:
                        return seeds
    except Exception as error:
        logger.warning("Unable to derive trend snapshot seeds: %s", error)
    return []


def get_latest_historical_keyword_seeds(client, limit: int) -> list[str]:
    try:
        rows = fetch_rows(client, "historical_trend_data", "keyword_id, month, google_score, market", order_by="month", limit=500)
        in_rows = [row for row in rows if row.get("market") == "IN"]
        if not in_rows:
            return []
        latest_month = in_rows[0].get("month")
        latest_rows = [row for row in in_rows if row.get("month") == latest_month]
        latest_rows.sort(key=lambda row: float(row.get("google_score") or 0), reverse=True)
        keyword_ids = [row.get("keyword_id") for row in latest_rows if row.get("keyword_id")][: max(limit * 3, 20)]
        if not keyword_ids:
            return []
        result = client.table("trend_keywords").select("id, keyword").in_("id", keyword_ids).execute()
        keyword_map = {row["id"]: row["keyword"] for row in result.data or []}
        seeds: list[str] = []
        seen: set[str] = set()
        for row in latest_rows:
            keyword = normalize_phrase(str(keyword_map.get(row.get("keyword_id")) or ""))
            if keyword and keyword not in seen:
                seeds.append(keyword)
                seen.add(keyword)
            if len(seeds) >= limit:
                break
        return seeds
    except Exception as error:
        logger.warning("Unable to derive historical seeds: %s", error)
        return []


def build_seed_keywords(client, limit: int = 8) -> list[str]:
    seeds = get_latest_snapshot_keyword_seeds(client, limit)
    if seeds:
        return seeds
    seeds = get_latest_historical_keyword_seeds(client, limit)
    if seeds:
        return seeds
    existing = sorted(load_existing_keywords(client))
    return existing[:limit]


def collect_local_documents(client, *, product_limit: int, news_limit: int, editorial_limit: int) -> tuple[list[SourceDocument], set[str]]:
    products = fetch_rows(client, "products", "title, brand, product_url, scraped_at", order_by="scraped_at", limit=product_limit)
    brand_terms = collect_brand_terms(products)
    documents: list[SourceDocument] = []
    recent_cutoff = NOW - timedelta(days=45)

    for row in products:
        title = str(row.get("title") or "").strip()
        if not title:
            continue
        observed_at = NOW
        scraped_at = str(row.get("scraped_at") or "")
        is_new_arrival = False
        if scraped_at:
            observed_at = parse_timestamp(scraped_at)
            is_new_arrival = observed_at >= recent_cutoff
        documents.append(
            SourceDocument(
                source_type="product_catalog",
                source_name=str(row.get("brand") or "catalog"),
                source_url=row.get("product_url"),
                text=title,
                evidence_kind="product_title",
                observed_at=observed_at,
                is_title=True,
                is_product=True,
                is_new_arrival=is_new_arrival,
            )
        )

    try:
        news_rows = fetch_rows(client, "news_articles", "title, summary, link, fetched_at", order_by="fetched_at", limit=news_limit)
    except Exception as error:
        logger.warning("Skipping news_articles source: %s", error)
        news_rows = []

    for row in news_rows:
        observed_at = NOW
        fetched_at = str(row.get("fetched_at") or "")
        if fetched_at:
            observed_at = parse_timestamp(fetched_at)
        for text, kind, is_title in (
            (str(row.get("title") or "").strip(), "headline", True),
            (str(row.get("summary") or "").strip(), "summary", False),
        ):
            if text:
                documents.append(
                    SourceDocument(
                        source_type="fashion_news",
                        source_name="news_articles",
                        source_url=row.get("link"),
                        text=text,
                        evidence_kind=kind,
                        observed_at=observed_at,
                        is_title=is_title,
                    )
                )

    try:
        editorial_rows = fetch_rows(client, "editorial_articles", "title, subtitle, slug, category, content_excerpt, published_date", order_by="published_date", limit=editorial_limit)
    except Exception as error:
        logger.warning("Skipping editorial_articles source: %s", error)
        editorial_rows = []

    for row in editorial_rows:
        observed_at = NOW
        published_date = str(row.get("published_date") or "")
        if published_date:
            observed_at = parse_timestamp(published_date)
        source_url = f"/discover/article/{row.get('slug')}" if row.get("slug") else None
        for text, kind, is_title in (
            (str(row.get("title") or "").strip(), "headline", True),
            (str(row.get("subtitle") or "").strip(), "subtitle", True),
            (str(row.get("content_excerpt") or "").strip(), "excerpt", False),
        ):
            if text:
                documents.append(
                    SourceDocument(
                        source_type="fashion_editorial",
                        source_name=str(row.get("category") or "editorial"),
                        source_url=source_url,
                        text=text,
                        evidence_kind=kind,
                        observed_at=observed_at,
                        is_title=is_title,
                    )
                )

    return documents, brand_terms


def serper_request(
    endpoint: str,
    payload: dict[str, object],
    *,
    timeout: int = 20,
) -> dict[str, object]:
    api_key = os.getenv("SERPER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("SERPER_API_KEY missing")

    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    response = requests.post(endpoint, headers=headers, json=payload, timeout=timeout)
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, dict) else {}


def fetch_google_related_queries(seed_keywords: list[str], geo: str = "IN", max_per_keyword: int = 5) -> list[SourceDocument]:
    api_key = os.getenv("SERPER_API_KEY", "").strip()
    if not api_key:
        logger.warning("SERPER_API_KEY missing; skipping Serper query expansion.")
        return []

    documents: list[SourceDocument] = []
    seen_queries: set[str] = set()

    for keyword in seed_keywords[:6]:
        for suffix in SERPER_EXPANSION_SUFFIXES[:3]:
            try:
                payload = {"q": f"{keyword} {suffix}", "gl": geo.lower(), "hl": "en", "num": max(6, max_per_keyword)}
                search_data = serper_request("https://google.serper.dev/search", payload)

                for item in (search_data.get("relatedSearches") or [])[:max_per_keyword]:
                    query = normalize_phrase(str(item.get("query") or item.get("text") or ""))
                    if not query or query == normalize_phrase(keyword) or query in seen_queries:
                        continue
                    seen_queries.add(query)
                    documents.append(
                        SourceDocument(
                            source_type="google_related_query",
                            source_name=f"serper expansion:{keyword}",
                            source_url=None,
                            text=query,
                            evidence_kind="related_query",
                            observed_at=NOW,
                            metadata={"seed_keyword": keyword, "origin": "relatedSearches", "query_suffix": suffix},
                            is_title=True,
                            is_related_query=True,
                        )
                    )

                for item in (search_data.get("organic") or [])[:max_per_keyword]:
                    title = normalize_phrase(str(item.get("title") or ""))
                    if not title or title in seen_queries:
                        continue
                    seen_queries.add(title)
                    documents.append(
                        SourceDocument(
                            source_type="google_related_query",
                            source_name=f"serper expansion:{keyword}",
                            source_url=item.get("link"),
                            text=title,
                            evidence_kind="related_query",
                            observed_at=NOW,
                            metadata={"seed_keyword": keyword, "origin": "organic_title", "query_suffix": suffix},
                            is_title=True,
                            is_related_query=True,
                        )
                    )
            except Exception as error:
                logger.warning("Serper query expansion failed for %s (%s): %s", keyword, suffix, error)

    return documents


def fetch_serper_signals() -> list[SourceDocument]:
    api_key = os.getenv("SERPER_API_KEY", "").strip()
    if not api_key:
        logger.warning("SERPER_API_KEY missing; skipping Serper discovery sources.")
        return []

    documents: list[SourceDocument] = []

    for query, source_type in SERPER_DISCOVERY_QUERIES:
        try:
            endpoint = "https://google.serper.dev/news" if source_type in {"runway_report", "fashion_news"} else "https://google.serper.dev/search"
            payload = serper_request(endpoint, {"q": query, "gl": "in", "hl": "en", "num": 8})
            items = payload.get("news") or payload.get("organic") or []
            for item in items[:8]:
                title = str(item.get("title") or "").strip()
                snippet = str(item.get("snippet") or "").strip()
                link = item.get("link")
                source_name = str((item.get("source") if isinstance(item.get("source"), str) else item.get("source", {}).get("name")) or source_type)
                if title:
                    documents.append(
                        SourceDocument(
                            source_type=source_type,
                            source_name=source_name,
                            source_url=link,
                            text=f"{title}. {snippet}".strip(),
                            evidence_kind="headline" if title else "snippet",
                            observed_at=NOW,
                            metadata={"query": query},
                            is_title=True,
                        )
                    )
        except Exception as error:
            logger.warning("Serper discovery query failed for '%s': %s", query, error)

    return documents


def fetch_serper_community_signals() -> list[SourceDocument]:
    api_key = os.getenv("SERPER_API_KEY", "").strip()
    if not api_key:
        logger.warning("SERPER_API_KEY missing; skipping Serper community sources.")
        return []

    documents: list[SourceDocument] = []
    seen_links: set[str] = set()

    for query, source_type in [*SERPER_REDDIT_QUERIES, *SERPER_FORUM_QUERIES]:
        try:
            payload = serper_request("https://google.serper.dev/search", {"q": query, "gl": "in", "hl": "en", "num": 8})
            for item in (payload.get("organic") or [])[:8]:
                title = str(item.get("title") or "").strip()
                snippet = str(item.get("snippet") or "").strip()
                link = str(item.get("link") or "").strip() or None
                if link and link in seen_links:
                    continue
                if link:
                    seen_links.add(link)
                text = f"{title}. {snippet}".strip()
                if not text:
                    continue
                documents.append(
                    SourceDocument(
                        source_type=source_type,
                        source_name="serper:reddit" if source_type == "reddit" else "serper:forum",
                        source_url=link,
                        text=text,
                        evidence_kind="search_result",
                        observed_at=NOW,
                        metadata={"query": query},
                        is_title=True,
                        is_reddit=source_type == "reddit",
                    )
                )
        except Exception as error:
            logger.warning("Serper community discovery failed for '%s': %s", query, error)

    return documents


def make_evidence(document: SourceDocument, existing_keywords: set[str], brand_terms: set[str]) -> tuple[list[Evidence], int, int, int]:
    raw_phrases = extract_candidate_phrases(document.text)
    kept: list[Evidence] = []
    filtered_out = 0
    already_existing = 0

    for phrase in raw_phrases:
        canonical = normalize_phrase(phrase)
        if canonical in existing_keywords:
            already_existing += 1
            continue
        if not candidate_allowed(phrase, existing_keywords, brand_terms):
            filtered_out += 1
            continue
        kept.append(
            Evidence(
                phrase=canonical,
                normalized_phrase=canonical,
                category=category_for_phrase(canonical),
                source_type=document.source_type,
                source_name=document.source_name,
                source_url=document.source_url,
                source_key=evidence_key(document.source_type, document.source_url, canonical, document.text),
                context=document.text[:500],
                evidence_kind=document.evidence_kind,
                observed_at=document.observed_at,
                metadata=document.metadata,
                is_title=document.is_title,
                is_product=document.is_product,
                is_new_arrival=document.is_new_arrival,
                is_related_query=document.is_related_query,
                is_reddit=document.is_reddit,
            )
        )

    return kept, len(raw_phrases), filtered_out, already_existing


def build_candidate_payloads(client, *, product_limit: int, news_limit: int, editorial_limit: int, seed_limit: int | None = None):
    existing_keywords = load_existing_keywords(client)
    existing_candidates = load_existing_candidates(client)
    existing_evidence_rows = load_existing_evidence_rows(client)
    existing_evidence_by_phrase: defaultdict[str, list[dict]] = defaultdict(list)
    for row in existing_evidence_rows.values():
        normalized = normalize_phrase(str(row.get("normalized_phrase") or ""))
        if normalized:
            existing_evidence_by_phrase[normalized].append(row)

    documents, brand_terms = collect_local_documents(
        client,
        product_limit=product_limit,
        news_limit=news_limit,
        editorial_limit=editorial_limit,
    )
    seed_keywords = build_seed_keywords(client, seed_limit or 8)
    documents.extend(fetch_google_related_queries(seed_keywords))
    documents.extend(fetch_serper_signals())
    documents.extend(fetch_serper_community_signals())

    aggregate_map: dict[str, CandidateAggregate] = {}
    evidence_payloads: defaultdict[str, list[dict]] = defaultdict(list)
    affected_phrases: set[str] = set()
    raw_phrases = 0
    filtered_out = 0
    already_existing = 0
    new_evidence_rows = 0

    for document in documents:
        evidence_rows, raw_count, filtered_count, existing_count = make_evidence(
            document,
            existing_keywords=existing_keywords,
            brand_terms=brand_terms,
        )
        raw_phrases += raw_count
        filtered_out += filtered_count
        already_existing += existing_count

        for evidence in evidence_rows:
            affected_phrases.add(evidence.normalized_phrase)

    for normalized_phrase in sorted(affected_phrases):
        for stored_row in existing_evidence_by_phrase.get(normalized_phrase, []):
            add_evidence(aggregate_map, evidence_from_stored_row(stored_row))

    for document in documents:
        evidence_rows, _, _, _ = make_evidence(
            document,
            existing_keywords=existing_keywords,
            brand_terms=brand_terms,
        )
        for evidence in evidence_rows:
            evidence_identity = f"{evidence.normalized_phrase}::{evidence.source_key}"
            existing_evidence = existing_evidence_rows.get(evidence_identity)
            if existing_evidence and normalize_phrase(str(existing_evidence.get("phrase") or "")) == evidence.phrase:
                continue
            existing_evidence_rows[evidence_identity] = {
                "id": existing_evidence.get("id") if existing_evidence else None,
                "phrase": evidence.phrase,
                "normalized_phrase": evidence.normalized_phrase,
                "source_key": evidence.source_key,
            }
            new_evidence_rows += 1
            add_evidence(aggregate_map, evidence)
            payload = {
                "normalized_phrase": evidence.normalized_phrase,
                "phrase": evidence.phrase,
                "source_type": evidence.source_type,
                "source_name": evidence.source_name,
                "source_url": evidence.source_url,
                "source_key": evidence.source_key,
                "context": evidence.context,
                "evidence_kind": evidence.evidence_kind,
                "score_contribution": evidence_weight(evidence),
                "observed_at": evidence.observed_at.isoformat(),
                "metadata": evidence.metadata,
            }
            if existing_evidence and existing_evidence.get("id"):
                payload["id"] = existing_evidence["id"]
            evidence_payloads[evidence.normalized_phrase].append(payload)

    now_iso = NOW.isoformat()
    candidate_payloads: list[dict] = []
    inserted = 0
    updated = 0
    ranked: list[CandidateAggregate] = []
    rejected_samples: list[str] = []

    for candidate in aggregate_map.values():
        existing = existing_candidates.get(candidate.normalized_phrase, {})
        evidence_count = candidate.evidence_count
        candidate = finalize_candidate(candidate, evidence_count)
        ranked.append(candidate)
        payload = build_candidate_payload_from_aggregate(candidate, existing, evidence_count, now_iso)
        candidate_payloads.append(payload)
        if existing:
            updated += 1
        else:
            inserted += 1

    ranked.sort(key=lambda row: (row.confidence_score, row.source_diversity, row.evidence_count), reverse=True)

    noise_probe = [
        "green double", "blue smooth", "misty grey trail", "solid sky",
        "green boxy fit", "maroon textured elegance",
    ]
    for probe in noise_probe:
        if not candidate_allowed(probe, existing_keywords, brand_terms):
            rejected_samples.append(probe)

    return {
        "candidate_payloads": candidate_payloads,
        "evidence_payloads": evidence_payloads,
        "inserted": inserted,
        "updated": updated,
        "raw_phrases": raw_phrases,
        "filtered_out": filtered_out,
        "already_existing": already_existing,
        "new_evidence_rows": new_evidence_rows,
        "top_candidates": ranked[:20],
        "ranked_candidates": ranked,
        "rejected_samples": rejected_samples,
    }


def upsert_candidates(client, payloads: list[dict]) -> dict[str, int]:
    if not payloads:
        return {}
    client.table("trend_candidates").upsert(payloads, on_conflict="normalized_phrase").execute()
    rows = fetch_rows(client, "trend_candidates", "id, normalized_phrase", limit=max(5000, len(payloads) * 2))
    return {normalize_phrase(str(row.get("normalized_phrase") or "")): row["id"] for row in rows if row.get("normalized_phrase") and row.get("id")}


def write_recomputed_candidates(client, summary: dict[str, object]) -> dict[str, int]:
    updated = 0
    inserted = 0

    for payload in summary["updates_by_id"]:
        row_id = payload.get("id")
        if not row_id:
            continue
        body = {key: value for key, value in payload.items() if key != "id"}
        client.table("trend_candidates").update(body).eq("id", row_id).execute()
        updated += 1

    insert_payloads = [{key: value for key, value in payload.items() if key != "id"} for payload in summary["inserts"]]
    if insert_payloads:
        client.table("trend_candidates").upsert(insert_payloads, on_conflict="normalized_phrase").execute()
        inserted = len(insert_payloads)

    return {"updated": updated, "inserted": inserted}


def upsert_evidence(client, evidence_payloads: defaultdict[str, list[dict]], candidate_ids: dict[str, int]) -> int:
    rows: list[dict] = []
    for normalized_phrase, payloads in evidence_payloads.items():
        candidate_id = candidate_ids.get(normalized_phrase)
        if not candidate_id:
            continue
        for payload in payloads:
            rows.append(
                {
                    "candidate_id": candidate_id,
                    **payload,
                }
            )
    if not rows:
        return 0
    client.table("trend_candidate_evidence").upsert(rows, on_conflict="candidate_id,source_key").execute()
    return len(rows)


def log_top_candidates(candidates: list[CandidateAggregate]) -> None:
    if not candidates:
        logger.info("No candidate phrases passed filtering.")
        return
    logger.info("Top candidate phrases by confidence:")
    for index, candidate in enumerate(candidates, start=1):
        logger.info(
            "%02d. %s | score=%.2f | stage=%s | category=%s | evidence=%s | sources=%s",
            index,
            candidate.normalized_phrase,
            candidate.confidence_score,
            candidate.emergence_stage,
            candidate.category,
            candidate.evidence_count,
            ", ".join(sorted(candidate.source_types)),
        )


def log_candidates_by_source_balance(candidates: list[CandidateAggregate]) -> None:
    if not candidates:
        return

    grouped: defaultdict[str, list[CandidateAggregate]] = defaultdict(list)
    for candidate in candidates:
        if len(candidate.source_types) == 1:
            key = f"1-source:{next(iter(candidate.source_types))}"
        else:
            key = f"{len(candidate.source_types)}-sources"
        grouped[key].append(candidate)

    logger.info("Top candidates grouped by source balance:")
    for key in sorted(grouped.keys()):
        logger.info("Group %s", key)
        for candidate in grouped[key][:5]:
            logger.info(
                "  - %s | score=%.2f | stage=%s | evidence=%s | sources=%s",
                candidate.normalized_phrase,
                candidate.confidence_score,
                candidate.emergence_stage,
                candidate.evidence_count,
                ", ".join(sorted(candidate.source_types)),
            )


def noisy_candidate_score(candidate: CandidateAggregate) -> int:
    tokens = set(tokenize(candidate.normalized_phrase))
    score = 0
    score += len(tokens & PRODUCT_NOISE_TOKENS) * 3
    if candidate.source_types == {"product_catalog"}:
        score += 2
    if candidate.source_diversity <= 1:
        score += 1
    if candidate.category == "other":
        score += 1
    if len(tokens) <= 2 and not (tokens & FASHION_SIGNAL_WORDS):
        score += 1
    return score


def log_dry_run_report(candidates: list[CandidateAggregate], *, top_n: int) -> None:
    top_candidates = candidates[:top_n]
    if not top_candidates:
        logger.info("Dry run produced no candidates.")
        return

    logger.info("Dry run top %s candidates:", min(top_n, len(top_candidates)))
    for index, candidate in enumerate(top_candidates, start=1):
        logger.info(
            "%02d. %s | score=%.2f | stage=%s | source_diversity=%s | sources=%s | evidence=%s | split=%s",
            index,
            candidate.normalized_phrase,
            candidate.confidence_score,
            candidate.emergence_stage,
            candidate.source_diversity,
            ", ".join(sorted(candidate.source_types)),
            candidate.evidence_count,
            "product-only" if candidate.source_types == {"product_catalog"} else "multi-source",
        )

    product_only = sum(1 for candidate in candidates if candidate.source_types == {"product_catalog"})
    multi_source = sum(1 for candidate in candidates if len(candidate.source_types) > 1)
    styleforum_contribution = sum(
        1
        for candidate in candidates
        if any("styleforum.net" in str(evidence.source_url or "") for evidence in candidate.evidence_items)
    )
    reddit_contribution = sum(1 for candidate in candidates if "reddit" in candidate.source_types)
    google_expansion_contribution = sum(1 for candidate in candidates if "google_related_query" in candidate.source_types)

    logger.info("Dry run split: product-only=%s | multi-source=%s", product_only, multi_source)
    logger.info("Styleforum contributing candidates: %s", styleforum_contribution)
    logger.info("Reddit contributing candidates: %s", reddit_contribution)
    logger.info("Google expansion contributing candidates: %s", google_expansion_contribution)

    noisy = [candidate for candidate in candidates if noisy_candidate_score(candidate) > 0]
    noisy.sort(key=lambda candidate: (noisy_candidate_score(candidate), candidate.confidence_score), reverse=True)
    logger.info("Top noisy-looking candidates:")
    for candidate in noisy[: min(15, len(noisy))]:
        logger.info(
            "  - %s | noise=%s | score=%.2f | sources=%s",
            candidate.normalized_phrase,
            noisy_candidate_score(candidate),
            candidate.confidence_score,
            ", ".join(sorted(candidate.source_types)),
        )


def recompute_existing_candidates(client) -> dict[str, object]:
    existing_candidate_groups = load_existing_candidate_groups(client)
    existing_candidates = {key: rows[0] for key, rows in existing_candidate_groups.items() if rows}
    evidence_by_phrase = group_existing_evidence_rows(client)
    now_iso = NOW.isoformat()
    candidate_payloads: list[dict] = []
    before_after: list[dict] = []
    product_only_downgrades: list[dict] = []
    multi_source_upgrades: list[dict] = []
    diversity_corrections: list[dict] = []
    updates_by_id: list[dict] = []
    inserts: list[dict] = []
    canonical_merge_conflicts: list[dict] = []
    skipped_for_safety: list[dict] = []
    duplicate_canonical_phrases: list[dict] = []

    for normalized_phrase, rows in existing_candidate_groups.items():
        if len(rows) > 1:
            duplicate_canonical_phrases.append(
                {
                    "normalized_phrase": normalized_phrase,
                    "row_ids": [row.get("id") for row in rows],
                    "stored_phrases": [row.get("phrase") for row in rows],
                    "stored_normalized_phrases": [row.get("normalized_phrase") for row in rows],
                }
            )

    for normalized_phrase, rows in evidence_by_phrase.items():
        aggregate_map: dict[str, CandidateAggregate] = {}
        for row in rows:
            add_evidence(aggregate_map, evidence_from_stored_row(row))
        candidate = aggregate_map.get(normalized_phrase)
        if not candidate:
            continue

        existing = existing_candidates.get(normalized_phrase, {})
        matching_rows = existing_candidate_groups.get(normalized_phrase, [])
        before_score = float(existing.get("confidence_score") or 0)
        before_stage = str(existing.get("emergence_stage") or "")
        before_diversity = int(existing.get("source_diversity") or 0)
        evidence_count = candidate.evidence_count
        candidate = finalize_candidate(candidate, evidence_count)
        payload = build_candidate_payload_from_aggregate(candidate, existing, evidence_count, now_iso)

        if len(matching_rows) > 1:
            conflict = {
                "normalized_phrase": normalized_phrase,
                "row_ids": [row.get("id") for row in matching_rows],
                "stored_phrases": [row.get("phrase") for row in matching_rows],
            }
            canonical_merge_conflicts.append(conflict)
            skipped_for_safety.append(conflict)
            continue

        candidate_payloads.append(payload)
        if existing.get("id"):
            updates_by_id.append(payload)
        else:
            inserts.append(payload)

        row = {
            "normalized_phrase": normalized_phrase,
            "before_score": before_score,
            "after_score": candidate.confidence_score,
            "delta": round(candidate.confidence_score - before_score, 2),
            "before_stage": before_stage,
            "after_stage": candidate.emergence_stage,
            "before_diversity": before_diversity,
            "after_diversity": candidate.source_diversity,
            "sources": sorted(candidate.source_types),
            "evidence_count": evidence_count,
        }
        before_after.append(row)
        if candidate.source_types == {"product_catalog"} and before_diversity == 1 and before_score > candidate.confidence_score:
            product_only_downgrades.append(row)
        if len(candidate.source_types) > 1 and row["delta"] > 0:
            multi_source_upgrades.append(row)
        if before_diversity != candidate.source_diversity:
            diversity_corrections.append(row)

    before_after.sort(key=lambda row: abs(row["delta"]), reverse=True)
    product_only_downgrades.sort(key=lambda row: row["delta"])
    multi_source_upgrades.sort(key=lambda row: row["delta"], reverse=True)
    diversity_corrections.sort(key=lambda row: abs(row["after_diversity"] - row["before_diversity"]), reverse=True)

    return {
        "candidate_payloads": candidate_payloads,
        "updates_by_id": updates_by_id,
        "inserts": inserts,
        "before_after": before_after,
        "product_only_downgrades": product_only_downgrades,
        "multi_source_upgrades": multi_source_upgrades,
        "diversity_corrections": diversity_corrections,
        "canonical_merge_conflicts": canonical_merge_conflicts,
        "duplicate_canonical_phrases": duplicate_canonical_phrases,
        "skipped_for_safety": skipped_for_safety,
        "total_candidates": len(candidate_payloads),
    }


def log_recompute_dry_run(summary: dict[str, object]) -> None:
    logger.info("Recompute dry run: %s candidates would be updated", summary["total_candidates"])
    logger.info("Rows updated by id: %s", len(summary["updates_by_id"]))
    logger.info("Rows that would be inserted: %s", len(summary["inserts"]))
    logger.info("Canonical merge conflicts: %s", len(summary["canonical_merge_conflicts"]))
    logger.info("Duplicate canonical phrases detected: %s", len(summary["duplicate_canonical_phrases"]))
    logger.info("Candidates skipped for safety: %s", len(summary["skipped_for_safety"]))
    logger.info("Top 20 before/after score changes:")
    for row in summary["before_after"][:20]:
        logger.info(
            "  - %s | %.2f -> %.2f | stage %s -> %s | diversity %s -> %s | sources=%s",
            row["normalized_phrase"],
            row["before_score"],
            row["after_score"],
            row["before_stage"],
            row["after_stage"],
            row["before_diversity"],
            row["after_diversity"],
            ", ".join(row["sources"]),
        )
    logger.info("Product-only candidates that would be downgraded:")
    for row in summary["product_only_downgrades"][:20]:
        logger.info("  - %s | %.2f -> %.2f", row["normalized_phrase"], row["before_score"], row["after_score"])
    logger.info("Multi-source candidates that would be upgraded:")
    for row in summary["multi_source_upgrades"][:20]:
        logger.info("  - %s | %.2f -> %.2f", row["normalized_phrase"], row["before_score"], row["after_score"])
    logger.info("Candidates with source_diversity corrections:")
    for row in summary["diversity_corrections"][:20]:
        logger.info(
            "  - %s | diversity %s -> %s | sources=%s",
            row["normalized_phrase"],
            row["before_diversity"],
            row["after_diversity"],
            ", ".join(row["sources"]),
        )
    if summary["canonical_merge_conflicts"]:
        logger.info("Canonical merge conflicts:")
        for row in summary["canonical_merge_conflicts"][:20]:
            logger.info(
                "  - %s | row_ids=%s | stored_phrases=%s",
                row["normalized_phrase"],
                row["row_ids"],
                row["stored_phrases"],
            )
    if summary["duplicate_canonical_phrases"]:
        logger.info("Duplicate canonical phrases detected:")
        for row in summary["duplicate_canonical_phrases"][:20]:
            logger.info(
                "  - %s | row_ids=%s | stored_normalized=%s",
                row["normalized_phrase"],
                row["row_ids"],
                row["stored_normalized_phrases"],
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover new trend candidates as an additive review layer.")
    parser.add_argument("--product-limit", type=int, default=500)
    parser.add_argument("--news-limit", type=int, default=200)
    parser.add_argument("--editorial-limit", type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--top-n", type=int, default=50)
    parser.add_argument("--seed-limit", type=int, default=None)
    parser.add_argument("--recompute-existing", action="store_true")
    args = parser.parse_args()

    load_environment()
    client = get_supabase()

    if args.recompute_existing:
        summary = recompute_existing_candidates(client)
        if args.dry_run:
            logger.info("Dry run enabled; skipping candidate upserts for recompute.")
            log_recompute_dry_run(summary)
            return 0
        write_summary = write_recomputed_candidates(client, summary)
        logger.info(
            "Recomputed candidates written safely. updated_by_id=%s inserted=%s skipped=%s",
            write_summary["updated"],
            write_summary["inserted"],
            len(summary["skipped_for_safety"]),
        )
        return 0

    summary = build_candidate_payloads(
        client,
        product_limit=max(50, args.product_limit),
        news_limit=max(25, args.news_limit),
        editorial_limit=max(25, args.editorial_limit),
        seed_limit=args.seed_limit,
    )

    logger.info("Raw phrases found: %s", summary["raw_phrases"])
    logger.info("Filtered out: %s", summary["filtered_out"])
    logger.info("Already existed in trend_keywords: %s", summary["already_existing"])
    logger.info("Noise probes rejected: %s", ", ".join(summary["rejected_samples"]) or "none")

    if args.dry_run:
        logger.info("Dry run enabled; skipping candidate and evidence upserts.")
        log_dry_run_report(summary["ranked_candidates"], top_n=max(1, args.top_n))
        log_candidates_by_source_balance(summary["ranked_candidates"][: max(1, min(args.top_n, 50))])
        return 0

    candidate_ids = upsert_candidates(client, summary["candidate_payloads"])
    inserted_evidence = upsert_evidence(client, summary["evidence_payloads"], candidate_ids)

    logger.info("New candidates inserted: %s", summary["inserted"])
    logger.info("Existing candidates updated: %s", summary["updated"])
    logger.info("New evidence rows inserted: %s", inserted_evidence)
    log_top_candidates(summary["top_candidates"])
    log_candidates_by_source_balance(summary["top_candidates"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
