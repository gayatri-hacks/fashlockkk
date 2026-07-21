import type { ResearchMarketSource } from "./research-worker";

const SAFE_STATUSES = new Set(["idle", "evidence_ready", "completed", "retryable", "deferred"]);
const SAFE_CATEGORIES = new Set([
  "google_trends_quota_or_rate_limit",
  "quota_exhausted",
  "insufficient_market_evidence",
  "research_retryable",
  "none",
]);
const SAFE_SOURCES = new Set<ResearchMarketSource>([
  "none",
  "authoritative_scores",
  "last_known_good_market_evidence",
  "live_pytrends",
]);

/** Returns only an allowlisted operational diagnostic; provider payloads and errors are omitted. */
export function safeResearchDiagnostic(input: {
  status?: unknown;
  errorCategory?: unknown;
  marketSource?: unknown;
  retryAfter?: unknown;
}) {
  const status = String(input.status || "retryable");
  const errorCategory = String(input.errorCategory || "none");
  const marketSource = String(input.marketSource || "none") as ResearchMarketSource;
  const retryDate = input.retryAfter ? new Date(String(input.retryAfter)) : null;
  return {
    status: SAFE_STATUSES.has(status) ? status : "retryable",
    error_category: SAFE_CATEGORIES.has(errorCategory) ? errorCategory : "research_retryable",
    market_source: SAFE_SOURCES.has(marketSource) ? marketSource : "none",
    retry_after: retryDate && !Number.isNaN(retryDate.getTime()) ? retryDate.toISOString() : null,
  };
}
