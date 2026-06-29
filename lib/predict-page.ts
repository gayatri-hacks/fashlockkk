import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "@/lib/supabase";

type TrendRow = {
  keyword_id: number;
  month: string;
  google_score: number;
  market: string;
};

type KeywordRow = {
  id: number;
  keyword: string;
};

export type PredictMarket = {
  code: string;
  market: string;
  flag: string;
  score: number;
};

export type PredictTrend = {
  keyword: string;
  trendName: string;
  simpleExplanation: string;
  prediction: string;
  whyNow: string;
  styleNote: string;
  confidenceLevel: "HIGH" | "MEDIUM" | "WATCH";
  pexelsQuery: string;
  shopTerms: string[];
  velocity: number;
  currentScore: number;
  markets: PredictMarket[];
  imageUrl: string | null;
};

export type SeasonShift = {
  lastTrend: string;
  thisTrend: string;
  sentence: string;
};

export type PredictPageData = {
  season: string;
  year: number;
  predictions: PredictTrend[];
  menswearPredictions: PredictTrend[];
  shift: SeasonShift | null;
  globalHeat: PredictTrend[];
};

const GEMINI_MODEL = "gemini-2.5-flash";
const PREDICT_KEYWORD_LIMIT = 12;
const PREDICT_MONTH_WINDOW = 9;

const MARKET_META: Record<string, { market: string; flag: string }> = {
  IT: { market: "Italy", flag: "🇮🇹" },
  FR: { market: "France", flag: "🇫🇷" },
  US: { market: "United States", flag: "🇺🇸" },
  KR: { market: "Korea", flag: "🇰🇷" },
  JP: { market: "Japan", flag: "🇯🇵" },
  GB: { market: "United Kingdom", flag: "🇬🇧" },
  DE: { market: "Germany", flag: "🇩🇪" },
  AU: { market: "Australia", flag: "🇦🇺" },
  BR: { market: "Brazil", flag: "🇧🇷" },
  IN: { market: "India", flag: "🇮🇳" },
  SG: { market: "Singapore", flag: "🇸🇬" },
  AE: { market: "UAE", flag: "🇦🇪" },
};

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cleanJson(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function confidenceFromVelocity(velocity: number): PredictTrend["confidenceLevel"] {
  if (velocity > 200) return "HIGH";
  if (velocity >= 50) return "MEDIUM";
  return "WATCH";
}

function currentSeason() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 5) return "Summer";
  if (month >= 6 && month <= 8) return "Monsoon";
  if (month >= 9 && month <= 10) return "Festive";
  return "Winter";
}

function monthsAgo(date: string, months: number) {
  const value = new Date(date);
  value.setMonth(value.getMonth() - months);
  return value.toISOString().split("T")[0];
}

function velocityFromRows(rows: TrendRow[]) {
  const sorted = [...rows].sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
  const recent = sorted.slice(-3).map((row) => row.google_score);
  const previous = sorted.slice(-6, -3).map((row) => row.google_score);
  const recentAvg = average(recent);
  const previousAvg = average(previous);
  if (previousAvg === 0) return 0;
  return ((recentAvg - previousAvg) / previousAvg) * 100;
}

function fallbackTrend(keyword: string, velocity: number, gender: "women" | "men" = "women"): Omit<PredictTrend, "velocity" | "currentScore" | "markets" | "imageUrl"> {
  const trendName = titleCase(keyword);
  const wearer = gender === "men" ? "men" : "people";
  const imageSubject = gender === "men" ? "menswear" : "fashion";
  return {
    keyword,
    trendName,
    simpleExplanation: `${trendName} is a wearable cue ${wearer} can add through fabric, silhouette, or styling.`,
    prediction: `${trendName} is moving from niche signal to something shoppers will start noticing everywhere.`,
    whyNow: `${trendName} is rising because wardrobes are looking for freshness without losing everyday practicality.`,
    styleNote: `Start with one ${keyword} piece and keep everything else simple.`,
    confidenceLevel: confidenceFromVelocity(velocity),
    pexelsQuery: `${keyword} ${imageSubject} outfit minimal white background`,
    shopTerms: gender === "men" ? [`mens ${keyword}`, `${keyword} men outfit`] : [`${keyword} outfit`, `${keyword} fashion`],
  };
}

async function callGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return "";

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85 },
      }),
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      return "";
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  } catch (error) {
    console.error("Gemini predict error:", error);
    return "";
  }
}

const cachedGeminiTrend = unstable_cache(
  async (keyword: string, velocity: number, gender: "women" | "men" = "women") => {
    const confidence = confidenceFromVelocity(velocity);
    const audience = gender === "men" ? "menswear" : "fashion";
    const guardrails =
      gender === "men"
        ? `
This is for MENSWEAR. Interpret the signal for stylish men in 2026.
Do not suggest womenswear pieces, dresses, skirts, lingerie, or literal costume styling unless the keyword is already a men's garment.
Think GQ, COS, Zegna, Zara Man, SSENSE: refined, wearable, fashion-conscious.`
        : "";
    const prompt = `You are Fashlock's prediction engine.

For the ${audience} trend keyword "${keyword}", generate JSON:
{
  "trendName": "the keyword capitalized properly e.g. 'Seersucker' not 'seersucker'",
  "simpleExplanation": "one sentence explaining what this trend IS in plain English for someone who has never heard of it. Focus on what it looks like, what you wear. Max 20 words.",
  "prediction": "one bold, confident, plain English sentence saying what's going to happen with this trend. No jargon. No percentages. Talk to a normal person.",
  "whyNow": "one sentence explaining WHY this is rising right now. Cultural context, seasonal reason, or global influence. Plain English.",
  "styleNote": "one practical tip for how to start wearing this trend without going all-in. Max 15 words.",
  "confidenceLevel": "${confidence}",
  "pexelsQuery": "specific query to find a clean ${audience} product/outfit photo for this trend on Pexels. Must show the actual garment clearly.",
  "shopTerms": ["2 specific search terms to find this trend on shopping sites"]
}
${guardrails}

Return ONLY valid JSON. No markdown.`;

    const response = await callGemini(prompt);
    if (!response) return fallbackTrend(keyword, velocity, gender);

    try {
      const parsed = JSON.parse(cleanJson(response));
      return {
        ...fallbackTrend(keyword, velocity, gender),
        ...parsed,
        confidenceLevel: confidence,
        keyword,
        shopTerms: Array.isArray(parsed.shopTerms) ? parsed.shopTerms.slice(0, 2) : fallbackTrend(keyword, velocity, gender).shopTerms,
      } as Omit<PredictTrend, "velocity" | "currentScore" | "markets" | "imageUrl">;
    } catch (error) {
      console.error("Gemini predict JSON parse error:", error);
      return fallbackTrend(keyword, velocity, gender);
    }
  },
  ["predict-gemini-trend-v2-gendered"],
  { revalidate: 60 * 60 * 12 },
);

const cachedShiftCopy = unstable_cache(
  async (lastTrend: string, thisTrend: string) => {
    const fallback = `Last season everyone was reaching for ${lastTrend}. This season the data says ${thisTrend} is making its move.`;
    const response = await callGemini(`Write one sentence in Fashlock's editorial voice using this exact structure:
"Last season everyone was reaching for [last trend]. This season the data says [this trend] is making its move."

Last trend: ${lastTrend}
This trend: ${thisTrend}
Return one sentence only.`);

    return response.replace(/^["']|["']$/g, "").trim() || fallback;
  },
  ["predict-season-shift-copy-v1"],
  { revalidate: 60 * 60 * 12 },
);

const cachedPexelsImage = unstable_cache(
  async (query: string) => {
    const key = process.env.PEXELS_API_KEY;
    if (!key) return null;

    try {
      const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=12`, {
        headers: { Authorization: key },
        next: { revalidate: 60 * 60 * 6 },
      });

      if (!response.ok) {
        console.error("Pexels error:", response.status);
        return null;
      }

      const data = await response.json();
      const photo = (data.photos || [])
        .filter((item: any) => item?.width >= 600 && item?.height >= 600)
        .filter((item: any) => !String(item.photographer || "").toLowerCase().includes("screenshot"))
        .sort((a: any, b: any) => b.height - a.height)[0];

      return photo?.src?.large2x || photo?.src?.large || null;
    } catch (error) {
      console.error("Pexels predict error:", error);
      return null;
    }
  },
  ["predict-pexels-image-v1"],
  { revalidate: 60 * 60 * 6 },
);

function marketsForKeyword(rows: TrendRow[], keywordId: number, latestMonth: string): PredictMarket[] {
  return rows
    .filter((row) => row.keyword_id === keywordId && row.month === latestMonth)
    .sort((a, b) => b.google_score - a.google_score)
    .slice(0, 3)
    .map((row) => ({
      code: row.market,
      market: MARKET_META[row.market]?.market ?? row.market,
      flag: MARKET_META[row.market]?.flag ?? "",
      score: row.google_score,
    }));
}

const loadPredictPageUncached = async (): Promise<PredictPageData> => {
  const supabase = getSupabaseClient();
  const season = currentSeason();
  const year = new Date().getFullYear();

  if (!supabase) {
    return { season, year, predictions: [], menswearPredictions: [], shift: null, globalHeat: [] };
  }

  const latestResult = await supabase
    .from("historical_trend_data")
    .select("month")
    .eq("market", "IN")
    .order("month", { ascending: false })
    .limit(1);

  const latestMonth = latestResult.data?.[0]?.month;
  if (!latestMonth) return { season, year, predictions: [], menswearPredictions: [], shift: null, globalHeat: [] };

  const fromNineMonths = monthsAgo(latestMonth, PREDICT_MONTH_WINDOW);

  const topKeywordResult = await supabase
    .from("historical_trend_data")
    .select("keyword_id, google_score")
    .eq("market", "IN")
    .eq("month", latestMonth)
    .order("google_score", { ascending: false })
    .limit(PREDICT_KEYWORD_LIMIT);

  if (topKeywordResult.error) {
    return { season, year, predictions: [], menswearPredictions: [], shift: null, globalHeat: [] };
  }

  const selectedKeywordIds = [
    ...new Set((topKeywordResult.data ?? []).map((row) => row.keyword_id).filter((id): id is number => typeof id === "number")),
  ].slice(0, PREDICT_KEYWORD_LIMIT);

  if (!selectedKeywordIds.length) {
    return { season, year, predictions: [], menswearPredictions: [], shift: null, globalHeat: [] };
  }

  const [inRowsResult, allMarketResult, keywordsResult] = await Promise.all([
    supabase
      .from("historical_trend_data")
      .select("keyword_id, month, google_score, market")
      .eq("market", "IN")
      .in("keyword_id", selectedKeywordIds)
      .gte("month", fromNineMonths)
      .order("month", { ascending: true })
      .limit(PREDICT_KEYWORD_LIMIT * PREDICT_MONTH_WINDOW),
    supabase
      .from("historical_trend_data")
      .select("keyword_id, month, google_score, market")
      .eq("month", latestMonth)
      .in("keyword_id", selectedKeywordIds)
      .limit(PREDICT_KEYWORD_LIMIT * Object.keys(MARKET_META).length),
    supabase.from("trend_keywords").select("id, keyword").in("id", selectedKeywordIds),
  ]);

  if (inRowsResult.error || allMarketResult.error || keywordsResult.error) {
    return { season, year, predictions: [], menswearPredictions: [], shift: null, globalHeat: [] };
  }

  const keywordMap = new Map(((keywordsResult.data ?? []) as KeywordRow[]).map((row) => [row.id, row.keyword]));
  const byKeyword = new Map<number, TrendRow[]>();
  for (const row of (inRowsResult.data ?? []) as TrendRow[]) {
    if (!byKeyword.has(row.keyword_id)) byKeyword.set(row.keyword_id, []);
    byKeyword.get(row.keyword_id)?.push(row);
  }

  const scored = [...byKeyword.entries()]
    .map(([keywordId, rows]) => {
      const latest = [...rows].sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime()).at(-1);
      return {
        keywordId,
        keyword: keywordMap.get(keywordId) ?? "",
        velocity: velocityFromRows(rows),
        currentScore: latest?.google_score ?? 0,
        rows,
      };
    })
    .filter((item) => item.keyword && item.rows.length >= 6)
    .sort((a, b) => b.velocity - a.velocity);

  const topEight = scored.slice(0, 8);
  const allMarketRows = (allMarketResult.data ?? []) as TrendRow[];

  const buildPredictionsForGender = async (gender: "women" | "men") =>
    Promise.all(
      topEight.map(async (item) => {
        const gemini = await cachedGeminiTrend(item.keyword, item.velocity, gender);
        const imageUrl = await cachedPexelsImage(gemini.pexelsQuery);

        return {
          ...gemini,
          keyword: item.keyword,
          velocity: item.velocity,
          currentScore: item.currentScore,
          markets: marketsForKeyword(allMarketRows, item.keywordId, latestMonth),
          imageUrl,
        };
      }),
    );

  const [predictions, menswearPredictions] = await Promise.all([
    buildPredictionsForGender("women"),
    buildPredictionsForGender("men"),
  ]);

  const lastSeasonCandidate = scored
    .map((item) => {
      const sorted = [...item.rows].sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
      const current = average(sorted.slice(-3).map((row) => row.google_score));
      const past = average(sorted.slice(0, 3).map((row) => row.google_score));
      return { ...item, drop: past - current };
    })
    .sort((a, b) => b.drop - a.drop)[0];

  const shift =
    lastSeasonCandidate && topEight[0]
      ? {
          lastTrend: titleCase(lastSeasonCandidate.keyword),
          thisTrend: titleCase(topEight[0].keyword),
          sentence: await cachedShiftCopy(titleCase(lastSeasonCandidate.keyword), titleCase(topEight[0].keyword)),
        }
      : null;

  const globalHeat = [...predictions].sort((a, b) => b.currentScore - a.currentScore).slice(0, 8);

  return { season, year, predictions, menswearPredictions, shift, globalHeat };
};

export const loadPredictPageData = unstable_cache(loadPredictPageUncached, ["predict-page-data-v2-menswear"], {
  revalidate: 60 * 60,
  tags: ["predict-page"],
});
