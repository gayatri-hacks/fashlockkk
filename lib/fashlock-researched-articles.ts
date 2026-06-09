import { seedArticles } from "@/lib/discover-seeds";
import { getSupabaseClient } from "@/lib/supabase";
import type { EditorialArticle } from "@/lib/discover-editorial";
import { unstable_cache } from "next/cache";

export type ResearchSource = {
  title: string;
  url: string;
  source: string;
  summary: string;
};

export type ResearchedArticle = EditorialArticle & {
  research_sources?: ResearchSource[];
  research_generated_at?: string | null;
  research_model?: string | null;
};

const GEMINI_MODEL = "gemini-2.5-flash";

function hasResearchedBody(article: Partial<ResearchedArticle> | null | undefined) {
  const sourceTitles = article?.research_sources?.map((source) => source.title.toLowerCase()).join(" ") ?? "";
  const body = article?.full_content?.toLowerCase() ?? "";
  const hasBadResearchMatch = sourceTitles.includes("age of adaline") || body.includes("adaline");

  return Boolean(
    article?.full_content &&
      article.full_content.length > 1800 &&
      article.research_generated_at &&
      !hasBadResearchMatch,
  );
}

function cleanJson(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeArticle(row: Partial<ResearchedArticle>, fallback: EditorialArticle): ResearchedArticle {
  return {
    ...fallback,
    ...row,
    tags: (row.tags as string[] | undefined) ?? fallback.tags,
    archetypes: (row.archetypes as EditorialArticle["archetypes"] | undefined) ?? fallback.archetypes,
    cover_image_url: row.cover_image_url ?? fallback.cover_image_url,
    research_sources: (row.research_sources as ResearchSource[] | undefined) ?? [],
  };
}

async function fetchWikipediaSource(query: string): Promise<ResearchSource | null> {
  try {
    const searchParams = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      format: "json",
      origin: "*",
      srlimit: "1",
    });
    const searchResponse = await fetch(`https://en.wikipedia.org/w/api.php?${searchParams.toString()}`, {
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!searchResponse.ok) return null;
    const searchData = (await searchResponse.json()) as {
      query?: { search?: Array<{ title?: string; snippet?: string }> };
    };
    const title = searchData.query?.search?.[0]?.title;
    if (!title) return null;

    const summaryResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { next: { revalidate: 60 * 60 * 24 } },
    );
    if (!summaryResponse.ok) return null;
    const summary = (await summaryResponse.json()) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (!summary.extract) return null;

    return {
      title: summary.title ?? title,
      url: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      source: "Wikipedia",
      summary: summary.extract,
    };
  } catch {
    return null;
  }
}

function isSpecificEra(era: string) {
  return /\d|y2k|runway|1970s|1980s|1990s|2000s|2010s|2020s/i.test(era);
}

function isRelevantSource(article: EditorialArticle, source: ResearchSource) {
  const sourceText = `${source.title} ${source.summary}`.toLowerCase();
  const requiredTerms = [
    article.title,
    article.category,
    article.region,
    article.culture_reference,
    ...article.tags,
  ]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3 && !["fashion", "style", "modern", "global", "culture"].includes(term));

  return requiredTerms.some((term) => sourceText.includes(term));
}

async function fetchNewsDataSources(article: EditorialArticle): Promise<ResearchSource[]> {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return [];

  try {
    const params = new URLSearchParams({
      apikey: key,
      q: `${article.title} fashion OR style`,
      language: "en",
    });
    const response = await fetch(`https://newsdata.io/api/1/news?${params.toString()}`, {
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      results?: Array<{
        title?: string;
        link?: string;
        source_id?: string;
        source_name?: string;
        description?: string | null;
      }>;
    };

    return (data.results ?? [])
      .filter((item) => item.title && item.link && item.description)
      .slice(0, 4)
      .map((item) => ({
        title: item.title!,
        url: item.link!,
        source: item.source_name ?? item.source_id ?? "NewsData",
        summary: item.description!,
      }));
  } catch {
    return [];
  }
}

async function gatherResearchSources(article: EditorialArticle): Promise<ResearchSource[]> {
  const wikiQueries = [
    article.culture_reference,
    article.tags.slice(0, 2).join(" fashion "),
    isSpecificEra(article.era) ? `${article.era} fashion ${article.tags[0] ?? ""}` : article.title,
  ].filter(Boolean);

  const [newsSources, ...wikiResults] = await Promise.all([
    fetchNewsDataSources(article),
    ...wikiQueries.map((query) => fetchWikipediaSource(query)),
  ]);

  const seen = new Set<string>();
  return [...newsSources, ...wikiResults.filter(Boolean)]
    .filter((source): source is ResearchSource => Boolean(source?.url && source.summary))
    .filter((source) => isRelevantSource(article, source))
    .filter((source) => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .slice(0, 7);
}

async function callGeminiForArticle(article: EditorialArticle, sources: ResearchSource[]) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const sourceNotes = sources.length
    ? sources
        .map(
          (source, index) =>
            `${index + 1}. ${source.title} (${source.source})\nURL: ${source.url}\nNotes: ${source.summary}`,
        )
        .join("\n\n")
    : "No live source snippets were available. Use broad fashion history and cultural knowledge, but do not invent precise claims, dates, or source names.";

  const prompt = `You are the founding editor of FASHLOCK, a premium fashion culture product.

Write an ORIGINAL magazine article. Do not copy source wording. Use the source notes as research context only.

Article brief:
Title: ${article.title}
Subtitle: ${article.subtitle}
Category: ${article.category}
Region: ${article.region}
Era: ${article.era}
Mood: ${article.mood}
Archetypes: ${article.archetypes.join(", ")}
Culture reference: ${article.culture_reference}
Visual prompt: ${article.visual_prompt}

Research notes:
${sourceNotes}

Return only JSON with this exact shape:
{
  "content_excerpt": "Why it matters: one strong sentence.",
  "full_content": "5 to 7 polished paragraphs separated by two newline characters. 750-950 words. Cinematic, specific, useful, and grounded. Explain history, cultural meaning, why it matters now, and how a reader can translate the idea into their style without sounding like a shopping app. Do not mention fictional films, fictional characters, or unrelated pop-culture examples unless they are explicitly present in the article brief."
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.72,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      return null;
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(cleanJson(text)) as {
      content_excerpt?: string;
      full_content?: string;
    };
    if (!parsed.full_content || parsed.full_content.length < 900) return null;
    return {
      content_excerpt: parsed.content_excerpt,
      full_content: parsed.full_content,
    } as { content_excerpt?: string; full_content: string };
  } catch {
    return null;
  }
}

async function loadRemoteArticle(slug: string, fallback: EditorialArticle) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("editorial_articles")
      .select("id, title, subtitle, slug, cover_image_url, category, tags, archetypes, reading_time, author, published_date, mood, era, region, culture_reference, visual_prompt, content_excerpt, content, full_content, source_type, image_strategy, is_featured, research_sources, research_generated_at, research_model")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return normalizeArticle(data as Partial<ResearchedArticle>, fallback);
  } catch {
    return null;
  }
}

async function saveResearchedArticle(article: ResearchedArticle) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const payload = {
    id: article.id,
    title: article.title,
    subtitle: article.subtitle,
    slug: article.slug,
    cover_image_url: article.cover_image_url,
    category: article.category,
    tags: article.tags,
    archetypes: article.archetypes,
    reading_time: article.reading_time,
    author: article.author,
    published_date: article.published_date,
    mood: article.mood,
    era: article.era,
    region: article.region,
    culture_reference: article.culture_reference,
    visual_prompt: article.visual_prompt,
    content_excerpt: article.content_excerpt,
    content: article.content_excerpt,
    full_content: article.full_content,
    source_type: "original",
    image_strategy: article.image_strategy,
    is_featured: article.is_featured,
    research_sources: article.research_sources ?? [],
    research_generated_at: article.research_generated_at,
    research_model: article.research_model,
  };

  try {
    await supabase.from("editorial_articles").upsert(payload, { onConflict: "slug" });
  } catch {
    const { research_sources, research_generated_at, research_model, ...withoutResearchColumns } = payload;
    void research_sources;
    void research_generated_at;
    void research_model;
    try {
      await supabase.from("editorial_articles").upsert(withoutResearchColumns, { onConflict: "slug" });
    } catch {
      // Rendering still works even if remote caching is unavailable.
    }
  }
}

async function loadOrGenerateFashlockArticleUncached(slug: string): Promise<ResearchedArticle | null> {
  const seed = seedArticles.find((article) => article.slug === slug);
  if (!seed) return null;

  const remote = await loadRemoteArticle(slug, seed);
  if (hasResearchedBody(remote)) return remote;

  const base = remote ?? seed;
  const sources = await gatherResearchSources(base);
  const generated = await callGeminiForArticle(base, sources);

  if (!generated) {
    return normalizeArticle(base, seed);
  }

  const researchedArticle: ResearchedArticle = {
    ...base,
    content_excerpt: generated.content_excerpt ?? base.content_excerpt,
    content: generated.content_excerpt ?? base.content_excerpt,
    full_content: generated.full_content,
    research_sources: sources,
    research_generated_at: new Date().toISOString(),
    research_model: GEMINI_MODEL,
  };

  await saveResearchedArticle(researchedArticle);
  return researchedArticle;
}

export const loadOrGenerateFashlockArticle = unstable_cache(loadOrGenerateFashlockArticleUncached, ["fashlock-researched-article-v2"], {
  revalidate: 60 * 60,
  tags: ["editorial"],
});
