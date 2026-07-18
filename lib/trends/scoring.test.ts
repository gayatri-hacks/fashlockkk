import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyTrendLifecycle,
  computeGlobalTrendScores,
  computeRegionalTrendScores,
  percentileRank,
  weightedMedian,
  type HistoricalTrendPoint,
} from "@/lib/trends/scoring";

const months = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"];

function points(keyword: string, region: string, scores: number[]): HistoricalTrendPoint[] {
  return scores.map((score, index) => ({
    keywordId: keyword === "loose" ? 1 : 2,
    rawKeyword: keyword,
    canonicalKeyword: keyword,
    region,
    period: months[index],
    score,
  }));
}

test("calculates percentile rank inside the comparable cohort", () => {
  assert.equal(percentileRank([10, 20, 30], 30), 100);
  assert.equal(percentileRank([10, 20, 30], 10), 0);
});

test("weighted median resists one extreme market", () => {
  assert.equal(weightedMedian([
    { value: 10, weight: 1 },
    { value: 60, weight: 5 },
    { value: 100, weight: 1 },
  ]), 60);
});

test("regional scoring uses history and handles missing regions", () => {
  const regional = computeRegionalTrendScores([
    ...points("loose", "IN", [10, 12, 15, 20, 28, 40]),
    ...points("denim", "IN", [55, 56, 56, 55, 55, 54]),
    ...points("loose", "FR", [12, 18, 26, 36, 44, 58]),
  ]);

  const looseIndia = regional.find((score) => score.canonicalKeyword === "loose" && score.region === "IN");
  assert.ok(looseIndia);
  assert.equal(looseIndia.observationCount, 6);
  assert.ok(looseIndia.velocity > 0);
});

test("global scoring handles missing India data as coming_to_india, not India breakout", () => {
  const regional = computeRegionalTrendScores([
    ...points("loose", "FR", [10, 14, 20, 28, 40, 60]),
    ...points("denim", "FR", [50, 50, 51, 50, 50, 51]),
    ...points("loose", "IT", [8, 12, 18, 26, 38, 55]),
    ...points("denim", "IT", [45, 46, 45, 45, 45, 44]),
  ]);

  const [loose] = computeGlobalTrendScores({ regionalScores: regional, supportedRegionCount: 10 })
    .filter((score) => score.canonicalKeyword === "loose");

  assert.equal(loose.indiaMomentum, null);
  assert.notEqual(loose.marketClassification, "india_breakout");
});

test("canonical lifecycle is behavior based and not a third-split", () => {
  const regional = computeRegionalTrendScores([
    ...points("loose", "IN", [10, 15, 22, 30, 42, 60]),
    ...points("denim", "IN", [60, 60, 60, 59, 59, 59]),
    ...points("loose", "FR", [12, 18, 26, 36, 49, 68]),
    ...points("denim", "FR", [55, 55, 54, 54, 54, 53]),
  ]);
  const global = computeGlobalTrendScores({ regionalScores: regional, supportedRegionCount: 2 });
  const loose = global.find((score) => score.canonicalKeyword === "loose");
  const denim = global.find((score) => score.canonicalKeyword === "denim");

  assert.equal(loose?.lifecycle, "RISING");
  assert.notEqual(denim?.lifecycle, "RISING");
  assert.equal(classifyTrendLifecycle(loose!), loose?.lifecycle);
});
