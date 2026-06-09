import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { FashlockDiscover, type FashlockArticle, type FashlockMoment } from "@/components/discover/fashlock-discover";
import { seedArticles } from "@/lib/discover-seeds";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-fashlock-display",
  weight: ["300"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-fashlock-body",
  weight: ["200", "300", "400", "500", "600", "700"],
});

export const dynamic = "force-dynamic";
const GEMINI_MODEL = "gemini-2.5-flash";

const historyMoments: Array<Omit<FashlockMoment, "imageUrl"> & { imageQuery: string; topic: string }> = [
  {
    year: "1920",
    fact: "Coco Chanel frees women from the corset",
    imageQuery: "1920s fashion editorial couture women",
    topic: "Coco Chanel frees women from the corset 1920 fashion history",
  },
  {
    year: "1947",
    fact: "Dior's New Look redefines the female silhouette",
    imageQuery: "dior new look runway fashion editorial",
    topic: "History of Dior New Look 1947 female silhouette fashion",
  },
  {
    year: "1966",
    fact: "YSL gives women the tuxedo suit",
    imageQuery: "women tuxedo suit fashion editorial",
    topic: "Yves Saint Laurent Le Smoking tuxedo suit women 1966 fashion history",
  },
  {
    year: "1975",
    fact: "Halston defines American minimalism",
    imageQuery: "1970s minimalist fashion editorial",
    topic: "Halston 1970s American minimalism fashion history",
  },
  {
    year: "1994",
    fact: "Kate Moss and the era of the waif",
    imageQuery: "90s fashion editorial minimalist runway",
    topic: "Kate Moss 1994 waif era 90s fashion history",
  },
  {
    year: "2001",
    fact: "Alexander McQueen turns fashion into theatre",
    imageQuery: "theatrical runway fashion editorial",
    topic: "Alexander McQueen fashion as theatre 2001 runway history",
  },
  {
    year: "2014",
    fact: "Normcore - fashion rejects itself",
    imageQuery: "normcore street style minimal fashion",
    topic: "Normcore 2014 fashion rejects itself trend history",
  },
  {
    year: "2020",
    fact: "Gender-fluid dressing goes mainstream",
    imageQuery: "gender fluid fashion editorial",
    topic: "Gender fluid dressing goes mainstream 2020 fashion history",
  },
];

async function fetchPexelsImage(query: string, page = 1) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  try {
    const params = new URLSearchParams({
      query,
      per_page: "1",
      page: String(page),
      orientation: "landscape",
    });
    const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: key },
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      photos?: Array<{ src?: { landscape?: string; large?: string; medium?: string; portrait?: string } }>;
    };
    return data.photos?.[0]?.src?.medium ?? data.photos?.[0]?.src?.landscape ?? data.photos?.[0]?.src?.large ?? null;
  } catch {
    return null;
  }
}

function isFashionArticle(article: {
  title?: string;
  description?: string | null;
  category?: string[] | string | null;
  keywords?: string[] | string | null;
}) {
  const haystack = [
    article.title,
    article.description,
    Array.isArray(article.category) ? article.category.join(" ") : article.category,
    Array.isArray(article.keywords) ? article.keywords.join(" ") : article.keywords,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const strongSignals = [
    "fashion",
    "style",
    "runway",
    "couture",
    "wardrobe",
    "dress",
    "designer",
    "sneaker",
    "streetwear",
    "luxury",
    "vogue",
    "versace",
    "dior",
    "chanel",
    "prada",
    "collection",
    "fashion week",
    "resort",
    "silhouette",
    "tailoring",
  ];
  const weakNoise = [
    "doughnut",
    "ebola",
    "supplies",
    "earnings call",
    "stock",
    "marketbeat",
    "drag race",
    "plane jane",
    "cast of",
    "tv show",
    "reality show",
    "project runway",
    "shops to close",
    "high street chain",
    "grand opening",
    "retail destination",
    "fashion destination",
    "coffee and fashion",
    "canceled",
    "inappropriate",
    "season 2",
    "tv series",
    "gala",
    "foundation",
    "inclusive communities",
    "lifespan services",
  ];

  return strongSignals.some((signal) => haystack.includes(signal)) &&
    !weakNoise.some((signal) => haystack.includes(signal));
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|and|of|to|in|for|with|from|by|on)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeArticles<T>(
  articles: T[],
  getTitle: (article: T) => string | undefined,
  getImage: (article: T) => string | null | undefined,
) {
  const seenTitles = new Set<string>();
  const seenImages = new Set<string>();

  return articles.filter((article) => {
    const title = normalizeTitle(getTitle(article) ?? "");
    const image = getImage(article)?.trim();

    if (!title || seenTitles.has(title)) return false;
    if (image && seenImages.has(image)) return false;

    seenTitles.add(title);
    if (image) seenImages.add(image);
    return true;
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "fashlock-story";
}

function articleBody(title: string, source: "FASHLOCK ORIGINAL" | "FASHION HISTORY" | "CURATED SIGNAL") {
  if (source === "FASHION HISTORY") {
    return `${title} is one of those fashion moments that keeps echoing because it changed more than clothes. It shifted posture, silhouette, and the way people understood what elegance could do.\n\nTo read it now is to see fashion as memory: a record of social freedom, restraint, fantasy, rebellion, and identity. The best historical style moments never stay in the archive. They return when the present needs their language again.\n\nFashlock reads this moment as a reminder that trends are rarely new. They are emotional codes resurfacing at the exact second culture is ready to wear them differently.`;
  }

  return `${title} is not just a trend note; it is a way of reading what fashion wants from the present. The silhouette, texture, and mood suggest a wardrobe moving toward feeling: clothes that do more than decorate, clothes that explain a person before they speak.\n\nWhat makes this story interesting is how wearable it feels. It does not ask for costume or perfection. It asks for one clear gesture: a proportion, a fabric, a color, a styling ritual that gives the whole look intent.\n\nFor Fashlock, the takeaway is simple. The strongest style ideas are the ones that can live both in an editorial image and in an ordinary day. That is where fashion becomes personal.`;
}

function previewText(value: string) {
  const sentences = value.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+/g);
  return (sentences?.slice(0, 2).join(" ") || value).trim();
}

function discoverArticleUrl({
  title,
  imageUrl,
  source,
  tags = [],
}: {
  title: string;
  imageUrl: string | null;
  source: "FASHLOCK ORIGINAL" | "FASHION HISTORY" | "CURATED SIGNAL";
  tags?: string[];
}) {
  const params = new URLSearchParams({
    title,
    source,
    content: articleBody(title, source),
  });
  if (imageUrl) params.set("imageUrl", imageUrl);
  if (tags.length) params.set("tags", tags.join(","));
  return `/discover/article/${slugify(title)}?${params.toString()}`;
}

async function fallbackFashionArticles(): Promise<FashlockArticle[]> {
  const fallbackTopics = [
    "Why Utility Dressing Feels Romantic Now",
    "The New Soft Tailoring Code",
    "How Texture Replaced the Logo",
    "Why Denim Feels Personal Again",
    "The Return of the City Sari",
    "How Black Became Fashion Armor",
  ];

  return Promise.all(
    fallbackTopics.map(async (title, index) => {
      const imageUrl = await fetchPexelsImage(`${title} fashion editorial`, index + 1);
      const content = articleBody(title, "FASHLOCK ORIGINAL");
      return {
        title,
        url: discoverArticleUrl({ title, imageUrl, source: "FASHLOCK ORIGINAL", tags: ["style", "wardrobe", "editorial"] }),
        imageUrl,
        sourceName: "FASHLOCK ORIGINAL",
        excerpt: previewText(content),
        content,
      };
    }),
  );
}

async function fallbackCuratedArticles(): Promise<FashlockArticle[]> {
  const fallbackStories = seedArticles
    .filter((article) => article.is_featured)
    .slice(0, 6);

  return Promise.all(
    fallbackStories.map(async (article, index) => {
      const imageUrl = await fetchPexelsImage(article.visual_prompt || "fashion editorial magazine", index + 1);
      const content = article.content ?? article.content_excerpt ?? articleBody(article.title, "CURATED SIGNAL");
      return {
        title: article.title,
        url: discoverArticleUrl({ title: article.title, imageUrl, source: "CURATED SIGNAL", tags: [article.category ?? "fashion"] }),
        imageUrl,
        sourceName: "CURATED SIGNAL",
        excerpt: article.content_excerpt ?? previewText(content),
        content,
      };
    }),
  );
}

async function fetchSerperCuratedArticles(): Promise<FashlockArticle[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: "latest fashion news runway street style designer trends 2026",
        num: 12,
      }),
        next: { revalidate: 60 * 60 },
      });
    if (!response.ok) {
      console.error("Serper failed:", response.status, await response.text());
      return [];
    }
    const data = (await response.json()) as {
      organic?: Array<{ title?: string; snippet?: string; source?: string; displayLink?: string; link?: string; imageUrl?: string | null }>;
    };
    const mapped = (data.organic ?? []).map((result) => ({
      title: result.title,
      url: result.link,
      description: result.snippet,
      source: result.source || result.displayLink || "Fashion Signal",
      imageUrl: result.imageUrl || null,
    }));
    const filtered = dedupeArticles(
      mapped.filter((result) =>
        isFashionArticle({
          title: result.title,
          description: result.description,
        }),
      ),
      (result) => result.title,
      () => null,
    ).slice(0, 6);

    if (filtered.length === 0) {
      console.log("Serper returned empty results");
      return [];
    }

    return Promise.all(
      filtered.map(async (result, index) => {
        const title = result.title ?? "Untitled fashion story";
        const imageUrl = result.imageUrl ?? (await fetchPexelsImage(`${title} fashion editorial`, index + 1));
        return {
          title,
          url: result.url ?? "#",
          description: result.description,
          source: result.source,
          imageUrl,
          sourceName: result.source,
          excerpt: result.description,
          content: result.description,
        };
      }),
    );
  } catch (error) {
    console.error("Serper error:", error instanceof Error ? error.message : error);
    return [];
  }
}

function currentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 6) return "summer";
  if (month >= 7 && month <= 9) return "monsoon";
  if (month >= 10 && month <= 11) return "festive";
  return "winter";
}

function cleanJsonArray(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function validOriginalTitle(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lower = title.toLowerCase();
  const noise = [
    "buy",
    "sale",
    "deal",
    "shop",
    "celebrity",
    "drag race",
    "project runway",
    "gala",
    "grand opening",
    "echoes of",
    "whispers of",
    "beyond the horizon",
    "sartorial reverie",
    "spirit",
  ];
  const concreteSignals = [
    "sari",
    "denim",
    "tailoring",
    "dress",
    "wardrobe",
    "jewellery",
    "jewelry",
    "silhouette",
    "texture",
    "street",
    "minimalism",
    "romantic",
    "utility",
    "runway",
    "blouse",
    "gold",
    "black",
    "y2k",
    "coquette",
    "luxury",
    "fabric",
    "shoe",
    "shoes",
  ];

  return words.length > 2 &&
    words.length <= 10 &&
    concreteSignals.some((signal) => lower.includes(signal)) &&
    !noise.some((item) => lower.includes(item));
}

async function fetchFashionSignals() {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  try {
    const season = currentSeason();
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: `${season} fashion culture style conversation 2026`,
        num: 10,
      }),
      next: { revalidate: 60 * 60 },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      organic?: Array<{ title?: string; snippet?: string }>;
    };
    return (data.organic ?? [])
      .map((result) => [result.title, result.snippet].filter(Boolean).join(" — "))
      .filter(Boolean)
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function generateOriginalTopics(headlines: string[]) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || headlines.length === 0) return [];

  const prompt = `You are the editorial director of Fashlock, a premium French fashion platform.

Based on these current fashion headlines from the web:
${headlines.join("\n")}

Generate 6 original editorial article titles that:
- Are inspired by these real signals but offer a fresh, deeper perspective
- Sound like Vogue cover lines — elegant, intriguing, not clickbait
- Cover different angles: cultural, historical, personal, trend-based
- Each title is max 10 words
- Are things no other fashion site has written about in this exact way
- Use concrete fashion language: garments, silhouettes, materials, colours, styling rituals, or culture
- Avoid vague poetic titles such as "echoes", "whispers", "horizon", "spirit", "reverie", unless the title also names a specific garment or style code
- Do not put "2026" in more than one title

Return ONLY a JSON array of 6 strings. No markdown, no explanation.
Example format: ["The Return of the City Sari", "Why Utility Dressing Feels Romantic Now", "The New Soft Tailoring Code", "How Texture Replaced the Logo", "The Gold Jewellery Effect", "Why Denim Feels Personal Again"]`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.85,
            },
          }),
          next: { revalidate: 60 * 60 },
        },
      );
      if (!response.ok) {
        const err = await response.text();
        console.error("Gemini error:", response.status, err);
        return [];
      }
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return [];
      const parsed = JSON.parse(cleanJsonArray(rawText)) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((title): title is string => typeof title === "string")
        .map((title) => title.trim())
        .filter(validOriginalTitle)
        .slice(0, 6);
    } catch (error) {
      console.error("Gemini discover original topics error:", error instanceof Error ? error.message : error);
      return [];
    }

}

async function generateFashlockOriginals(): Promise<FashlockArticle[]> {
  const headlines = await fetchFashionSignals();
  const topics = await generateOriginalTopics(headlines);

  if (topics.length < 3) {
    return fallbackFashionArticles();
  }

  const uniqueTopics = dedupeArticles(
    topics.map((title) => ({ title })),
    (topic) => topic.title,
    () => null,
  )
    .map((topic) => topic.title)
    .slice(0, 6);

  return Promise.all(
    uniqueTopics.map(async (title, index) => {
      const keyword = title.split(/\s+/).slice(0, 4).join(" ");
      const imageUrl = await fetchPexelsImage(`${keyword} fashion editorial`, index + 1);
      const content = articleBody(title, "FASHLOCK ORIGINAL");
      return {
        title,
        url: discoverArticleUrl({ title, imageUrl, source: "FASHLOCK ORIGINAL", tags: ["fashlock", "editorial", keyword] }),
        imageUrl,
        sourceName: "FASHLOCK ORIGINAL",
        excerpt: previewText(content),
        content,
      };
    }),
  );
}

async function fetchFashionNews(): Promise<FashlockArticle[]> {
  const newsApiKey = process.env.NEWS_API_KEY;
  const newsDataKey = process.env.NEWSDATA_API_KEY;

  if (newsApiKey) {
    try {
      const params = new URLSearchParams({
        q: 'fashion OR style OR runway OR couture OR "fashion week"',
        language: "en",
        sortBy: "publishedAt",
        pageSize: "24",
        apiKey: newsApiKey,
      });
      const response = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`, {
        next: { revalidate: 60 * 30 },
      });
      if (response.ok) {
        const data = (await response.json()) as {
          articles?: Array<{
            title?: string;
            description?: string | null;
            url?: string;
            urlToImage?: string | null;
            source?: { name?: string };
          }>;
        };
        const filtered = dedupeArticles(
          (data.articles ?? []).filter(isFashionArticle),
          (article) => article.title,
          (article) => article.urlToImage,
        ).slice(0, 6);

        if (filtered.length >= 3) {
          return Promise.all(
            filtered.map(async (article, index) => {
              const title = article.title ?? "Untitled fashion story";
              return {
                title,
                url: article.url ?? "#",
                imageUrl: article.urlToImage ?? (await fetchPexelsImage(`${title} fashion editorial`, index + 1)),
                sourceName: article.source?.name ?? "Fashion Desk",
                excerpt: article.description ?? undefined,
                content: article.description ?? undefined,
              };
            }),
          );
        }
      }
    } catch (error) {
      console.error("NewsAPI curated source error:", error instanceof Error ? error.message : error);
    }
  }

  if (newsDataKey) {
    try {
      const params = new URLSearchParams({
        apikey: newsDataKey,
        q: "fashion OR style OR runway OR couture",
        language: "en",
      });
      const response = await fetch(`https://newsdata.io/api/1/news?${params.toString()}`, {
        next: { revalidate: 60 * 30 },
      });
      if (response.ok) {
        const data = (await response.json()) as {
          results?: Array<{
            title?: string;
            description?: string | null;
            image_url?: string | null;
            category?: string[] | string | null;
            keywords?: string[] | string | null;
            source_id?: string;
            source_name?: string;
            link?: string;
          }>;
        };
        const filtered = dedupeArticles(
          (data.results ?? []).filter(isFashionArticle),
          (article) => article.title,
          (article) => article.image_url,
        ).slice(0, 6);

        if (filtered.length >= 3) {
          return Promise.all(
            filtered.map(async (article, index) => {
              const title = article.title ?? "Untitled fashion story";
              return {
                title,
                url: article.link ?? "#",
                imageUrl: article.image_url ?? (await fetchPexelsImage(`${title} fashion editorial`, index + 1)),
                sourceName: article.source_name ?? article.source_id ?? "Fashion Desk",
                excerpt: article.description ?? undefined,
                content: article.description ?? undefined,
              };
            }),
          );
        }
      }
    } catch (error) {
      console.error("NewsData curated source error:", error instanceof Error ? error.message : error);
    }
  }

  const serperArticles = await fetchSerperCuratedArticles();
  if (serperArticles.length > 0) return serperArticles;
  console.log("All curated article sources failed; using fallbackCuratedArticles()");
  return fallbackCuratedArticles();
}

export default async function DiscoverPage() {
  const [curatedArticles, originalArticles, moments] = await Promise.all([
    fetchFashionNews(),
    generateFashlockOriginals(),
    Promise.all(
      historyMoments.map(async (moment, index) => {
        const imageUrl = await fetchPexelsImage(moment.imageQuery, index + 1);
        const content = articleBody(moment.fact, "FASHION HISTORY");
        return {
          year: moment.year,
          fact: moment.fact,
          topic: discoverArticleUrl({
            title: moment.fact,
            imageUrl,
            source: "FASHION HISTORY",
            tags: ["history", "archive", moment.year],
          }),
          imageUrl,
          excerpt: previewText(content),
          content,
        };
      }),
    ),
  ]);

  return (
    <FashlockDiscover
      className={`${cormorant.variable} ${dmSans.variable}`}
      curatedArticles={curatedArticles}
      originalArticles={originalArticles}
      moments={moments}
    />
  );
}
