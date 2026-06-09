"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type GeneratedArticle = {
  version?: number;
  text: string;
  sources: string[];
  sourceUrls?: string[];
  imageUrl: string | null;
};

type ArticleState =
  | { status: "loading"; article: null; error: null }
  | { status: "ready"; article: GeneratedArticle; error: null }
  | { status: "error"; article: null; error: string };

function paragraphize(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getTopicFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("topic")?.trim() ?? "";
}

const ARTICLE_CACHE_VERSION = 2;

export function FashlockArticleEngine({ className }: { className?: string }) {
  const [topic, setTopic] = useState("");
  const [state, setState] = useState<ArticleState>({
    status: "loading",
    article: null,
    error: null,
  });

  useEffect(() => {
    const currentTopic = getTopicFromUrl();
    setTopic(currentTopic);

    if (!currentTopic) {
      setState({
        status: "error",
        article: null,
        error: "Missing article topic. Open /article?topic=The Sari as a fashion language",
      });
      return;
    }

    const cacheKey = `article_v${ARTICLE_CACHE_VERSION}_${currentTopic}`;
    const cached = window.localStorage.getItem(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached) as GeneratedArticle;
        if (parsed.version === ARTICLE_CACHE_VERSION && parsed.text?.length > 900) {
          setState({
            status: "ready",
            article: parsed,
            error: null,
          });
          return;
        }
        window.localStorage.removeItem(cacheKey);
      } catch {
        window.localStorage.removeItem(cacheKey);
      }
    }

    let cancelled = false;

    async function generateArticle() {
      setState({ status: "loading", article: null, error: null });
      try {
        const response = await fetch(`/api/article-engine?topic=${encodeURIComponent(currentTopic)}`);
        const data = (await response.json()) as GeneratedArticle & { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Could not generate article");
        }

        const article = {
          version: ARTICLE_CACHE_VERSION,
          text: data.text,
          sources: data.sources ?? [],
          sourceUrls: data.sourceUrls ?? [],
          imageUrl: data.imageUrl ?? null,
        };

        window.localStorage.setItem(cacheKey, JSON.stringify(article));
        if (!cancelled) {
          setState({ status: "ready", article, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            article: null,
            error: error instanceof Error ? error.message : "Could not generate article",
          });
        }
      }
    }

    void generateArticle();

    return () => {
      cancelled = true;
    };
  }, []);

  const paragraphs = useMemo(
    () => (state.article ? paragraphize(state.article.text) : []),
    [state.article],
  );

  if (state.status === "loading") {
    return (
      <main
        className={`${className ?? ""} flex min-h-screen items-center justify-center bg-[#FAF7F4] px-6 text-center text-[#2C2A27] [font-family:var(--font-fashlock-body)]`}
      >
        <div>
          <h1 className="text-4xl italic leading-tight [font-family:var(--font-fashlock-display)]">
            {topic || "Preparing your article"}
          </h1>
          <motion.div
            animate={{ width: [40, 120, 40], opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto mt-7 h-px bg-[#B03A5B]"
          />
          <p className="mt-6 text-[13px] text-[#7A6F65]">Researching across the web...</p>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main
        className={`${className ?? ""} min-h-screen bg-[#FAF7F4] px-6 py-10 text-[#2C2A27] [font-family:var(--font-fashlock-body)]`}
      >
        <Link href="/discover" className="text-sm text-[#B03A5B]">
          ← Back
        </Link>
        <div className="mx-auto mt-28 max-w-xl text-center">
          <h1 className="text-4xl italic [font-family:var(--font-fashlock-display)]">
            Article could not be written.
          </h1>
          <p className="mt-5 text-sm leading-7 text-[#7A6F65]">{state.error}</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${className ?? ""} min-h-screen bg-[#FAF7F4] text-[#2C2A27] [font-family:var(--font-fashlock-body)]`}
    >
      <div className="px-6 py-6 md:px-[120px]">
        <Link href="/discover" className="text-sm text-[#B03A5B]">
          ← Back
        </Link>
      </div>

      <div className="h-[60vh] w-full overflow-hidden bg-white">
        {state.article.imageUrl ? (
          <img
            src={state.article.imageUrl}
            alt={topic}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white text-[11px] uppercase tracking-[0.28em] text-[#7A6F65]">
            FASHLOCK
          </div>
        )}
      </div>

      <article className="mx-auto max-w-[680px] px-6 py-16 md:px-0">
        <h1 className="text-[38px] italic leading-tight [font-family:var(--font-fashlock-display)]">
          {topic}
        </h1>
        <div className="mt-6 h-px w-10 bg-[#B03A5B]" />

        <div className="mt-12 space-y-7 text-[18px] leading-[1.9] text-[#2C2A27]">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="mt-16 border-t border-[#2C2A27]/10 pt-8">
          <span className="text-[12px] uppercase tracking-[0.18em] text-[#7A6F65]">
            Research drawn from
          </span>
          <div className="mt-4 flex flex-wrap gap-3">
            {state.article.sources.map((source, index) => {
              const url = state.article?.sourceUrls?.[index];
              const pill = (
                <span className="rounded-full bg-white px-4 py-2 text-[12px] text-[#7A6F65]">
                  {source}
                </span>
              );

              return url ? (
                <a key={`${source}-${index}`} href={url} target="_blank" rel="noreferrer">
                  {pill}
                </a>
              ) : (
                <span key={`${source}-${index}`}>{pill}</span>
              );
            })}
          </div>
        </div>
      </article>
    </main>
  );
}
