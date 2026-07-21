import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_TREND_REGIONS } from "@/lib/trends/config";
import {
  createStylingEvidenceSearchProvider,
  EvidenceProviderQuotaError,
  resolveSerperLocale,
  SERPER_CREDIT_EXHAUSTION_RETRY_SECONDS,
  SERPER_MARKET_LANGUAGE_SETTINGS,
  SERPER_REQUEST_RESULT_COUNT,
  SERPER_USABLE_RESULT_LIMIT,
  SerperEvidenceSearchError,
} from "./evidence-provider";
import { MARKET_RESEARCH_LANGUAGES } from "./market-selection";
import { runManualFirstStylingWorkflow } from "./manual-workflow";
import { safeResearchDiagnostic } from "./research-diagnostics";
import { runResearchWorker, type ResearchJob, type ResearchStore } from "./research-worker";
import type { MarketDiscoveryBatch } from "./market-discovery-provider";

const input = {
  keyword: "linen",
  audience: "women" as const,
  region: "IN",
  season: "current",
  language: "hi",
};

function responseFetch(response: Response, requests: RequestInit[] = []): typeof fetch {
  return async (_url, init) => {
    requests.push(init || {});
    return response;
  };
}

function organicResults(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Linen outfit source ${index + 1}`,
    link: `https://source${index + 1}.example/linen`,
    snippet: "Linen shirt with tailored trousers, sandals and a belt",
    date: "2026-07-01",
    position: index + 1,
  }));
}

test("Serper locale mapping explicitly covers every configured market and research language", () => {
  assert.deepEqual(Object.keys(SERPER_MARKET_LANGUAGE_SETTINGS), SUPPORTED_TREND_REGIONS.map(({ code }) => code));
  for (const { code } of SUPPORTED_TREND_REGIONS) {
    for (const language of MARKET_RESEARCH_LANGUAGES[code]) {
      const locale = resolveSerperLocale(code, language);
      assert.equal(locale.market, code);
      assert.ok(locale.gl);
      assert.ok(locale.hl);
    }
  }
  assert.deepEqual(resolveSerperLocale("SG", "zh"), { market: "SG", language: "zh", gl: "sg", hl: "zh-cn" });
});

test("Serper success uses supported request fields and keeps only the best six organic results", async () => {
  const requests: RequestInit[] = [];
  const provider = createStylingEvidenceSearchProvider({
    apiKey: "mock-serper-key",
    fetchImpl: responseFetch(new Response(JSON.stringify({ organic: organicResults(10) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }), requests),
  });
  const results = await provider.search(input);
  assert.equal(requests.length, 1);
  const body = JSON.parse(String(requests[0].body));
  assert.equal(body.num, SERPER_REQUEST_RESULT_COUNT);
  assert.equal(body.num, 10);
  assert.equal(body.gl, "in");
  assert.equal(body.hl, "hi");
  assert.doesNotMatch(body.q, /language:/i);
  assert.doesNotMatch(body.q, /\bIN\b/);
  assert.match(body.q, /कैसे पहनें/);
  assert.equal(results.length, SERPER_USABLE_RESULT_LIMIT);
  assert.deepEqual(results.map(({ title }) => title), organicResults(6).map(({ title }) => title));
});

async function expectSerperError(status: number, body: unknown, expected: {
  kind: SerperEvidenceSearchError["kind"];
  retryAfterSeconds: number | null;
  headers?: HeadersInit;
  quotaError?: boolean;
}) {
  const apiKey = "mock-secret-api-key-never-log";
  const provider = createStylingEvidenceSearchProvider({
    apiKey,
    fetchImpl: responseFetch(new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...expected.headers },
    })),
  });
  await assert.rejects(provider.search(input), (error: unknown) => {
    assert.ok(error instanceof SerperEvidenceSearchError);
    assert.equal(error.status, status);
    assert.equal(error.kind, expected.kind);
    assert.equal(error.retryAfterSeconds, expected.retryAfterSeconds);
    assert.equal(error instanceof EvidenceProviderQuotaError, expected.quotaError === true);
    assert.ok(error.providerReason.length <= 240);
    assert.doesNotMatch(error.message, new RegExp(apiKey));
    return true;
  });
}

test("Serper HTTP 400 with a bounded Not enough credits diagnostic is typed quota exhaustion", async () => {
  await expectSerperError(400, {
    error: {
      code: "payment_required",
      message: "Not enough credits",
      ignoredPrivatePayload: "x".repeat(4_000),
    },
  }, {
    kind: "quota_exhausted",
    retryAfterSeconds: SERPER_CREDIT_EXHAUSTION_RETRY_SECONDS,
    quotaError: true,
  });
});

test("an unrelated Serper HTTP 400 remains a sanitized invalid request", async () => {
  await expectSerperError(400, {
    error: { code: "invalid_request", message: `Unsupported num value; key=mock-secret-api-key-never-log ${"x".repeat(1_000)}` },
  }, { kind: "invalid_request", retryAfterSeconds: null });
});

test("Serper HTTP 401 and 403 are classified as credential problems without exposing credentials", async () => {
  for (const status of [401, 403]) {
    await expectSerperError(status, { error: { code: "unauthorized", message: "API key is invalid" } }, {
      kind: "credential_problem",
      retryAfterSeconds: 3_600,
    });
  }
});

test("Serper HTTP 429 preserves bounded retry information", async () => {
  await expectSerperError(429, { error: { code: "rate_limited", message: "Too many searches" } }, {
    kind: "quota_or_rate_limit",
    retryAfterSeconds: 120,
    headers: { "Retry-After": "120" },
  });
});

test("Serper HTTP 5xx is classified as a temporary provider failure", async () => {
  await expectSerperError(503, "temporary upstream outage", {
    kind: "temporary_provider_failure",
    retryAfterSeconds: 300,
  });
});

test("Serper credit exhaustion defers the exact job, releases its claim attempt and stops formula work", async () => {
  const now = new Date("2026-07-20T00:00:00.000Z");
  const job: ResearchJob = {
    id: "job",
    concept_id: "concept",
    canonical_keyword: "linen",
    requesting_market: "IN",
    season: "current",
    attempts: 2,
    max_attempts: 3,
  };
  const batch: MarketDiscoveryBatch = {
    schemaVersion: "repo-pytrends-market-discovery-v1",
    provider: "google_trends_pytrends",
    canonicalKeyword: "linen",
    generatedAt: now.toISOString(),
    cacheHit: true,
    providerCalls: 0,
    maximumProviderCalls: 18,
    markets: SUPPORTED_TREND_REGIONS.map(({ code }, index) => ({
      market: code,
      normalizedInterest: 90 - index,
      recentMomentum: 30 - index,
      confidence: 0.9,
      observationCompleteness: 1,
      providerTimestamp: now.toISOString(),
      retryInformation: { attempts: 1, maxAttempts: 3, rateLimited: false, retryAfterSeconds: null, nextRetryAt: null },
      failureReason: null,
    })),
  };
  let retryAfter: string | null | undefined;
  let searches = 0;
  let persistedAttempts = job.attempts;
  let retryCalls = 0;
  let evidenceWrites = 0;
  let researchCompletions = 0;
  let deferrals = 0;
  const store: ResearchStore = {
    async claim() { return job; },
    async loadMarketEvidence() { return batch; },
    async insertEvidence() { evidenceWrites += 1; },
    async complete() { researchCompletions += 1; },
    async retry() { retryCalls += 1; },
    async deferQuota(claimedJob, deferral) {
      assert.equal(claimedJob.id, job.id);
      assert.equal(claimedJob.attempts, 2);
      assert.equal(deferral.errorCategory, "quota_exhausted");
      retryAfter = deferral.retryAfter;
      persistedAttempts -= 1;
      deferrals += 1;
    },
  };
  const result = await runResearchWorker({
    workerId: "mock",
    store,
    interestProvider: { async discover() { throw new Error("unexpected Google Trends call"); } },
    searchProvider: {
      async search() {
        searches += 1;
        throw new EvidenceProviderQuotaError(400, "payment_required", "Not enough credits");
      },
    },
    now,
  });
  assert.equal(result.status, "deferred");
  assert.equal(result.errorCategory, "quota_exhausted");
  assert.equal(searches, 1);
  assert.equal(retryAfter, "2026-07-20T12:00:00.000Z");
  assert.equal(persistedAttempts, 1);
  assert.equal(deferrals, 1);
  assert.equal(retryCalls, 0);
  assert.equal(evidenceWrites, 0);
  assert.equal(researchCompletions, 0);
  assert.equal(safeResearchDiagnostic(result).error_category, "quota_exhausted");

  let geminiCalls = 0;
  let formulaPublicationCalls = 0;
  await assert.rejects(runManualFirstStylingWorkflow({
    enabled: true,
    autoEnqueueImages: false,
    research: async () => {
      throw new Error("Manual styling research deferred");
    },
    generate: async () => { geminiCalls += 1; return []; },
    approve: async () => { formulaPublicationCalls += 1; return []; },
  }), /research deferred/);
  assert.equal(geminiCalls, 0);
  assert.equal(formulaPublicationCalls, 0);
});
