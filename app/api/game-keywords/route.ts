import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export const revalidate = 3600;

export async function GET() {
  const supabase = getSupabaseClient();
  if (!supabase) return NextResponse.json({ keywords: [] });

  const { data, error } = await supabase
    .from("trend_keywords")
    .select("keyword")
    .order("created_at", { ascending: false })
    .range(0, 19);

  if (error) return NextResponse.json({ keywords: [] });

  return NextResponse.json({ keywords: (data ?? []).map((row) => row.keyword).filter(Boolean) });
}
