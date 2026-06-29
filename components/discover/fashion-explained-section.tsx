"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type FashionExplainedArticle = {
  slug: string;
  title: string;
  subtitle: string;
  cover_image_url: string | null;
  category: string;
  reading_time: number;
  matchedArchetypes: string[];
};

type FashionExplainedPayload = {
  personalized: boolean;
  articles: FashionExplainedArticle[];
};

function FashionExplainedSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-[240px] animate-pulse rounded-sm bg-[#EEE5DC]" />
      ))}
    </div>
  );
}

function VisualBlock({ article }: { article: FashionExplainedArticle }) {
  if (article.cover_image_url) {
    return (
      <img
        src={article.cover_image_url}
        alt=""
        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-end bg-[linear-gradient(135deg,#2C2418,#BFA898_48%,#F4DCE4)] p-4">
      <p className="max-w-[160px] text-[10px] uppercase tracking-[4px] text-[#FAF7F4]/80">
        {article.category}
      </p>
    </div>
  );
}

export function FashionExplainedSection() {
  const [payload, setPayload] = useState<FashionExplainedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadFashionExplained() {
      try {
        const response = await fetch("/api/discover/fashion-explained", { cache: "no-store" });
        if (!response.ok) throw new Error("Fashion Explained unavailable");
        const data = (await response.json()) as FashionExplainedPayload;
        if (!cancelled) setPayload(data);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFashionExplained();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || (!loading && !payload?.articles.length)) return null;

  return (
    <section className="border-y border-[#E8DCD2] bg-[#F7F1EA] px-5 py-12 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-[9px] font-[200] uppercase tracking-[5px] text-[#B03A5B]">
              {payload?.personalized ? "CURATED FOR YOUR STYLE" : "FASHION EXPLAINED"}
            </p>
            <h2 className="max-w-2xl text-[34px] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)] md:text-[46px]">
              The ideas behind the clothes
            </h2>
          </div>
          <p className="max-w-sm text-sm font-[300] leading-6 text-[#8C7B6E]">
            Short editorial guides on fashion history, style psychology, and the culture behind what people wear.
          </p>
        </div>

        {loading ? (
          <FashionExplainedSkeleton />
        ) : (
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
            className="grid gap-5 md:grid-cols-3"
          >
            {payload?.articles.map((article, index) => (
              <motion.article
                key={article.slug}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className={cn(
                  "group overflow-hidden border border-[#E4D7CC] bg-[#FAF7F4]",
                  index === 0 ? "md:col-span-2" : "",
                )}
              >
                <Link href={`/discover/article/${article.slug}`} className="block h-full">
                  <div className={cn("overflow-hidden", index === 0 ? "h-[260px]" : "h-[180px]")}>
                    <VisualBlock article={article} />
                  </div>
                  <div className="p-5">
                    <div className="mb-4 flex items-center justify-between gap-3 text-[9px] uppercase tracking-[3px] text-[#B03A5B]">
                      <span>{article.category}</span>
                      <span>{article.reading_time} min</span>
                    </div>
                    <h3 className="text-[25px] italic leading-[1.05] text-[#2C2418] [font-family:var(--font-fashlock-display)]">
                      {article.title}
                    </h3>
                    <p className="mt-4 line-clamp-3 text-sm font-[300] leading-6 text-[#75685F]">
                      {article.subtitle}
                    </p>
                    {article.matchedArchetypes.length ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {article.matchedArchetypes.slice(0, 3).map((archetype) => (
                          <span
                            key={archetype}
                            className="rounded-full bg-[#F4DCE4] px-3 py-1 text-[9px] uppercase tracking-[2px] text-[#B03A5B]"
                          >
                            {archetype}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </motion.article>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}
