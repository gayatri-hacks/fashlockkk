import { NextResponse } from "next/server";

type SearchResult = {
  title?: string;
  link?: string;
  displayLink?: string;
  snippet?: string;
};

type ArticleEngineResponse = {
  text: string;
  sources: string[];
  sourceUrls: string[];
  imageUrl: string | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripHtml(html: string) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isUsefulResearchUrl(url: string) {
  const domain = domainFromUrl(url);
  return ![
    "facebook.com",
    "instagram.com",
    "pinterest.com",
    "reddit.com",
    "x.com",
    "twitter.com",
    "youtube.com",
    "tiktok.com",
    "yahoo.com",
  ].some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

function sentenceList(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 80 && sentence.length < 360);
}

function fallbackArticleFromResearch(topic: string, results: SearchResult[], contentPieces: string[]) {
  const researchSentences = contentPieces.flatMap(sentenceList);
  const snippetFacts = results
    .map((result) => [result.title, result.snippet].filter(Boolean).join(". ").trim())
    .filter((fact) => fact.length > 40);
  const snippetSentences = snippetFacts.flatMap(sentenceList);
  const sentences = [...researchSentences, ...snippetSentences].slice(0, 18);

  if (sentences.length < 4) {
    const sourceContext = snippetFacts.slice(0, 5).join(" ");
    return `Fashion rarely announces its importance all at once; it gathers meaning through timing, repetition, and the people who decide to wear it. ${topic} matters because it sits at that exact point where clothing stops being only decorative and starts becoming a public language.\n\nThe research trail around this subject points to a wider fashion conversation: ${sourceContext || "design history, cultural memory, runway references, and everyday styling habits all shape the way this topic is understood."} Read together, those signals show how style moves from a specific designer, garment, silhouette, or cultural moment into the collective imagination. It is not simply about what appeared first; it is about why the image stayed.\n\nFashion history is useful because it gives shape to instinct. A person might be drawn to a sari, a tuxedo, a black dress, a soft trouser, a ribbon, a heel, or a severe coat before they can explain why. Research gives those instincts context: who wore it, which era gave it force, what social rule it challenged, and why the same visual code keeps returning when the culture needs it again.\n\nThat is why this topic belongs inside Fashlock rather than as a passing news link. The question is not only what happened in fashion, but what the reference does to the person wearing it now. Does it make the body feel sharper, softer, freer, more guarded, more romantic, more precise? The best fashion writing gives the reader language for sensations they already had.\n\nFor you, the point is not to copy the reference exactly. It is to understand what the reference is doing, then translate that feeling into proportion, texture, color, and attitude. That is how a fashion fact becomes personal style.`;
  }

  const paragraphs = [
    `Fashion rarely begins as a trend; it begins as a charged image, a detail that keeps returning until it starts to feel inevitable. ${sentences[0]}`,
    sentences.slice(1, 5).join(" "),
    sentences.slice(5, 9).join(" "),
    sentences.slice(9, 13).join(" "),
    `${sentences.slice(13, 17).join(" ")} For the reader, the point is not to copy the reference exactly. It is to understand what the reference is doing, then translate that feeling into proportion, texture, color, and attitude.`,
  ].filter((paragraph) => paragraph.trim().length > 0);

  return paragraphs.join("\n\n");
}

async function searchWeb(topic: string) {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("Missing SERPER_API_KEY in .env.local");
  }

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: `${topic} fashion Vogue Elle`,
      num: 5,
    }),
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) {
    throw new Error("Serper search failed");
  }

  const data = (await response.json()) as { organic?: SearchResult[] };
  return (data.organic ?? [])
    .filter((result) => result.link)
    .filter((result) => isUsefulResearchUrl(result.link!))
    .slice(0, 4);
}

async function fetchPageText(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return "";

    const directText = stripHtml(await response.text());
    if (directText.length > 500) return directText;
  } catch {
    // Try the CORS reader below.
  }

  try {
    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) return "";
    const data = (await response.json()) as { contents?: string };
    return data.contents ? stripHtml(data.contents) : "";
  } catch {
    return "";
  }
}

async function fetchHeroImage(topic: string) {
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!pexelsKey) return null;

  try {
    const params = new URLSearchParams({
      query: `${topic} fashion editorial`,
      per_page: "1",
      orientation: "landscape",
    });
    const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: pexelsKey },
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      photos?: Array<{ src?: { landscape?: string; large2x?: string; large?: string; medium?: string } }>;
    };
    return data.photos?.[0]?.src?.medium ?? data.photos?.[0]?.src?.landscape ?? data.photos?.[0]?.src?.large ?? null;
  } catch {
    return null;
  }
}

async function writeArticle(topic: string, combinedResearch: string) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.local");
  }

  const prompt = `You are the lead editorial writer for Fashlock, a premium French fashion platform with the voice of Vogue — elevated, warm, intelligent, never generic.

Write a complete, rich editorial article about: "${topic}"

Use the research below as your source material. Extract real facts, names, dates, and context from it.

STRUCTURE:
- One unforgettable opening line that pulls the reader in
- 4 full paragraphs of real substance — history, cultural context, why it matters, how it feels
- One closing paragraph that brings it back to the reader personally
- Total length: 550-650 words

RULES:
- Use real facts and details from the research, not vague generalities
- Rewrite everything completely in your own voice — do not copy sentences
- Write like a human fashion editor, not an AI
- No bullet points, no headers, no markdown — pure flowing prose only
- Every paragraph should make the reader want to read the next one

RESEARCH:
${combinedResearch}

Return only the article body text. Nothing else.`;

  const models = ["gemini-2.5-flash"];

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.75,
          },
        }),
        next: { revalidate: 60 * 60 },
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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      return text;
    }
  }

  throw new Error("Gemini article generation failed");
}

export async function GET(request: Request) {
  const topic = new URL(request.url).searchParams.get("topic")?.trim();

  if (!topic) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }

  try {
    const [results, imageUrl] = await Promise.all([searchWeb(topic), fetchHeroImage(topic)]);
    const urls = results.map((result) => result.link!).filter(Boolean);
    const uniqueSources = new Map<string, string>();
    for (const result of results) {
      const url = result.link!;
      const domain = result.displayLink ?? domainFromUrl(url);
      if (!uniqueSources.has(domain)) {
        uniqueSources.set(domain, url);
      }
    }
    const sources = Array.from(uniqueSources.keys());
    const sourceUrls = Array.from(uniqueSources.values());
    const contentPieces = await Promise.all(urls.map(fetchPageText));

    const combinedResearch = contentPieces
      .filter((content) => content.length > 100)
      .join("\n\n---\n\n")
      .slice(0, 8000);

    const researchFallback = results
      .map((result) => [result.title, result.displayLink, result.snippet].filter(Boolean).join(" — "))
      .join("\n\n---\n\n");

    let articleText = "";
    try {
      articleText = await writeArticle(topic, combinedResearch || researchFallback);
    } catch {
      articleText = fallbackArticleFromResearch(topic, results, contentPieces);
    }

    const body: ArticleEngineResponse = {
      text: articleText,
      sources,
      sourceUrls,
      imageUrl,
    };

    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Article generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
