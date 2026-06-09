import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FETCH_TIMEOUT_MS = 7000;
const ARTICLE_TIMEOUT_MS = 4500;
const MAX_ITEMS_PER_RUN = 650;
const ARTICLE_RESULTS_PER_QUERY = 8;
const QUERY_BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;

function scraperDisabledResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Style knowledge scraper is disabled. Set STYLE_SCRAPER_ENABLED=true to run it intentionally.",
    },
    { status: 403 },
  );
}

type KnowledgeItem = {
  source: string;
  source_url: string;
  title: string;
  content: string;
  category: "body_type" | "colour" | "occasion" | "capsule" | "mens" | "womens" | "general";
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

const articleQueries: Array<{ query: string; results?: number }> = [
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

const redditFallbackQueries = [
  { query: "site:reddit.com/r/femalefashionadvice style guide", results: 20, gender: "female" as const },
  { query: "site:reddit.com/r/malefashionadvice style guide", results: 20, gender: "male" as const },
  { query: "site:reddit.com/r/IndianFashionAddicts outfit advice", results: 10, gender: "both" as const },
];

const embeddingModels = [
  "models/text-embedding-004",
  "models/embedding-001",
  "models/gemini-embedding-exp-03-07",
];

let workingEmbeddingModel: string | null = null;
let embeddingUnavailable = false;

function detectCategory(title: string): KnowledgeItem["category"] {
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

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "article";
  }
}

function uniqueByUrl(items: KnowledgeItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.source_url || seen.has(item.source_url)) return false;
    seen.add(item.source_url);
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
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetchWithTimeout(proxyUrl, { headers: { "User-Agent": "FashlockStyleKnowledge/1.0" } }, ARTICLE_TIMEOUT_MS);
    if (!response.ok) return "";
    const html = await response.text();
    return normalizeText(html).slice(0, 18000);
  } catch (error) {
    console.error("Article fetch error:", error);
    return "";
  }
}

async function scrapeArticleQuery(queryConfig: { query: string; results?: number }, fetchFullText = true) {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    console.error("SERPER_API_KEY missing; skipping article scrape");
    return [];
  }

  const { query, results: resultLimit = ARTICLE_RESULTS_PER_QUERY } = queryConfig;

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
        if (!content) return null;
        const title = result.title || query;

        return {
          source: domainFromUrl(url),
          source_url: url,
          title,
          content,
          category: detectCategory(`${query} ${title}`),
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

async function scrapeArticles(fetchFullText = true) {
  const items: KnowledgeItem[] = [];
  const batches = Math.ceil(articleQueries.length / QUERY_BATCH_SIZE);

  for (let index = 0; index < articleQueries.length; index += QUERY_BATCH_SIZE) {
    const batchNumber = Math.floor(index / QUERY_BATCH_SIZE) + 1;
    const batchQueries = articleQueries.slice(index, index + QUERY_BATCH_SIZE);
    const batchResults = await Promise.all(batchQueries.map((queryConfig) => scrapeArticleQuery(queryConfig, fetchFullText)));
    const batchItems = batchResults.flat();
    items.push(...batchItems);
    console.log(`Search batch ${batchNumber}/${batches} collected ${batchItems.length} candidate items.`);
    if (index + QUERY_BATCH_SIZE < articleQueries.length) await delay(BATCH_DELAY_MS);
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
      const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          content: {
            parts: [{ text: contentText }],
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        errors.push(`${model}: ${response.status} ${err}`);
        console.error("Gemini error:", response.status, err);
        continue;
      }

      const data = await response.json();
      const values = data.embedding?.values;
      if (!Array.isArray(values) || !values.length) {
        errors.push(`${model}: missing embedding.values`);
        continue;
      }

      if (values.length !== 768) {
        errors.push(`${model}: returned ${values.length} dimensions, expected 768`);
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

async function collectKnowledge(fetchFullText = true) {
  const [redditDirect, redditFallback, articles] = await Promise.all([scrapeReddit(), scrapeRedditViaSerper(), scrapeArticles(fetchFullText)]);
  return uniqueByUrl([...redditDirect, ...redditFallback, ...articles]).slice(0, MAX_ITEMS_PER_RUN);
}

async function runScraper(fetchFullText = true) {
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

  const collected = await collectKnowledge(fetchFullText);
  let stored = 0;
  let embedded = 0;
  let skipped = 0;

  for (let index = 0; index < collected.length; index += 10) {
    const batch = collected.slice(index, index + 10);
    let batchStored = 0;
    let batchEmbedded = 0;

    for (const item of batch) {
      const { data: existing, error: existingError } = await supabase
        .from("style_knowledge")
        .select("id")
        .eq("source_url", item.source_url)
        .maybeSingle();

      if (existingError) {
        console.error("style_knowledge duplicate check error:", existingError.message);
      }

      if (existing) {
        skipped += 1;
        continue;
      }

    const embedding = await embedContent(`${item.title}\n\n${item.content}`);
      if (embedding?.length) {
        embedded += 1;
        batchEmbedded += 1;
      }

      const { error } = await supabase.from("style_knowledge").insert(
      {
        ...item,
        embedding,
      },
    );

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

  const { count } = await supabase.from("style_knowledge").select("*", { count: "exact", head: true });

  console.log(`Style knowledge scrape collected ${collected.length} articles/posts and stored ${stored}. Embedded ${embedded}. Skipped ${skipped}. Total rows ${count ?? "unknown"}.`);
  return { ok: true, collected: collected.length, stored, embedded, skipped, total: count ?? null };
}

export async function GET(request: Request) {
  if (process.env.STYLE_SCRAPER_ENABLED !== "true") return scraperDisabledResponse();

  const url = new URL(request.url);
  const result = await runScraper(url.searchParams.get("full") !== "0");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  if (process.env.STYLE_SCRAPER_ENABLED !== "true") return scraperDisabledResponse();

  const url = new URL(request.url);
  const result = await runScraper(url.searchParams.get("full") !== "0");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
