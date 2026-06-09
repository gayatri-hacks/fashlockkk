import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "@/lib/supabase";

type HistoricalTrendRow = {
  keyword_id: number;
  month: string;
  google_score: number;
  market: string;
};

type KeywordRow = {
  id: number;
  keyword: string;
};

export type MarketHeat = {
  code: string;
  market: string;
  flag: string;
  avgScore: number;
};

export type HistoricalPrediction = {
  keyword: string;
  velocity: number;
  seasonalScore: number;
  currentScore: number;
  seasonScore: number;
  peakValue: number;
  peakYear: number;
  predictionScore: number;
  topMarkets: MarketHeat[];
  sparkline: number[];
  prediction: string;
  whyNow: string;
  howToPrepare: string;
  confidence: "High" | "Medium" | "Early Signal";
  dataInsight: string;
  searchKeyword: string;
};

export type HistoricalPredictionsData = {
  nextSeason: string;
  rising: HistoricalPrediction[];
  peaking: HistoricalPrediction[];
  fading: HistoricalPrediction[];
  nextSeasonPredictions: HistoricalPrediction[];
  globalHeat: HistoricalPrediction[];
};

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

function getNextSeasonMonths() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return [5, 6, 7];
  if (month >= 5 && month <= 7) return [8, 9, 10];
  if (month >= 8 && month <= 10) return [11, 0, 1];
  return [2, 3, 4];
}

function getNextSeasonName() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "summer";
  if (month >= 5 && month <= 7) return "autumn";
  if (month >= 8 && month <= 10) return "winter";
  return "spring";
}

function calculateSeasonalPattern(keywordData: HistoricalTrendRow[]) {
  const nextSeasonMonths = getNextSeasonMonths();
  const historicalPeaks = keywordData
    .filter((row) => nextSeasonMonths.includes(new Date(row.month).getMonth()))
    .map((row) => row.google_score);

  return average(historicalPeaks);
}

function getTopMarkets(keywordData: HistoricalTrendRow[]): MarketHeat[] {
  const marketMap = new Map<string, number[]>();
  for (const row of keywordData) {
    if (!marketMap.has(row.market)) marketMap.set(row.market, []);
    marketMap.get(row.market)?.push(row.google_score);
  }

  return [...marketMap.entries()]
    .map(([code, scores]) => ({
      code,
      market: MARKET_META[code]?.market ?? code,
      flag: MARKET_META[code]?.flag ?? "",
      avgScore: average(scores),
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 3);
}

function monthlySparkline(keywordData: HistoricalTrendRow[]) {
  const byMonth = new Map<string, number[]>();
  for (const row of keywordData) {
    if (!byMonth.has(row.month)) byMonth.set(row.month, []);
    byMonth.get(row.month)?.push(row.google_score);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([, scores]) => Math.round(average(scores) * 10) / 10)
    .slice(-12);
}

function confidenceFromVelocity(velocity: number): HistoricalPrediction["confidence"] {
  if (velocity > 30) return "High";
  if (velocity >= 15) return "Medium";
  return "Early Signal";
}

function getInMarketSignals(keywordData: HistoricalTrendRow[]) {
  const inRows = keywordData
    .filter((row) => row.market === "IN")
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
  const current = inRows.at(-1);
  const season = inRows.at(-4) ?? inRows.at(0) ?? current;
  const peak = keywordData.reduce<HistoricalTrendRow | null>((highest, row) => {
    if (!highest || row.google_score > highest.google_score) return row;
    return highest;
  }, null);

  const nowScore = current?.google_score ?? 0;
  const seasonScore = season?.google_score ?? 0;
  const peakValue = peak?.google_score ?? nowScore;
  const peakYear = peak ? new Date(peak.month).getFullYear() : new Date().getFullYear();

  return { nowScore, seasonScore, peakValue, peakYear };
}

function fallbackEditorial(prediction: Omit<HistoricalPrediction, "prediction" | "whyNow" | "howToPrepare" | "confidence" | "dataInsight" | "searchKeyword">): Pick<
  HistoricalPrediction,
  "prediction" | "whyNow" | "howToPrepare" | "confidence" | "dataInsight" | "searchKeyword"
> {
  const markets = prediction.topMarkets.map((market) => market.market).join(", ") || "global markets";
  const direction = prediction.velocity > 15 ? "accelerating" : prediction.velocity < -5 ? "cooling" : "holding steady";

  return {
    prediction: `${prediction.keyword} is ${direction} because shoppers are treating it less like a novelty and more like a wardrobe language. ${markets} leading the signal suggests the trend is moving through specific climate, culture, and styling needs rather than generic hype.`,
    whyNow: `${prediction.keyword} is ${direction} as real wardrobes look for a sharper way to refresh familiar silhouettes. Its strongest readings in ${markets} suggest the next move will be regional first, then broader if the styling remains wearable.`,
    howToPrepare: `Start with one wearable ${prediction.keyword} cue and style it against clean basics so the trend feels intentional.`,
    confidence: confidenceFromVelocity(prediction.velocity),
    dataInsight: `The signal is ${formatSignedVelocity(prediction.velocity)} recently, with ${markets} setting the pace.`,
    searchKeyword: `${prediction.keyword} fashion`.split(/\s+/).slice(0, 3).join(" "),
  };
}

function formatSignedVelocity(velocity: number) {
  const rounded = Math.round(velocity);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function buildPredictions(historicalData: HistoricalTrendRow[], keywords: KeywordRow[]) {
  const keywordMap = new Map(keywords.map((keyword) => [keyword.id, keyword.keyword]));
  const byKeyword = new Map<string, HistoricalTrendRow[]>();

  for (const row of historicalData) {
    const name = keywordMap.get(row.keyword_id);
    if (!name) continue;
    if (!byKeyword.has(name)) byKeyword.set(name, []);
    byKeyword.get(name)?.push(row);
  }

  const keywordStats = [...byKeyword.entries()]
    .map(([keyword, rows]) => {
      const data = [...rows].sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
      const sparkline = monthlySparkline(data);
      const { nowScore, seasonScore, peakValue, peakYear } = getInMarketSignals(data);
      const velocity = seasonScore === 0 ? 0 : ((nowScore - seasonScore) / seasonScore) * 100;
      const seasonalScore = calculateSeasonalPattern(data);
      const topMarkets = getTopMarkets(data);
      const currentScore = nowScore;
      const predictionScore = velocity * 0.4 + seasonalScore * 0.6;
      const base = { keyword, velocity, seasonalScore, currentScore, seasonScore, peakValue, peakYear, predictionScore, topMarkets, sparkline };

      return {
        ...base,
        ...fallbackEditorial(base),
      };
    })
    .filter((prediction) => prediction.sparkline.length >= 6)
    .sort((a, b) => b.predictionScore - a.predictionScore);

  return {
    rising: keywordStats.filter((keyword) => keyword.velocity > 15).slice(0, 6),
    peaking: keywordStats.filter((keyword) => keyword.velocity >= -5 && keyword.velocity <= 15).slice(0, 6),
    fading: keywordStats.filter((keyword) => keyword.velocity < -5).slice(0, 6),
    nextSeasonPredictions: keywordStats.slice(0, 5),
    globalHeat: [...keywordStats].sort((a, b) => b.currentScore - a.currentScore).slice(0, 8),
  };
}

async function enrichSinglePrediction(prediction: HistoricalPrediction): Promise<HistoricalPrediction> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return prediction;

  const markets = prediction.topMarkets.map((market) => market.market).join(", ") || "global markets";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are Fashlock's prediction engine.
Given this trend data:
- Keyword: ${prediction.keyword}
- Velocity: ${formatSignedVelocity(prediction.velocity)} growth recently
- Strongest markets: ${markets}
- Current value: ${Math.round(prediction.currentScore)}
- Historical peak: ${Math.round(prediction.peakValue)} in ${prediction.peakYear}

Write exactly 2 sentences of prediction intelligence. 

Sentence 1: What this velocity means specifically for THIS trend — reference the actual keyword and what's happening culturally or stylistically to drive it.

Sentence 2: What the market pattern reveals — if it's strongest in ${markets}, what does that tell us about where it's heading?

Be specific. Be editorial. Never use the phrase 'enough data pressure'.
Never repeat the same sentence structure across trends.

Examples of good insights:
'Seersucker's +1200% velocity suggests it's crossing from niche fabric knowledge into mainstream summer wardrobes — the texture story is arriving. Its strongest signal in Germany and Singapore suggests this is a heat-climate trend with European editorial backing.'

'Co-ord sets are consolidating — the +480% reading reflects a shopper who wants to look dressed without thinking. Brazil and Italy leading suggests this is being driven by occasion dressing and holiday culture.'

Return only the 2 sentences. No markdown.`,
                },
              ],
            },
          ],
        }),
        next: { revalidate: 60 * 60 * 24 },
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini error:", res.status, err);
      return prediction;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return prediction;

    const cleaned = text.replace(/^["']|["']$/g, "").replace(/enough data pressure/gi, "credible market signal");
    const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
    const predictionText = sentences.slice(0, 2).join(" ").trim();

    return {
      ...prediction,
      prediction: predictionText || prediction.prediction,
      whyNow: predictionText || prediction.whyNow,
      dataInsight: `The signal is ${formatSignedVelocity(prediction.velocity)}, with ${markets} carrying the strongest market heat.`,
    };
  } catch (error) {
    console.error("Gemini prediction enrichment error:", error);
    return prediction;
  }
}

async function enrichWithGemini(
  predictions: ReturnType<typeof buildPredictions>,
): Promise<Map<string, HistoricalPrediction>> {
  const unique = new Map<string, HistoricalPrediction>();
  for (const prediction of [
    ...predictions.nextSeasonPredictions,
    ...predictions.rising,
    ...predictions.peaking,
    ...predictions.fading,
    ...predictions.globalHeat,
  ]) {
    unique.set(prediction.keyword, prediction);
  }

  const enriched = await Promise.all([...unique.values()].map(enrichSinglePrediction));
  return new Map(enriched.map((prediction) => [prediction.keyword, prediction]));
}

async function loadHistoricalPredictionsUncached(): Promise<HistoricalPredictionsData> {
  const supabase = getSupabaseClient();
  const nextSeason = getNextSeasonName();

  if (!supabase) {
    return { nextSeason, rising: [], peaking: [], fading: [], nextSeasonPredictions: [], globalHeat: [] };
  }
  const client = supabase;

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const fromDate = twoYearsAgo.toISOString().split("T")[0];
  async function fetchHistoricalRows() {
    const { data, error } = await client
      .from("historical_trend_data")
      .select("keyword_id, month, google_score, market")
      .gte("month", fromDate)
      .order("month", { ascending: true })
      .limit(100);

    if (error) throw error;
    return (data ?? []) as HistoricalTrendRow[];
  }

  const [historicalResult, keywordsResult] = await Promise.all([
    fetchHistoricalRows()
      .then((data) => ({ data, error: null }))
      .catch((error) => ({ data: null, error })),
    client
      .from("trend_keywords")
      .select("id, keyword")
      .order("keyword", { ascending: true })
      .limit(500),
  ]);

  if (historicalResult.error || keywordsResult.error) {
    return { nextSeason, rising: [], peaking: [], fading: [], nextSeasonPredictions: [], globalHeat: [] };
  }

  const built = buildPredictions(
    historicalResult.data ?? [],
    (keywordsResult.data ?? []) as KeywordRow[],
  );
  const enrichedByKeyword = await enrichWithGemini(built);
  const hydrate = (prediction: HistoricalPrediction) => enrichedByKeyword.get(prediction.keyword) ?? prediction;

  return {
    nextSeason,
    rising: built.rising.map(hydrate),
    peaking: built.peaking.map(hydrate),
    fading: built.fading.map(hydrate),
    nextSeasonPredictions: built.nextSeasonPredictions.map(hydrate),
    globalHeat: built.globalHeat.map(hydrate),
  };
}

export const loadHistoricalPredictions = unstable_cache(loadHistoricalPredictionsUncached, ["historical-predictions-daily-v3-unique-copy"], {
  revalidate: 60 * 60 * 24,
  tags: ["historical-predictions"],
});
