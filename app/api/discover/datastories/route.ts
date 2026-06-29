import { NextResponse } from "next/server";
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from "@/lib/supabase";

export const revalidate = 86400;
const GEMINI_MODEL = "gemini-2.5-flash";

type Point = { date: string; value: number };

function isRising(points: Point[]) {
  const recent = points.slice(-3);
  const before = points.slice(-6, -3);
  if (recent.length < 3 || before.length < 3) return false;
  const avg = (items: Point[]) => items.reduce((sum, item) => sum + item.value, 0) / items.length;
  return avg(recent) > avg(before);
}

function peakYear(points: Point[]) {
  const peak = points.reduce((best, item) => (item.value > best.value ? item : best), points[0] ?? { date: "2026", value: 0 });
  return new Date(peak.date).getFullYear();
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function fallbackHeadline(keyword: string) {
  const clean = titleCase(keyword);
  if (clean.length <= 8) return `The ${clean} Never Left`;
  return clean;
}

function cleanHeadline(value: string) {
  return value
    .replace(/^["']|["']$/g, "")
    .replace(/^([*_]{1,2})(.+)\1\.?$/g, "$2")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();
}

function buildFallbackPoints(seed: number) {
  return Array.from({ length: 24 }, (_, index) => ({
    date: `${2024 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`,
    value: Math.max(8, Math.min(100, Math.round(seed + Math.sin(index / 2.8) * 12 + index * 1.1))),
  }));
}

function fallbackStories() {
  return [
    {
      keyword: "linen",
      headline: "Linen Gets Sharper",
      insight:
        "In India, linen is moving beyond vacation dressing into clean city uniforms built for heat. The signal points to fabric-first wardrobes: breathable, polished, and less fussy.",
      meaning: "Choose structured linen pieces that hold shape through the day.",
      points: buildFallbackPoints(34),
      francePoints: buildFallbackPoints(28),
      peakYear: 2026,
      isRising: true,
      imageUrl: null,
    },
    {
      keyword: "cargo",
      headline: "Utility Finds Its Elegance",
      insight:
        "Cargo is no longer reading purely utilitarian; the newer version is cleaner, slimmer, and more intentional. India’s appetite suggests everyday dressing wants practicality without losing polish.",
      meaning: "Treat cargo as tailoring with pockets, not streetwear by default.",
      points: buildFallbackPoints(42),
      francePoints: buildFallbackPoints(31),
      peakYear: 2026,
      isRising: true,
      imageUrl: null,
    },
  ];
}

async function callGeminiText(prompt: string, label: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        next: { revalidate },
      },
    );
    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      return null;
    }
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/^["']|["']$/g, "").trim() ?? null;
  } catch (error) {
    console.error(`Gemini discover ${label} error:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function pexelsImage(query: string) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  try {
    const params = new URLSearchParams({ query: `${query} fashion editorial`, per_page: "1", orientation: "landscape" });
    const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: key },
      next: { revalidate },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { photos?: Array<{ src?: { landscape?: string; large?: string; medium?: string } }> };
    return data.photos?.[0]?.src?.landscape ?? data.photos?.[0]?.src?.large ?? data.photos?.[0]?.src?.medium ?? null;
  } catch {
    return null;
  }
}

async function geminiInsight(keyword: string, india: Point[], france: Point[]) {
  const peak = peakYear(india);
  const [headline, insight, meaning] = await Promise.all([
    callGeminiText(
      `Write a punchy editorial headline for a fashion trend story about ${keyword}. Max 6 words. Cormorant Garamond italic energy. Examples: 'The Mini Never Really Left', 'Cargo Found Its Elegance', 'Utility Becomes the New Luxury'. Return only the headline, nothing else. No markdown, no asterisks.`,
      "data story headline",
    ),
    callGeminiText(
      `You are a fashion data journalist. Given trend search data for ${keyword} from 2003-2026 in India (IN) and France (FR), write exactly 2 sentences. First sentence: what the data pattern reveals about this trend in India — be specific about when it peaked and what that moment meant culturally. Second sentence: compare it to France — what does the difference tell us? Tone: warm, intelligent, editorial. Like a Vogue data story.\nIndia peak year: ${peak}\nIndia recent data: ${JSON.stringify(india.slice(-36))}\nFrance recent data: ${JSON.stringify(france.slice(-36))}`,
      "data story insight",
    ),
    callGeminiText(
      `In one sentence, tell a fashion-conscious person in India what the current trajectory of ${keyword} means for their wardrobe right now. Be practical and elegant. Max 15 words.`,
      "data story wardrobe meaning",
    ),
  ]);

  return {
    headline: cleanHeadline(headline || fallbackHeadline(keyword)),
    insight:
      insight ||
      `In India, ${keyword} peaked in ${peak}, marking the moment this style moved from search curiosity into wardrobe language. France reads more restrained by comparison, suggesting the trend carries stronger everyday momentum in India right now.`,
    meaning: meaning || `Treat ${keyword} as a considered update, not a passing impulse.`,
  };
}

export async function GET() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    logSupabaseFallback();
    return NextResponse.json({ stories: fallbackStories() });
  }

  try {
    const stories = await supabaseCache("discover-datastories", supabaseCacheTtl("historical_trend_data"), async () => {
      const latest = await supabase
        .from("historical_trend_data")
        .select("month")
        .eq("market", "IN")
        .order("month", { ascending: false })
        .limit(1);
      if (latest.error) throw latest.error;
      const latestMonth = latest.data?.[0]?.month;
      if (!latestMonth) return fallbackStories();

      const top = await supabase
        .from("historical_trend_data")
        .select("keyword_id, google_score")
        .eq("market", "IN")
        .eq("month", latestMonth)
        .order("google_score", { ascending: false })
        .limit(4);
      if (top.error) throw top.error;
      const ids = (top.data ?? []).map((row) => row.keyword_id);
      if (!ids.length) return fallbackStories();

      const keywords = await supabase.from("trend_keywords").select("id, keyword").in("id", ids);
      if (keywords.error) throw keywords.error;
      const keywordMap = new Map((keywords.data ?? []).map((row) => [row.id, row.keyword]));

      const result = await Promise.all(
        ids.map(async (id) => {
          const [indiaRes, franceRes] = await Promise.all([
            supabase.from("historical_trend_data").select("month, google_score").eq("market", "IN").eq("keyword_id", id).order("month", { ascending: true }).limit(100),
            supabase.from("historical_trend_data").select("month, google_score").eq("market", "FR").eq("keyword_id", id).order("month", { ascending: true }).limit(100),
          ]);
          if (indiaRes.error) throw indiaRes.error;
          if (franceRes.error) throw franceRes.error;
          const india = (indiaRes.data ?? []).map((row) => ({ date: row.month, value: Number(row.google_score ?? 0) }));
          const france = (franceRes.data ?? []).map((row) => ({ date: row.month, value: Number(row.google_score ?? 0) }));
          const keyword = keywordMap.get(id) ?? "fashion signal";
          const insight = await geminiInsight(keyword, india, france);
          return {
            keyword,
            points: india,
            francePoints: france,
            headline: insight.headline,
            insight: insight.insight,
            meaning: insight.meaning,
            peakYear: peakYear(india),
            isRising: isRising(india),
            imageUrl: await pexelsImage(keyword),
          };
        }),
      );

      return result.length ? result : fallbackStories();
    });

    return NextResponse.json({ stories });
  } catch (error) {
    logSupabaseFallback(error);
    return NextResponse.json({ stories: fallbackStories() });
  }
}
