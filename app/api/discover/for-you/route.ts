import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";
import { getSupabaseClient, logSupabaseFallback, supabaseCache } from "@/lib/supabase";
import { lookLibrary } from "@/lib/look-library";
import { getTopTrendingKeywords, type TrendingKeyword } from "@/lib/trend-velocity";

export const dynamic = "force-dynamic";

const FOR_YOU_TTL_SECONDS = 60 * 60;
const FOR_YOU_CACHE_VERSION = "v2";

type Gender = "female" | "male";

type StyleProfile = {
  vibe?: string | null;
  style_personality?: string[] | null;
  colour_palette?: string[] | null;
};

function normalizeGender(value: string | null): Gender {
  return value === "male" ? "male" : "female";
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function normalizedKeyword(value: string) {
  return tokens(value).join(" ");
}

const KEYWORD_LOOK_ALIASES: Record<Gender, Record<string, string>> = {
  female: {
    mini: "female-mini-skirt-moment",
    "mini skirt": "female-mini-skirt-moment",
    "micro mini": "female-mini-skirt-moment",
    cargo: "female-bollywood-off-duty",
    "cargo pants": "female-bollywood-off-duty",
    utility: "female-bollywood-off-duty",
    linen: "female-linen-cafe-look",
    layering: "female-trench-coat-formula",
    layer: "female-trench-coat-formula",
  },
  male: {
    cargo: "male-cargo-utility-look",
    "cargo pants": "male-cargo-utility-look",
    utility: "male-cargo-utility-look",
    linen: "male-soft-linen-suit",
    layering: "male-overshirt-layer",
    layer: "male-overshirt-layer",
    "wide leg": "male-wide-leg-summer",
  },
};

function profileSignals(profile: StyleProfile | null) {
  if (!profile) return [];

  return [
    profile.vibe,
    ...(profile.style_personality || []),
    ...(profile.colour_palette || []),
  ]
    .filter((item): item is string => Boolean(item))
    .flatMap(tokens);
}

function rankForProfile(trends: TrendingKeyword[], signals: string[]) {
  const signalSet = new Set(signals);
  if (!signalSet.size) return trends;

  return trends
    .map((trend, index) => {
      const keywordTokens = tokens(trend.keyword);
      const profileBoost = keywordTokens.filter((token) => signalSet.has(token)).length;
      return { trend, index, profileBoost };
    })
    .sort((a, b) => b.profileBoost - a.profileBoost || b.trend.score - a.trend.score || a.index - b.index)
    .map(({ trend }) => trend);
}

function matchLook(keyword: string, gender: Gender) {
  const keywordTokens = tokens(keyword);
  if (!keywordTokens.length) return null;

  const aliasId = KEYWORD_LOOK_ALIASES[gender][normalizedKeyword(keyword)];
  const aliasLook = aliasId ? lookLibrary.find((look) => look.id === aliasId && look.gender === gender) : null;
  if (aliasLook) return { look: aliasLook, reason: "keyword-alias" };

  const matches = lookLibrary
    .filter((look) => look.gender === gender)
    .map((look, index) => {
      const searchableText = [
        look.title,
        look.trendCluster,
        look.feeling,
        look.whyNow,
        look.aesthetic,
        look.category,
        ...look.tags,
        ...look.pieces,
        ...look.colours,
        ...look.materials,
        ...look.shopTerms,
      ]
        .join(" ");
      const searchableTokens = new Set(tokens(searchableText));
      const titleTokens = new Set(tokens(look.title));
      const clusterTokens = new Set(tokens(look.trendCluster));

      const score = keywordTokens.reduce((total, token) => {
        if (!searchableTokens.has(token)) return total;
        if (clusterTokens.has(token)) return total + 4;
        if (titleTokens.has(token)) return total + 3;
        return total;
      }, 0);

      return { look, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const best = matches[0]?.look || null;
  return best ? { look: best, reason: "library-token-match" } : null;
}

async function getProfile(userId: string | null): Promise<StyleProfile | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from("style_profiles")
    .select("vibe,style_personality,colour_palette")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseFallback(error);
    return null;
  }

  return data as StyleProfile | null;
}

async function loadForYou(gender: Gender, userId: string | null) {
  const profile = await getProfile(userId);
  const trends = await getTopTrendingKeywords("IN", 12);
  const ranked = rankForProfile(trends, profileSignals(profile)).slice(0, 6);

  return {
    gender,
    personalized: Boolean(profile),
    trends: ranked.map((trend) => {
      const match = matchLook(trend.keyword, gender);
      const look = match?.look || null;

      console.info("Discover For You image match:", {
        keyword: trend.keyword,
        gender,
        lookId: look?.id || null,
        trendCluster: look?.trendCluster || null,
        heroImage: look?.heroImage || null,
        reason: match?.reason || "unmatched-trends-link",
      });

      return {
        keyword: trend.keyword,
        velocity: trend.velocity,
        ...(look?.heroImage ? { heroImage: look.heroImage } : {}),
        ...(look?.trendCluster ? { trendCluster: look.trendCluster } : {}),
        ...(look?.id ? { matchedLookId: look.id } : {}),
        imageSource: look?.heroImage ? `look-library:${look.id}:${match?.reason || "matched"}` : "none:trends-link",
      };
    }),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const gender = normalizeGender(url.searchParams.get("gender"));
    const userId = await getAuthenticatedUserId();
    const cacheKey = `${FOR_YOU_CACHE_VERSION}:for-you:${gender}:${userId || "anon"}`;
    const result = await supabaseCache(cacheKey, FOR_YOU_TTL_SECONDS, () => loadForYou(gender, userId));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Discover For You failed:", error);
    return NextResponse.json({ gender: "female", personalized: false, trends: [] });
  }
}
