import {
  REGIONAL_MOMENTUM_WEIGHTS,
  TREND_CONFIDENCE,
  TREND_SCORE_WEIGHTS,
  leadTrendRegionCodes,
  type MarketClassification,
  type TrendLifecycle,
} from "@/lib/trends/config";
import { canonicalizeTrendKeyword, isBroadOneWordSignal } from "@/lib/trends/keyword-normalization";

export type HistoricalTrendPoint = {
  keywordId: number;
  rawKeyword: string;
  canonicalKeyword?: string;
  region: string;
  period: string;
  score: number;
};

export type RegionalTrendScore = {
  canonicalKeyword: string;
  rawKeywords: string[];
  region: string;
  currentInterest: number;
  currentInterestPercentile: number;
  velocity: number;
  velocityPercentile: number;
  acceleration: number;
  accelerationPercentile: number;
  positivePeriodPersistence: number;
  negativePeriodPersistence: number;
  regionalRank: number;
  observationCount: number;
  latestPeriod: string;
  dataFreshness: number;
  regionalMomentum: number;
  confidence: number;
};

export type SourceConfirmation = {
  sourceConfirmation: number;
  sourceDiversity: number;
  productSupportCount: number;
  articleSupportCount: number;
  evidenceFacets: string[];
  evidenceSummary: Record<string, unknown>;
};

export type GlobalTrendScore = {
  canonicalKeyword: string;
  rawKeywords: string[];
  primaryKeywordId: number | null;
  indiaMomentum: number | null;
  crossRegionMomentum: number;
  regionBreadth: number;
  regionsObserved: string[];
  regionsRising: string[];
  regionsFading: string[];
  leadRegions: string[];
  fashionLeadMarketMomentum: number;
  sourceDiversity: number;
  persistence: number;
  confidence: number;
  finalTrendScore: number;
  marketClassification: MarketClassification;
  lifecycle: TrendLifecycle;
  latestPeriod: string;
  regionalScores: RegionalTrendScore[];
  evidence: SourceConfirmation;
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function monthsBetween(a: string, b: string) {
  const start = new Date(a);
  const end = new Date(b);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
}

export function percentileRank(values: number[], value: number) {
  const comparable = values.filter((item) => Number.isFinite(item)).sort((a, b) => a - b);
  if (!comparable.length) return 0;
  if (comparable.length === 1) return 100;
  const belowOrEqual = comparable.filter((item) => item <= value).length - 1;
  return clamp((belowOrEqual / (comparable.length - 1)) * 100);
}

export function weightedMedian(items: Array<{ value: number; weight: number }>) {
  const clean = items
    .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0)
    .sort((a, b) => a.value - b.value);
  if (!clean.length) return 0;
  const totalWeight = clean.reduce((sum, item) => sum + item.weight, 0);
  let running = 0;
  for (const item of clean) {
    running += item.weight;
    if (running >= totalWeight / 2) return item.value;
  }
  return clean[clean.length - 1].value;
}

function trendVelocity(values: number[]) {
  if (values.length < 2) return 0;
  const current = values[values.length - 1];
  const previous = values[Math.max(0, values.length - 4)];
  if (previous <= 0) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

function trendAcceleration(values: number[]) {
  if (values.length < 5) return 0;
  const midpoint = Math.max(1, values.length - 4);
  const older = trendVelocity(values.slice(0, midpoint + 1));
  const newer = trendVelocity(values.slice(midpoint - 1));
  return newer - older;
}

function persistence(values: number[], direction: "positive" | "negative") {
  if (values.length < 2) return 0;
  const recent = values.slice(-6);
  const deltas = recent.slice(1).map((value, index) => value - recent[index]);
  if (!deltas.length) return 0;
  const matching = deltas.filter((delta) => direction === "positive" ? delta > 0 : delta < 0).length;
  return (matching / deltas.length) * 100;
}

export function computeRegionalTrendScores(points: HistoricalTrendPoint[]) {
  const normalizedPoints = points.map((point) => ({
    ...point,
    canonicalKeyword: point.canonicalKeyword || canonicalizeTrendKeyword(point.rawKeyword),
    score: toNumber(point.score),
  }));

  const latestByRegion = new Map<string, string>();
  for (const point of normalizedPoints) {
    const current = latestByRegion.get(point.region);
    if (!current || point.period > current) latestByRegion.set(point.region, point.period);
  }

  const byRegionKeyword = new Map<string, typeof normalizedPoints>();
  for (const point of normalizedPoints) {
    const key = `${point.region}:${point.canonicalKeyword}`;
    const list = byRegionKeyword.get(key) || [];
    list.push(point);
    byRegionKeyword.set(key, list);
  }

  const candidates = [...byRegionKeyword.entries()].map(([key, rows]) => {
    const [region, canonicalKeyword] = key.split(":");
    const sorted = rows.sort((a, b) => a.period.localeCompare(b.period));
    const values = sorted.map((row) => row.score);
    const latestPeriod = sorted[sorted.length - 1]?.period || "";
    return {
      canonicalKeyword,
      rawKeywords: Array.from(new Set(sorted.map((row) => row.rawKeyword))).slice(0, 8),
      region,
      currentInterest: values[values.length - 1] || 0,
      velocity: trendVelocity(values),
      acceleration: trendAcceleration(values),
      positivePeriodPersistence: persistence(values, "positive"),
      negativePeriodPersistence: persistence(values, "negative"),
      regionalRank: 0,
      observationCount: values.length,
      latestPeriod,
      dataFreshness: 1,
      currentInterestPercentile: 0,
      velocityPercentile: 0,
      accelerationPercentile: 0,
      regionalMomentum: 0,
      confidence: 0,
    };
  });

  const byRegion = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const list = byRegion.get(candidate.region) || [];
    list.push(candidate);
    byRegion.set(candidate.region, list);
  }

  return candidates.map((candidate) => {
    const regionCandidates = byRegion.get(candidate.region) || [];
    const latestRegionPeriod = latestByRegion.get(candidate.region) || candidate.latestPeriod;
    const currentInterestPercentile = percentileRank(regionCandidates.map((item) => item.currentInterest), candidate.currentInterest);
    const velocityPercentile = percentileRank(regionCandidates.map((item) => item.velocity), candidate.velocity);
    const accelerationPercentile = percentileRank(regionCandidates.map((item) => item.acceleration), candidate.acceleration);
    const ranked = [...regionCandidates].sort((a, b) => b.currentInterest - a.currentInterest);
    const regionalRank = ranked.findIndex((item) => item.canonicalKeyword === candidate.canonicalKeyword) + 1;
    const freshness = clamp(100 - monthsBetween(candidate.latestPeriod, latestRegionPeriod) * 25) / 100;
    const historyConfidence = clamp((candidate.observationCount / TREND_CONFIDENCE.minObservations) * 100) / 100;
    const regionalMomentum =
      velocityPercentile * REGIONAL_MOMENTUM_WEIGHTS.velocityPercentile +
      currentInterestPercentile * REGIONAL_MOMENTUM_WEIGHTS.currentInterestPercentile +
      accelerationPercentile * REGIONAL_MOMENTUM_WEIGHTS.accelerationPercentile +
      candidate.positivePeriodPersistence * REGIONAL_MOMENTUM_WEIGHTS.positivePeriodPersistence;

    return {
      ...candidate,
      currentInterestPercentile,
      velocityPercentile,
      accelerationPercentile,
      regionalRank,
      dataFreshness: freshness,
      regionalMomentum: clamp(regionalMomentum),
      confidence: clamp(historyConfidence * freshness * 100) / 100,
    };
  });
}

export function classifyTrendLifecycle(score: Pick<GlobalTrendScore, "confidence" | "regionalScores" | "crossRegionMomentum" | "regionBreadth" | "persistence">): TrendLifecycle {
  const usable = score.regionalScores.filter((regional) => regional.confidence >= 0.35);
  if (score.confidence < 0.25 || usable.length === 0) return "INSUFFICIENT_DATA";

  const weightedVelocity = average(usable.map((regional) => regional.velocity * regional.confidence));
  const currentInterest = average(usable.map((regional) => regional.currentInterestPercentile));
  const acceleration = average(usable.map((regional) => regional.accelerationPercentile));
  const positivePersistence = average(usable.map((regional) => regional.positivePeriodPersistence));
  const negativePersistence = average(usable.map((regional) => regional.negativePeriodPersistence));

  if (weightedVelocity > 0.18 && positivePersistence >= 45 && (acceleration >= 55 || score.regionBreadth >= 35)) {
    return "RISING";
  }

  if (weightedVelocity < -0.12 && negativePersistence >= 45) {
    return "FADING";
  }

  if (currentInterest >= 65 && weightedVelocity > -0.12 && weightedVelocity < 0.18) {
    return "PEAKING";
  }

  return "STABLE";
}

function classifyMarket({
  indiaMomentum,
  crossRegionMomentum,
  regionBreadth,
  regionsObserved,
  regionsRising,
  confidence,
}: {
  indiaMomentum: number | null;
  crossRegionMomentum: number;
  regionBreadth: number;
  regionsObserved: string[];
  regionsRising: string[];
  confidence: number;
}): MarketClassification {
  if (confidence < 0.25 || !regionsObserved.length) return "insufficient_evidence";
  if (indiaMomentum !== null && indiaMomentum >= 68 && regionsRising.includes("IN")) return "india_breakout";
  if (indiaMomentum === null && crossRegionMomentum >= 62 && regionBreadth >= 15) return "coming_to_india";
  if (regionsObserved.length >= TREND_CONFIDENCE.minRegionsForCrossMarket && crossRegionMomentum >= 58) return "cross_market_rising";
  if (regionBreadth >= 35 && crossRegionMomentum >= 54) return "global_momentum";
  return "local_only";
}

export function computeGlobalTrendScores({
  regionalScores,
  sourceConfirmations = new Map(),
  supportedRegionCount,
  primaryKeywordIds = new Map(),
}: {
  regionalScores: RegionalTrendScore[];
  sourceConfirmations?: Map<string, SourceConfirmation>;
  supportedRegionCount: number;
  primaryKeywordIds?: Map<string, number>;
}) {
  const grouped = new Map<string, RegionalTrendScore[]>();
  for (const score of regionalScores) {
    const list = grouped.get(score.canonicalKeyword) || [];
    list.push(score);
    grouped.set(score.canonicalKeyword, list);
  }

  return [...grouped.entries()].map(([canonicalKeyword, scores]) => {
    const rawKeywords = Array.from(new Set(scores.flatMap((score) => score.rawKeywords))).slice(0, 12);
    const indiaScore = scores.find((score) => score.region === "IN");
    const leadRegions = new Set<string>(leadTrendRegionCodes());
    const leadScores = scores.filter((score) => leadRegions.has(score.region));
    const source = sourceConfirmations.get(canonicalKeyword) || neutralSourceConfirmation(canonicalKeyword);
    const sourceConfirmation = source.sourceConfirmation;
    const crossRegionMomentum = weightedMedian(scores.map((score) => ({ value: score.regionalMomentum, weight: score.confidence })));
    const regionBreadth = clamp((scores.length / Math.max(1, supportedRegionCount)) * 100);
    const fashionLeadMarketMomentum = leadScores.length
      ? weightedMedian(leadScores.map((score) => ({ value: score.regionalMomentum, weight: score.confidence })))
      : crossRegionMomentum;
    const confidenceBase = average(scores.map((score) => score.confidence));
    const broadSignalPenalty = isBroadOneWordSignal(canonicalKeyword) && source.sourceDiversity < 2 ? 0.78 : 1;
    const confidence = clamp((confidenceBase * 0.7 + Math.min(1, scores.length / Math.max(1, supportedRegionCount)) * 0.3) * broadSignalPenalty * 100) / 100;
    const sourceScoreForFinal = source.sourceDiversity === 0 ? 50 : sourceConfirmation;

    const finalTrendScore = clamp(
      (indiaScore ? indiaScore.regionalMomentum * TREND_SCORE_WEIGHTS.indiaMomentum : 0) +
        crossRegionMomentum * TREND_SCORE_WEIGHTS.crossRegionMomentum +
        regionBreadth * TREND_SCORE_WEIGHTS.regionBreadth +
        fashionLeadMarketMomentum * TREND_SCORE_WEIGHTS.fashionLeadMarketMomentum +
        sourceScoreForFinal * TREND_SCORE_WEIGHTS.sourceConfirmation,
    );

    const regionsRising = scores.filter((score) => score.velocity > 0.1 && score.positivePeriodPersistence >= 35).map((score) => score.region);
    const regionsFading = scores.filter((score) => score.velocity < -0.1 && score.negativePeriodPersistence >= 35).map((score) => score.region);
    const persistenceScore = average(scores.map((score) => Math.max(score.positivePeriodPersistence, score.negativePeriodPersistence)));
    const latestPeriod = scores.map((score) => score.latestPeriod).sort().at(-1) || "";

    const base = {
      canonicalKeyword,
      rawKeywords,
      primaryKeywordId: primaryKeywordIds.get(canonicalKeyword) || null,
      indiaMomentum: indiaScore?.regionalMomentum ?? null,
      crossRegionMomentum,
      regionBreadth,
      regionsObserved: scores.map((score) => score.region).sort(),
      regionsRising,
      regionsFading,
      leadRegions: leadScores.map((score) => score.region).sort(),
      fashionLeadMarketMomentum,
      sourceDiversity: source.sourceDiversity,
      persistence: persistenceScore,
      confidence,
      finalTrendScore,
      marketClassification: "insufficient_evidence" as MarketClassification,
      lifecycle: "INSUFFICIENT_DATA" as TrendLifecycle,
      latestPeriod,
      regionalScores: scores,
      evidence: source,
    };

    return {
      ...base,
      marketClassification: classifyMarket(base),
      lifecycle: classifyTrendLifecycle(base),
    };
  });
}

export function neutralSourceConfirmation(canonicalKeyword: string): SourceConfirmation {
  return {
    sourceConfirmation: isBroadOneWordSignal(canonicalKeyword) ? 45 : 50,
    sourceDiversity: 0,
    productSupportCount: 0,
    articleSupportCount: 0,
    evidenceFacets: [canonicalKeyword],
    evidenceSummary: { limitation: "No reliable non-Google confirmation found; source weight held neutral." },
  };
}
