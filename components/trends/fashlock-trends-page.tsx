"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SeasonHero } from "@/components/fashlock/season-hero";

type TrendCard = {
  name: string;
  description: string;
  howToWear: string;
  keyword: string;
  image: string | null;
};

type VelocityItem = {
  title: string;
  snippet: string;
};

type CityTrend = {
  city: string;
  headline: string;
  snippet: string;
  image: string | null;
};

type TrendsData = {
  season: string;
  year: number;
  trends: TrendCard[];
  velocity: {
    rising: VelocityItem[];
    peaking: VelocityItem[];
    fading: VelocityItem[];
  };
  cities: CityTrend[];
};

type TrendsState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: TrendsData; error: null }
  | { status: "error"; data: null; error: string };

const quotes = [
  "Fashion is the daily rehearsal of becoming.",
  "A trend is only useful when it teaches you how to see.",
  "The best style signals arrive quietly, then become obvious.",
  "What people wear first in the street, culture explains later.",
];

const gridVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

function currentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "Spring";
  if (month >= 6 && month <= 8) return "Summer";
  if (month >= 9 && month <= 11) return "Autumn";
  return "Winter";
}

function articleHref(topic: string) {
  return `/article?topic=${encodeURIComponent(topic)}`;
}

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
          "flex items-center justify-center bg-[#EEE8E1] text-center text-xs uppercase tracking-[0.28em] text-[#7A6F65]",
          className,
        )}
      >
        FASHLOCK
      </div>
    );
  }

  return <img src={src} alt={alt} className={cn("h-full w-full object-cover", className)} loading="lazy" decoding="async" />;
}

function LoadingState({ className }: { className?: string }) {
  const quote = quotes[new Date().getSeconds() % quotes.length];

  return (
    <main
      className={`${className ?? ""} flex min-h-screen items-center justify-center bg-[#FAF7F4] px-6 text-center text-[#2C2A27] [font-family:var(--font-fashlock-body)]`}
    >
      <div>
        <h1 className="max-w-2xl text-4xl italic leading-tight [font-family:var(--font-fashlock-display)]">
          {quote}
        </h1>
        <motion.div
          animate={{ width: [40, 120, 40], opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mt-7 h-px bg-[#B03A5B]"
        />
        <p className="mt-6 text-[13px] text-[#7A6F65]">Loading today&apos;s trends...</p>
      </div>
    </main>
  );
}

function TrendCardView({ trend }: { trend: TrendCard }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.article
      variants={itemVariants}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="overflow-hidden rounded-[12px] bg-white"
    >
      <Link href={articleHref(`${trend.name} fashion trend 2026 how to style`)}>
        <div className="h-[280px] overflow-hidden">
          <ImageBlock
            src={trend.image}
            alt={trend.name}
            className="h-full transition duration-700 hover:scale-[1.03]"
          />
        </div>
      </Link>
      <div className="p-6">
        <Link href={articleHref(`${trend.name} fashion trend 2026 how to style`)}>
          <h3 className="text-[20px] leading-tight [font-family:var(--font-fashlock-display)]">
            {trend.name}
          </h3>
          <p className="mt-3 line-clamp-2 text-[13px] leading-6 text-[#7A6F65]">
            {trend.description}
          </p>
        </Link>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-5 border-b border-[#B03A5B] pb-1 text-left text-sm text-[#B03A5B]"
        >
          How to wear it →
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <p className="pt-5 text-sm leading-7 text-[#2C2A27]">{trend.howToWear}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

function VelocityColumn({
  label,
  color,
  marker,
  items,
}: {
  label: string;
  color: string;
  marker: string;
  items: VelocityItem[];
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color }}>
        {label}
      </p>
      <div className="mt-8 space-y-7">
        {items.slice(0, 4).map((item) => (
          <Link
            key={item.title}
            href={articleHref(item.title)}
            className="group block"
          >
            <div className="flex gap-4">
              <span className="mt-1 text-lg leading-none" style={{ color }}>
                {marker}
              </span>
              <div>
                <h3 className="text-lg leading-snug [font-family:var(--font-fashlock-display)] group-hover:text-[#B03A5B]">
                  {item.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#7A6F65]">
                  {item.snippet}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function FashlockTrendsPage({ className }: { className?: string }) {
  const [state, setState] = useState<TrendsState>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    const season = currentSeason();
    const cacheKey = `trends_${season}_${new Date().toDateString()}`;
    const cached = window.localStorage.getItem(cacheKey);

    if (cached) {
      try {
        setState({ status: "ready", data: JSON.parse(cached) as TrendsData, error: null });
        return;
      } catch {
        window.localStorage.removeItem(cacheKey);
      }
    }

    let cancelled = false;

    async function loadTrends() {
      setState({ status: "loading", data: null, error: null });
      try {
        const response = await fetch("/api/fashlock-trends");
        const data = (await response.json()) as TrendsData & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Could not load trends");
        }
        window.localStorage.setItem(cacheKey, JSON.stringify(data));
        if (!cancelled) {
          setState({ status: "ready", data, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : "Could not load trends",
          });
        }
      }
    }

    void loadTrends();

    return () => {
      cancelled = true;
    };
  }, []);

  const data = state.data;
  if (state.status === "loading") {
    return <LoadingState className={className} />;
  }

  if (state.status === "error") {
    return (
      <main
        className={`${className ?? ""} flex min-h-screen items-center justify-center bg-[#FAF7F4] px-6 text-center text-[#2C2A27] [font-family:var(--font-fashlock-body)]`}
      >
        <div>
          <h1 className="text-4xl italic [font-family:var(--font-fashlock-display)]">
            Trends could not be loaded.
          </h1>
          <p className="mt-5 text-sm text-[#7A6F65]">{state.error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return <LoadingState className={className} />;
  }

  return (
    <div
      className={`${className ?? ""} min-h-screen bg-[#FAF7F4] text-[#2C2A27] [font-family:var(--font-fashlock-body)]`}
    >
      <main>
        <SeasonHero kind="trends" />

        <section className="px-6 py-20 md:px-[120px]">
          <h2 className="text-5xl italic leading-none [font-family:var(--font-fashlock-display)] md:text-6xl">
            Right Now
          </h2>
          <motion.div
            variants={gridVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="mt-12 grid gap-10 md:grid-cols-3"
          >
            {data.trends.slice(0, 6).map((trend) => (
              <TrendCardView key={trend.name} trend={trend} />
            ))}
          </motion.div>
        </section>

        <section className="px-6 py-20 md:px-[120px]">
          <h2 className="text-5xl italic leading-tight [font-family:var(--font-fashlock-display)] md:text-6xl">
            The Cycle
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#7A6F65]">
            Every trend has a moment. Here&apos;s where each one stands.
          </p>
          <div className="mt-14 grid gap-14 md:grid-cols-3">
            <VelocityColumn
              label="Rising"
              color="#4A7C59"
              marker="↑"
              items={data.velocity.rising}
            />
            <VelocityColumn
              label="Peaking"
              color="#B03A5B"
              marker="●"
              items={data.velocity.peaking}
            />
            <VelocityColumn
              label="Fading"
              color="#9E9087"
              marker="↓"
              items={data.velocity.fading}
            />
          </div>
        </section>

        <section className="px-6 py-20 md:px-[120px]">
          <h2 className="text-5xl italic leading-tight [font-family:var(--font-fashlock-display)] md:text-6xl">
            Around The World
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#7A6F65]">
            Six cities. Six moods. One season.
          </p>
          <div className="mt-12 flex snap-x gap-8 overflow-x-auto pb-6">
            {data.cities.map((city) => (
              <Link
                key={city.city}
                href={articleHref(`${city.city} street style fashion ${data.season} ${data.year}`)}
                className="group w-[300px] shrink-0 snap-start overflow-hidden rounded-[12px] bg-white md:w-[340px]"
              >
                <div className="h-[360px]">
                  <ImageBlock
                    src={city.image}
                    alt={`${city.city} street style`}
                    className="h-full transition duration-700 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="min-h-[168px] p-5">
                  <h3 className="text-[22px] leading-tight [font-family:var(--font-fashlock-display)]">
                    {city.city}
                  </h3>
                  <p className="mt-4 line-clamp-2 text-[13px] leading-6 text-[#7A6F65]">
                    {city.headline}
                  </p>
                  <span className="mt-5 inline-block border-b border-[#B03A5B] pb-1 text-sm text-[#B03A5B]">
                    Explore →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
