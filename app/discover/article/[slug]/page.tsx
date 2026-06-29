import Link from "next/link";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { loadOrGenerateFashlockArticle } from "@/lib/fashlock-researched-articles";

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

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

type ArticleSection = {
  heading: string;
  body: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function fallbackSections({
  fullContent,
  content,
  excerpt,
  region,
}: {
  fullContent?: string;
  content?: string;
  excerpt?: string;
  region?: string;
}): ArticleSection[] {
  const paragraphs = (fullContent || content || excerpt || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length >= 3) {
    const headings = ["The Meaning Beneath the Surface", `Why It Belongs to ${region || "Now"}`, "How to Read It Now", "The Style Lesson"];
    return paragraphs.slice(0, 4).map((paragraph, index) => ({
      heading: headings[index] ?? "The Style Lesson",
      body: paragraph,
    }));
  }

  return [];
}

function NotFoundState() {
  return (
    <main className={`${cormorant.variable} ${dmSans.variable} min-h-screen bg-[#FAF7F4] px-6 py-28 text-[#2C2418] [font-family:var(--font-fashlock-body)]`}>
      <div className="mx-auto max-w-xl">
        <p className="mb-4 text-[9px] font-[200] uppercase tracking-[5px] text-[#B03A5B]">
          Story not found
        </p>
        <h1 className="text-[46px] italic leading-none [font-family:var(--font-fashlock-display)]">
          This article is not in the Fashlock archive yet.
        </h1>
        <p className="mt-6 text-sm font-[300] leading-7 text-[#75685F]">
          The Fashion Explained spine only serves curated editorial slugs. Return to Discover for the live set.
        </p>
        <Link href="/discover" className="mt-8 inline-block text-[11px] uppercase tracking-[3px] text-[#B03A5B]">
          Back to Discover
        </Link>
      </div>
    </main>
  );
}

export default async function DiscoverArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await loadOrGenerateFashlockArticle(slug);

  if (!article) return <NotFoundState />;

  const sections = article.sections?.length
    ? article.sections
    : fallbackSections({
        fullContent: article.full_content,
        content: article.content,
        excerpt: article.content_excerpt,
        region: article.region,
      });
  const sources = article.research_sources ?? [];

  return (
    <main className={`${cormorant.variable} ${dmSans.variable} min-h-screen bg-[#FAF7F4] text-[#2C2418] [font-family:var(--font-fashlock-body)]`}>
      <Link
        href="/discover"
        className="fixed left-6 top-[72px] z-40 text-[11px] font-[300] text-[#B03A5B] md:left-12"
      >
        Back to Discover
      </Link>

      <section className="relative min-h-[66vh] overflow-hidden bg-[#1C1410]">
        {article.cover_image_url ? (
          <img src={article.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,#BFA898,transparent_34%),linear-gradient(135deg,#1C1410,#8C7B6E_55%,#F4DCE4)]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.42)_40%,rgba(0,0,0,0)_75%)]" />
        <div className="relative flex min-h-[66vh] items-end px-6 pb-12 pt-36 md:px-12">
          <div className="max-w-[920px]">
            <p className="mb-5 text-[9px] font-[200] uppercase tracking-[5px] text-[#F4DCE4]">
              {article.category}
            </p>
            <h1 className="max-w-[880px] text-[44px] italic leading-[1.02] text-[#F0EBE3] [font-family:var(--font-fashlock-display)] md:text-[68px]">
              {article.title}
            </h1>
          </div>
        </div>
      </section>

      <article className="mx-auto max-w-[760px] px-6 py-12 md:px-0">
        <div className="mb-10 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-[200] uppercase tracking-[3px] text-[#B03A5B]">
          <span>{article.reading_time} min read</span>
          <span>{formatDate(article.published_date)}</span>
          <span>{article.mood}</span>
        </div>

        <p className="mb-10 border-l border-[#B03A5B] pl-5 text-[18px] italic leading-8 text-[#5F534A] [font-family:var(--font-fashlock-display)]">
          {article.content_excerpt}
        </p>

        <p className="mb-12 text-[20px] font-[300] leading-9 text-[#75685F] [font-family:var(--font-fashlock-display)]">
          {article.subtitle}
        </p>

        <div className="space-y-12">
          {sections.map((section) => (
            <section key={`${section.heading}-${section.body.slice(0, 24)}`}>
              <h2 className="mb-4 text-[34px] italic leading-tight text-[#2C2418] [font-family:var(--font-fashlock-display)]">
                {section.heading}
              </h2>
              <p className="text-[16px] font-[300] leading-[1.95] text-[#2C2418]">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-12 grid gap-4 border-y border-[#E8DCD2] py-6 text-sm font-[300] text-[#75685F] md:grid-cols-3">
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-[3px] text-[#B03A5B]">Era</p>
            <p>{article.era}</p>
          </div>
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-[3px] text-[#B03A5B]">Region</p>
            <p>{article.region}</p>
          </div>
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-[3px] text-[#B03A5B]">Reference</p>
            <p>{article.culture_reference}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {[...article.archetypes, ...article.tags].slice(0, 8).map((tag) => (
            <span key={tag} className="rounded-full bg-[#F4DCE4] px-3 py-2 text-[10px] font-[300] text-[#B03A5B]">
              {tag}
            </span>
          ))}
        </div>

        {sources.length ? (
          <section className="mt-12">
            <p className="mb-4 text-[9px] uppercase tracking-[4px] text-[#B03A5B]">Sources</p>
            <div className="space-y-3">
              {sources.map((source) => (
                <a
                  key={`${source.url}-${source.title}`}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border border-[#E8DCD2] bg-[#F7F1EA] p-4 text-sm text-[#2C2418] transition hover:border-[#B03A5B]"
                >
                  <span className="block text-[9px] uppercase tracking-[3px] text-[#B03A5B]">
                    {source.source}
                  </span>
                  <span className="mt-2 block font-[300]">{source.title}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}
