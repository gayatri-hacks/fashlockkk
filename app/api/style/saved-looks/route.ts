import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

async function getAuthedClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { supabase: null, userId: null };
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, userId: user?.id || null };
}

export async function GET() {
  const { supabase, userId } = await getAuthedClient();

  if (!supabase || !userId) {
    return NextResponse.json({ savedLookIds: [], authenticated: false });
  }

  const { data, error } = await supabase
    .from("saved_looks")
    .select("look_id")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("saved looks fetch failed:", error.message);
    return NextResponse.json({ savedLookIds: [], authenticated: true });
  }

  return NextResponse.json({
    savedLookIds: (data || []).map((item) => item.look_id).filter(Boolean),
    authenticated: true,
  });
}

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthedClient();

  if (!supabase || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const lookId = typeof body.lookId === "string" ? body.lookId.trim() : "";
  const lookTitle = typeof body.lookTitle === "string" ? body.lookTitle.trim() : "";

  if (!lookId || !lookTitle) {
    return NextResponse.json({ error: "Missing lookId or lookTitle" }, { status: 400 });
  }

  const { error } = await supabase.from("saved_looks").upsert(
    {
      user_id: userId,
      look_id: lookId,
      look_title: lookTitle,
    },
    { onConflict: "user_id,look_id" },
  );

  if (error) {
    console.error("saved look insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true, lookId });
}

export async function DELETE(request: Request) {
  const { supabase, userId } = await getAuthedClient();

  if (!supabase || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const lookId = typeof body.lookId === "string" ? body.lookId.trim() : "";

  if (!lookId) {
    return NextResponse.json({ error: "Missing lookId" }, { status: 400 });
  }

  const { error } = await supabase.from("saved_looks").delete().eq("user_id", userId).eq("look_id", lookId);

  if (error) {
    console.error("saved look delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: false, lookId });
}
