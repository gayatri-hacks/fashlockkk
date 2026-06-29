import { NextResponse } from "next/server";
import { seedArticles } from "@/lib/discover-seeds";
import type { StyleArchetype } from "@/lib/discover-editorial";
import { mapProfileToArchetypes } from "@/lib/style-archetype-mapping";
import { getSupabaseClient, logSupabaseFallback, supabaseCache } from "@/lib/supabase";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

type StyleProfileRow = {
  vibe?: string | null;
  style_personality?: string[] | null;
  colour_palette?: string[] | null;
};

async function getProfileArchetypes(userId: string | null) {
  if (!userId) return [] as StyleArchetype[];

  const supabase = getSupabaseClient();
  if (!supabase) return [] as StyleArchetype[];

  const { data, error } = await supabase
    .from("style_profiles")
    .select("vibe, style_personality, colour_palette")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseFallback(error);
    return [] as StyleArchetype[];
  }

  return mapProfileToArchetypes(data as StyleProfileRow | null);
}

function rankArticles(profileArchetypes: StyleArchetype[]) {
  return seedArticles
    .map((article, index) => {
      const matchedArchetypes = article.archetypes.filter((archetype) => profileArchetypes.includes(archetype));
      return { article, index, matchedArchetypes };
    })
    .sort((a, b) => {
      const overlap = b.matchedArchetypes.length - a.matchedArchetypes.length;
      if (overlap !== 0) return overlap;
      if (a.article.is_featured !== b.article.is_featured) return a.article.is_featured ? -1 : 1;
      return a.index - b.index;
    })
    .slice(0, 6)
    .map(({ article, matchedArchetypes }) => ({
      slug: article.slug,
      title: article.title,
      subtitle: article.subtitle,
      cover_image_url: article.cover_image_url,
      category: article.category,
      reading_time: article.reading_time,
      matchedArchetypes,
    }));
}

export async function GET() {
  const userId = await getAuthenticatedUserId();
  const cacheKey = `fashion-explained:${userId || "anon"}`;

  const payload = await supabaseCache(cacheKey, 21600, async () => {
    const profileArchetypes = await getProfileArchetypes(userId);
    return {
      personalized: profileArchetypes.length > 0,
      articles: rankArticles(profileArchetypes),
    };
  });

  return NextResponse.json(payload);
}
