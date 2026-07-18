import { SUPPORTED_TREND_REGIONS } from "@/lib/trends/config";

export type PeriodStatus = "partial" | "complete" | "provider_not_ready" | "failed";

export type RegionPeriodStatus = {
  region: string;
  periodMonth: string;
  periodStatus: PeriodStatus;
  providerReady?: boolean;
  rowCount?: number;
  keywordCount?: number;
  finalizedAt?: string | null;
};

export type PeriodFinalizationPlan = {
  currentPartialMonth: string;
  precedingMonth: string;
  regionsToFinalize: string[];
  regionsAlreadyComplete: string[];
  regionsProviderNotReady: string[];
  expectedRegions: string[];
};

export type PeriodCoverage = {
  periodMonth: string;
  completeRegions: string[];
};

export type CatchUpPeriodPlan = {
  currentPartialMonth: string;
  latestClosedMonth: string;
  latestCompleteBaseline: string | null;
  closedMonthsToFinalize: string[];
  currentPartialRegions: string[];
  blockedClosedMonths: string[];
};

export const MATERIAL_GLOBAL_COVERAGE_RATIO = 0.8;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function calendarMonthStart(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`;
}

export function addCalendarMonths(monthStart: string, months: number) {
  const date = new Date(`${monthStart}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return calendarMonthStart(date);
}

export function precedingCalendarMonth(date: Date) {
  return addCalendarMonths(calendarMonthStart(date), -1);
}

export function enumerateCalendarMonthsAfter(startExclusive: string | null, endInclusive: string) {
  const months: string[] = [];
  if (!startExclusive) return [endInclusive];

  for (let cursor = addCalendarMonths(startExclusive, 1); cursor <= endInclusive; cursor = addCalendarMonths(cursor, 1)) {
    months.push(cursor);
  }

  return months;
}

export function expectedPeriodEnd(monthStart: string) {
  return addCalendarMonths(monthStart, 1);
}

export function hasPeriodEnded(monthStart: string, now: Date) {
  return calendarMonthStart(now) >= expectedPeriodEnd(monthStart);
}

export function configuredTrendRegions() {
  const configured = process.env.TREND_MARKETS?.split(",").map((region) => region.trim().toUpperCase()).filter(Boolean);
  return configured?.length ? configured : SUPPORTED_TREND_REGIONS.map((region) => region.code);
}

export function buildPeriodFinalizationPlan({
  now,
  configuredRegions,
  statuses,
}: {
  now: Date;
  configuredRegions: string[];
  statuses: RegionPeriodStatus[];
}): PeriodFinalizationPlan {
  const currentPartialMonth = calendarMonthStart(now);
  const precedingMonth = precedingCalendarMonth(now);
  const statusByRegion = new Map(
    statuses
      .filter((status) => status.periodMonth === precedingMonth)
      .map((status) => [status.region.toUpperCase(), status]),
  );

  const regionsAlreadyComplete: string[] = [];
  const regionsProviderNotReady: string[] = [];
  const regionsToFinalize: string[] = [];

  for (const region of configuredRegions.map((item) => item.toUpperCase())) {
    const status = statusByRegion.get(region);
    if (status?.periodStatus === "complete") {
      regionsAlreadyComplete.push(region);
    } else {
      regionsToFinalize.push(region);
      if (status?.periodStatus === "provider_not_ready") regionsProviderNotReady.push(region);
    }
  }

  return {
    currentPartialMonth,
    precedingMonth,
    regionsToFinalize,
    regionsAlreadyComplete,
    regionsProviderNotReady,
    expectedRegions: configuredRegions.map((item) => item.toUpperCase()),
  };
}

export function globalPeriodCoverage({
  periodMonth,
  configuredRegions,
  statuses,
  minCoverageRatio = MATERIAL_GLOBAL_COVERAGE_RATIO,
}: {
  periodMonth: string;
  configuredRegions: string[];
  statuses: RegionPeriodStatus[];
  minCoverageRatio?: number;
}) {
  const expectedRegions = configuredRegions.map((region) => region.toUpperCase());
  const completeRegions = statuses
    .filter((status) => status.periodMonth === periodMonth && status.periodStatus === "complete")
    .map((status) => status.region.toUpperCase())
    .filter((region, index, regions) => expectedRegions.includes(region) && regions.indexOf(region) === index)
    .sort();
  const missingRegions = expectedRegions.filter((region) => !completeRegions.includes(region)).sort();
  const materialCoverageRatio = expectedRegions.length ? completeRegions.length / expectedRegions.length : 0;

  return {
    periodMonth,
    periodStatus: materialCoverageRatio >= minCoverageRatio ? "complete" as const : "incomplete" as const,
    expectedRegions,
    completeRegions,
    missingRegions,
    materialCoverageRatio,
    isMateriallyComplete: materialCoverageRatio >= minCoverageRatio,
  };
}

export function latestComparableCompletePeriod({
  configuredRegions,
  statuses,
  now,
  minCoverageRatio = MATERIAL_GLOBAL_COVERAGE_RATIO,
}: {
  configuredRegions: string[];
  statuses: RegionPeriodStatus[];
  now: Date;
  minCoverageRatio?: number;
}) {
  const currentPartialMonth = calendarMonthStart(now);
  const candidateMonths = Array.from(new Set(statuses.map((status) => status.periodMonth)))
    .filter((month) => month < currentPartialMonth)
    .sort()
    .reverse();

  for (const periodMonth of candidateMonths) {
    const coverage = globalPeriodCoverage({ periodMonth, configuredRegions, statuses, minCoverageRatio });
    if (coverage.isMateriallyComplete) return coverage;
  }

  return null;
}

export function latestMateriallyCompleteCoverageMonth({
  coverages,
  configuredRegions,
  currentPartialMonth,
  minCoverageRatio = MATERIAL_GLOBAL_COVERAGE_RATIO,
}: {
  coverages: PeriodCoverage[];
  configuredRegions: string[];
  currentPartialMonth: string;
  minCoverageRatio?: number;
}) {
  const expectedRegions = configuredRegions.map((region) => region.toUpperCase());
  const candidates = coverages
    .filter((coverage) => coverage.periodMonth < currentPartialMonth)
    .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth));

  for (const coverage of candidates) {
    const completeRegions = new Set(coverage.completeRegions.map((region) => region.toUpperCase()));
    const ratio = expectedRegions.filter((region) => completeRegions.has(region)).length / Math.max(1, expectedRegions.length);
    if (ratio >= minCoverageRatio) return coverage.periodMonth;
  }

  return null;
}

export function buildCatchUpPeriodPlan({
  now,
  configuredRegions,
  coverages,
  statuses = [],
  minCoverageRatio = MATERIAL_GLOBAL_COVERAGE_RATIO,
}: {
  now: Date;
  configuredRegions: string[];
  coverages: PeriodCoverage[];
  statuses?: RegionPeriodStatus[];
  minCoverageRatio?: number;
}): CatchUpPeriodPlan {
  const currentPartialMonth = calendarMonthStart(now);
  const latestClosedMonth = precedingCalendarMonth(now);
  const latestCompleteBaseline = latestMateriallyCompleteCoverageMonth({
    coverages,
    configuredRegions,
    currentPartialMonth,
    minCoverageRatio,
  });
  const candidateClosedMonths = latestCompleteBaseline
    ? enumerateCalendarMonthsAfter(latestCompleteBaseline, latestClosedMonth)
    : enumerateCalendarMonthsAfter(addCalendarMonths(latestClosedMonth, -1), latestClosedMonth);
  const expectedRegions = configuredRegions.map((region) => region.toUpperCase());

  const closedMonthsToFinalize = candidateClosedMonths.filter((periodMonth) => {
    const coverage = globalPeriodCoverage({
      periodMonth,
      configuredRegions: expectedRegions,
      statuses,
      minCoverageRatio,
    });
    return !coverage.isMateriallyComplete;
  });

  const blockedClosedMonths = closedMonthsToFinalize.filter((periodMonth) => {
    const rows = statuses.filter((status) => status.periodMonth === periodMonth);
    return rows.some((status) => status.periodStatus !== "complete");
  });

  return {
    currentPartialMonth,
    latestClosedMonth,
    latestCompleteBaseline,
    closedMonthsToFinalize,
    currentPartialRegions: expectedRegions,
    blockedClosedMonths,
  };
}

export function shouldUseHistoricalPoint({
  month,
  periodStatus,
  latestComparablePeriod,
}: {
  month: string;
  periodStatus?: string | null;
  latestComparablePeriod?: string | null;
}) {
  if (periodStatus === "partial") return false;
  if (latestComparablePeriod && month > latestComparablePeriod) return false;
  return true;
}

export type HistoricalPeriodRecord = {
  keywordId: number;
  month: string;
  region: string;
  periodStatus: "partial" | "complete";
};

export function historicalPeriodIdentity(record: Pick<HistoricalPeriodRecord, "keywordId" | "month" | "region">) {
  return `${record.keywordId}:${record.month}:${record.region.toUpperCase()}`;
}

export function dedupeHistoricalPeriodRecords<T extends HistoricalPeriodRecord>(records: T[]) {
  const deduped = new Map<string, T>();
  for (const record of records) {
    deduped.set(historicalPeriodIdentity(record), record);
  }
  return [...deduped.values()];
}
