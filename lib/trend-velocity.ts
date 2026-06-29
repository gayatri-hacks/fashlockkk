import { getSupabaseClient } from "@/lib/supabase";

export type TrendingKeyword = {
  keywordId: number;
  keyword: string;
  score: number;
  comparisonScore: number;
  velocity: number;
};

export async function getLatestTrendMonth(supabase: any, market: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("historical_trend_data")
    .select("month")
    .eq("market", market)
    .order("month", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.month || null;
}

export async function getTopTrendingKeywords(
  market: string,
  limit: number,
): Promise<TrendingKeyword[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const latestMonth = await getLatestTrendMonth(supabase, market);
  if (!latestMonth) return [];

  const { data: currentRows, error: currentError } = await supabase
    .from("historical_trend_data")
    .select("keyword_id, google_score")
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
      .select("keyword_id, google_score")
      .eq("market", market)
      .eq("month", threeMonthsAgo)
      .in("keyword_id", keywordIds)
      .limit(Math.max(100, limit)),
    supabase.from("trend_keywords").select("id, keyword").in("id", keywordIds),
  ]);

  if (comparisonError) throw comparisonError;
  if (keywordsError) throw keywordsError;

  const comparisonMap = new Map((comparisonRows || []).map((row: any) => [row.keyword_id, Number(row.google_score || 0)]));
  const keywordMap = new Map((keywords || []).map((row: any) => [row.id, row.keyword]));

  return (currentRows || [])
    .map((row: any) => {
      const keyword = keywordMap.get(row.keyword_id);
      if (!keyword) return null;

      const score = Number(row.google_score || 0);
      const comparisonScore = Number(comparisonMap.get(row.keyword_id) || 0);
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

export function trendVelocityLabel(score: number, comparisonScore: number): "RISING" | "PEAKING" | "FADING" {
  if (score > comparisonScore * 1.1) return "RISING";
  if (score < comparisonScore * 0.9) return "FADING";
  return "PEAKING";
}
