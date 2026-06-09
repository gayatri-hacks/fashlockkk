import { NextResponse } from "next/server";

export const revalidate = 86400;

const designers = [
  "Coco Chanel",
  "Christian Dior",
  "Yves Saint Laurent",
  "Alexander McQueen",
  "Rei Kawakubo",
  "Miuccia Prada",
  "Virgil Abloh",
  "Jacquemus",
];

const fallbackMeta: Record<string, { legacy: string; aesthetic: string[]; era: string }> = {
  "Coco Chanel": { legacy: "She made ease look revolutionary and changed the female wardrobe forever.", aesthetic: ["clean", "liberated", "modern"], era: "1920s" },
  "Christian Dior": { legacy: "He restored fantasy to postwar fashion through the architecture of femininity.", aesthetic: ["cinched", "romantic", "grand"], era: "1940s" },
  "Yves Saint Laurent": { legacy: "He gave women the codes of power without taking away seduction.", aesthetic: ["sharp", "sensual", "left-bank"], era: "1960s" },
  "Alexander McQueen": { legacy: "He turned fashion into theatre, trauma, beauty, and myth.", aesthetic: ["dark", "sublime", "surgical"], era: "1990s" },
  "Rei Kawakubo": { legacy: "She taught fashion that beauty could be difficult, abstract, and unfinished.", aesthetic: ["abstract", "radical", "intellectual"], era: "1980s" },
  "Miuccia Prada": { legacy: "She made ugly chic, intelligent, and deeply desirable.", aesthetic: ["offbeat", "clever", "bourgeois"], era: "1990s" },
  "Virgil Abloh": { legacy: "He dissolved the wall between streetwear, luxury, and cultural authorship.", aesthetic: ["street", "graphic", "conceptual"], era: "2010s" },
  Jacquemus: { legacy: "He made minimalism feel sunlit, emotional, and cinematic.", aesthetic: ["sunny", "sensual", "minimal"], era: "2010s" },
};

async function pexelsImage(name: string) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const params = new URLSearchParams({ query: `${name} fashion`, per_page: "1", orientation: "portrait" });
    const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: key },
      next: { revalidate },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { photos?: Array<{ src?: { portrait?: string; large?: string; medium?: string } }> };
    return data.photos?.[0]?.src?.portrait ?? data.photos?.[0]?.src?.large ?? data.photos?.[0]?.src?.medium ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const items = await Promise.all(
    designers.map(async (name) => ({
      name,
      imageUrl: await pexelsImage(name),
      ...fallbackMeta[name],
    })),
  );
  return NextResponse.json({ designers: items });
}
