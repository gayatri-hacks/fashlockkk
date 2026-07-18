export const TREND_COMPUTATION_VERSION = "multi-region-v1";

export const SUPPORTED_TREND_REGIONS = [
  { code: "IN", market: "India", leadMarket: true, indiaWeight: 0.4 },
  { code: "US", market: "United States", leadMarket: true },
  { code: "GB", market: "United Kingdom", leadMarket: true },
  { code: "FR", market: "France", leadMarket: true },
  { code: "IT", market: "Italy", leadMarket: true },
  { code: "DE", market: "Germany", leadMarket: true },
  { code: "JP", market: "Japan", leadMarket: true },
  { code: "KR", market: "Korea", leadMarket: true },
  { code: "AU", market: "Australia", leadMarket: false },
  { code: "BR", market: "Brazil", leadMarket: false },
  { code: "SG", market: "Singapore", leadMarket: false },
  { code: "AE", market: "UAE", leadMarket: false },
] as const;

export type SupportedTrendRegion = (typeof SUPPORTED_TREND_REGIONS)[number]["code"];

export type TrendLifecycle =
  | "RISING"
  | "PEAKING"
  | "FADING"
  | "STABLE"
  | "INSUFFICIENT_DATA";

export type MarketClassification =
  | "india_breakout"
  | "cross_market_rising"
  | "coming_to_india"
  | "global_momentum"
  | "local_only"
  | "insufficient_evidence";

export const TREND_SCORE_WEIGHTS = {
  indiaMomentum: 0.4,
  crossRegionMomentum: 0.25,
  regionBreadth: 0.15,
  fashionLeadMarketMomentum: 0.1,
  sourceConfirmation: 0.1,
} as const;

export const REGIONAL_MOMENTUM_WEIGHTS = {
  velocityPercentile: 0.45,
  currentInterestPercentile: 0.25,
  accelerationPercentile: 0.15,
  positivePeriodPersistence: 0.15,
} as const;

export const TREND_CONFIDENCE = {
  minObservations: 6,
  minFreshnessMonths: 4,
  minRegionsForCrossMarket: 2,
  maxAiTrendsPerRun: Number(process.env.MAX_AI_TRENDS_PER_RUN || 8),
} as const;

export function isMultiRegionTrendsEnabled() {
  return process.env.MULTI_REGION_TRENDS_ENABLED === "true";
}

export function isAiTrendRefinementEnabled() {
  return process.env.AI_TREND_REFINEMENT_ENABLED === "true";
}

export function isTrendImageAutoEnqueueEnabled() {
  return process.env.AUTO_ENQUEUE_TREND_IMAGES_ENABLED === "true";
}

export function regionLabel(code: string) {
  return SUPPORTED_TREND_REGIONS.find((region) => region.code === code)?.market || code;
}

export function leadTrendRegionCodes() {
  return SUPPORTED_TREND_REGIONS.filter((region) => region.leadMarket).map((region) => region.code);
}
