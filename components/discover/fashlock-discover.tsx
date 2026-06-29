"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { CompleteYourClosetCard } from "@/components/discover/complete-your-closet-card";
import { FashionExplainedSection } from "@/components/discover/fashion-explained-section";
import { ForYouSection } from "@/components/discover/for-you-section";
import { cn } from "@/lib/utils";

export type FashlockArticle = {
  title: string;
  url: string;
  imageUrl: string | null;
  sourceName: string;
  excerpt?: string;
  content?: string;
  year?: string;
};

type FashlockDiscoverProps = {
  className?: string;
  curatedArticles: FashlockArticle[];
};

type SearchPayload = {
  editorial?: {
    summary?: string;
    keyMoments?: Array<{ year: string; description: string }>;
    influence?: string;
    relatedTerms?: string[];
  };
  images?: Array<{ id: string; url: string; alt: string }>;
  trend?: { keyword: string; points: Array<{ date: string; value: number }> } | null;
};

type EventItem = {
  name: string;
  city: string;
  date: string;
  description: string;
  imageUrl: string | null;
};

type DataStory = {
  keyword: string;
  points: Array<{ date: string; value: number }>;
  francePoints?: Array<{ date: string; value: number }>;
  headline: string;
  insight: string;
  meaning?: string;
  peakYear: number;
  isRising: boolean;
  imageUrl?: string | null;
};

function ImageBlock({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-[linear-gradient(135deg,#E8E0D4,#D4C8BC)] text-center text-xs uppercase tracking-[0.28em] text-[#7A6F65]",
          className,
        )}
      >
        FASHLOCK
      </div>
    );
  }

  return (
    <div className={cn("bg-[linear-gradient(135deg,#E8E0D4,#D4C8BC)]", className)}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("fashlock-skeleton rounded-[2px]", className)} />;
}

function SectionShell({
  label,
  title,
  subtitle,
  children,
  className,
}: {
  label: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-[#D4C8BC] bg-[#FAF7F4] px-5 py-8 md:px-[120px] md:py-14", className)} style={{ borderTopWidth: 0.5 }}>
      <p className="mb-[10px] text-[8px] font-[200] uppercase tracking-[5px] text-[#B03A5B]">{label}</p>
      <h2 className="mb-[6px] text-[36px] font-[300] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)]">
        {title}
      </h2>
      {subtitle ? <p className="mb-7 text-[11px] font-[300] leading-5 tracking-[0.3px] text-[#8C7B6E]">{subtitle}</p> : null}
      {children}
    </section>
  );
}

function Sparkline({ points, className }: { points: Array<{ value: number }>; className?: string }) {
  const values = points.map((point) => point.value).filter(Number.isFinite);
  if (values.length < 2) return <div className={cn("h-16 bg-[#E8E0D4]", className)} />;

  const width = 360;
  const height = 92;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-20 w-full overflow-visible", className)} aria-hidden="true">
      <path d={path} fill="none" stroke="#B03A5B" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function DataStoryChart({
  india,
  france,
}: {
  india: Array<{ value: number }>;
  france: Array<{ value: number }>;
}) {
  const width = 360;
  const height = 280;
  const paddingX = 18;
  const paddingY = 28;
  const allValues = [...india, ...france].map((point) => point.value).filter(Number.isFinite);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 1);
  const range = max - min || 1;

  function path(points: Array<{ value: number }>) {
    const values = points.map((point) => point.value).filter(Number.isFinite);
    if (values.length < 2) return "";

    return values
      .map((value, index) => {
        const x = paddingX + (index / Math.max(values.length - 1, 1)) * (width - paddingX * 2);
        const y = paddingY + (1 - (value - min) / range) * (height - paddingY * 2);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  const indiaPath = path(india);
  const francePath = path(france);

  return (
    <div className="dataStoryChartPane relative h-full overflow-hidden bg-[#E8E0D4] transition duration-300 ease-in-out">
      <style>{`
        @keyframes drawDataStoryLine {
          from { stroke-dashoffset: 1; }
          to { stroke-dashoffset: 0; }
        }

        .dataStoryLine {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: drawDataStoryLine 1.5s ease forwards;
        }

        .dataStoryCard:hover .dataStoryChartPane {
          background: #DDD4C8;
        }

        .dataStoryCard:hover .dataStoryIndiaLine {
          filter: drop-shadow(0 0 4px rgba(176,58,91,0.4));
        }
      `}</style>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-hidden="true">
        {francePath ? (
          <path
            d={francePath}
            fill="none"
            pathLength={1}
            stroke="#B03A5B"
            strokeDasharray="5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.3}
            strokeWidth={1}
          />
        ) : null}
        {indiaPath ? (
          <path
            className="dataStoryLine dataStoryIndiaLine transition duration-300 ease-in-out"
            d={indiaPath}
            fill="none"
            pathLength={1}
            stroke="#B03A5B"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 pb-2 text-[8px] font-[200] text-[#C4B4A6]">
        <span>2003</span>
        <span>2026</span>
      </div>
    </div>
  );
}

function FashionSearch() {
  const placeholders = useMemo(
    () => [
      "Search Met Gala 2019...",
      "Search Coco Chanel...",
      "Search ballet flats history...",
      "Search what Paris wore in 2008...",
      "Search Alexander McQueen...",
      "Search fashion week SS2026...",
    ],
    [],
  );
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchPayload | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setPlaceholderIndex((index) => (index + 1) % placeholders.length), 2500);
    return () => window.clearInterval(timer);
  }, [placeholders.length]);

  async function runSearch(nextQuery: string) {
    const trimmed = nextQuery.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const response = await fetch("/api/discover/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      if (response.ok) setResult((await response.json()) as SearchPayload);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(query);
  }

  return (
    <SectionShell label="DISCOVER" title="Search the fashion universe" className="border-t-0">
      <div className="mx-auto max-w-[760px]">
        <form onSubmit={submit} className="group relative">
          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[#8C7B6E]">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholders[placeholderIndex]}
            className="w-full rounded-full bg-[#F0EBE3] px-14 py-5 text-[15px] font-[300] text-[#2C2418] outline-none placeholder:text-[#8C7B6E]"
          />
          <span className="absolute bottom-0 left-10 h-px w-0 bg-[#B03A5B] transition-all duration-500 group-focus-within:w-[calc(100%-5rem)]" />
        </form>
        <p className="mt-3 text-center text-[11px] font-[300] text-[#8C7B6E]">
          Search any trend, designer, era, event or moment in fashion history
        </p>

        {loading ? <Skeleton className="mx-auto mt-8 h-40 max-w-2xl" /> : null}

        {result ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 rounded-[2px] border border-[#D4C8BC] bg-[#F0EBE3] p-6 shadow-[0_4px_40px_rgba(44,36,24,0.08)] md:p-8"
            style={{ borderWidth: 0.5 }}
          >
            <button className="mb-5 text-[11px] font-[300] text-[#8C7B6E]" onClick={() => setResult(null)}>
              Close
            </button>
            <p className="text-[28px] italic leading-[1.25] text-[#2C2418] [font-family:var(--font-fashlock-display)]">
              {result.editorial?.summary}
            </p>
            {result.editorial?.keyMoments?.length ? (
              <div className="mt-7 space-y-4">
                {result.editorial.keyMoments.map((moment) => (
                  <div key={`${moment.year}-${moment.description}`} className="grid grid-cols-[72px_1fr] gap-5 border-t border-[#D4C8BC] pt-4" style={{ borderTopWidth: 0.5 }}>
                    <p className="text-[13px] text-[#B03A5B]">{moment.year}</p>
                    <p className="text-[12px] font-[300] leading-6 text-[#8C7B6E]">{moment.description}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {result.trend?.points?.length ? (
              <div className="mt-8">
                <p className="mb-2 text-[9px] font-[200] uppercase tracking-[4px] text-[#B03A5B]">{result.trend.keyword}</p>
                <Sparkline points={result.trend.points} />
              </div>
            ) : null}
            {result.images?.length ? (
              <div className="mt-8 flex gap-3 overflow-x-auto scrollbar-none">
                {result.images.map((image) => (
                  <img key={image.id} src={image.url} alt={image.alt} className="h-36 w-52 shrink-0 object-cover" loading="lazy" />
                ))}
              </div>
            ) : null}
            {result.editorial?.relatedTerms?.length ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {result.editorial.relatedTerms.map((term) => (
                  <button
                    key={term}
                    className="rounded-full bg-[#F4DCE4] px-3 py-2 text-[10px] font-[300] text-[#B03A5B]"
                    onClick={() => {
                      setQuery(term);
                      void runSearch(term);
                    }}
                  >
                    {term}
                  </button>
                ))}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </div>
    </SectionShell>
  );
}

function useDiscoverApi<T>(path: string, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(path)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active) setData(payload?.[key] ?? null);
      })
      .catch(() => null)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, key]);

  return { data, loading };
}

function EventsSection() {
  const { data, loading } = useDiscoverApi<EventItem[]>("/api/discover/events", "events");
  const featuredEvent = useMemo(() => pickFeaturedEvent(data ?? []), [data]);
  if (!loading && !data?.length) return null;
  return (
    <SectionShell label="NOW" title="The fashion world, right now" subtitle="Live events, shows and moments happening globally">
      {loading ? (
        <Skeleton className="h-[260px] max-w-[640px]" />
      ) : featuredEvent ? (
        <EventCard event={featuredEvent} />
      ) : null}
    </SectionShell>
  );
}

function DataStoriesSection() {
  const { data, loading } = useDiscoverApi<DataStory[]>("/api/discover/datastories", "stories");
  if (!loading && !data?.length) return null;
  return (
    <SectionShell label="DATA STORIES" title="Fashion has cycles" subtitle="22 years of real trend data — what history tells us about right now">
      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[280px]" />)}</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {data?.map((story) => (
            <Link
              key={story.keyword}
              href={dataStoryArticleUrl(story)}
              className="dataStoryCard grid h-[280px] cursor-pointer grid-cols-[40%_60%] overflow-hidden rounded-[2px] bg-[#F0EBE3] text-[#2C2418] no-underline shadow-[0_2px_24px_rgba(44,36,24,0.07)] transition duration-300 ease-in-out"
            >
              <DataStoryChart india={story.points} france={story.francePoints ?? []} />
              <div className="relative overflow-hidden p-8">
                <span
                  className={cn(
                    "relative z-[1] inline-block rounded-[20px] px-3 py-1 text-[8px] font-[300] uppercase tracking-[3px]",
                    story.isRising ? "bg-[#F4DCE4] text-[#B03A5B]" : "bg-[#EDE8E0] text-[#8C7B6E]",
                  )}
                >
                  {story.isRising ? "RISING NOW" : "CYCLING BACK"}
                </span>
                <h3 className="relative z-[1] mt-2 text-[32px] italic leading-[1.2] text-[#2C2418] [font-family:var(--font-fashlock-display)]">
                  {renderInlineEmphasis(story.headline)}
                </h3>
                <p className="pointer-events-none absolute bottom-5 right-8 z-0 text-[64px] font-[200] leading-none text-[#E8E0D4] [font-family:var(--font-fashlock-display)]">
                  {story.peakYear}
                </p>
                <p
                  className="relative z-[1] mt-3 text-[12px] font-[300] leading-[1.7] text-[#8C7B6E]"
                  style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                >
                  {story.insight}
                </p>
                <div className="relative z-[1] my-4 bg-[#D4C8BC]" style={{ height: 0.5 }} />
                <p className="relative z-[1] mb-[6px] text-[8px] font-[200] uppercase tracking-[3px] text-[#B03A5B]">
                  WHAT THIS MEANS FOR YOU
                </p>
                <p className="relative z-[1] pr-16 text-[14px] italic leading-5 text-[#B03A5B] [font-family:var(--font-fashlock-display)]">
                  {story.meaning}
                </p>
                <p className="absolute bottom-8 right-8 z-[1] text-[8px] font-[200] uppercase tracking-[2px] text-[#C4B4A6]">
                  PEAKED {story.peakYear}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "story";
}

function eventArticleUrl(event: EventItem) {
  const params = new URLSearchParams({
    title: event.name,
    content: event.description,
    source: `${event.city.toUpperCase()} · ${event.date}`,
    type: "event",
  });
  if (event.imageUrl) params.set("imageUrl", event.imageUrl);
  params.set("tags", ["event", event.city, event.date].filter(Boolean).join(","));

  return `/discover/article/${slugify(event.name)}?${params.toString()}`;
}

function stripInlineEmphasis(value: string) {
  return value.replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1").trim();
}

function renderInlineEmphasis(value: string) {
  const parts = value.split(/(\*[^*]+\*|_[^_]+_)/g).filter(Boolean);
  return parts.map((part, index) => {
    const match = part.match(/^([*_])(.+)\1$/);
    return match ? <em key={`${part}-${index}`}>{match[2]}</em> : part;
  });
}

function dataStoryArticleUrl(story: DataStory) {
  const headline = stripInlineEmphasis(story.headline);
  const content = [story.insight, story.meaning].filter(Boolean).join("\n\n");
  const params = new URLSearchParams({
    title: headline,
    content,
    source: "FASHION DATA · FASHLOCK",
    type: "data-story",
    tags: ["fashion data", story.keyword, `peaked ${story.peakYear}`].join(","),
  });
  if (story.imageUrl) params.set("imageUrl", story.imageUrl);

  return `/discover/article/${slugify(headline)}?${params.toString()}`;
}

function parseEventDate(date: string) {
  const value = date.trim();
  const parts = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (parts) {
    const parsed = new Date(Number(parts[1]), Number(parts[2] ?? "1") - 1, Number(parts[3] ?? "1"));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const monthName = value.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:-\d{1,2})?,\s*(\d{4})/i);
  if (monthName) {
    const parsed = new Date(`${monthName[1]} ${monthName[2]}, ${monthName[3]}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function eventBadge(date: string) {
  const eventDate = parseEventDate(date);
  if (!eventDate) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const deltaDays = Math.floor((eventDay.getTime() - today.getTime()) / 86400000);

  if (deltaDays === 0) return { label: "LIVE", color: "#B03A5B" };
  if (deltaDays > 0) return { label: "UPCOMING", color: "#8C7B6E" };
  if (deltaDays >= -30) return { label: "RECENT", color: "#C4B4A6" };
  return null;
}

function pickFeaturedEvent(events: EventItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return [...events]
    .map((event, index) => {
      const eventDate = parseEventDate(event.date);
      const timestamp = eventDate ? new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()).getTime() : Number.POSITIVE_INFINITY;
      return {
        event,
        index,
        distance: Number.isFinite(timestamp) ? Math.abs(timestamp - today) : Number.POSITIVE_INFINITY,
        isUpcoming: Number.isFinite(timestamp) && timestamp >= today,
      };
    })
    .sort((a, b) => {
      if (a.isUpcoming !== b.isUpcoming) return a.isUpcoming ? -1 : 1;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.index - b.index;
    })[0]?.event ?? null;
}

function EventCard({ event }: { event: EventItem }) {
  const badge = eventBadge(event.date);

  return (
    <Link
      href={eventArticleUrl(event)}
      className="grid max-w-[720px] overflow-hidden rounded-[2px] border border-[#D4C8BC] bg-[#F0EBE3] text-[#2C2418] no-underline transition duration-300 ease-in-out hover:-translate-y-[3px] hover:shadow-[0_8px_32px_rgba(44,36,24,0.1)] md:grid-cols-[240px_1fr]"
      style={{ borderWidth: 0.5 }}
    >
      <ImageBlock src={event.imageUrl} alt={event.name} className="h-40 md:h-full" />
      <div className="p-5 md:p-6">
        {badge ? (
          <p className="mb-3 text-[8px] font-[300] uppercase tracking-[4px]" style={{ color: badge.color }}>
            {badge.label}
          </p>
        ) : null}
        <h3 className="text-[24px] leading-tight text-[#2C2418] [font-family:var(--font-fashlock-display)]">{event.name}</h3>
        <p className="mt-2 text-[9px] font-[200] uppercase tracking-[2px] text-[#8C7B6E]">{event.city} · {event.date}</p>
        <p className="mt-4 text-[12px] font-[300] leading-6 text-[#8C7B6E]">{event.description}</p>
      </div>
    </Link>
  );
}

function NewsStrip({ articles }: { articles: FashlockArticle[] }) {
  const newsArticles = articles
    .filter((article) => article.url && article.url !== "#")
    .slice(0, 5);

  if (newsArticles.length < 2) return null;

  return (
    <section className="border-t border-[#E8DCD2] bg-[#FAF7F4] px-5 py-8 md:px-[120px]" style={{ borderTopWidth: 0.5 }}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-[9px] font-[200] uppercase tracking-[0.28em] text-[#B03A5B]">
          IN THE NEWS
        </p>
        <span className="hidden h-px flex-1 bg-[#E8DCD2] md:block" />
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
        {newsArticles.map((article) => (
          <a
            key={`${article.title}-${article.url}`}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-[112px] w-[230px] shrink-0 flex-col justify-between rounded-[2px] border border-[#E4D7CC] bg-[#F0EBE3] p-4 text-[#2C2418] no-underline transition duration-200 hover:border-[#B03A5B] md:w-auto"
            style={{ borderWidth: 0.5 }}
          >
            <span
              className="text-[13px] font-[300] leading-5 text-[#2C2418]"
              style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {article.title}
            </span>
            <span className="mt-4 flex items-center justify-between gap-3 text-[9px] font-[200] uppercase tracking-[2px] text-[#8C7B6E]">
              <span className="truncate">{article.sourceName}</span>
              <span className="text-[14px] text-[#B03A5B] transition group-hover:translate-x-0.5">↗</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function FashlockDiscover({
  className,
  curatedArticles,
}: FashlockDiscoverProps) {
  return (
    <div
      className={cn(
        "min-h-screen bg-[#FAF7F4] text-[#2C2A27]",
        "[font-family:var(--font-fashlock-body)]",
        className,
      )}
    >
      <main>
        <FashionSearch />

        <ForYouSection />
        <CompleteYourClosetCard />

        <EventsSection />

        <DataStoriesSection />

        <FashionExplainedSection />

        {/* TODO: fold lag/regional angle into Fashion Explained per discover redesign spec */}

        <NewsStrip articles={curatedArticles} />
      </main>
    </div>
  );
}
