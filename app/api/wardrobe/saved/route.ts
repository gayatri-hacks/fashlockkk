import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

const USER_ID = "fashlock_user_1";

export async function GET() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ success: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const pageSize = 20;
  const { data, error } = await supabase
    .from("saved_outfits")
    .select("id, item_ids, occasion, gemini_feedback, created_at")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .range(0, pageSize - 1);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, outfits: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: "Supabase is not configured" }, { status: 500 });
    }

    const body = (await req.json()) as {
      itemIds?: string[];
      occasion?: string;
      geminiFeedback?: string;
    };

    if (!body.itemIds?.length) {
      return NextResponse.json({ success: false, error: "Missing itemIds" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("saved_outfits")
      .insert({
        user_id: USER_ID,
        item_ids: body.itemIds,
        occasion: body.occasion ?? null,
        gemini_feedback: body.geminiFeedback ?? null,
      })
      .select("id, item_ids, occasion, gemini_feedback, created_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, outfit: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ success: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase.from("saved_outfits").delete().eq("user_id", USER_ID).eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
