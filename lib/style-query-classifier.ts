import { unstable_cache } from "next/cache";

const GEMINI_MODEL = "gemini-2.5-flash";

export type StyleQueryType = "western" | "indian" | "fusion";
export type StyleSearchRegion = "it" | "in" | "fr";

export type StyleQueryClassification = {
  type: StyleQueryType;
  searchRegion: StyleSearchRegion;
  premiumSites: string[];
};

const indianSites = [
  "kalki.in",
  "indya.com",
  "perniaspopupshop.com",
  "libas.in",
  "anitadongre.com",
  "rawmango.in",
  "rimzim.com",
  "sahilbeggarani.com",
  "ampm-india.com",
  "payalkhandwala.com",
];

const westernSites = [
  "zara.com",
  "mango.com",
  "cos.com",
  "arket.com",
  "sandro-paris.com",
  "apc.fr",
  "isabellemarant.com",
  "toteme-studio.com",
  "ganni.com",
  "acnestudios.com",
  "uniqlo.com",
  "massimodutti.com",
];

function fallbackClassification(query: string): StyleQueryClassification {
  const lower = query.toLowerCase();
  const indian = /\b(lehenga|saree|sari|kurta|salwar|dupatta|ethnic|festival|wedding indian|desi|anarkali|sherwani|bandhgala|nehru jacket|dhoti|indo-western|fusion|mehendi|sangeet|festive wear)\b/.test(lower);
  const western = /\b(jeans|blazer|shirt|trousers|coat|jacket|dress|skirt|top|minimal|streetwear|casual|formal|suit|tuxedo|denim|linen western|tailored|oversized|polo)\b/.test(lower);

  if (indian && western) {
    return { type: "fusion", searchRegion: "fr", premiumSites: [...indianSites.slice(0, 5), ...westernSites.slice(0, 5)] };
  }

  if (indian) {
    return { type: "indian", searchRegion: "in", premiumSites: indianSites };
  }

  return { type: "western", searchRegion: "it", premiumSites: westernSites };
}

function cleanJson(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

async function classifyStyleQueryUncached(query: string): Promise<StyleQueryClassification> {
  const fallback = fallbackClassification(query);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback;

  const prompt = `Classify this fashion query as one of three types:
Query: ${query}

Return JSON only:
{
  "type": "western" | "indian" | "fusion",
  "searchRegion": "it" | "in" | "fr",
  "premiumSites": string[]
}

Classification rules:
INDIAN if query contains any of:
lehenga, saree, kurta, salwar, 
dupatta, ethnic, festival, wedding 
indian, desi, anarkali, sherwani,
bandhgala, nehru jacket, dhoti,
indo-western, fusion, mehendi,
sangeet, festive wear
→ searchRegion: 'in'
→ premiumSites: kalki.in, indya.com,
  perniaspopupshop.com, libas.in,
  anitadongre.com, rawmango.in,
  rimzim.com, sahilbeggarani.com,
  ampm-india.com, payalkhandwala.com

WESTERN if query contains any of:
jeans, blazer, shirt, trousers,
coat, jacket, dress, skirt, top,
minimal, streetwear, casual, formal,
suit, tuxedo, denim, linen western,
tailored, oversized, polo
→ searchRegion: 'it'
→ premiumSites: zara.com, mango.com,
  cos.com, arket.com, sandro-paris.com,
  apc.fr, isabellemarant.com,
  toteme-studio.com, ganni.com,
  acnestudios.com, uniqlo.com,
  massimodutti.com

FUSION if mix of both
→ searchRegion: 'fr'
→ premiumSites: mix of both above`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
    });

    if (!response.ok) {
      console.error("Gemini query classifier error:", response.status, await response.text());
      return fallback;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(cleanJson(text));
    const type = ["western", "indian", "fusion"].includes(parsed.type) ? parsed.type : fallback.type;
    const searchRegion = ["it", "in", "fr"].includes(parsed.searchRegion) ? parsed.searchRegion : fallback.searchRegion;
    const sites = Array.isArray(parsed.premiumSites) ? parsed.premiumSites.filter((site: unknown) => typeof site === "string") : fallback.premiumSites;

    return {
      type,
      searchRegion,
      premiumSites: sites.length ? sites.slice(0, 12) : fallback.premiumSites,
    };
  } catch (error) {
    console.error("Style query classifier failed:", error);
    return fallback;
  }
}

const cachedClassifyStyleQuery = unstable_cache(
  classifyStyleQueryUncached,
  ["style-query-classifier-v1"],
  { revalidate: 60 * 60 * 24 },
);

export function siteFilter(sites: string[]) {
  return sites.map((site) => `site:${site}`).join(" OR ");
}

export async function classifyStyleQuery(query: string) {
  return cachedClassifyStyleQuery(query);
}
