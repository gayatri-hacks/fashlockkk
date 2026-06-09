"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Clock, Play, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type {
  DiscoverEditorialData,
  EditorialArticle,
  MicroDocumentary,
  StyleArchetype,
  StyleQuizQuestion,
} from "@/lib/discover-editorial";
import { cn } from "@/lib/utils";

type StyleProfile = {
  user_id: string;
  primary_archetype: StyleArchetype;
  secondary_archetype: StyleArchetype | null;
  preferred_colors: string[];
  preferred_eras: string[];
  preferred_moods: string[];
};

const PROFILE_KEY = "fashiontrend:discover-profile:v2";
const USER_KEY = "fashiontrend:anon-user-id:v1";
function getBrowserUserId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(USER_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(USER_KEY, next);
  return next;
}

function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function readLocalProfile(): StyleProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(PROFILE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveLocalProfile(profile: StyleProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}:${String(rest).padStart(2, "0")}` : `${minutes} min`;
}

function trackEvent(event: {
  event_type: string;
  article_id?: string;
  video_id?: string;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const user_id = getBrowserUserId();
  supabase.from("personalization_events").insert({
    user_id,
    article_id: event.article_id ?? null,
    video_id: event.video_id ?? null,
    event_type: event.event_type,
  }).then(() => {});
}

function articleMatches(article: EditorialArticle, profile: StyleProfile | null) {
  if (!profile) return article.is_featured;
  return article.archetypes.includes(profile.primary_archetype);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-300/70">
      {children}
    </p>
  );
}

function promptTokens(prompt: string) {
  return prompt
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9-]/gi, "").trim())
    .filter(Boolean)
    .slice(0, 9);
}

function EditorialFallback({
  title,
  category,
  mood,
  visualPrompt,
  variant = "gradient",
}: {
  title: string;
  category: string;
  mood: string;
  visualPrompt?: string;
  variant?: "collage" | "typography" | "gradient" | "image";
}) {
  const tokens = promptTokens(visualPrompt ?? `${category} ${mood} editorial fashion`);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#121012]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(244,114,182,0.22),transparent_30%),radial-gradient(circle_at_84%_78%,rgba(179,146,82,0.18),transparent_30%),linear-gradient(135deg,#080708,#1a1517_45%,#09090b)]" />
      {variant === "collage" && (
        <>
          <div className="absolute left-8 top-8 h-32 w-24 rotate-[-7deg] border border-rose-200/25 bg-rose-100/10" />
          <div className="absolute right-10 top-16 h-40 w-28 rotate-6 border border-white/15 bg-white/10" />
          <div className="absolute bottom-12 left-16 h-28 w-40 rotate-3 border border-amber-200/20 bg-amber-200/10" />
        </>
      )}
      <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-3">
        <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-200 backdrop-blur">
          {category}
        </span>
        <span className="rounded-full border border-rose-200/20 bg-rose-200/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-rose-100">
          {mood}
        </span>
      </div>
      <div className="absolute inset-x-5 bottom-5">
        <p className="text-[11px] uppercase tracking-[0.32em] text-rose-200/70">Editorial direction</p>
        <h3 className="mt-2 max-w-sm text-3xl font-semibold leading-[0.96] text-white">{title}</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {tokens.map((token) => (
            <span key={`${title}-${token}`} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300">
              {token}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroVideo({ hero, onStart }: { hero: DiscoverEditorialData["hero"]; onStart: () => void }) {
  if (!hero) {
    return (
      <section className="flex min-h-[80vh] items-end rounded-lg border border-white/10 bg-zinc-950 p-6 text-white">
        <div>
          <SectionLabel>Discover</SectionLabel>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-none md:text-7xl">
            Enter the fashion world.
          </h1>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-[88vh] overflow-hidden rounded-lg border border-white/10 bg-zinc-950 text-white shadow-2xl">
      <video
        className="absolute inset-0 h-full w-full object-cover opacity-60"
        src={hero.video_url}
        poster={hero.poster_image_url}
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(244,114,182,0.18),transparent_34%),linear-gradient(to_top,rgba(0,0,0,0.96),rgba(0,0,0,0.38),rgba(0,0,0,0.72))]" />
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative flex min-h-[88vh] flex-col justify-end px-5 py-8 sm:px-8 lg:px-12 lg:py-12"
      >
        <SectionLabel>Discover / enter the world</SectionLabel>
        <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.92] tracking-tight sm:text-6xl lg:text-8xl">
          {hero.title}
        </h1>
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,680px)_auto] lg:items-end lg:justify-between">
          <p className="max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
            {hero.subtitle}
          </p>
          <a
            href={hero.cta_link}
            onClick={onStart}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-rose-300/30 bg-rose-300 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-rose-200"
          >
            <Sparkles className="h-4 w-4" />
            {hero.cta_text}
          </a>
        </div>
      </motion.div>
    </section>
  );
}

function ArticleCard({ article, featured = false }: { article: EditorialArticle; featured?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const useImage = Boolean(article.cover_image_url) && !imageFailed && article.image_strategy === "image";

  return (
    <motion.article
      layout
      whileHover={{ y: -4 }}
      className={cn(
        "group overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] text-white shadow-2xl shadow-black/20",
        featured && "md:col-span-2",
      )}
    >
      <button
        type="button"
        onClick={() => trackEvent({ event_type: "article_view", article_id: article.id })}
        className="block w-full text-left"
      >
        <div className="relative overflow-hidden" style={{ aspectRatio: featured ? "16/10" : "4/5" }}>
          {useImage ? (
            <img
              src={article.cover_image_url ?? ""}
              alt=""
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-105"
            />
          ) : (
            <EditorialFallback
              title={article.title}
              category={article.category}
              mood={article.mood}
              visualPrompt={article.visual_prompt}
              variant={article.image_strategy}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-200 backdrop-blur">
              {article.category}
            </span>
            {article.is_featured && (
              <span className="rounded-full bg-rose-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-950">
                Featured
              </span>
            )}
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
            <span>{article.author}</span>
            <span className="h-1 w-1 rounded-full bg-zinc-600" />
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {article.reading_time} min
            </span>
          </div>
          <h3 className={cn("font-display font-semibold leading-tight text-zinc-50", featured ? "text-3xl" : "text-2xl")}>
            {article.title}
          </h3>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-300">{article.subtitle}</p>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-500">{article.content_excerpt}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {article.archetypes.slice(0, 3).map((tag) => (
              <span key={`${article.id}-${tag}`} className="rounded-full border border-white/10 px-3 py-1 text-xs text-rose-100/80">
                {tag}
              </span>
            ))}
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
              {article.mood}
            </span>
          </div>
        </div>
      </button>
    </motion.article>
  );
}

function MicroDocumentaries({ docs }: { docs: MicroDocumentary[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionLabel>Micro documentaries</SectionLabel>
          <h2 className="mt-2 text-3xl font-semibold text-zinc-50 md:text-5xl">60-second style films</h2>
        </div>
        <p className="hidden max-w-sm text-right text-sm leading-6 text-zinc-500 sm:block">
          Short vertical reels for origin stories, style shifts, and fast cultural context.
        </p>
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3">
        {docs.map((doc) => (
          <DocumentaryCard key={doc.id} doc={doc} />
        ))}
      </div>
    </section>
  );
}

function DocumentaryCard({ doc }: { doc: MicroDocumentary }) {
  const [imageFailed, setImageFailed] = useState(false);
  const useImage = Boolean(doc.thumbnail_url) && !imageFailed && doc.image_strategy === "image";

  return (
    <motion.button
      whileHover={{ y: -4 }}
      onClick={() => trackEvent({ event_type: "video_watch", video_id: doc.id })}
      className="group relative h-[440px] w-[250px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.05] text-left"
    >
      {useImage ? (
        <img
          src={doc.thumbnail_url ?? ""}
          alt=""
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-105"
        />
      ) : (
        <EditorialFallback
          title={doc.title}
          category={doc.category}
          mood="60 sec"
          visualPrompt={doc.visual_prompt}
          variant={doc.image_strategy ?? "typography"}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white backdrop-blur">{doc.category}</span>
        <span className="rounded-full bg-rose-300 px-3 py-1 text-xs font-semibold text-zinc-950">
          {formatDuration(doc.duration_seconds)}
        </span>
      </div>
      <div className="absolute inset-x-4 bottom-4">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-zinc-950">
          <Play className="h-5 w-5 fill-current" />
        </span>
        <h3 className="text-2xl font-semibold leading-tight text-white">{doc.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-300">{doc.description}</p>
      </div>
    </motion.button>
  );
}

function StyleMood({ mood }: { mood: DiscoverEditorialData["weeklyMood"] }) {
  if (!mood) return null;

  return (
    <section className="grid gap-6 rounded-lg border border-white/10 bg-white/[0.045] p-5 text-white md:p-7 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <SectionLabel>Style mood of the week</SectionLabel>
        <h2 className="mt-3 text-4xl font-semibold leading-tight md:text-5xl">{mood.title}</h2>
        <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400">{mood.description}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {[...mood.textures, ...mood.keywords].slice(0, 8).map((item) => (
            <span key={item} className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
              {item}
            </span>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          {mood.colors.map((color) => (
            <span key={color} className="h-10 w-10 rounded-full border border-white/20" style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(mood.image_board_urls.length ? mood.image_board_urls : ["", "", "", ""]).map((url, index) => (
          <div
            key={`${url || mood.title}-${index}`}
            className={cn("overflow-hidden rounded-lg", index === 0 && "col-span-2 row-span-2")}
          >
            {url ? (
              <img src={url} alt="" className="h-full min-h-[160px] w-full object-cover" />
            ) : (
              <EditorialFallback
                title={mood.keywords[index] ?? mood.title}
                category="Moodboard"
                mood={mood.textures[index] ?? "texture"}
                visualPrompt={`${mood.title} ${mood.keywords.join(" ")} ${mood.textures.join(" ")}`}
                variant={index % 2 === 0 ? "collage" : "gradient"}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function QuizModal({
  questions,
  onComplete,
}: {
  questions: StyleQuizQuestion[];
  onComplete: (profile: StyleProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [colors, setColors] = useState<string[]>([]);
  const [eras, setEras] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);

  useEffect(() => {
    if (!readLocalProfile()) setOpen(true);
  }, []);

  const question = questions[index];

  function choose(option: StyleQuizQuestion["options"][number]) {
    const nextScores = {
      ...scores,
      [option.archetype]: (scores[option.archetype] ?? 0) + 1,
    };
    setScores(nextScores);
    setColors((prev) => Array.from(new Set([...prev, ...(option.colors ?? [])])));
    setEras((prev) => Array.from(new Set([...prev, ...(option.eras ?? [])])));
    setMoods((prev) => Array.from(new Set([...prev, ...(option.moods ?? [])])));

    if (index < questions.length - 1) {
      setIndex((value) => value + 1);
      return;
    }

    const sorted = Object.entries(nextScores).sort((a, b) => b[1] - a[1]);
    const profile: StyleProfile = {
      user_id: getBrowserUserId(),
      primary_archetype: (sorted[0]?.[0] as StyleArchetype) ?? "Minimalist",
      secondary_archetype: (sorted[1]?.[0] as StyleArchetype) ?? null,
      preferred_colors: colors,
      preferred_eras: eras,
      preferred_moods: moods,
    };
    saveLocalProfile(profile);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      supabase.from("user_style_profiles").upsert(profile, { onConflict: "user_id" }).then(() => {});
      supabase.from("personalization_events").insert({
        user_id: profile.user_id,
        event_type: "quiz_completion",
      }).then(() => {});
    }
    onComplete(profile);
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && question && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur"
        >
          <motion.div
            initial={{ scale: 0.96, y: 18 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 18 }}
            className="w-full max-w-2xl rounded-lg border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <SectionLabel>First launch style quiz</SectionLabel>
                <h2 className="mt-2 text-3xl font-semibold">{question.question}</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Question {index + 1} of {questions.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-white/10 p-2 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3">
              {question.options.map((option) => (
                <button
                  key={`${question.id}-${option.label}`}
                  onClick={() => choose(option)}
                  className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-left text-zinc-100 transition hover:border-rose-300/50 hover:bg-rose-300/10"
                >
                  <span className="text-lg font-semibold">{option.label}</span>
                  <span className="ml-3 text-xs uppercase tracking-[0.18em] text-rose-200/70">
                    {option.archetype}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DiscoverExperience({ data }: { data: DiscoverEditorialData }) {
  const [profile, setProfile] = useState<StyleProfile | null>(null);

  useEffect(() => {
    setProfile(readLocalProfile());
  }, []);

  const sortedArticles = useMemo(
    () =>
      [...data.articles].sort((a, b) => {
        if (a.is_featured !== b.is_featured) return Number(b.is_featured) - Number(a.is_featured);
        return new Date(b.published_date).getTime() - new Date(a.published_date).getTime();
      }),
    [data.articles],
  );

  const forYou = sortedArticles.filter((article) => articleMatches(article, profile));
  const romantic = sortedArticles.filter((article) => article.archetypes.includes("Romantic"));
  const psychology = sortedArticles.filter((article) => article.category.toLowerCase().includes("psychology"));
  const channels = Array.from(new Set(sortedArticles.map((article) => article.category))).slice(0, 8);
  const visibleForYou = forYou.length ? forYou : sortedArticles.filter((article) => article.is_featured);

  return (
    <div className="-mx-4 -my-6 min-h-screen bg-[#080708] px-4 py-4 text-zinc-100 sm:-mx-6 lg:-mx-8">
      <div className="mx-auto max-w-7xl space-y-14">
        <HeroVideo hero={data.hero} onStart={() => document.getElementById("style-quiz")?.scrollIntoView({ behavior: "smooth" })} />

        <section id="style-quiz" className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <SectionLabel>Your style profile</SectionLabel>
            <h2 className="mt-2 text-3xl font-semibold text-white">
              {profile ? `${profile.primary_archetype} with ${profile.secondary_archetype ?? "an evolving"} edge` : "Take the first-launch quiz"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Your archetype shapes the editorials, moodboards, and micro films that rise to the top.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              window.localStorage.removeItem(PROFILE_KEY);
              setProfile(null);
              window.location.reload();
            }}
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 hover:border-rose-300/50 hover:text-white"
          >
            Retake quiz
          </button>
        </section>

        <section className="space-y-4">
          <SectionLabel>Editorial rooms</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {channels.map((channel) => (
              <div key={channel} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <p className="text-sm font-semibold text-zinc-100">{channel}</p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  {sortedArticles.filter((article) => article.category === channel).length} pieces
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div>
            <SectionLabel>Personalised for you</SectionLabel>
            <h2 className="mt-2 text-4xl font-semibold text-white md:text-6xl">
              {profile ? `For the ${profile.primary_archetype}` : "Featured editorial picks"}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {visibleForYou.slice(0, 5).map((article, index) => (
              <ArticleCard key={article.id} article={article} featured={index === 0} />
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div>
            <SectionLabel>For the Romantic</SectionLabel>
            <h2 className="mt-2 text-4xl font-semibold text-white md:text-6xl">Softness with a spine</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {romantic.slice(0, 8).map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>

        <MicroDocumentaries docs={data.microDocs} />

        <StyleMood mood={data.weeklyMood} />

        <section className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <SectionLabel>Editorial infinite scroll</SectionLabel>
              <h2 className="mt-2 text-4xl font-semibold text-white md:text-6xl">Read the world</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-zinc-500">
              Featured stories appear first, followed by the newest capsules and deep dives.
            </p>
          </div>
          <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
            {sortedArticles.map((article) => (
              <div key={article.id} className="mb-4 break-inside-avoid">
                <ArticleCard article={article} />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5 pb-20">
          <div>
            <SectionLabel>Psychology x style</SectionLabel>
            <h2 className="mt-2 text-4xl font-semibold text-white md:text-6xl">Dangerously readable</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {psychology.map((article) => (
              <motion.article
                key={article.id}
                whileHover={{ y: -3 }}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-5"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-rose-200/70">{article.mood} / {article.era}</p>
                <h3 className="mt-3 text-3xl font-semibold leading-tight text-white">{article.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{article.subtitle}</p>
                <div className="mt-5 flex items-center justify-between text-sm text-zinc-500">
                  <span>{article.reading_time} min read</span>
                  <button
                    type="button"
                    onClick={() => trackEvent({ event_type: "save", article_id: article.id })}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 hover:border-rose-300/40 hover:text-white"
                  >
                    <Bookmark className="h-4 w-4" />
                    Save
                  </button>
                </div>
              </motion.article>
            ))}
          </div>
        </section>
      </div>

      <QuizModal questions={data.quizQuestions} onComplete={setProfile} />
    </div>
  );
}
