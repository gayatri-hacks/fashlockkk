import { getSupabaseClient } from "@/lib/supabase";
import {
  TREND_COMPUTATION_VERSION,
  type TrendLifecycle,
} from "@/lib/trends/config";
import {
  selectStylingResearchMarkets,
  type StylingMarketPlan,
} from "./market-selection";

export const AUTHORITATIVE_MARKET_THRESHOLDS = {
  minimumGlobalConfidence: 0.5,
  maximumScoreAgeDays: 75,
  minimumSupportedMarkets: 3,
} as const;

type GlobalScoreRow = {
  lifecycle: TrendLifecycle;
  confidence: number | string;
  latest_period: string;
};

type RegionalScoreRow = {
  region: string;
  regional_momentum: number | string;
  confidence: number | string;
  data_freshness: number | string;
  observation_count: number | string;
  current_interest_percentile: number | string;
  computed_at: string;
};

export interface AuthoritativeMarketScoreReader {
  readGlobal(canonicalKeyword: string): Promise<GlobalScoreRow | null>;
  readRegional(canonicalKeyword: string): Promise<RegionalScoreRow[]>;
}

export type AuthoritativeMarketPlan = StylingMarketPlan & {
  lifecycle: TrendLifecycle;
  globalConfidence: number;
  latestPeriod: string;
  marketSource: "authoritative_scores";
};

function periodTimestamp(period: string) {
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) {
    return Date.UTC(Number(month[1]), Number(month[2]), 0, 23, 59, 59, 999);
  }
  const parsed = new Date(period).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isFresh(value: string, now: Date) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const age = now.getTime() - timestamp;
  return age >= -86_400_000 && age <= AUTHORITATIVE_MARKET_THRESHOLDS.maximumScoreAgeDays * 86_400_000;
}

function isFreshPeriod(value: string, now: Date) {
  const timestamp = periodTimestamp(value);
  if (!Number.isFinite(timestamp)) return false;
  const age = now.getTime() - timestamp;
  return age >= -31 * 86_400_000 && age <= AUTHORITATIVE_MARKET_THRESHOLDS.maximumScoreAgeDays * 86_400_000;
}

function createSupabaseReader(): AuthoritativeMarketScoreReader | null {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  return {
    async readGlobal(canonicalKeyword) {
      const { data, error } = await supabase
        .from("global_trend_scores")
        .select("lifecycle,confidence,latest_period")
        .eq("canonical_keyword", canonicalKeyword)
        .eq("computation_version", TREND_COMPUTATION_VERSION)
        .maybeSingle();
      if (error) throw error;
      return data as GlobalScoreRow | null;
    },
    async readRegional(canonicalKeyword) {
      const { data, error } = await supabase
        .from("regional_trend_scores")
        .select("region,regional_momentum,confidence,data_freshness,observation_count,current_interest_percentile,computed_at")
        .eq("canonical_keyword", canonicalKeyword)
        .eq("computation_version", TREND_COMPUTATION_VERSION)
        .order("computed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as RegionalScoreRow[];
    },
  };
}

/**
 * Reads the existing scoring tables by canonical keyword. This function has no
 * write-capable dependency and deliberately returns null when the authoritative
 * data is absent, stale, or too weak to support three markets.
 */
export async function loadAuthoritativeMarketPlan(
  canonicalKeyword: string,
  requestingMarket?: string | null,
  options: { reader?: AuthoritativeMarketScoreReader | null; now?: Date } = {},
): Promise<AuthoritativeMarketPlan | null> {
  const reader = options.reader === undefined ? createSupabaseReader() : options.reader;
  if (!reader) return null;
  const now = options.now || new Date();
  const [global, regional] = await Promise.all([
    reader.readGlobal(canonicalKeyword),
    reader.readRegional(canonicalKeyword),
  ]);
  const globalConfidence = Number(global?.confidence);
  if (
    !global ||
    !Number.isFinite(globalConfidence) ||
    globalConfidence < AUTHORITATIVE_MARKET_THRESHOLDS.minimumGlobalConfidence ||
    !isFreshPeriod(global.latest_period, now)
  ) {
    return null;
  }

  const latest = new Map<string, RegionalScoreRow>();
  for (const row of regional) {
    const region = row.region.toUpperCase();
    if (!latest.has(region) && isFresh(row.computed_at, now)) latest.set(region, row);
  }
  const plan = selectStylingResearchMarkets({
    lifecycle: global.lifecycle,
    requestingMarket,
    signals: [...latest.values()].map((row) => ({
      region: row.region,
      regionalMomentum: Number(row.regional_momentum),
      confidence: Number(row.confidence),
      dataFreshness: Number(row.data_freshness),
      observationCount: Number(row.observation_count),
      currentInterestPercentile: Number(row.current_interest_percentile),
    })),
  });
  if (plan.strongestMarkets.length < AUTHORITATIVE_MARKET_THRESHOLDS.minimumSupportedMarkets) return null;
  return {
    ...plan,
    lifecycle: global.lifecycle,
    globalConfidence,
    latestPeriod: global.latest_period,
    marketSource: "authoritative_scores",
  };
}
