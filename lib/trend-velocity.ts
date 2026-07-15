import { getSupabaseClient } from "@/lib/supabase";

export type TrendingKeyword = {
  keywordId: number;
  keyword: string;
  score: number;
  comparisonScore: number;
  velocity: number;
};

type TrendSnapshotRow = {
  keyword_id: number;
  snapshot_date: string;
  blended_score: number | null;
  google_score: number | null;
  growth_percentage: number | null;
};

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateSnapshotScore(rows: TrendSnapshotRow[]) {
  const blended = rows.map((row) => toNumber(row.blended_score)).filter((value) => value > 0);
  if (blended.length) return average(blended);

  const google = rows.map((row) => toNumber(row.google_score)).filter((value) => value > 0);
  if (google.length) return average(google);

  const growth = rows.map((row) => toNumber(row.growth_percentage)).filter((value) => value > 0);
  return growth.length ? average(growth) : 0;
}

async function latestSnapshotDate(supabase: any) {
  const { data, error } = await supabase
    .from("trend_snapshots")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.snapshot_date || null;
}

async function latestHistoricalMonth(supabase: any, market: string) {
  const { data, error } = await supabase
    .from("historical_trend_data")
    .select("month")
    .eq("market", market)
    .order("month", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.month || null;
}

export async function getLatestTrendMonth(supabase: any, market: string): Promise<string | null> {
  return latestHistoricalMonth(supabase, market);
}

async function getTopTrendingKeywordsFromSnapshots(limit: number): Promise<TrendingKeyword[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const latestDate = await latestSnapshotDate(supabase);
  if (!latestDate) return [];

  const previousDate = new Date(new Date(latestDate).getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [{ data: currentRows, error: currentError }, { data: previousRows, error: previousError }] =
    await Promise.all([
      supabase
        .from("trend_snapshots")
        .select("keyword_id, snapshot_date, blended_score, google_score, growth_percentage")
        .eq("snapshot_date", latestDate)
        .limit(500),
      supabase
        .from("trend_snapshots")
        .select("keyword_id, snapshot_date, blended_score, google_score, growth_percentage")
        .eq("snapshot_date", previousDate)
        .limit(500),
    ]);

  if (currentError) throw currentError;
  if (previousError) throw previousError;

  const groupedCurrent = new Map<number, TrendSnapshotRow[]>();
  for (const row of (currentRows ?? []) as TrendSnapshotRow[]) {
    const list = groupedCurrent.get(row.keyword_id) ?? [];
    list.push(row);
    groupedCurrent.set(row.keyword_id, list);
  }

  if (!groupedCurrent.size) return [];

  const groupedPrevious = new Map<number, TrendSnapshotRow[]>();
  for (const row of (previousRows ?? []) as TrendSnapshotRow[]) {
    const list = groupedPrevious.get(row.keyword_id) ?? [];
    list.push(row);
    groupedPrevious.set(row.keyword_id, list);
  }

  const keywordIds = [...groupedCurrent.keys()];
  const { data: keywords, error: keywordsError } = await supabase
    .from("trend_keywords")
    .select("id, keyword")
    .in("id", keywordIds)
    .limit(Math.max(100, keywordIds.length));

  if (keywordsError) throw keywordsError;

  const keywordMap = new Map((keywords ?? []).map((row: any) => [Number(row.id), String(row.keyword)]));

  return keywordIds
    .map((keywordId) => {
      const keyword = keywordMap.get(keywordId);
      if (!keyword) return null;

      const score = aggregateSnapshotScore(groupedCurrent.get(keywordId) ?? []);
      const comparisonScore = aggregateSnapshotScore(groupedPrevious.get(keywordId) ?? []);
      const velocity = comparisonScore > 0 ? (score - comparisonScore) / comparisonScore : score > 0 ? 1 : 0;

      return {
        keywordId,
        keyword,
        score,
        comparisonScore,
        velocity,
      };
    })
    .filter((row): row is TrendingKeyword => Boolean(row))
    .sort((a, b) => b.score - a.score || b.velocity - a.velocity)
    .slice(0, limit);
}

async function getTopTrendingKeywordsFromHistorical(market: string, limit: number): Promise<TrendingKeyword[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const latestMonth = await latestHistoricalMonth(supabase, market);
  if (!latestMonth) return [];

  const { data: currentRows, error: currentError } = await supabase
    .from("historical_trend_data")
    .select("keyword_id, month, google_score")
    .eq("market", market)
    .eq("month", latestMonth)
    .order("google_score", { ascending: false })
    .limit(limit);
  if (currentError) throw currentError;

  const keywordIds = (currentRows || []).map((row: any) => row.keyword_id).filter(Boolean);
  if (!keywordIds.length) return [];

  const threeMonthsAgo = new Date(new Date(latestMonth).getTime() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [{ data: comparisonRows, error: comparisonError }, { data: keywords, error: keywordsError }] = await Promise.all([
    supabase
      .from("historical_trend_data")
      .select("keyword_id, month, google_score")
      .eq("market", market)
      .eq("month", threeMonthsAgo)
      .in("keyword_id", keywordIds)
      .limit(Math.max(100, limit)),
    supabase.from("trend_keywords").select("id, keyword").in("id", keywordIds),
  ]);

  if (comparisonError) throw comparisonError;
  if (keywordsError) throw keywordsError;

  const comparisonMap = new Map((comparisonRows || []).map((row: any) => [row.keyword_id, toNumber(row.google_score)]));
  const keywordMap = new Map((keywords || []).map((row: any) => [row.id, row.keyword]));

  return (currentRows || [])
    .map((row: any) => {
      const keyword = keywordMap.get(row.keyword_id);
      if (!keyword) return null;

      const score = toNumber(row.google_score);
      const comparisonScore = toNumber(comparisonMap.get(row.keyword_id));
      const velocity = comparisonScore > 0 ? (score - comparisonScore) / comparisonScore : score;

      return {
        keywordId: Number(row.keyword_id),
        keyword: String(keyword),
        score,
        comparisonScore,
        velocity,
      };
    })
    .filter((row): row is TrendingKeyword => Boolean(row));
}

export async function getTopTrendingKeywords(
  market: string,
  limit: number,
): Promise<TrendingKeyword[]> {
  try {
    const snapshotRows = await getTopTrendingKeywordsFromSnapshots(limit);
    if (snapshotRows.length) return snapshotRows;
  } catch (error) {
    console.error("Trend snapshots ranking failed, falling back to historical trend data:", error);
  }

  return getTopTrendingKeywordsFromHistorical(market, limit);
}

export function trendVelocityLabel(score: number, comparisonScore: number): "RISING" | "PEAKING" | "FADING" {
  if (comparisonScore <= 0) return score > 0 ? "RISING" : "PEAKING";
  if (score > comparisonScore * 1.1) return "RISING";
  if (score < comparisonScore * 0.9) return "FADING";
  return "PEAKING";
}
