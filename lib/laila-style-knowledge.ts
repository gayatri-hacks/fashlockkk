import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from "@/lib/supabase";

export type LailaPremiumCategory =
  | "runway_designer"
  | "fabric_construction"
  | "colour_theory"
  | "proportion_silhouette"
  | "fashion_culture_taste"
  | "indian_premium_fashion"
  | "menswear_premium";

export type LailaKnowledgeGender = "female" | "male";

export type LailaKnowledgeChunk = {
  id: string;
  title: string | null;
  content: string | null;
  source: string | null;
  category: string | null;
  gender?: string | null;
  category_tags?: string[] | null;
  rank?: number | null;
  retrievalScore?: number;
};

const PREMIUM_SOURCES = [
  "vogue.com",
  "vogue.in",
  "vogue.it",
  "businessoffashion.com",
  "gq.com",
  "gqindia.com",
  "ssense.com",
  "perniaspopupshop.com",
];

function queryWords(query: string) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 6);
}

export function classifyLailaKnowledgeTags(query: string, gender?: LailaKnowledgeGender): LailaPremiumCategory[] {
  const value = query.toLowerCase();
  const tags = new Set<LailaPremiumCategory>();

  if (/\b(expensive|luxury|premium|quality|fabric|construction|tailor|tailoring|cashmere|silk|linen|wool|leather)\b/.test(value)) {
    tags.add("fabric_construction");
  }
  if (/\b(colou?r|skin|tone|undertone|wheatish|dusky|fair|palette|warm|cool)\b/.test(value)) {
    tags.add("colour_theory");
    tags.add("indian_premium_fashion");
  }
  if (/\b(proportion|silhouette|body|fit|fits|shape|waist|hem|volume|height|petite|curvy)\b/.test(value)) {
    tags.add("proportion_silhouette");
  }
  if (/\b(old money|taste|elegant|elevated|classy|quiet luxury|minimal|parisian|french|japanese|investment)\b/.test(value)) {
    tags.add("fashion_culture_taste");
    tags.add("fabric_construction");
  }
  if (/\b(wedding|festive|saree|sari|lehenga|indian|banarasi|kanjivaram|chanderi|khadi|kurta|anarkali)\b/.test(value)) {
    tags.add("indian_premium_fashion");
  }
  if (/\b(runway|designer|collection|fashion week|vogue|editorial|street style)\b/.test(value)) {
    tags.add("runway_designer");
  }
  if (gender === "male" || /\b(men|menswear|male|gq|suit|sprezzatura)\b/.test(value)) {
    tags.add("menswear_premium");
  }

  if (!tags.size) tags.add("fashion_culture_taste");
  return [...tags].slice(0, 4);
}

function sourceBoost(source: string | null | undefined) {
  const normalized = (source || "").toLowerCase();
  return PREMIUM_SOURCES.some((premiumSource) => normalized.includes(premiumSource.replace(/^www\./, ""))) ? 2 : 0;
}

function scoreChunk(chunk: LailaKnowledgeChunk, selectedTags: LailaPremiumCategory[]) {
  const categoryTags = chunk.category_tags || [];
  const tagMatches = selectedTags.filter((tag) => categoryTags.includes(tag)).length;
  const baseRank = Number(chunk.rank || 0) * 10;
  const tagBoost = tagMatches * 4;
  const premiumBoost = sourceBoost(chunk.source);
  const genderBoost = chunk.gender === "both" || !chunk.gender ? 0.5 : 1;
  return baseRank + tagBoost + premiumBoost + genderBoost;
}

function uniqueChunks(chunks: LailaKnowledgeChunk[]) {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = chunk.id || `${chunk.source}:${chunk.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchRowsByIds(ids: string[]) {
  const supabase = getSupabaseClient();
  if (!supabase || !ids.length) return [];

  const { data, error } = await supabase
    .from("style_knowledge")
    .select("id,title,content,source,category,gender,category_tags")
    .in("id", ids);

  if (error) {
    logSupabaseFallback(error);
    return [];
  }

  return (data || []) as LailaKnowledgeChunk[];
}

async function searchKnowledgeUncached(query: string, gender: LailaKnowledgeGender, limit: number) {
  const supabase = getSupabaseClient();
  if (!supabase) return { chunks: [] as LailaKnowledgeChunk[], selectedTags: classifyLailaKnowledgeTags(query, gender) };

  const selectedTags = classifyLailaKnowledgeTags(query, gender);
  const candidates: LailaKnowledgeChunk[] = [];

  const { data: rpcData, error: rpcError } = await supabase.rpc("search_style_knowledge", {
    query_text: query,
    gender_filter: gender,
    limit_count: 16,
  });

  if (!rpcError && rpcData?.length) {
    const detailedRows = await fetchRowsByIds(rpcData.map((row: LailaKnowledgeChunk) => row.id));
    const detailById = new Map(detailedRows.map((row) => [row.id, row]));
    candidates.push(...rpcData.map((row: LailaKnowledgeChunk) => ({ ...row, ...(detailById.get(row.id) || {}) })));
  } else if (rpcError) {
    console.error("style knowledge search RPC failed:", rpcError.message);
  }

  for (const tag of selectedTags) {
    const { data, error } = await supabase
      .from("style_knowledge")
      .select("id,title,content,source,category,gender,category_tags")
      .contains("category_tags", [tag])
      .in("gender", gender === "female" ? ["female", "both"] : ["male", "both"])
      .limit(8);

    if (error) {
      logSupabaseFallback(error);
      continue;
    }
    candidates.push(...((data || []) as LailaKnowledgeChunk[]));
  }

  const words = queryWords(query);
  if (words.length) {
    const orFilter = words.flatMap((word) => [`title.ilike.%${word}%`, `content.ilike.%${word}%`]).join(",");
    const { data, error } = await supabase
      .from("style_knowledge")
      .select("id,title,content,source,category,gender,category_tags")
      .or(orFilter)
      .in("gender", gender === "female" ? ["female", "both"] : ["male", "both"])
      .limit(16);

    if (error) {
      logSupabaseFallback(error);
    } else {
      candidates.push(...((data || []) as LailaKnowledgeChunk[]));
    }
  }

  const chunks = uniqueChunks(candidates)
    .map((chunk) => ({ ...chunk, retrievalScore: scoreChunk(chunk, selectedTags) }))
    .sort((a, b) => (b.retrievalScore || 0) - (a.retrievalScore || 0))
    .slice(0, limit);

  return { chunks, selectedTags };
}

export async function searchLailaStyleKnowledge(query: string, gender: LailaKnowledgeGender, limit = 8, debugLabel = "style-chat") {
  const cappedLimit = Math.min(Math.max(limit, 1), 8);
  const cacheKey = `laila-style-knowledge:${debugLabel}:${gender}:${query.toLowerCase().slice(0, 180)}:${cappedLimit}`;

  const result = await supabaseCache(cacheKey, supabaseCacheTtl("style_knowledge"), () => searchKnowledgeUncached(query, gender, cappedLimit));

  if (process.env.NODE_ENV !== "production") {
    console.log(`[${debugLabel}] selected category tags:`, result.selectedTags);
    console.log(`[${debugLabel}] retrieved titles:`, result.chunks.map((chunk) => chunk.title).filter(Boolean));
  }

  return result;
}
