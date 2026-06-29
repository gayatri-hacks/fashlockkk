import { NextResponse } from "next/server";
import { clearSupabaseCache, getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from "@/lib/supabase";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

const arrayFields = new Set(["lifestyle", "style_personality", "colour_palette", "avoids", "colours_that_glow", "colours_to_avoid"]);

function cleanArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function cleanProfilePayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};

  for (const key of [
    "gender",
    "body_type",
    "skin_tone",
    "skin_undertone",
    "budget_range",
    "favourite_pieces",
    "vibe",
    "camilles_take",
    "current_outfit_read",
  ]) {
    if (typeof body[key] === "string") payload[key] = String(body[key]).trim();
  }

  for (const key of arrayFields) {
    if (key in body) payload[key] = cleanArray(body[key]);
  }

  if (typeof body.onboarding_complete === "boolean") {
    payload.onboarding_complete = body.onboarding_complete;
  }

  payload.updated_at = new Date().toISOString();
  return payload;
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const userId = await getAuthenticatedUserId();
  const sessionId = url.searchParams.get("sessionId")?.trim() || userId;

  if (!userId && !sessionId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ deleted: false, skipped: "Supabase not configured" });
  }

  const { error } = await supabase.from("style_profiles").delete().eq(userId ? "user_id" : "session_id", userId || sessionId);
  if (error) {
    if (isMissingStyleProfilesTable(error)) {
      return NextResponse.json({ deleted: false, migrationMissing: true });
    }
    console.error("style profile delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  clearSupabaseCache(`style-profile-route:${userId || sessionId}`);
  clearSupabaseCache(`style-profile:${userId || sessionId}`);

  return NextResponse.json({ deleted: true });
}

function isMissingStyleProfilesTable(error: { message?: string; code?: string }) {
  return (
    error.code === "42P01" ||
    /style_profiles/i.test(error.message || "") && /not find|does not exist|schema cache/i.test(error.message || "")
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = await getAuthenticatedUserId();
  const sessionId = url.searchParams.get("sessionId")?.trim() || userId;

  if (!userId && !sessionId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ profile: null, skipped: "Supabase not configured" });
  }

  const { data, error } = await supabaseCache<{ data: Record<string, unknown> | null; error: { message?: string; code?: string } | null }>(`style-profile-route:${userId || sessionId}`, supabaseCacheTtl("style_profiles"), async () => {
    const result = await supabase
      .from("style_profiles")
      .select("*")
      .eq(userId ? "user_id" : "session_id", userId || sessionId)
      .maybeSingle();
    return result as { data: Record<string, unknown> | null; error: { message?: string; code?: string } | null };
  });

  if (error) {
    if (isMissingStyleProfilesTable(error)) {
      console.error("style_profiles table is missing. Apply database/014_style_profiles.sql in Supabase SQL Editor.");
      return NextResponse.json({ profile: null, migrationMissing: true });
    }
    logSupabaseFallback(error);
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({ profile: data ?? null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = await getAuthenticatedUserId();
    const sessionId = userId || (typeof body.sessionId === "string" ? body.sessionId.trim() : "");

    if (!userId && !sessionId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ profile: null, skipped: "Supabase not configured" });
    }

    const payload = {
      session_id: sessionId,
      user_id: userId,
      ...cleanProfilePayload(body),
    };

    const { data, error } = await supabase
      .from("style_profiles")
      .upsert(payload, { onConflict: "session_id" })
      .select("*")
      .single();

    if (error) {
      if (isMissingStyleProfilesTable(error)) {
        console.error("style_profiles table is missing. Apply database/014_style_profiles.sql in Supabase SQL Editor.");
        return NextResponse.json({ profile: payload, migrationMissing: true });
      }
      console.error("style profile upsert failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    clearSupabaseCache(`style-profile-route:${userId || sessionId}`);
    clearSupabaseCache(`style-profile:${userId || sessionId}`);

    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error("Style profile route error:", error);
    return NextResponse.json({ error: "Failed to save style profile" }, { status: 500 });
  }
}
