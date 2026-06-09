import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSeasonHero() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring fashion editorial florals light minimal";
  if (month >= 5 && month <= 7) return "summer fashion editorial sun linen minimal elegant";
  if (month >= 8 && month <= 10) return "autumn fashion editorial warm tones coat minimal";
  return "winter fashion editorial dark coat minimal elegant";
}

export async function GET() {
  const key = process.env.PEXELS_API_KEY;
  const heroKeyword = getSeasonHero();

  if (!key) {
    return NextResponse.json({ heroKeyword, heroImage: null });
  }

  try {
    const params = new URLSearchParams({
      query: heroKeyword,
      per_page: "10",
      orientation: "landscape",
    });
    const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: key },
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      return NextResponse.json({ heroKeyword, heroImage: null });
    }

    const data = (await response.json()) as {
      photos?: Array<{
        width?: number;
        height?: number;
        src?: { original?: string; large2x?: string; landscape?: string; large?: string };
      }>;
    };
    const heroImage = (data.photos ?? [])
      .sort((a, b) => ((b.width ?? 0) * (b.height ?? 0)) - ((a.width ?? 0) * (a.height ?? 0)))[0]
      ?.src?.original ??
      (data.photos ?? [])[0]?.src?.large2x ??
      (data.photos ?? [])[0]?.src?.landscape ??
      (data.photos ?? [])[0]?.src?.large ??
      null;

    return NextResponse.json({ heroKeyword, heroImage });
  } catch {
    return NextResponse.json({ heroKeyword, heroImage: null });
  }
}
