import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getLookSourceQueries, getLookVariationSeeds, lookLibrary } from "@/lib/look-library";

export const runtime = "nodejs";
export const revalidate = 86400;

const GEMINI_MODEL = "gemini-2.5-flash";
const VARIATION_REVALIDATE_SECONDS = 60 * 60 * 24;

type SearchResult = {
  title?: string;
  link?: string;
  displayLink?: string;
  snippet?: string;
};

type LookVariation = {
  title: string;
  formula: string;
  pieces: string[];
  stylingNote: string;
  evidenceSources: Array<{ title: string; url: string; source: string }>;
  shopTerms: string[];
};

function fallbackVariations(lookId: string, trendCluster: string): LookVariation[] {
  const look = lookLibrary.find((item) => item.id === lookId) || lookLibrary.find((item) => item.trendCluster === trendCluster);
  if (!look) return [];

  return getLookVariationSeeds(look).map((seed) => ({
    ...seed,
    evidenceSources: [],
  }));
}

function cleanJson(text: string) {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function parseVariations(text: string): LookVariation[] {
  try {
    const parsed = JSON.parse(cleanJson(text)) as { variations?: LookVariation[] } | LookVariation[];
    const variations = Array.isArray(parsed) ? parsed : parsed.variations || [];
    return variations
      .filter((variation) => variation?.title && variation?.formula)
      .map((variation) => ({
        title: String(variation.title).slice(0, 80),
        formula: String(variation.formula).slice(0, 180),
        pieces: Array.isArray(variation.pieces) ? variation.pieces.map(String).slice(0, 6) : [],
        stylingNote: String(variation.stylingNote || "").slice(0, 220),
        evidenceSources: Array.isArray(variation.evidenceSources) ? variation.evidenceSources.slice(0, 3) : [],
        shopTerms: Array.isArray(variation.shopTerms) ? variation.shopTerms.map(String).slice(0, 4) : [],
      }))
      .slice(0, 8);
  } catch {
    return [];
  }
}

async function searchSerper(queries: string[]) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const results: SearchResult[] = [];

  for (const query of queries.slice(0, 4)) {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 4 }),
      next: { revalidate: VARIATION_REVALIDATE_SECONDS },
    });

    if (!response.ok) continue;
    const data = (await response.json()) as { organic?: SearchResult[] };
    results.push(...(data.organic || []).slice(0, 4));
  }

  const seen = new Set<string>();
  return results
    .filter((result) => result.link && !seen.has(result.link) && seen.add(result.link))
    .slice(0, 12);
}

async function summarizeWithGemini(lookId: string, trendCluster: string, results: SearchResult[]) {
  const key = process.env.GEMINI_API_KEY;
  const look = lookLibrary.find((item) => item.id === lookId) || lookLibrary.find((item) => item.trendCluster === trendCluster);
  if (!key || !look || !results.length) return [];

  const evidence = results
    .map((result, index) => `${index + 1}. ${result.title || "Untitled"} (${result.displayLink || result.link}) - ${result.snippet || ""}`)
    .join("\n");

  const prompt = `You are a fashion editor. Based only on these search snippets, identify recurring outfit formulas for how this trend is being styled now.

Look: ${look.title}
Trend cluster: ${look.trendCluster}
Base pieces: ${look.pieces.join(", ")}

Search evidence:
${evidence}

Return JSON only:
{
  "variations": [
    {
      "title": "short editorial title",
      "formula": "one-line outfit formula",
      "pieces": ["piece 1", "piece 2", "piece 3"],
      "stylingNote": "specific styling note",
      "evidenceSources": [{"title": "source title", "url": "source url", "source": "domain"}],
      "shopTerms": ["specific shopping query", "specific shopping query"]
    }
  ]
}

Rules:
- Return 5 to 8 variations.
- Keep formulas wearable and specific.
- Do not invent brand claims.
- Use evidence source URLs from the snippets only.
- Keep shopTerms concrete, not generic.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1800,
        responseMimeType: "application/json",
      },
    }),
    next: { revalidate: VARIATION_REVALIDATE_SECONDS },
  });

  if (!response.ok) return [];
  const data = await response.json();
  return parseVariations(data?.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

const loadLookVariations = unstable_cache(
  async (lookId: string, trendCluster: string) => {
    const look = lookLibrary.find((item) => item.id === lookId) || lookLibrary.find((item) => item.trendCluster === trendCluster);
    if (!look) return { variations: [], source: "empty" };

    const fallback = fallbackVariations(look.id, look.trendCluster);

    try {
      const results = await searchSerper(getLookSourceQueries(look));
      const generated = await summarizeWithGemini(look.id, look.trendCluster, results);
      return {
        variations: generated.length ? generated : fallback,
        source: generated.length ? "research" : "fallback",
      };
    } catch (error) {
      console.error("Look variations failed:", error);
      return { variations: fallback, source: "fallback" };
    }
  },
  ["style-look-variations-v2"],
  { revalidate: VARIATION_REVALIDATE_SECONDS },
);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const lookId = String(body.lookId || "").trim();
    const trendCluster = String(body.trendCluster || "").trim();

    if (!lookId && !trendCluster) {
      return NextResponse.json({ error: "Missing lookId or trendCluster" }, { status: 400 });
    }

    const result = await loadLookVariations(lookId, trendCluster);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Look variations route error:", error);
    return NextResponse.json({ variations: [], source: "fallback" });
  }
}
