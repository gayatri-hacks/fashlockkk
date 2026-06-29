import { NextResponse } from "next/server";
import { computeClosetGaps, type WardrobeItem } from "@/lib/closet-gaps";
import { polishClosetCopy } from "@/lib/closet-copy";
import { getSupabaseClient, hasFreshSupabaseCache, logSupabaseFallback, supabaseCache } from "@/lib/supabase";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

const CLOSET_GAPS_TTL_SECONDS = 6 * 60 * 60;

type ClosetGapsReadyResponse = {
  authenticated: true;
  status: "ready";
  missingCategory: string;
  unlockedLookCount: number;
  copy: string;
  shopTerms: string[];
};

async function loadClosetGaps(userId: string): Promise<ClosetGapsReadyResponse | { authenticated: true; status: "insufficient_data"; itemCount: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { authenticated: true, status: "insufficient_data", itemCount: 0 };
  }

  const { data: items, error: itemsError } = await supabase
    .from("wardrobe_items")
    .select("id, image_url, category, color, name, tags, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (itemsError) {
    logSupabaseFallback(itemsError);
    return { authenticated: true, status: "insufficient_data", itemCount: 0 };
  }

  const wardrobeItems = (items || []) as WardrobeItem[];
  if (wardrobeItems.length < 3) {
    return { authenticated: true, status: "insufficient_data", itemCount: wardrobeItems.length };
  }

  const { data: profile, error: profileError } = await supabase
    .from("style_profiles")
    .select("gender")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    logSupabaseFallback(profileError);
  }

  const gender = profile?.gender === "male" ? "male" : "female";
  const result = computeClosetGaps(wardrobeItems, gender);

  if (!result) {
    return { authenticated: true, status: "insufficient_data", itemCount: wardrobeItems.length };
  }

  const copy = await polishClosetCopy(result);
  console.log("Discover closet gaps copy source:", copy.source);

  return {
    authenticated: true,
    status: "ready",
    missingCategory: result.missingCategory,
    unlockedLookCount: result.unlockedLookCount,
    copy: copy.text,
    shopTerms: result.sampleShopTerms,
  };
}

export async function GET() {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ authenticated: false });
  }

  const cacheKey = `closet-gaps:${userId}`;
  const cacheHit = hasFreshSupabaseCache(cacheKey);
  const result = await supabaseCache(cacheKey, CLOSET_GAPS_TTL_SECONDS, () => loadClosetGaps(userId));
  console.log("Discover closet gaps cache hit:", cacheHit);

  return NextResponse.json(result);
}
