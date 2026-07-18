import test from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarMonths,
  buildCatchUpPeriodPlan,
  buildPeriodFinalizationPlan,
  calendarMonthStart,
  dedupeHistoricalPeriodRecords,
  expectedPeriodEnd,
  globalPeriodCoverage,
  historicalPeriodIdentity,
  latestComparableCompletePeriod,
  precedingCalendarMonth,
  shouldUseHistoricalPoint,
  type PeriodCoverage,
  type RegionPeriodStatus,
} from "@/lib/trends/period-finalization";
import { computeGlobalTrendScores, computeRegionalTrendScores, type HistoricalTrendPoint } from "@/lib/trends/scoring";

const regions = ["IN", "US", "FR"];

test("July 31 to August 1 rollover targets July finalisation", () => {
  const july31 = new Date("2026-07-31T23:59:59.000Z");
  const aug1 = new Date("2026-08-01T00:00:00.000Z");

  assert.equal(calendarMonthStart(july31), "2026-07-01");
  assert.equal(calendarMonthStart(aug1), "2026-08-01");
  assert.equal(precedingCalendarMonth(aug1), "2026-07-01");
  assert.equal(expectedPeriodEnd("2026-07-01"), "2026-08-01");
});

test("partial July is replaced by completed July with the same upsert identity", () => {
  const partial = { keywordId: 1, month: "2026-07-01", region: "IN", periodStatus: "partial" as const };
  const complete = { keywordId: 1, month: "2026-07-01", region: "IN", periodStatus: "complete" as const };
  const rows = dedupeHistoricalPeriodRecords([partial, complete]);

  assert.equal(historicalPeriodIdentity(partial), "1:2026-07-01:IN");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].periodStatus, "complete");
});

test("one region failing finalisation prevents full global completion", () => {
  const statuses: RegionPeriodStatus[] = [
    { region: "IN", periodMonth: "2026-07-01", periodStatus: "complete" },
    { region: "US", periodMonth: "2026-07-01", periodStatus: "complete" },
    { region: "FR", periodMonth: "2026-07-01", periodStatus: "failed" },
  ];

  const coverage = globalPeriodCoverage({ periodMonth: "2026-07-01", configuredRegions: regions, statuses, minCoverageRatio: 1 });
  assert.equal(coverage.periodStatus, "incomplete");
  assert.equal(coverage.isMateriallyComplete, false);
  assert.deepEqual(coverage.missingRegions, ["FR"]);
});

test("provider-not-ready on August 1 is retried later", () => {
  const augustFirstStatuses: RegionPeriodStatus[] = [
    { region: "IN", periodMonth: "2026-07-01", periodStatus: "provider_not_ready" },
  ];
  const plan = buildPeriodFinalizationPlan({
    now: new Date("2026-08-01T08:00:00.000Z"),
    configuredRegions: ["IN"],
    statuses: augustFirstStatuses,
  });

  assert.deepEqual(plan.regionsToFinalize, ["IN"]);
  assert.deepEqual(plan.regionsProviderNotReady, ["IN"]);

  const laterStatuses: RegionPeriodStatus[] = [
    { region: "IN", periodMonth: "2026-07-01", periodStatus: "complete" },
  ];
  const retryPlan = buildPeriodFinalizationPlan({
    now: new Date("2026-08-03T08:00:00.000Z"),
    configuredRegions: ["IN"],
    statuses: laterStatuses,
  });

  assert.deepEqual(retryPlan.regionsToFinalize, []);
  assert.deepEqual(retryPlan.regionsAlreadyComplete, ["IN"]);
});

test("August becomes the new current partial month after August begins", () => {
  const plan = buildPeriodFinalizationPlan({
    now: new Date("2026-08-01T00:00:00.000Z"),
    configuredRegions: ["IN", "US"],
    statuses: [],
  });

  assert.equal(plan.currentPartialMonth, "2026-08-01");
  assert.equal(plan.precedingMonth, "2026-07-01");
  assert.deepEqual(plan.regionsToFinalize, ["IN", "US"]);
});

test("latest comparable complete period ignores partial current month", () => {
  const statuses: RegionPeriodStatus[] = [
    { region: "IN", periodMonth: "2026-07-01", periodStatus: "complete" },
    { region: "US", periodMonth: "2026-07-01", periodStatus: "complete" },
    { region: "FR", periodMonth: "2026-07-01", periodStatus: "complete" },
    { region: "IN", periodMonth: "2026-08-01", periodStatus: "partial" },
    { region: "US", periodMonth: "2026-08-01", periodStatus: "partial" },
    { region: "FR", periodMonth: "2026-08-01", periodStatus: "partial" },
  ];

  const comparable = latestComparableCompletePeriod({
    configuredRegions: regions,
    statuses,
    now: new Date("2026-08-12T00:00:00.000Z"),
  });

  assert.equal(comparable?.periodMonth, "2026-07-01");
  assert.equal(shouldUseHistoricalPoint({ month: "2026-08-01", periodStatus: "partial", latestComparablePeriod: comparable?.periodMonth }), false);
  assert.equal(shouldUseHistoricalPoint({ month: "2026-07-01", periodStatus: "complete", latestComparablePeriod: comparable?.periodMonth }), true);
});

test("lifecycle recomputes after July finalisation becomes usable", () => {
  const base: HistoricalTrendPoint[] = [
    { keywordId: 1, rawKeyword: "linen", canonicalKeyword: "linen", region: "IN", period: "2026-05-01", score: 20 },
    { keywordId: 1, rawKeyword: "linen", canonicalKeyword: "linen", region: "IN", period: "2026-06-01", score: 22 },
    { keywordId: 2, rawKeyword: "denim", canonicalKeyword: "denim", region: "IN", period: "2026-05-01", score: 50 },
    { keywordId: 2, rawKeyword: "denim", canonicalKeyword: "denim", region: "IN", period: "2026-06-01", score: 50 },
  ];
  const july: HistoricalTrendPoint[] = [
    { keywordId: 1, rawKeyword: "linen", canonicalKeyword: "linen", region: "IN", period: "2026-07-01", score: 80 },
    { keywordId: 2, rawKeyword: "denim", canonicalKeyword: "denim", region: "IN", period: "2026-07-01", score: 49 },
  ];

  const beforeRegional = computeRegionalTrendScores(base);
  const before = computeGlobalTrendScores({ regionalScores: beforeRegional, supportedRegionCount: 1 })
    .find((score) => score.canonicalKeyword === "linen");
  const afterRegional = computeRegionalTrendScores([...base, ...july]);
  const after = computeGlobalTrendScores({ regionalScores: afterRegional, supportedRegionCount: 1 })
    .find((score) => score.canonicalKeyword === "linen");

  assert.notEqual(before?.finalTrendScore, after?.finalTrendScore);
  assert.equal(after?.lifecycle, "RISING");
});

test("year rollover from December to January targets December finalisation", () => {
  const jan1 = new Date("2027-01-01T00:00:00.000Z");
  assert.equal(calendarMonthStart(jan1), "2027-01-01");
  assert.equal(precedingCalendarMonth(jan1), "2026-12-01");
  assert.equal(addCalendarMonths("2026-12-01", 1), "2027-01-01");
});

test("catch-up plans May and June complete plus July partial when latest historical month is April", () => {
  const coverage: PeriodCoverage[] = [
    { periodMonth: "2026-04-01", completeRegions: regions },
  ];
  const plan = buildCatchUpPeriodPlan({
    now: new Date("2026-07-18T00:00:00.000Z"),
    configuredRegions: regions,
    coverages: coverage,
  });

  assert.equal(plan.latestCompleteBaseline, "2026-04-01");
  assert.deepEqual(plan.closedMonthsToFinalize, ["2026-05-01", "2026-06-01"]);
  assert.equal(plan.currentPartialMonth, "2026-07-01");
  assert.deepEqual(plan.currentPartialRegions, regions);
});

test("catch-up enumerates multiple missing closed months without hardcoded dates", () => {
  const plan = buildCatchUpPeriodPlan({
    now: new Date("2027-03-09T00:00:00.000Z"),
    configuredRegions: regions,
    coverages: [{ periodMonth: "2026-11-01", completeRegions: regions }],
  });

  assert.deepEqual(plan.closedMonthsToFinalize, [
    "2026-12-01",
    "2027-01-01",
    "2027-02-01",
  ]);
  assert.equal(plan.currentPartialMonth, "2027-03-01");
});

test("catch-up skips already-finalized complete months", () => {
  const statuses: RegionPeriodStatus[] = regions.map((region) => ({
    region,
    periodMonth: "2026-05-01",
    periodStatus: "complete",
  }));
  const plan = buildCatchUpPeriodPlan({
    now: new Date("2026-07-18T00:00:00.000Z"),
    configuredRegions: regions,
    coverages: [{ periodMonth: "2026-04-01", completeRegions: regions }],
    statuses,
  });

  assert.deepEqual(plan.closedMonthsToFinalize, ["2026-06-01"]);
});

test("incomplete closed month remains a recomputation blocker", () => {
  const statuses: RegionPeriodStatus[] = [
    { region: "IN", periodMonth: "2026-05-01", periodStatus: "complete" },
    { region: "US", periodMonth: "2026-05-01", periodStatus: "provider_not_ready" },
    { region: "FR", periodMonth: "2026-05-01", periodStatus: "complete" },
  ];
  const plan = buildCatchUpPeriodPlan({
    now: new Date("2026-07-18T00:00:00.000Z"),
    configuredRegions: regions,
    coverages: [{ periodMonth: "2026-04-01", completeRegions: regions }],
    statuses,
    minCoverageRatio: 1,
  });

  assert.deepEqual(plan.closedMonthsToFinalize, ["2026-05-01", "2026-06-01"]);
  assert.deepEqual(plan.blockedClosedMonths, ["2026-05-01"]);
});
