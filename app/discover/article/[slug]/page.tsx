import Link from "next/link";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-fashlock-display",
  weight: ["300"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-fashlock-body",
  weight: ["200", "300", "400"],
});

const GEMINI_MODEL = "gemini-2.5-flash";

type ArticlePageProps = {
  searchParams: Promise<{
    title?: string;
    imageUrl?: string;
    description?: string;
    content?: string;
    source?: string;
    url?: string;
    year?: string;
    tags?: string;
  }>;
};

function fallbackContent(title: string, sourceText: string) {
  if (sourceText.trim()) return sourceText.trim();

  return `${title} is a fashion story about memory, identity, and the way clothes become language.\n\nThe strongest looks are never only about the garment. They are about timing: the cultural mood, the body wearing it, the references it carries, and the confidence it gives back.\n\nFashlock reads this as a signal worth keeping close. It belongs to the archive, but it also belongs to right now.`;
}

function readingTime(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

function cleanGeminiText(value: string) {
  return value
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function rewriteWithGemini(original: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !original.trim()) return null;

  const prompt = `Rewrite this fashion article in Fashlock's editorial voice. Tone: warm, intelligent, confident — like a brilliant Vogue editor who also understands data and culture. Not too long — 3 to 4 paragraphs. Make it feel like an original Fashlock piece, not a news summary. Here is the original content: ${original}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75 },
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      return null;
    }

    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? cleanGeminiText(text) : null;
  } catch (error) {
    console.error("Gemini article rewrite error:", error instanceof Error ? error.message : error);
    return null;
  }
}

export default async function DiscoverArticlePage({ searchParams }: ArticlePageProps) {
  const params = await searchParams;
  const title = params.title || "Fashlock Story";
  const source = params.source || "FASHLOCK ORIGINAL";
  const original = fallbackContent(title, params.content || params.description || "");
  const rewritten = await rewriteWithGemini(original);
  const body = rewritten || original;
  const tags = (params.tags || [source, params.year].filter(Boolean).join(","))
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);

  return (
    <main className={`${cormorant.variable} ${dmSans.variable} min-h-screen bg-[#FAF7F4] text-[#2C2418] [font-family:var(--font-fashlock-body)]`}>
      <Link
        href="/discover"
        className="fixed left-6 top-[72px] z-40 text-[11px] font-[300] text-[#B03A5B] md:left-12"
      >
        ← Back to Discover
      </Link>

      <section className="relative h-[65vh] min-h-[440px] overflow-hidden bg-[#1C1410]">
        {params.imageUrl ? (
          <img src={params.imageUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-[#D4C8BC]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(28,20,16,0.85),transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 max-w-[900px] px-6 pb-12 md:px-12">
          <p className="mb-4 text-[9px] font-[200] uppercase tracking-[5px] text-[#B03A5B]">
            {source}
          </p>
          <h1 className="max-w-[800px] text-[42px] italic leading-[1.05] text-[#F0EBE3] [font-family:var(--font-fashlock-display)] md:text-[48px]">
            {title}
          </h1>
        </div>
      </section>

      <article className="mx-auto max-w-[720px] px-6 py-12 md:px-0">
        <p className="mb-8 text-[10px] font-[200] text-[#C4B4A6]">
          {readingTime(body)}
        </p>

        <div className="space-y-6 text-[16px] font-[300] leading-[1.9] text-[#2C2418]">
          {body.split(/\n{2,}/).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {tags.length ? (
          <div className="mt-12 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#F4DCE4] px-3 py-2 text-[10px] font-[300] text-[#B03A5B]">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </article>
    </main>
  );
}
