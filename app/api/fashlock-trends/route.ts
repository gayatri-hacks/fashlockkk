import { NextResponse } from "next/server";

type SearchResult = {
  title?: string;
  snippet?: string;
  link?: string;
  displayLink?: string;
};

type TrendCard = {
  name: string;
  description: string;
  howToWear: string;
  keyword: string;
  image: string | null;
};

type VelocityItem = {
  title: string;
  snippet: string;
};

type CityTrend = {
  city: string;
  headline: string;
  snippet: string;
  image: string | null;
};

export const runtime = "nodejs";
export const revalidate = 21600;

const cities = ["Paris", "Milan", "Tokyo", "New York", "London", "Seoul"];

function currentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "Spring";
  if (month >= 6 && month <= 8) return "Summer";
  if (month >= 9 && month <= 11) return "Autumn";
  return "Winter";
}

function cleanJson(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|and|of|to|in|for|with|from|by|on|this|these)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeResults(results: SearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = normalizeTitle(result.title ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isUsefulFashionSignal(result: SearchResult) {
  const text = [result.title, result.snippet].filter(Boolean).join(" ").toLowerCase();
  const fashionWords = [
    "fashion",
    "style",
    "trend",
    "runway",
    "street style",
    "wardrobe",
    "dress",
    "tailoring",
    "denim",
    "shoe",
    "bag",
    "silhouette",
    "wearing",
    "couture",
  ];
  const noise = [
    "drag race",
    "project runway",
    "stock",
    "earnings",
    "sale",
    "coupon",
    "discount",
    "grand opening",
    "canceled",
    "tv show",
    "cast",
    "movie",
  ];

  return fashionWords.some((word) => text.includes(word)) && !noise.some((word) => text.includes(word));
}

async function serperSearch(query: string, num: number) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num }),
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { organic?: SearchResult[] };
    return dedupeResults(data.organic ?? []).filter(isUsefulFashionSignal);
  } catch {
    return [];
  }
}

async function fetchPexelsImage(query: string, page = 1, orientation: "landscape" | "portrait" = "landscape") {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  try {
    const params = new URLSearchParams({
      query,
      per_page: "1",
      page: String(page),
      orientation,
    });
    const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: key },
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      photos?: Array<{ src?: { large?: string; large2x?: string; medium?: string; landscape?: string } }>;
    };
    return data.photos?.[0]?.src?.medium ??
      data.photos?.[0]?.src?.landscape ??
      data.photos?.[0]?.src?.large ??
      null;
  } catch {
    return null;
  }
}

function fallbackTrends(): Array<Omit<TrendCard, "image">> {
  return [
    {
      name: "Soft Tailoring",
      description: "Relaxed suits and fluid trousers are making polish feel less severe.",
      howToWear: "Start with one structured piece, like a blazer or pleated trouser, then soften it with a fine knit or tank. Keep the palette quiet so the proportion does the work.",
      keyword: "soft tailoring fashion",
    },
    {
      name: "Sheer Layering",
      description: "Transparency is moving from evening drama into everyday texture.",
      howToWear: "Layer a sheer shirt over a tonal camisole, slip dress, or ribbed tank. Let only one layer reveal skin, then ground it with denim or tailoring.",
      keyword: "sheer layering fashion",
    },
    {
      name: "Modern Romance",
      description: "Ribbons, drape, lace, and pearls are returning with sharper styling.",
      howToWear: "Use one romantic cue at a time: a bow, a pearl, a soft neckline, or a lace edge. Pair it with something blunt, like dark denim or flat shoes.",
      keyword: "romantic fashion editorial",
    },
    {
      name: "Utility Mood",
      description: "Pockets, cargos, and practical cloth are becoming a cleaner style language.",
      howToWear: "Wear utility pieces with something precise: a fitted tank, a narrow sandal, or a crisp shirt. Avoid too many hardware details in one look.",
      keyword: "utility fashion editorial",
    },
    {
      name: "Emotional Denim",
      description: "Denim is being styled as memory, attitude, and comfort all at once.",
      howToWear: "Choose one denim statement: a wide jean, long skirt, jacket, or dark wash shirt. Add a personal object, like gold hoops or a worn belt, to make it yours.",
      keyword: "denim fashion editorial",
    },
    {
      name: "Texture First",
      description: "Fabric depth is replacing loud logos as the new sign of taste.",
      howToWear: "Mix two textures in the same color family: cotton with silk, denim with leather, knit with satin. Keep shapes simple so the surface feels intentional.",
      keyword: "fashion texture editorial",
    },
  ];
}

async function extractTrends(globalSignals: SearchResult[]) {
  const key = process.env.GEMINI_API_KEY;
  const allRawData = globalSignals.map((result) => `${result.title}: ${result.snippet}`).join("\n");
  if (!key || !allRawData) return fallbackTrends();

  const prompt = `You are the trends editor at Fashlock, a premium French fashion platform.

Based on this real fashion data from the web:
${allRawData}

Extract and return a JSON array of 6 trend objects. Each object must have:
- "name": short punchy trend name, max 4 words
- "description": one elegant sentence describing the trend in Fashlock's editorial voice
- "howToWear": two sentences — practical, specific styling advice any woman can follow
- "keyword": 3-word phrase to search Pexels for a matching editorial image

Return ONLY valid JSON array. No markdown, no explanation.
Example: [{"name":"Quiet Luxury","description":"...","howToWear":"...","keyword":"quiet luxury fashion"}]`;

  const models = ["gemini-2.5-flash"];
  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.72 },
          }),
          next: { revalidate: 60 * 60 * 6 },
        },
      );
      if (!response.ok) {
        const err = await response.text();
        console.error("Gemini error:", response.status, err);
        continue;
      }
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) continue;
      const parsed = JSON.parse(cleanJson(raw)) as Array<Partial<TrendCard>>;
      if (!Array.isArray(parsed)) continue;
      const trends = parsed
        .filter((trend) => trend.name && trend.description && trend.howToWear && trend.keyword)
        .map((trend) => ({
          name: String(trend.name).slice(0, 80),
          description: String(trend.description),
          howToWear: String(trend.howToWear),
          keyword: String(trend.keyword),
        }))
        .slice(0, 6);
      if (trends.length >= 4) return trends;
    } catch {
      continue;
    }
  }

  return fallbackTrends();
}

function formatVelocity(results: SearchResult[]): VelocityItem[] {
  return results.slice(0, 4).map((result) => ({
    title: result.title ?? "Untitled trend signal",
    snippet: result.snippet ?? "A current signal in the fashion conversation.",
  }));
}

function fallbackVelocity(kind: "rising" | "peaking" | "fading"): VelocityItem[] {
  const map = {
    rising: [
      ["Sheer city layers", "Light transparency is moving into daywear through shirts, skirts, and soft knits."],
      ["Utility romance", "Practical pockets and cargo shapes are being styled with a softer hand."],
      ["Indian coquette", "Ribbons, bangles, pearls, and kajal are giving the global romantic trend local texture."],
      ["Texture dressing", "Fabric interest is becoming the easiest way to make simple outfits feel considered."],
    ],
    peaking: [
      ["Quiet luxury", "Minimal neutrals and expensive-looking basics are now a mainstream style language."],
      ["Ballet flats", "The flat shoe revival has moved from niche styling cue to everyday default."],
      ["Wide denim", "Loose jeans and long denim shapes are everywhere across street style."],
      ["Soft tailoring", "Relaxed suits and calm workwear are defining the current polished silhouette."],
    ],
    fading: [
      ["Logo maximalism", "Obvious branding is losing energy as texture and shape take over."],
      ["Overdone Barbie pink", "The single-color fantasy is softening into more personal romantic palettes."],
      ["Micro trend stacking", "Wearing every internet aesthetic at once is giving way to cleaner identity codes."],
      ["Hard corporate dressing", "Rigid office styling is being replaced by softer authority."],
    ],
  };

  return map[kind].map(([title, snippet]) => ({ title, snippet }));
}

function ensureVelocityItems(results: SearchResult[], kind: "rising" | "peaking" | "fading") {
  const liveItems = formatVelocity(results);
  const fallbackItems = fallbackVelocity(kind);
  const seen = new Set(liveItems.map((item) => normalizeTitle(item.title)));

  for (const item of fallbackItems) {
    const key = normalizeTitle(item.title);
    if (!seen.has(key)) {
      liveItems.push(item);
      seen.add(key);
    }
    if (liveItems.length >= 4) break;
  }

  return liveItems.slice(0, 4);
}

export async function GET() {
  const season = currentSeason();
  const year = new Date().getFullYear();

  try {
    const [globalSignals, risingSignals, peakingSignals, fadingSignals] = await Promise.all([
      serperSearch(`${season} fashion trends 2026 what to wear site:vogue.com OR site:elle.com OR site:whowhatwear.com OR site:harpersbazaar.com`, 8),
      serperSearch("emerging micro fashion trend rising 2026 new", 4),
      serperSearch("biggest fashion trend everyone wearing right now 2026", 4),
      serperSearch("fashion trend over done 2026 fading out", 4),
    ]);

    const extractedTrends = await extractTrends(globalSignals);
    const trends = await Promise.all(
      extractedTrends.map(async (trend, index) => ({
        ...trend,
        image: await fetchPexelsImage(`${trend.keyword} editorial`, index + 1),
      })),
    );

    const cityTrends: CityTrend[] = await Promise.all(
      cities.map(async (city, index) => {
        const [signals, image] = await Promise.all([
          serperSearch(`${city} street style fashion 2026 what people are wearing`, 2),
          fetchPexelsImage(`${city} street style fashion editorial`, index + 1),
        ]);
        const first = signals[0];
        return {
          city,
          headline: first?.title ?? `${city} street style is setting the season's mood`,
          snippet: first?.snippet ?? "A city-led read on what people are wearing now.",
          image,
        };
      }),
    );

    return NextResponse.json({
      season,
      year,
      trends,
      velocity: {
        rising: ensureVelocityItems(risingSignals, "rising"),
        peaking: ensureVelocityItems(peakingSignals, "peaking"),
        fading: ensureVelocityItems(fadingSignals, "fading"),
      },
      cities: cityTrends,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load trends",
      },
      { status: 500 },
    );
  }
}
