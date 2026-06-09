import { seedArticles, seedHero, seedMicroDocs, seedQuizQuestions, seedWeeklyMood } from "@/lib/discover-seeds";
import { getSupabaseClient } from "@/lib/supabase";
import { unstable_cache } from "next/cache";

export type StyleArchetype =
  | "Romantic"
  | "Minimalist"
  | "Avant-Garde"
  | "Street Muse"
  | "Classic"
  | "Bohemian";

export type SourceType = "original" | "editorial" | "curated";
export type ImageStrategy = "image" | "collage" | "typography" | "gradient";

export type HeroVideo = {
  id: string;
  title: string;
  subtitle: string;
  video_url: string;
  poster_image_url: string;
  cta_text: string;
  cta_link: string;
  is_active: boolean;
  active_from: string | null;
  active_to: string | null;
};

export type EditorialArticle = {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  cover_image_url: string | null;
  category: string;
  tags: string[];
  archetypes: StyleArchetype[];
  reading_time: number;
  author: string;
  published_date: string;
  mood: string;
  era: string;
  region: string;
  culture_reference: string;
  visual_prompt: string;
  content_excerpt: string;
  content: string;
  full_content: string;
  source_type: SourceType;
  image_strategy: ImageStrategy;
  is_featured: boolean;
};

export type MicroDocumentary = {
  id: string;
  title: string;
  description: string;
  video_url: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  category: string;
  tags: string[];
  archetypes: StyleArchetype[];
  visual_prompt?: string;
  image_strategy?: ImageStrategy;
};

export type StyleQuizQuestion = {
  id: string;
  question: string;
  options: Array<{
    label: string;
    archetype: StyleArchetype;
    colors?: string[];
    eras?: string[];
    moods?: string[];
  }>;
};

export type StyleMoodWeekly = {
  id: string;
  week_start: string;
  title: string;
  description: string;
  colors: string[];
  textures: string[];
  keywords: string[];
  image_board_urls: string[];
  linked_articles: string[];
};

export type DiscoverEditorialData = {
  hero: HeroVideo | null;
  articles: EditorialArticle[];
  microDocs: MicroDocumentary[];
  quizQuestions: StyleQuizQuestion[];
  weeklyMood: StyleMoodWeekly | null;
};

function fallbackData(): DiscoverEditorialData {
  return {
    hero: seedHero,
    articles: seedArticles,
    microDocs: seedMicroDocs,
    quizQuestions: seedQuizQuestions,
    weeklyMood: seedWeeklyMood,
  };
}

async function loadDiscoverEditorialDataUncached(): Promise<DiscoverEditorialData> {
  const supabase = getSupabaseClient();
  if (!supabase) return fallbackData();

  const now = new Date().toISOString();
  const [heroResult, articleResult, microDocResult, quizResult, moodResult] = await Promise.all([
    supabase
      .from("hero_videos")
      .select("id, title, subtitle, video_url, poster_image_url, cta_text, cta_link, is_active, active_from, active_to")
      .eq("is_active", true)
      .or(`active_from.is.null,active_from.lte.${now}`)
      .or(`active_to.is.null,active_to.gte.${now}`)
      .order("active_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("editorial_articles")
      .select("id, title, subtitle, slug, cover_image_url, category, tags, archetypes, reading_time, author, published_date, mood, era, region, culture_reference, visual_prompt, content_excerpt, source_type, image_strategy, is_featured")
      .order("is_featured", { ascending: false })
      .order("published_date", { ascending: false })
      .range(0, 11),
    supabase
      .from("micro_documentaries")
      .select("id, title, description, video_url, thumbnail_url, duration_seconds, category, tags, archetypes, visual_prompt, image_strategy")
      .order("duration_seconds", { ascending: true })
      .range(0, 5),
    supabase
      .from("style_quiz_questions")
      .select("id, question, options")
      .range(0, 11),
    supabase
      .from("style_mood_weekly")
      .select("id, week_start, title, description, colors, textures, keywords, image_board_urls, linked_articles")
      .lte("week_start", new Date().toISOString().slice(0, 10))
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const fallback = fallbackData();
  const remoteArticles = articleResult.data as Partial<EditorialArticle>[] | null;
  const remoteMicroDocs = microDocResult.data as Partial<MicroDocumentary>[] | null;
  const remoteMood = moodResult.data as Partial<StyleMoodWeekly> | null;
  const hasUpgradedArticles = Boolean(
    remoteArticles?.length &&
      remoteArticles.every((article) => article.visual_prompt && article.content_excerpt && article.source_type),
  );
  const hasUpgradedMicroDocs = Boolean(
    remoteMicroDocs?.length &&
      remoteMicroDocs.every((doc) => doc.visual_prompt && doc.image_strategy),
  );
  const hasUpgradedMood = Boolean(
    remoteMood?.title === fallback.weeklyMood?.title &&
      remoteMood?.image_board_urls &&
      remoteMood.image_board_urls.length === 0,
  );

  return {
    hero: (heroResult.data as HeroVideo | null) ?? fallback.hero,
    articles: hasUpgradedArticles ? (remoteArticles as EditorialArticle[]) : fallback.articles,
    microDocs: hasUpgradedMicroDocs ? (remoteMicroDocs as MicroDocumentary[]) : fallback.microDocs,
    quizQuestions: (quizResult.data as StyleQuizQuestion[] | null)?.length
      ? (quizResult.data as StyleQuizQuestion[])
      : fallback.quizQuestions,
    weeklyMood: hasUpgradedMood ? (remoteMood as StyleMoodWeekly) : fallback.weeklyMood,
  };
}

export const loadDiscoverEditorialData = unstable_cache(loadDiscoverEditorialDataUncached, ["discover-editorial-v2"], {
  revalidate: 900,
  tags: ["discover", "editorial"],
});
