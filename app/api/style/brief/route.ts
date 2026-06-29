import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";
import { getSupabaseClient, logSupabaseFallback } from "@/lib/supabase";
import { buildStyleBrief, type StyleBriefProfile } from "@/lib/style-brief";
import type { PredictPageData, PredictTrend } from "@/lib/predict-page";

export const revalidate = 21600;

const PROFILE_COLUMNS =
  "gender,body_type,skin_tone,skin_undertone,vibe,lifestyle,style_personality,colour_palette,colours_that_glow,avoids,budget_range,favourite_pieces";

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function currentSeason() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 5) return "Summer";
  if (month >= 6 && month <= 8) return "Monsoon";
  if (month >= 9 && month <= 10) return "Festive";
  return "Winter";
}

function confidenceFromScore(score: number): PredictTrend["confidenceLevel"] {
  if (score >= 75) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "WATCH";
}

async function loadProfile(profileKey: string, useUserId: boolean): Promise<StyleBriefProfile | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !profileKey) return null;

  const { data, error } = await supabase
    .from("style_profiles")
    .select(PROFILE_COLUMNS)
    .eq(useUserId ? "user_id" : "session_id", profileKey)
    .maybeSingle();

  if (error) {
    logSupabaseFallback(error);
    return null;
  }

  return (data as StyleBriefProfile | null) ?? null;
}

async function loadTrendSignals(): Promise<PredictPageData> {
  const supabase = getSupabaseClient();
  const season = currentSeason();
  const year = new Date().getFullYear();
  const empty = { season, year, predictions: [], menswearPredictions: [], shift: null, globalHeat: [] };
  if (!supabase) return empty;

  const latestResult = await supabase
    .from("historical_trend_data")
    .select("month")
    .eq("market", "IN")
    .order("month", { ascending: false })
    .limit(1);

  const latestMonth = latestResult.data?.[0]?.month;
  if (latestResult.error || !latestMonth) return empty;

  const topResult = await supabase
    .from("historical_trend_data")
    .select("keyword_id, google_score")
    .eq("market", "IN")
    .eq("month", latestMonth)
    .order("google_score", { ascending: false })
    .limit(12);

  if (topResult.error) return empty;

  const ids = [...new Set((topResult.data || []).map((row) => row.keyword_id).filter(Boolean))].slice(0, 12);
  if (!ids.length) return empty;

  const { data: keywords, error: keywordError } = await supabase.from("trend_keywords").select("id, keyword").in("id", ids);
  if (keywordError) return empty;

  const keywordMap = new Map((keywords || []).map((row) => [row.id, row.keyword]));
  const predictions = (topResult.data || [])
    .map((row): PredictTrend | null => {
      const keyword = keywordMap.get(row.keyword_id);
      if (!keyword) return null;
      const trendName = titleCase(keyword);
      return {
        keyword,
        trendName,
        simpleExplanation: `${trendName} is a wearable signal showing up in current fashion searches.`,
        prediction: `${trendName} is worth trying through one practical piece, not a full costume.`,
        whyNow: `${trendName} is rising because wardrobes are leaning toward easy updates with personality.`,
        styleNote: `Try one ${keyword} piece with quiet basics.`,
        confidenceLevel: confidenceFromScore(row.google_score || 0),
        pexelsQuery: `${keyword} outfit`,
        shopTerms: [`${keyword} outfit`, `${keyword} fashion`],
        velocity: row.google_score || 0,
        currentScore: row.google_score || 0,
        markets: [],
        imageUrl: null,
      };
    })
    .filter((trend): trend is PredictTrend => Boolean(trend));

  return {
    season,
    year,
    predictions,
    menswearPredictions: predictions.map((trend) => ({
      ...trend,
      simpleExplanation: `${trend.trendName} is a wearable menswear signal showing up in current fashion searches.`,
      shopTerms: [`mens ${trend.keyword}`, `${trend.keyword} men outfit`],
    })),
    shift: null,
    globalHeat: predictions.slice(0, 8),
  };
}

const cachedBrief = unstable_cache(
  async (profileKey: string, useUserId: boolean) => {
    const [profile, predictData] = await Promise.all([loadProfile(profileKey, useUserId), loadTrendSignals()]);
    return buildStyleBrief(profile, predictData);
  },
  ["style-brief-v6-local-look-library-signals"],
  { revalidate: 21600 },
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = await getAuthenticatedUserId();
  const sessionId = url.searchParams.get("sessionId")?.trim() || "";
  const profileKey = userId || sessionId;

  if (!profileKey) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  try {
    const brief = await cachedBrief(profileKey, Boolean(userId));
    return NextResponse.json({ brief });
  } catch (error) {
    console.error("Style brief route error:", error);
    return NextResponse.json({ brief: null });
  }
}
