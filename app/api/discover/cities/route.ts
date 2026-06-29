import { NextResponse } from "next/server";
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from "@/lib/supabase";

export const revalidate = 86400;
const GEMINI_MODEL = "gemini-2.5-flash";

const marketCities: Record<string, string> = {
  IT: "Milan",
  FR: "Paris",
  US: "New York",
  KR: "Seoul",
  JP: "Tokyo",
  GB: "London",
  DE: "Berlin",
  AU: "Sydney",
  BR: "São Paulo",
  IN: "Mumbai",
  SG: "Singapore",
  AE: "Dubai",
};

const fallbackKeywords: Record<string, string[]> = {
  IN: ["linen", "kurta", "minimal tailoring"],
  IT: ["soft tailoring", "loafers", "linen"],
  FR: ["ballet flats", "mini skirt", "tonal dressing"],
  US: ["denim", "utility", "oversized blazer"],
  KR: ["layering", "wide trousers", "clean shirting"],
  JP: ["workwear", "quiet utility", "cropped jackets"],
  GB: ["trench coats", "heritage checks", "sleek boots"],
  DE: ["minimal tailoring", "technical outerwear", "neutrals"],
  AU: ["resort linen", "denim shorts", "easy dresses"],
  BR: ["colour", "fluid dresses", "summer sets"],
  SG: ["light layers", "clean sandals", "linen separates"],
  AE: ["modest luxury", "silk sets", "structured abayas"],
};

function fallbackCities(markets: Array<[string, string]>) {
  return markets.map(([market, city]) => {
    const keywords = fallbackKeywords[market] ?? ["polished ease", "clean silhouettes", "modern basics"];
    return {
      market,
      city,
      keywords,
      imageUrl: null,
      mood: fallbackMood(city, keywords),
    };
  });
}

async function pexelsImage(city: string) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const params = new URLSearchParams({ query: `${city} street style fashion`, per_page: "1", orientation: "landscape" });
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

function fallbackMood(city: string, keywords: string[]) {
  const signal = keywords.slice(0, 2).join(" and ") || "polished ease";
  return `${city} sharpens ${signal} into a cleaner street-style language.`;
}

async function mood(city: string, keywords: string[]) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallbackMood(city, keywords);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Given these top trending fashion keywords right now in ${city}: ${keywords.join(", ")}. Write ONE sentence describing the current fashion mood of this city. Rules: do NOT use the word 'leaning'. Be specific, evocative, editorial. Sound like a fashion correspondent filing from that city. Reference the actual keywords naturally. Max 12 words. Examples of the tone we want: 'Milan is sharpening its silhouette — precision over drama this season.' 'Seoul layers everything, including meaning.' 'Paris rediscovers the ankle.' Return only the sentence, nothing else.` }] }],
        }),
        next: { revalidate },
      },
    );
    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      return fallbackMood(city, keywords);
    }
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/^["']|["']$/g, "").trim() || fallbackMood(city, keywords);
  } catch (error) {
    console.error("Gemini discover city mood error:", error instanceof Error ? error.message : error);
    return fallbackMood(city, keywords);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const loadWorld = searchParams.get("scope") === "world" || searchParams.get("world") === "true";
  const markets = loadWorld ? Object.entries(marketCities) : ([["IN", marketCities.IN]] as Array<[string, string]>);
  const supabase = getSupabaseClient();
  if (!supabase) {
    logSupabaseFallback();
    return NextResponse.json({ cities: fallbackCities(markets) });
  }

  try {
    const cities = await supabaseCache(`discover-cities:${loadWorld ? "world" : "in"}`, supabaseCacheTtl("historical_trend_data"), async () => {
      const latest = await supabase
        .from("historical_trend_data")
        .select("month")
        .order("month", { ascending: false })
        .limit(1);
      if (latest.error) throw latest.error;
      const latestMonth = latest.data?.[0]?.month;
      if (!latestMonth) return fallbackCities(markets);

      const rows = await Promise.all(
        markets.map(async ([market, city]) => {
          const top = await supabase
            .from("historical_trend_data")
            .select("keyword_id, google_score")
            .eq("market", market)
            .eq("month", latestMonth)
            .order("google_score", { ascending: false })
            .limit(3);
          if (top.error) throw top.error;
          const ids = (top.data ?? []).map((row) => row.keyword_id);
          const names = ids.length
            ? await supabase.from("trend_keywords").select("id, keyword").in("id", ids)
            : { data: [] as Array<{ id: string; keyword: string }>, error: null };
          if (names.error) throw names.error;
          const map = new Map((names.data ?? []).map((row) => [row.id, row.keyword]));
          const keywords = ids.map((id) => map.get(id)).filter((item): item is string => Boolean(item));
          return {
            market,
            city,
            keywords,
            imageUrl: await pexelsImage(city),
            mood: await mood(city, keywords),
          };
        }),
      );

      return rows.length ? rows : fallbackCities(markets);
    });

    return NextResponse.json({ cities });
  } catch (error) {
    logSupabaseFallback(error);
    return NextResponse.json({ cities: fallbackCities(markets) });
  }
}
