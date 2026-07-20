import { getSupabaseClient } from "@/lib/supabase";
import { TREND_COMPUTATION_VERSION, type TrendLifecycle } from "@/lib/trends/config";
import { selectStylingResearchMarkets } from "./market-selection";

export async function loadAuthoritativeMarketPlan(canonicalKeyword: string, requestingMarket?: string | null) {
  const supabase = getSupabaseClient(); if (!supabase) throw new Error("Supabase is required for market authority");
  const [{ data: global, error: globalError }, { data: regional, error: regionalError }] = await Promise.all([
    supabase.from("global_trend_scores").select("lifecycle,confidence,latest_period").eq("canonical_keyword", canonicalKeyword).eq("computation_version", TREND_COMPUTATION_VERSION).maybeSingle(),
    supabase.from("regional_trend_scores").select("region,regional_momentum,confidence,data_freshness,observation_count,current_interest_percentile,computed_at").eq("canonical_keyword", canonicalKeyword).eq("computation_version", TREND_COMPUTATION_VERSION).order("computed_at", { ascending: false }),
  ]);
  if (globalError || regionalError) throw globalError || regionalError;
  if (!global) throw new Error("Canonical trend has no authoritative global score");
  const latest = new Map<string, any>(); for (const row of regional || []) if (!latest.has(row.region)) latest.set(row.region, row);
  return { ...selectStylingResearchMarkets({ lifecycle: global.lifecycle as TrendLifecycle, requestingMarket, signals: [...latest.values()].map((row) => ({ region: row.region, regionalMomentum: Number(row.regional_momentum), confidence: Number(row.confidence), dataFreshness: Number(row.data_freshness), observationCount: Number(row.observation_count), currentInterestPercentile: Number(row.current_interest_percentile) })) }), lifecycle: global.lifecycle as TrendLifecycle, globalConfidence: Number(global.confidence), latestPeriod: global.latest_period };
}
