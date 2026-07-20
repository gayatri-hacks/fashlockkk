import { SUPPORTED_TREND_REGIONS, type SupportedTrendRegion, type TrendLifecycle } from "@/lib/trends/config";

export type StylingMarketSignal = { region: string; regionalMomentum: number; confidence: number; dataFreshness: number; observationCount: number; currentInterestPercentile: number };
export type StylingMarketPlan = { evaluatedMarkets: SupportedTrendRegion[]; strongestMarkets: SupportedTrendRegion[]; researchMarkets: SupportedTrendRegion[]; insufficientMarkets: SupportedTrendRegion[]; selectedReasons: Record<string,string[]> };

const ACTIVE_LIFECYCLES: TrendLifecycle[] = ["RISING", "PEAKING", "STABLE"];
export function selectStylingResearchMarkets(input: { signals: StylingMarketSignal[]; lifecycle: TrendLifecycle; requestingMarket?: string | null }): StylingMarketPlan {
  const evaluatedMarkets = SUPPORTED_TREND_REGIONS.map(({ code }) => code);
  const byRegion = new Map(input.signals.map((signal) => [signal.region.toUpperCase(), signal]));
  const supported = evaluatedMarkets.map((region) => ({ region, signal: byRegion.get(region) })).filter((entry): entry is { region: SupportedTrendRegion; signal: StylingMarketSignal } => Boolean(entry.signal && entry.signal.confidence >= .35 && entry.signal.dataFreshness >= .5 && entry.signal.observationCount >= 6 && (entry.signal.currentInterestPercentile >= 5 || entry.signal.regionalMomentum >= 5)));
  const ranked = ACTIVE_LIFECYCLES.includes(input.lifecycle) ? supported.sort((a, b) => marketStrength(b.signal) - marketStrength(a.signal)) : [];
  const strongestMarkets = ranked.slice(0, 3).map(({ region }) => region);
  const requestingMarket = evaluatedMarkets.find((region) => region === input.requestingMarket?.toUpperCase());
  const researchMarkets = Array.from(new Set([...strongestMarkets, ...(requestingMarket ? [requestingMarket] : [])]));
  const selectedReasons=Object.fromEntries(researchMarkets.map((region)=>[region,[...(strongestMarkets.includes(region)?[`top_three_supported_rank_${strongestMarkets.indexOf(region)+1}`]:[]),...(region===requestingMarket&&!strongestMarkets.includes(region)?["requesting_user_market"]:[]),"confidence_freshness_completeness_passed"]]));
  return { evaluatedMarkets, strongestMarkets, researchMarkets, insufficientMarkets: evaluatedMarkets.filter((region) => !supported.some((entry) => entry.region === region)), selectedReasons };
}
function marketStrength(signal: StylingMarketSignal) { return signal.regionalMomentum * .4 + signal.currentInterestPercentile * .25 + signal.confidence * 100 * .2 + signal.dataFreshness * 100 * .15; }

export const MARKET_RESEARCH_LANGUAGES: Record<SupportedTrendRegion, readonly string[]> = {
  IN: ["en", "hi"], US: ["en"], GB: ["en"], FR: ["fr", "en"], IT: ["it", "en"], DE: ["de", "en"], JP: ["ja", "en"], KR: ["ko", "en"], AU: ["en"], BR: ["pt", "en"], SG: ["en", "zh"], AE: ["ar", "en"],
};
