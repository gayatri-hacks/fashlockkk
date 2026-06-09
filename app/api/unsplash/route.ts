import { NextResponse } from "next/server";
import { fallbackTrendImages, type TrendImage } from "@/lib/unsplash";

const CACHE_SECONDS = 21600;

export const revalidate = 21600;

type UnsplashResult = {
  id: string;
  alt_description?: string | null;
  description?: string | null;
  urls?: {
    regular?: string;
    small?: string;
  };
  user?: {
    name?: string;
    links?: {
      html?: string;
    };
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "fashion editorial street style";
  const count = Math.min(6, Math.max(1, Number(url.searchParams.get("count") ?? 4)));
  const fallback = fallbackTrendImages(query, count);
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    return NextResponse.json({ images: fallback, fallback: true });
  }

  try {
    const params = new URLSearchParams({
      query,
      per_page: String(count),
      orientation: "portrait",
      content_filter: "high",
    });

    const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
      },
      next: { revalidate: CACHE_SECONDS },
    });

    if (!response.ok) {
      return NextResponse.json({ images: fallback, fallback: true });
    }

    const payload = (await response.json()) as { results?: UnsplashResult[] };
    const images: TrendImage[] = (payload.results ?? [])
      .map((item) => ({
        id: item.id,
        url: item.urls?.regular ?? item.urls?.small ?? "",
        alt: item.alt_description ?? item.description ?? `${query} fashion mood`,
        credit: item.user?.name,
        creditUrl: item.user?.links?.html,
      }))
      .filter((item) => item.url);

    return NextResponse.json({
      images: images.length > 0 ? images : fallback,
      fallback: images.length === 0,
    });
  } catch {
    return NextResponse.json({ images: fallback, fallback: true });
  }
}
