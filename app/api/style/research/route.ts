import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

const GEMINI_MODEL = "gemini-2.5-flash";
const CACHE_DAYS = 7;
const FALLBACK_CACHE_HOURS = 1;
const MAX_SERPER_CALLS = 2;
const MAX_SERPER_RESULTS = 12;

type Gender = "female" | "male";

type SearchSignal = {
  title: string;
  url: string;
  source: string;
  snippet: string;
};

type ResearchVariation = {
  title: string;
  formula: string;
  pieces: string[];
  stylingNote: string;
  whyItWorks: string;
  occasion: string;
  aesthetic: string;
  shopTerms: string[];
  sourceSignals: SearchSignal[];
};

type ResearchResult = {
  query: string;
  title: string;
  summary: string;
  variations: ResearchVariation[];
  researchQuality?: "gemini_clustered" | "snippet_fallback" | "empty";
  serperResultCount?: number;
  geminiStatus?: string;
};

type SerperResult = {
  title?: string;
  link?: string;
  displayLink?: string;
  source?: string;
  snippet?: string;
};

function normalizeQuery(query: string) {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function emptyResult(query: string, reason = "Not enough current styling signals were found. Try a more specific fashion item or trend.") {
  return {
    query,
    title: titleCase(query),
    summary: reason,
    variations: [],
    researchQuality: "empty" as const,
    serperResultCount: 0,
  };
}

function cleanJson(text: string) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function sanitizeSignal(value: unknown, fallbackSignals: SearchSignal[]): SearchSignal[] {
  const signals = Array.isArray(value) ? value : [];
  const sanitized = signals
    .map((signal) => signal as Partial<SearchSignal>)
    .filter((signal) => signal.title || signal.url || signal.snippet)
    .map((signal) => ({
      title: String(signal.title || "").slice(0, 140),
      url: String(signal.url || "").slice(0, 500),
      source: String(signal.source || "").slice(0, 80),
      snippet: String(signal.snippet || "").slice(0, 260),
    }))
    .filter((signal) => signal.title || signal.url || signal.snippet)
    .slice(0, 3);

  return sanitized.length ? sanitized : fallbackSignals.slice(0, 3);
}

function sanitizeResearch(value: unknown, query: string, sourceSignals: SearchSignal[]): ResearchResult {
  const parsed = (value || {}) as Partial<ResearchResult>;
  const variations = Array.isArray(parsed.variations) ? parsed.variations : [];

  return {
    query,
    title: String(parsed.title || titleCase(query)).slice(0, 100),
    summary: String(parsed.summary || `Current styling signals for ${query}.`).slice(0, 500),
    variations: variations
      .map((variation) => variation as Partial<ResearchVariation>)
      .filter((variation) => variation.title && variation.formula)
      .map((variation) => ({
        title: String(variation.title || "").slice(0, 90),
        formula: String(variation.formula || "").slice(0, 220),
        pieces: Array.isArray(variation.pieces) ? variation.pieces.map(String).filter(Boolean).slice(0, 6) : [],
        stylingNote: String(variation.stylingNote || "").slice(0, 240),
        whyItWorks: String(variation.whyItWorks || "").slice(0, 260),
        occasion: String(variation.occasion || "Everyday").slice(0, 60),
        aesthetic: String(variation.aesthetic || "Current").slice(0, 80),
        shopTerms: Array.isArray(variation.shopTerms) ? variation.shopTerms.map(String).filter(Boolean).slice(0, 4) : [],
        sourceSignals: sanitizeSignal(variation.sourceSignals, sourceSignals),
      }))
      .slice(0, 8),
  };
}

async function readCachedResult(cacheKey: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("style_research_cache")
    .select("original_query,title,summary,variations,serper_result_count,model")
    .eq("normalized_query", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("Style research cache read failed:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    query: data.original_query,
    title: data.title,
    summary: data.summary,
    variations: Array.isArray(data.variations) ? data.variations : [],
    researchQuality: data.model === "snippet_fallback" ? "snippet_fallback" : "gemini_clustered",
    serperResultCount: data.serper_result_count,
    geminiStatus: data.model === "snippet_fallback" ? "fallback_cached" : "ok_cached",
  } as ResearchResult;
}

async function writeCachedResult(
  cacheKey: string,
  query: string,
  gender: Gender | null,
  result: ResearchResult,
  sourceSignals: SearchSignal[],
  serperResultCount: number,
  options: { ttlMs?: number; model?: string } = {},
) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const ttlMs = options.ttlMs ?? CACHE_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const { error } = await supabase.from("style_research_cache").upsert(
    {
      normalized_query: cacheKey,
      original_query: query,
      gender,
      title: result.title,
      summary: result.summary,
      variations: result.variations,
      source_signals: sourceSignals,
      serper_result_count: serperResultCount,
      model: options.model || GEMINI_MODEL,
      generated_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: "normalized_query" },
  );

  if (error) {
    console.error("Style research cache write failed:", error.message);
  }
}

async function searchSerper(query: string, gender: Gender | null): Promise<SearchSignal[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const audience = gender === "male" ? "men" : gender === "female" ? "women" : "";
  const queries = [
    `${query} ${audience} outfit street style 2026 how to style`,
    `${query} fashion week street style vogue elle who what wear outfit`,
  ].slice(0, MAX_SERPER_CALLS);
  const results: SearchSignal[] = [];
  const seen = new Set<string>();

  for (const searchQuery of queries) {
    try {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: searchQuery, num: 8 }),
      });

      if (!response.ok) {
        console.error("Style research Serper failed:", response.status, await response.text());
        continue;
      }

      const data = (await response.json()) as { organic?: SerperResult[] };
      for (const item of data.organic || []) {
        const url = item.link || "";
        if (!url || seen.has(url)) continue;
        seen.add(url);
        results.push({
          title: String(item.title || "Untitled source").slice(0, 140),
          url,
          source: String(item.source || item.displayLink || "").slice(0, 80),
          snippet: String(item.snippet || "").slice(0, 300),
        });
        if (results.length >= MAX_SERPER_RESULTS) return results;
      }
    } catch (error) {
      console.error("Style research Serper error:", error instanceof Error ? error.message : error);
    }
  }

  return results.slice(0, MAX_SERPER_RESULTS);
}

async function clusterWithGemini(query: string, gender: Gender | null, sourceSignals: SearchSignal[]) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !sourceSignals.length) return { result: null, status: !key ? "missing_key" : "no_sources" };

  const evidence = sourceSignals
    .map((signal, index) => `${index + 1}. ${signal.title} (${signal.source || signal.url})\nURL: ${signal.url}\nSnippet: ${signal.snippet}`)
    .join("\n\n");

  const prompt = `Based only on these search snippets, identify recurring outfit formulas.

Fashion query: ${query}
Audience: ${gender || "any"}

Search snippets:
${evidence}

Return JSON only. No markdown. No invented claims. If the snippets do not support a variation, do not include it.
Return 5-8 variations.
Each sourceSignals item must come from the provided snippets.

Output shape:
{
  "query": "${query}",
  "title": "editorial title for this researched style idea",
  "summary": "2 sentence summary of how this is being styled right now based only on snippets",
  "variations": [
    {
      "title": "short variation title",
      "formula": "one-line outfit formula",
      "pieces": ["piece 1", "piece 2", "piece 3"],
      "stylingNote": "specific styling note",
      "whyItWorks": "why this formula works",
      "occasion": "occasion",
      "aesthetic": "aesthetic",
      "shopTerms": ["specific shopping query"],
      "sourceSignals": [
        { "title": "source title", "url": "source url", "source": "domain/source", "snippet": "supporting snippet" }
      ]
    }
  ]
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2100,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Style research Gemini failed:", response.status, errorText);
      return { result: null, status: String(response.status) };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) return { result: null, status: "empty_response" };
    return { result: sanitizeResearch(JSON.parse(cleanJson(text)), query, sourceSignals), status: "ok" };
  } catch (error) {
    console.error("Style research Gemini error:", error instanceof Error ? error.message : error);
    return { result: null, status: "parse_or_network_error" };
  }
}

function fallbackFormulaSeeds(query: string) {
  const item = query.trim();
  return [
    {
      title: `Fitted Tank + ${titleCase(item)}`,
      formula: `fitted tank + ${item}`,
      pieces: ["fitted tank", item, "minimal sandals", "small shoulder bag"],
      occasion: "Day",
      aesthetic: "clean summer",
    },
    {
      title: `Oversized Shirt + ${titleCase(item)}`,
      formula: `oversized shirt + ${item}`,
      pieces: ["oversized shirt", item, "flat sandals or loafers", "sleek tote"],
      occasion: "Weekend",
      aesthetic: "relaxed editorial",
    },
    {
      title: `Blazer + ${titleCase(item)}`,
      formula: `structured blazer + ${item}`,
      pieces: ["structured blazer", "simple top", item, "pointed flats or slingbacks"],
      occasion: "Work",
      aesthetic: "soft tailoring",
    },
    {
      title: `Cropped Cardigan + ${titleCase(item)}`,
      formula: `cropped cardigan + ${item}`,
      pieces: ["cropped cardigan", item, "ballet flats", "delicate jewellery"],
      occasion: "Casual",
      aesthetic: "feminine minimal",
    },
    {
      title: `Minimal Top + Statement ${titleCase(item)}`,
      formula: `minimal top + statement ${item}`,
      pieces: ["minimal top", item, "clean shoe", "quiet accessories"],
      occasion: "Evening",
      aesthetic: "statement skirt",
    },
  ];
}

function buildSnippetFallback(query: string, sourceSignals: SearchSignal[], geminiStatus: string): ResearchResult {
  const availableSignals = sourceSignals.slice(0, 12);
  const snippets = availableSignals.map((signal) => `${signal.title} ${signal.snippet}`.toLowerCase()).join(" ");
  const seeds = fallbackFormulaSeeds(query);
  const filteredSeeds = seeds.filter((seed) => {
    const searchable = [seed.formula, ...seed.pieces, seed.aesthetic, seed.occasion].join(" ").toLowerCase();
    return seed === seeds[4] || searchable.split(/\s+/).some((word) => word.length > 4 && snippets.includes(word));
  });
  const selectedSeeds = (filteredSeeds.length >= 3 ? filteredSeeds : seeds).slice(0, 5);

  return {
    query,
    title: titleCase(query),
    summary: "Based on available search snippets; deeper clustering is temporarily unavailable.",
    researchQuality: "snippet_fallback",
    serperResultCount: sourceSignals.length,
    geminiStatus,
    variations: selectedSeeds.map((seed, index) => {
      const signals = availableSignals.slice(index, index + 3);
      return {
        title: seed.title,
        formula: seed.formula,
        pieces: seed.pieces,
        stylingNote: `Keep the ${query} as the directional piece and let the supporting layers stay clean.`,
        whyItWorks: "This is a conservative formula built from the available snippets: one clear statement item balanced by simpler proportions.",
        occasion: seed.occasion,
        aesthetic: seed.aesthetic,
        shopTerms: [
          `${query} ${seed.aesthetic}`,
          seed.pieces[0],
          seed.pieces[2],
          `${query} outfit`,
        ].filter(Boolean).slice(0, 4),
        sourceSignals: signals.length ? signals : availableSignals.slice(0, 3),
      };
    }),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const gender: Gender | null = body.gender === "female" || body.gender === "male" ? body.gender : null;

    if (query.length < 2 || query.length > 80) {
      return NextResponse.json({ error: "Query must be between 2 and 80 characters." }, { status: 400 });
    }

    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery || normalizedQuery.length < 2) {
      return NextResponse.json({ error: "Query must include a fashion item or trend." }, { status: 400 });
    }

    const cacheKey = `${gender || "any"}:${normalizedQuery}`;
    const cached = await readCachedResult(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const sourceSignals = await searchSerper(normalizedQuery, gender);
    console.log("Style research Serper result count:", sourceSignals.length);
    if (!sourceSignals.length) {
      return NextResponse.json({ ...emptyResult(query), cached: false });
    }

    const { result: generated, status: geminiStatus } = await clusterWithGemini(normalizedQuery, gender, sourceSignals);
    if (!generated || !generated.variations.length) {
      const fallback = buildSnippetFallback(query, sourceSignals, geminiStatus);
      await writeCachedResult(cacheKey, query, gender, fallback, sourceSignals, sourceSignals.length, {
        ttlMs: FALLBACK_CACHE_HOURS * 60 * 60 * 1000,
        model: "snippet_fallback",
      });
      return NextResponse.json({ ...fallback, cached: false });
    }

    const result = {
      ...generated,
      query,
      researchQuality: "gemini_clustered" as const,
      serperResultCount: sourceSignals.length,
      geminiStatus: "ok",
    };
    await writeCachedResult(cacheKey, query, gender, result, sourceSignals, sourceSignals.length);

    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    console.error("Style research route error:", error);
    return NextResponse.json({
      ...emptyResult("style research", "Style research is unavailable right now. Try again shortly."),
      cached: false,
    });
  }
}
