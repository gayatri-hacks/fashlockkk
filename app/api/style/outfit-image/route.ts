import { NextResponse } from "next/server";
import { classifyStyleQuery } from "@/lib/style-query-classifier";

export const dynamic = "force-dynamic";

type SerperImage = {
  title?: string;
  imageUrl?: string;
  link?: string;
  source?: string;
  width?: number;
  height?: number;
  imageWidth?: number;
  imageHeight?: number;
};

const targetSites = {
  western:
    "site:vogue.it OR site:vogue.com OR site:elle.com OR site:harpersbazaar.com OR site:whowhatwear.com OR site:manrepeller.com OR site:net-a-porter.com OR site:matchesfashion.com",
  indian:
    "site:vogue.in OR site:elle.in OR site:grazia.in OR site:femina.in OR site:perniaspopupshop.com OR site:fdci.org OR site:lakmefashionweek.com",
  fusion: "site:vogue.fr OR site:vogue.com OR site:elle.fr OR site:lofficiel.com",
};

function imageWidth(image: SerperImage) {
  return Number(image.width || image.imageWidth || 0);
}

function imageHeight(image: SerperImage) {
  return Number(image.height || image.imageHeight || 0);
}

async function searchOutfitImage(query: string) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { images: [], classification: await classifyStyleQuery(query) };

  const classification = await classifyStyleQuery(query);
  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    body: JSON.stringify({
      q: `${query} ${targetSites[classification.type]}`,
      gl: classification.searchRegion,
      hl: "en",
      num: 10,
    }),
  });

  if (!response.ok) {
    console.error("Serper style outfit image failed:", response.status, await response.text());
    return { images: [], classification };
  }

  const data = (await response.json()) as { images?: SerperImage[] };
  const images = (data.images || [])
    .filter((image) => image.imageUrl && image.link)
    .filter((image) => imageWidth(image) >= 400 && imageHeight(image) >= 400)
    .filter((image) => !/\b(logo|icon|sprite|amazon|flipkart|meesho|snapdeal)\b/i.test(`${image.imageUrl} ${image.link} ${image.title || ""}`))
    .slice(0, 6)
    .map((image) => ({
      imageUrl: image.imageUrl,
      sourceUrl: image.link,
      title: image.title || "Editorial outfit image",
      source: image.source || "",
    }));

  return { images, classification };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || searchParams.get("query") || searchParams.get("shopTerm") || "";
  if (!query.trim()) return NextResponse.json({ images: [] });

  const result = await searchOutfitImage(query.trim());
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = typeof body.query === "string" ? body.query : typeof body.shopTerm === "string" ? body.shopTerm : "";
    if (!query.trim()) return NextResponse.json({ error: "Missing query" }, { status: 400 });

    const result = await searchOutfitImage(query.trim());
    return NextResponse.json(result);
  } catch (error) {
    console.error("Style outfit image route error:", error);
    return NextResponse.json({ images: [] });
  }
}
