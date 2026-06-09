import { NextResponse } from "next/server";
import { loadTrendsData } from "@/lib/data";
import { trendQuerySchema } from "@/lib/schemas";
import { logSupabaseFallback } from "@/lib/supabase";

function fallbackTrendsData() {
  return {
    trendRows: [
      { keyword: "linen", currentCount: 72, previousCount: 48, growthPercentage: 50, status: "Rising" },
      { keyword: "cargo", currentCount: 68, previousCount: 62, growthPercentage: 10, status: "Stable" },
      { keyword: "ballet flats", currentCount: 55, previousCount: 38, growthPercentage: 45, status: "Rising" },
    ],
    chart: [],
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = trendQuerySchema.parse({
      weeks: url.searchParams.get("weeks") ?? 6,
    });

    const data = await loadTrendsData(query.weeks);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logSupabaseFallback(error);
    return NextResponse.json({ success: true, data: fallbackTrendsData() });
  }
}
