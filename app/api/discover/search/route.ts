import { NextResponse } from "next/server";
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from "@/lib/supabase";

export const runtime = "nodejs";

const GEMINI_MODEL = "gemini-2.5-flash";

type SearchResult = {
  summary: string;
  keyMoments: Array<{ year: string; description: string }>;
  influence: string;
  relatedTerms: string[];
};

const fallbackSearch = (query: string): SearchResult => ({
  summary: `${query} sits inside fashion as both a visual code and a cultural memory. The most interesting way to read it is through silhouette, context, and the kind of person it allowed people to become.`,
  keyMoments: [
    { year: "1900s", description: "The idea begins as a social or practical dressing code." },
    { year: "1960s", description: "Youth culture and media turn it into a more visible style language." },
    { year: "1990s", description: "Minimalism and celebrity imagery make the reference newly desirable." },
    { year: "2020s", description: "Digital fashion culture revives it through moodboards, archives, and personal styling." },
  ],
  influence: "Its lasting influence is the way it keeps returning whenever clothes need to express identity quickly.",
  relatedTerms: ["runway archive", "style history", "street style", "fashion mood", "designer influence"],
});

function cleanJson(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

async function askGemini(query: string): Promise<SearchResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallbackSearch(query);

  const prompt = `You are Fashlock's fashion intelligence engine. You have deep knowledge of fashion history, designers, trends, events, cultural moments, runway shows, style movements, and the global fashion industry. When given a search query, return a rich, editorial, intelligent response as if written by a brilliant fashion editor. Format your response as JSON with these fields: summary (2-3 sentence editorial overview), keyMoments (array of 3-4 objects with year and description), influence (one sentence on lasting impact), relatedTerms (array of 4-5 related search terms the user might want to explore next). Keep the tone warm, intelligent, confident — like a Vogue editor who also understands data.

Search query: ${query}

Return ONLY valid JSON.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      return fallbackSearch(query);
    }
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallbackSearch(query);
    return { ...fallbackSearch(query), ...(JSON.parse(cleanJson(text)) as Partial<SearchResult>) };
  } catch (error) {
    console.error("Gemini discover search error:", error instanceof Error ? error.message : error);
    return fallbackSearch(query);
  }
}

async function fetchPexelsImages(query: string) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];

  try {
    const params = new URLSearchParams({ query: `${query} fashion editorial`, per_page: "3", orientation: "landscape" });
    const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: key },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      photos?: Array<{ id: number; alt?: string; src?: { large?: string; medium?: string; landscape?: string } }>;
    };
    return (data.photos ?? [])
      .map((photo) => ({
        id: String(photo.id),
        alt: photo.alt || query,
        url: photo.src?.landscape || photo.src?.large || photo.src?.medium || "",
      }))
      .filter((photo) => photo.url);
  } catch {
    return [];
  }
}

async function fetchTrendArc(query: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    return await supabaseCache(`discover-search-trend-arc:${query}`, supabaseCacheTtl("historical_trend_data"), async () => {
      const { data: keywords, error: keywordError } = await supabase
        .from("trend_keywords")
        .select("id, keyword")
        .ilike("keyword", `%${query}%`)
        .limit(1);
      if (keywordError) throw keywordError;
      const match = keywords?.[0];
      if (!match) return null;

      const { data, error } = await supabase
        .from("historical_trend_data")
        .select("month, google_score, market")
        .eq("keyword_id", match.id)
        .order("month", { ascending: true })
        .limit(100);
      if (error) throw error;

      if (!data?.length) return null;
      const byMonth = new Map<string, { total: number; count: number }>();
      data.forEach((row) => {
        const month = String(row.month);
        const entry = byMonth.get(month) ?? { total: 0, count: 0 };
        entry.total += Number(row.google_score ?? 0);
        entry.count += 1;
        byMonth.set(month, entry);
      });

      return {
        keyword: match.keyword,
        points: Array.from(byMonth.entries()).map(([date, value]) => ({
          date,
          value: Math.round((value.total / Math.max(1, value.count)) * 10) / 10,
        })),
      };
    });
  } catch (error) {
    logSupabaseFallback(error);
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { query?: string };
  const query = body.query?.trim();
  if (!query) return NextResponse.json({ result: null });

  const [editorial, images, trend] = await Promise.all([askGemini(query), fetchPexelsImages(query), fetchTrendArc(query)]);
  return NextResponse.json({ editorial, images, trend });
}
