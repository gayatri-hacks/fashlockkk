import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { createAuthServerClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authClient = await createAuthServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const profileKey = user?.id || sessionId;
    const productUrl = typeof body.productUrl === "string" ? body.productUrl : "";
    const message = typeof body.message === "string" ? body.message : "";

    if (!profileKey || !productUrl) {
      return NextResponse.json({ error: "Missing user/session or productUrl" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ ok: true, skipped: "Supabase not configured" });

    const { error } = await supabase.from("style_interactions").insert({
      session_id: profileKey,
      user_id: user?.id || null,
      message,
      product_url: productUrl,
      action: "shop_click",
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("style shop click log failed:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Style interaction route error:", error);
    return NextResponse.json({ error: "Failed to log style interaction" }, { status: 500 });
  }
}
