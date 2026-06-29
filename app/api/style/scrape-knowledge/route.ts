import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FETCH_TIMEOUT_MS = 7000;
const ARTICLE_TIMEOUT_MS = 4500;
const MAX_ITEMS_PER_RUN = 500;
const ARTICLE_RESULTS_PER_QUERY = 10;
const QUERY_BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
const FULL_ARTICLE_TEXT_LIMIT = 12000;

type PremiumCategory =
  | "runway_designer"
  | "fabric_construction"
  | "colour_theory"
  | "proportion_silhouette"
  | "fashion_culture_taste"
  | "indian_premium_fashion"
  | "menswear_premium";

type KnowledgeCategory = "body_type" | "colour" | "occasion" | "capsule" | "mens" | "womens" | "general";

function scraperDisabledResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Style knowledge scraper is disabled. Set STYLE_SCRAPER_ENABLED=true to run it intentionally.",
    },
    { status: 403 },
  );
}

function unauthorizedResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Unauthorized style knowledge scraper request.",
    },
    { status: 401 },
  );
}

function isAuthorizedScraperRequest(request: Request) {
  const secret = process.env.STYLE_SCRAPER_SECRET;
  const provided = request.headers.get("x-style-scraper-secret");
  return Boolean(secret && provided && provided === secret);
}

type KnowledgeItem = {
  source: string;
  source_url: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  category_tags?: string[];
  gender: "male" | "female" | "both";
};

const redditSources = [
  { subreddit: "femalefashionadvice", gender: "female" as const },
  { subreddit: "malefashionadvice", gender: "male" as const },
  { subreddit: "styleadvice", gender: "both" as const },
  { subreddit: "IndianFashionAddicts", gender: "both" as const },
  { subreddit: "IndianMalesFashion", gender: "male" as const },
  { subreddit: "desifashion", gender: "both" as const },
];

const premiumQueryGroups: Record<PremiumCategory, string[]> = {
  runway_designer: [
    "Vogue runway review season analysis designer collection meaning",
    "Business of Fashion designer philosophy aesthetic",
    "site:businessoffashion.com fashion analysis style",
    "site:vogue.com runway review collection analysis",
    "site:vogue.it runway collection review analysis",
    "site:ssense.com editorial fashion culture",
    "Suzy Menkes fashion review collection",
    "fashion week street style analysis what it means",
  ],
  fabric_construction: [
    "luxury fabric guide fashion linen silk wool cashmere quality",
    "how to identify quality clothing fabric construction guide",
    "why expensive clothes fit better construction tailoring guide",
    "fabric guide fashion silk linen wool cashmere cotton quality feel",
    "Italian tailoring vs fast fashion construction difference",
  ],
  colour_theory: [
    "colour theory fashion advanced seasonal palette analysis",
    "how colours work with skin tone advanced colour theory fashion",
    "colour psychology fashion what colours communicate style",
    "tonal dressing colour blocking advanced fashion guide",
    "French approach to colour fashion Parisian palette guide",
  ],
  proportion_silhouette: [
    "fashion proportion rules advanced silhouette styling guide",
    "golden ratio fashion styling proportion theory",
    "how to dress your body advanced proportion guide fashion",
    "silhouette history fashion why shapes return cultural meaning",
    "tailoring fit guide fashion how clothes should fit premium",
  ],
  fashion_culture_taste: [
    "how to develop fashion taste advanced style guide",
    "fashion insider style secrets what stylists know",
    "how to look expensive fashion guide quality over quantity",
    "Parisian style guide real French fashion approach",
    "Japanese fashion aesthetic guide minimal quality approach",
    "how fashion reflects personality psychology style identity",
    "mixing high and low fashion guide investment pieces",
  ],
  indian_premium_fashion: [
    "site:vogue.in designer profile Indian fashion aesthetic",
    "Indian designer philosophy Anavila Raw Mango Bodice aesthetic",
    "Indian fabric guide Chanderi Banarasi Kanjivaram Khadi when to wear quality",
    "Indian fashion week analysis FDCI Lakme designer collection",
    "Indian colour theory skin tone warm dusky fair what to wear",
    "premium Indian fashion guide investment pieces designers",
    "Indian occasion dressing advanced guide wedding festive corporate",
    "site:perniaspopupshop.com designer story Indian fashion",
  ],
  menswear_premium: [
    "GQ style guide advanced menswear",
    "site:gq.com style guide how to dress men premium",
    "Italian menswear philosophy sprezzatura style guide",
    "how to dress well men advanced guide investment wardrobe",
    "menswear fit guide premium tailoring advanced",
    "Japanese menswear aesthetic guide minimal quality",
  ],
};

const premiumArticleQueries: Array<{ query: string; results?: number; categoryTag?: PremiumCategory }> = Object.entries(premiumQueryGroups).flatMap(
  ([categoryTag, queries]) => queries.map((query) => ({ query, categoryTag: categoryTag as PremiumCategory })),
);

const legacyArticleQueries: Array<{ query: string; results?: number; categoryTag?: PremiumCategory }> = [
  { query: "how to dress for your body type complete guide" },
  { query: "men style guide how to dress well" },
  { query: "capsule wardrobe guide women" },
  { query: "how to find your personal style" },
  { query: "colour theory fashion what suits you" },
  { query: "how to dress for occasions guide" },
  { query: "gym wear style guide men women" },
  { query: "office fashion style guide" },
  { query: "how to dress Indian body type style guide" },
  { query: "Indian men fashion style guide how to dress" },
  { query: "Indian women fashion what to wear skin tone guide" },
  { query: "what to wear Indian wedding guest" },
  { query: "office fashion India style guide" },
  { query: "Indian street style how to dress" },
  { query: "dressing for Indian climate guide" },
  { query: "kurta style guide men India" },
  { query: "saree styling guide body type" },
  { query: "Indian capsule wardrobe guide" },
  { query: "gym wear India style guide" },
  { query: "ethnic fusion fashion guide India" },
  { query: "site:vogue.in style guide how to" },
  { query: "site:elle.in fashion guide dressing" },
  { query: "site:grazia.in style guide" },
  { query: "site:gqindia.com style guide", results: 20 },
  { query: "plus size fashion guide India women" },
  { query: "petite fashion tips Indian women" },
  { query: "tall men fashion guide India" },
  { query: "dark skin tone what colours to wear" },
  { query: "warm undertone fashion colour guide" },
  { query: "how to dress minimalist India" },
  { query: "streetwear guide India men" },
  { query: "ethnic wear men style guide India" },
  { query: "party wear women India style guide" },
  { query: "workwear women India guide" },
  { query: "hourglass body type what to wear women" },
  { query: "apple body type fashion tips" },
  { query: "pear body type styling guide" },
  { query: "rectangle body type outfits" },
  { query: "inverted triangle body men fashion" },
  { query: "slim body type men what to wear" },
  { query: "athletic build men fashion guide" },
  { query: "warm skin tone what colours to wear" },
  { query: "cool skin tone fashion colour guide" },
  { query: "dark complexion what colours suit" },
  { query: "fair skin tone outfit colours" },
  { query: "colour coordination fashion guide" },
  { query: "how to wear neutrals outfit guide" },
  { query: "how to dress for job interview guide" },
  { query: "wedding guest outfit guide India" },
  { query: "first date outfit guide men women" },
  { query: "festival fashion India what to wear" },
  { query: "beach vacation outfit guide" },
  { query: "monsoon fashion India what to wear" },
  { query: "winter fashion India Delhi guide" },
  { query: "summer fashion India Mumbai guide" },
  { query: "how to develop personal style guide" },
  { query: "minimalist fashion wardrobe guide" },
  { query: "maximalist fashion how to style" },
  { query: "classic style wardrobe essentials" },
  { query: "streetwear style guide beginners" },
  { query: "bohemian style fashion guide" },
  { query: "smart casual dress code guide" },
  { query: "business casual men women guide" },
  { query: "how to style jeans outfit guide" },
  { query: "blazer styling guide men women" },
  { query: "how to wear saree styling tips" },
  { query: "kurta styling men occasion guide" },
  { query: "how to wear ethnic fusion India" },
  { query: "denim jacket outfit ideas guide" },
  { query: "how to style white shirt outfits" },
  { query: "trousers vs jeans when to wear" },
  { query: "gym outfit style guide men" },
  { query: "gym fashion women what to wear" },
  { query: "athleisure style guide how to" },
  { query: "workout clothes that look good" },
  { query: "activewear styling tips India" },
  { query: "how to accessorise outfit guide" },
  { query: "jewellery styling guide India" },
  { query: "bag styling guide women" },
  { query: "shoes outfit matching guide" },
  { query: "watch styling guide men" },
];

const articleQueries: Array<{ query: string; results?: number; categoryTag?: PremiumCategory }> = [
  ...premiumArticleQueries,
  ...legacyArticleQueries,
];

const redditFallbackQueries = [
  { query: "site:reddit.com/r/femalefashionadvice style guide", results: 20, gender: "female" as const },
  { query: "site:reddit.com/r/malefashionadvice style guide", results: 20, gender: "male" as const },
  { query: "site:reddit.com/r/IndianFashionAddicts outfit advice", results: 10, gender: "both" as const },
];

const embeddingModels = [
  "gemini-embedding-001",
];

const STYLE_KNOWLEDGE_EMBEDDING_DIMENSIONS = 768;

let workingEmbeddingModel: string | null = null;
let embeddingUnavailable = false;

function broadCategoryForPremiumTag(categoryTag?: PremiumCategory): KnowledgeCategory {
  if (categoryTag === "colour_theory") return "colour";
  if (categoryTag === "proportion_silhouette") return "body_type";
  if (categoryTag === "menswear_premium") return "mens";
  if (categoryTag === "indian_premium_fashion") return "occasion";
  return "general";
}

function detectCategory(title: string, categoryTag?: PremiumCategory): KnowledgeItem["category"] {
  if (categoryTag) return broadCategoryForPremiumTag(categoryTag);
  const value = title.toLowerCase();
  if (value.includes("body type") || value.includes("body shape")) return "body_type";
  if (value.includes("colour") || value.includes("color")) return "colour";
  if (value.includes("office") || value.includes("work") || value.includes("occasion") || value.includes("wedding") || value.includes("gym")) return "occasion";
  if (value.includes("capsule")) return "capsule";
  if (value.includes("menswear") || value.includes("men ") || value.includes("male")) return "mens";
  if (value.includes("womenswear") || value.includes("women") || value.includes("female")) return "womens";
  return "general";
}

function detectGender(title: string, fallback: KnowledgeItem["gender"] = "both"): KnowledgeItem["gender"] {
  const value = title.toLowerCase();
  if (value.includes("menswear") || value.includes(" men ") || value.includes(" male") || value.startsWith("men ")) return "male";
  if (value.includes("womenswear") || value.includes(" women") || value.includes(" female") || value.startsWith("women ")) return "female";
  return fallback;
}

function normalizeText(text: string) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitleKey(title: string) {
  return normalizeText(title)
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/g, " ")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlockedOrPaywalledText(text: string) {
  const value = text.toLowerCase();
  return [
    "subscribe to continue",
    "subscription required",
    "sign in to continue",
    "log in to continue",
    "login to continue",
    "create an account to continue",
    "enable javascript",
    "access denied",
    "request blocked",
    "temporarily blocked",
    "forbidden",
    "paywall",
    "403 forbidden",
  ].some((pattern) => value.includes(pattern));
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "article";
  }
}

function uniqueByUrlAndTitle(items: KnowledgeItem[]) {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  return items.filter((item) => {
    const titleKey = normalizeTitleKey(item.title);
    if (!item.source_url || seenUrls.has(item.source_url)) return false;
    if (!titleKey || seenTitles.has(titleKey)) return false;
    seenUrls.add(item.source_url);
    seenTitles.add(titleKey);
    return item.content.trim().length > 80;
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetchWithTimeout(url, {
    ...init,
    headers: {
      "User-Agent": "FashlockStyleKnowledge/1.0",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function scrapeRedditViaSerper() {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const items: KnowledgeItem[] = [];

  for (const fallbackQuery of redditFallbackQueries) {
    try {
      const response = await fetchWithTimeout("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": key,
        },
        body: JSON.stringify({
          q: fallbackQuery.query,
          num: fallbackQuery.results,
        }),
      });

      if (!response.ok) {
        console.error("Serper reddit fallback failed:", response.status, await response.text());
        continue;
      }

      const data = await response.json();
      for (const result of (data.organic || []).slice(0, fallbackQuery.results)) {
        const title = result.title || "Reddit style advice";
        const content = normalizeText([result.snippet, result.title].filter(Boolean).join("\n\n"));
        if (!result.link || !content) continue;

        items.push({
          source: "reddit",
          source_url: result.link,
          title,
          content,
          category: detectCategory(title),
          category_tags: [],
          gender: detectGender(title, fallbackQuery.gender),
        });
      }
    } catch (error) {
      console.error(`Serper reddit fallback failed for ${fallbackQuery.query}:`, error);
    }
  }

  return items;
}

async function fetchRedditComments(permalink: string) {
  try {
    const commentsUrl = `https://www.reddit.com${permalink}.json?limit=30&sort=top`;
    const data = await fetchJson(commentsUrl);
    const comments = data?.[1]?.data?.children || [];
    return comments
      .map((child: any) => child?.data)
      .filter((comment: any) => comment?.body && Number(comment.score || 0) > 50)
      .map((comment: any) => comment.body)
      .slice(0, 8)
      .join("\n\n");
  } catch (error) {
    console.error("Reddit comments error:", error);
    return "";
  }
}

async function scrapeReddit() {
  const items: KnowledgeItem[] = [];

  for (const source of redditSources) {
    try {
      const listingUrl = `https://www.reddit.com/r/${source.subreddit}/top.json?t=all&limit=100`;
      const data = await fetchJson(listingUrl);
      const posts = data?.data?.children || [];

      for (const child of posts) {
        const post = child?.data;
        if (!post || Number(post.score || 0) <= 100) continue;

        const title = post.title || "Reddit style advice";
        const selftext = post.selftext || "";
        const comments = await fetchRedditComments(post.permalink);
        const content = normalizeText([selftext, comments].filter(Boolean).join("\n\nTop comments:\n"));
        if (!content) continue;

        items.push({
          source: "reddit",
          source_url: `https://www.reddit.com${post.permalink}`,
          title,
          content,
          category: detectCategory(title),
          category_tags: [],
          gender: detectGender(title, source.gender),
        });
      }
    } catch (error) {
      console.error(`Reddit scrape failed for ${source.subreddit}:`, error);
    }
  }

  return items;
}

async function fetchArticleText(url: string) {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": "FashlockStyleKnowledge/1.0",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
      },
      ARTICLE_TIMEOUT_MS,
    );
    if ([401, 402, 403, 407, 429, 451].includes(response.status)) return "";
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) return "";
    const html = await response.text();
    const text = normalizeText(html);
    if (isBlockedOrPaywalledText(text)) return "";
    return text.slice(0, FULL_ARTICLE_TEXT_LIMIT);
  } catch (error) {
    console.error("Article fetch error:", error);
    return "";
  }
}

async function scrapeArticleQuery(queryConfig: { query: string; results?: number; categoryTag?: PremiumCategory }, fetchFullText = true, maxResults?: number) {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    console.error("SERPER_API_KEY missing; skipping article scrape");
    return [];
  }

  const { query, results = ARTICLE_RESULTS_PER_QUERY, categoryTag } = queryConfig;
  const resultLimit = Math.min(results, maxResults ?? results);

  try {
    const response = await fetchWithTimeout("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": key,
      },
      body: JSON.stringify({ q: query, num: Math.max(ARTICLE_RESULTS_PER_QUERY, resultLimit) }),
    });

    if (!response.ok) {
      console.error("Serper failed:", response.status, await response.text());
      return [];
    }

    const data = await response.json();
    const searchResults = data.organic || [];

    const articleItems = await Promise.all(
      searchResults.slice(0, resultLimit).map(async (result: any) => {
        const url = result.link;
        if (!url) return null;
        const fullText = fetchFullText ? await fetchArticleText(url) : "";
        const snippetText = normalizeText([result.title, result.snippet].filter(Boolean).join("\n\n"));
        const content = fullText || snippetText;
        if (!content || isBlockedOrPaywalledText(content)) return null;
        const title = result.title || query;
        if (isBlockedOrPaywalledText(title)) return null;

        return {
          source: domainFromUrl(url),
          source_url: url,
          title,
          content,
          category: detectCategory(`${query} ${title}`, categoryTag),
          category_tags: categoryTag ? [categoryTag] : [],
          gender: detectGender(`${query} ${title}`, "both"),
        } satisfies KnowledgeItem;
      }),
    );

    return articleItems.filter(Boolean) as KnowledgeItem[];
  } catch (error) {
    console.error(`Article scrape failed for ${query}:`, error);
    return [];
  }
}

async function scrapeArticles(fetchFullText = true, limit = MAX_ITEMS_PER_RUN, categoryTag?: PremiumCategory) {
  const items: KnowledgeItem[] = [];
  const queries = categoryTag ? premiumArticleQueries.filter((queryConfig) => queryConfig.categoryTag === categoryTag) : articleQueries;
  const batches = Math.ceil(queries.length / QUERY_BATCH_SIZE);
  const smallRunResultLimit = limit < MAX_ITEMS_PER_RUN ? Math.max(2, Math.min(ARTICLE_RESULTS_PER_QUERY, Math.ceil(limit / QUERY_BATCH_SIZE) + 1)) : undefined;

  for (let index = 0; index < queries.length; index += QUERY_BATCH_SIZE) {
    const batchNumber = Math.floor(index / QUERY_BATCH_SIZE) + 1;
    const batchQueries = queries.slice(index, index + QUERY_BATCH_SIZE);
    const batchResults = await Promise.all(batchQueries.map((queryConfig) => scrapeArticleQuery(queryConfig, fetchFullText, smallRunResultLimit)));
    const batchItems = batchResults.flat();
    items.push(...batchItems);
    console.log(`Search batch ${batchNumber}/${batches} collected ${batchItems.length} candidate items.`);
    if (uniqueByUrlAndTitle(items).length >= limit) break;
    if (index + QUERY_BATCH_SIZE < queries.length) await delay(BATCH_DELAY_MS);
  }

  return items;
}

async function embedContent(content: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || embeddingUnavailable) return null;

  const contentText = content.slice(0, 12000);
  const errors: string[] = [];
  const modelsToTry = workingEmbeddingModel ? [workingEmbeddingModel] : embeddingModels;

  for (const model of modelsToTry) {
    try {
      const modelPath = `models/${model}`;
      const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          content: {
            parts: [{ text: contentText }],
          },
          output_dimensionality: STYLE_KNOWLEDGE_EMBEDDING_DIMENSIONS,
          taskType: "RETRIEVAL_DOCUMENT",
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        errors.push(`${model}: ${response.status} ${err}`);
        console.error("Gemini embedding model failed", {
          model,
          status: response.status,
          message: err.slice(0, 300),
        });
        continue;
      }

      const data = await response.json();
      const values = data.embedding?.values || data.embeddings?.[0]?.values;
      const dimension = Array.isArray(values) ? values.length : 0;
      console.log("Gemini embedding model response", {
        model,
        status: response.status,
        dimension,
      });
      if (!Array.isArray(values) || !values.length) {
        errors.push(`${model}: missing embedding.values`);
        continue;
      }

      if (values.length !== STYLE_KNOWLEDGE_EMBEDDING_DIMENSIONS) {
        errors.push(`${model}: returned ${values.length} dimensions, expected ${STYLE_KNOWLEDGE_EMBEDDING_DIMENSIONS}`);
        continue;
      }

      workingEmbeddingModel = model;
      return values;
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Gemini embedding error:", error);
    }
  }

  console.error("All Gemini embedding models failed:", errors.join(" | "));
  if (!workingEmbeddingModel) embeddingUnavailable = true;
  return null;
}

function requestedLimit(request: Request) {
  const value = Number(new URL(request.url).searchParams.get("limit") || MAX_ITEMS_PER_RUN);
  if (!Number.isFinite(value) || value < 1) return MAX_ITEMS_PER_RUN;
  return Math.min(Math.floor(value), MAX_ITEMS_PER_RUN);
}

function requestedPremiumCategory(request: Request) {
  const value = new URL(request.url).searchParams.get("category");
  if (!value) return undefined;
  return Object.prototype.hasOwnProperty.call(premiumQueryGroups, value) ? (value as PremiumCategory) : undefined;
}

async function collectKnowledge(fetchFullText = true, limit = MAX_ITEMS_PER_RUN, categoryTag?: PremiumCategory) {
  const articles = uniqueByUrlAndTitle(await scrapeArticles(fetchFullText, limit, categoryTag));
  if (articles.length >= limit) return articles.slice(0, limit);
  if (categoryTag) return articles;

  const [redditDirect, redditFallback] = await Promise.all([scrapeReddit(), scrapeRedditViaSerper()]);
  return uniqueByUrlAndTitle([...articles, ...redditDirect, ...redditFallback]).slice(0, limit);
}

function isMissingCategoryTagsColumn(error: { message?: string; code?: string }) {
  return error.code === "PGRST204" || /category_tags/i.test(error.message || "");
}

async function insertKnowledgeItem(supabase: ReturnType<typeof getSupabaseClient>, item: KnowledgeItem, embedding: number[] | null) {
  if (!supabase) return { error: { message: "Supabase is not configured" } };

  const payload = {
    ...item,
    category_tags: item.category_tags ?? [],
    embedding,
  };

  const result = await supabase.from("style_knowledge").insert(payload);
  if (!result.error || !isMissingCategoryTagsColumn(result.error)) return result;

  const { category_tags: _categoryTags, ...withoutCategoryTags } = payload;
  return supabase.from("style_knowledge").insert(withoutCategoryTags);
}

async function runScraper(fetchFullText = true, limit = MAX_ITEMS_PER_RUN, categoryTag?: PremiumCategory) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured", collected: 0, stored: 0 };
  }

  const { error: tableError } = await supabase.from("style_knowledge").select("id").limit(1);
  if (tableError) {
    console.error("style_knowledge table check failed:", tableError.message);
    return {
      ok: false,
      error: "style_knowledge table is missing. Apply database/011_style_knowledge.sql in Supabase SQL Editor, then rerun this route.",
      collected: 0,
      stored: 0,
    };
  }

  const collected = await collectKnowledge(fetchFullText, limit, categoryTag);
  let stored = 0;
  let embedded = 0;
  let skipped = 0;

  for (let index = 0; index < collected.length; index += 10) {
    const batch = collected.slice(index, index + 10);
    let batchStored = 0;
    let batchEmbedded = 0;

    for (const item of batch) {
      const { data: existingByUrl, error: existingUrlError } = await supabase
        .from("style_knowledge")
        .select("id")
        .eq("source_url", item.source_url)
        .maybeSingle();

      const { data: existingByTitle, error: existingTitleError } = existingByUrl
        ? { data: null, error: null }
        : await supabase.from("style_knowledge").select("id").eq("title", item.title).maybeSingle();

      if (existingUrlError || existingTitleError) {
        console.error("style_knowledge duplicate check error:", existingUrlError?.message || existingTitleError?.message);
      }

      if (existingByUrl || existingByTitle) {
        skipped += 1;
        continue;
      }

    const embedding = await embedContent(`${item.title}\n\n${item.content}`);
      if (embedding?.length) {
        embedded += 1;
        batchEmbedded += 1;
      }

      const { error } = await insertKnowledgeItem(supabase, item, embedding);

      if (error) {
        console.error("style_knowledge insert error:", error.message);
        continue;
      }

      stored += 1;
      batchStored += 1;
    }

    console.log(`Batch ${Math.floor(index / 10) + 1} complete: ${batchStored} items stored, ${batchEmbedded} embeddings generated`);
    if (index + 10 < collected.length) await delay(BATCH_DELAY_MS);
  }

  const { count } = await supabase.from("style_knowledge").select("id", { count: "exact", head: true });

  console.log(`Style knowledge scrape collected ${collected.length} articles/posts and stored ${stored}. Embedded ${embedded}. Skipped ${skipped}. Total rows ${count ?? "unknown"}.`);
  return { ok: true, collected: collected.length, stored, embedded, skipped, total: count ?? null };
}

export async function GET(request: Request) {
  if (process.env.STYLE_SCRAPER_ENABLED !== "true") return scraperDisabledResponse();
  if (!isAuthorizedScraperRequest(request)) return unauthorizedResponse();

  const url = new URL(request.url);
  const result = await runScraper(url.searchParams.get("full") !== "0", requestedLimit(request), requestedPremiumCategory(request));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  if (process.env.STYLE_SCRAPER_ENABLED !== "true") return scraperDisabledResponse();
  if (!isAuthorizedScraperRequest(request)) return unauthorizedResponse();

  const url = new URL(request.url);
  const result = await runScraper(url.searchParams.get("full") !== "0", requestedLimit(request), requestedPremiumCategory(request));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
