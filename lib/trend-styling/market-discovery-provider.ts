import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { canonicalizeTrendKeyword } from "@/lib/trends/keyword-normalization";
import { SUPPORTED_TREND_REGIONS, type SupportedTrendRegion } from "@/lib/trends/config";

const execFileAsync = promisify(execFile);
const EXPECTED_MARKETS = SUPPORTED_TREND_REGIONS.map(({ code }) => code);

export const MARKET_DISCOVERY_PROVIDER_NAME = "google_trends_pytrends" as const;
export const MARKET_DISCOVERY_LIMITS = {
  maxKeywordsPerRun: 1,
  maxProviderCallsPerKeyword: 18,
  maxAttemptsPerCall: 3,
  cacheTtlHours: 24,
  processTimeoutMs: 360_000,
} as const;

export type MarketDiscoveryRetryInformation = {
  attempts: number;
  maxAttempts: number;
  rateLimited: boolean;
  retryAfterSeconds: number | null;
  nextRetryAt: string | null;
};

export type MarketDiscoveryResult = {
  market: SupportedTrendRegion;
  normalizedInterest: number;
  recentMomentum: number;
  confidence: number;
  observationCompleteness: number;
  providerTimestamp: string;
  retryInformation: MarketDiscoveryRetryInformation;
  failureReason: string | null;
};

export type MarketDiscoveryBatch = {
  schemaVersion: "repo-pytrends-market-discovery-v1";
  provider: typeof MARKET_DISCOVERY_PROVIDER_NAME;
  canonicalKeyword: string;
  generatedAt: string;
  cacheHit: boolean;
  providerCalls: number;
  maximumProviderCalls: number;
  markets: MarketDiscoveryResult[];
};

export interface MarketInterestProvider {
  discover(input: { keyword: string; conceptId: string }): Promise<MarketDiscoveryBatch>;
}

function finiteNumber(value: unknown, name: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid market discovery ${name}`);
  }
  return parsed;
}

function nullableIso(value: unknown, name: string) {
  if (value === null || value === undefined) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid market discovery ${name}`);
  return parsed.toISOString();
}

function requiredIso(value:unknown,name:string){const parsed=nullableIso(value,name);if(!parsed)throw new Error(`Missing market discovery ${name}`);return parsed;}

export function parseRepoMarketDiscoveryBatch(value: unknown, expectedKeyword: string): MarketDiscoveryBatch {
  if (!value || typeof value !== "object") throw new Error("Market discovery response must be an object");
  const payload = value as Record<string, unknown>;
  if (payload.schemaVersion !== "repo-pytrends-market-discovery-v1" || payload.provider !== MARKET_DISCOVERY_PROVIDER_NAME) {
    throw new Error("Unsupported market discovery provider response");
  }
  const canonicalKeyword = canonicalizeTrendKeyword(String(payload.canonicalKeyword || ""));
  if (canonicalKeyword !== canonicalizeTrendKeyword(expectedKeyword)) throw new Error("Market discovery keyword mismatch");
  const rawMarkets = Array.isArray(payload.markets) ? payload.markets : [];
  if (rawMarkets.length !== EXPECTED_MARKETS.length) throw new Error("Market discovery must return exactly 12 markets");

  const markets = rawMarkets.map((raw): MarketDiscoveryResult => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid market discovery row");
    const row = raw as Record<string, unknown>;
    const market = String(row.market || "").toUpperCase() as SupportedTrendRegion;
    if (!EXPECTED_MARKETS.includes(market)) throw new Error(`Unsupported market discovery market: ${market}`);
    const retry = row.retryInformation as Record<string, unknown> | undefined;
    if (!retry || typeof retry !== "object") throw new Error(`Missing retry information for ${market}`);
    const observationCompleteness=finiteNumber(row.observationCompleteness, `${market}.observationCompleteness`, 0, 1);
    const failureReason=row.failureReason === null || row.failureReason === undefined ? null : String(row.failureReason).slice(0, 240);
    if(observationCompleteness===0&&!failureReason)throw new Error(`Missing failure reason for unavailable market ${market}`);
    return {
      market,
      normalizedInterest: finiteNumber(row.normalizedInterest, `${market}.normalizedInterest`, 0, 100),
      recentMomentum: finiteNumber(row.recentMomentum, `${market}.recentMomentum`, -100, 100),
      confidence: finiteNumber(row.confidence, `${market}.confidence`, 0, 1),
      observationCompleteness,
      providerTimestamp: requiredIso(row.providerTimestamp, `${market}.providerTimestamp`),
      retryInformation: {
        attempts: finiteNumber(retry.attempts, `${market}.retry.attempts`, 0, MARKET_DISCOVERY_LIMITS.maxAttemptsPerCall),
        maxAttempts: finiteNumber(retry.maxAttempts, `${market}.retry.maxAttempts`, 1, MARKET_DISCOVERY_LIMITS.maxAttemptsPerCall),
        rateLimited: retry.rateLimited === true,
        retryAfterSeconds: retry.retryAfterSeconds === null || retry.retryAfterSeconds === undefined
          ? null
          : finiteNumber(retry.retryAfterSeconds, `${market}.retry.retryAfterSeconds`, 1, 86400),
        nextRetryAt: nullableIso(retry.nextRetryAt, `${market}.retry.nextRetryAt`),
      },
      failureReason,
    };
  });
  if (new Set(markets.map(({ market }) => market)).size !== EXPECTED_MARKETS.length || EXPECTED_MARKETS.some((market) => !markets.some((item) => item.market === market))) {
    throw new Error("Market discovery contains duplicate or missing markets");
  }
  const providerCalls = finiteNumber(payload.providerCalls, "providerCalls", 0, MARKET_DISCOVERY_LIMITS.maxProviderCallsPerKeyword);
  const maximumProviderCalls = finiteNumber(payload.maximumProviderCalls, "maximumProviderCalls", 1, MARKET_DISCOVERY_LIMITS.maxProviderCallsPerKeyword);
  if (providerCalls > maximumProviderCalls) throw new Error("Market discovery exceeded its provider-call budget");
  return {
    schemaVersion: "repo-pytrends-market-discovery-v1",
    provider: MARKET_DISCOVERY_PROVIDER_NAME,
    canonicalKeyword,
    generatedAt: requiredIso(payload.generatedAt, "generatedAt"),
    cacheHit: payload.cacheHit === true,
    providerCalls,
    maximumProviderCalls,
    markets,
  };
}

export async function runRepoMarketDiscoveryCommand(keyword: string): Promise<unknown> {
  const python = process.env.TREND_MARKET_DISCOVERY_PYTHON || "python3";
  const script = path.resolve(process.cwd(), "scraper/discover_keyword_markets.py");
  const cacheDirectory = path.resolve(process.cwd(), process.env.TREND_MARKET_DISCOVERY_CACHE_DIR || ".cache/trend-styling-market-discovery");
  const configuredTimeout = Number(process.env.TREND_MARKET_DISCOVERY_TIMEOUT_MS || MARKET_DISCOVERY_LIMITS.processTimeoutMs);
  const timeout = Math.max(60_000, Math.min(900_000, Number.isFinite(configuredTimeout) ? configuredTimeout : MARKET_DISCOVERY_LIMITS.processTimeoutMs));
  const { stdout } = await execFileAsync(python, [script, "--keyword", canonicalizeTrendKeyword(keyword), "--cache-dir", cacheDirectory], {
    cwd: process.cwd(),
    timeout,
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
  return JSON.parse(stdout.trim());
}

export function createRepoOwnedMarketInterestProvider(
  runner: (keyword: string) => Promise<unknown> = runRepoMarketDiscoveryCommand,
): MarketInterestProvider {
  return {
    async discover({ keyword }) {
      const canonicalKeyword=canonicalizeTrendKeyword(keyword);
      return parseRepoMarketDiscoveryBatch(await runner(canonicalKeyword), canonicalKeyword);
    },
  };
}
