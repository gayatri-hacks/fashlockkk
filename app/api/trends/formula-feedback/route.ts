import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";
import { getSupabaseClient } from "@/lib/supabase";

const bodySchema = z.object({ formulaId: z.string().uuid(), action: z.enum(["saved","not_for_me","wore_it","swapped_item","opened_in_laila"]), sessionId: z.string().max(200).optional(), metadata: z.record(z.unknown()).optional() });
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  const userId = await getAuthenticatedUserId(); const session = parsed.data.sessionId;
  if (!userId && !session) return NextResponse.json({ error: "Session required" }, { status: 401 });
  const supabase = getSupabaseClient(); if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const anonymous_session_hash = !userId ? createHash("sha256").update(`${process.env.FEEDBACK_HASH_SALT || "local"}:${session}`).digest("hex") : null;
  const { error } = await supabase.from("trend_formula_feedback").insert({ formula_id: parsed.data.formulaId, user_id: userId, anonymous_session_hash, action: parsed.data.action, metadata: parsed.data.metadata || {} });
  if (error) return NextResponse.json({ error: "Feedback unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
