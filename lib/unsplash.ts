export type TrendGender = "Women" | "Men" | "Unisex";

export type TrendImage = {
  id: string;
  url: string;
  alt: string;
  credit?: string;
  creditUrl?: string;
};

const FALLBACK_PHOTOS = [
  "photo-1483985988355-763728e1935b",
  "photo-1496747611176-843222e1e57c",
  "photo-1503342217505-b0a15ec3261c",
  "photo-1506629905607-d9c297d1f5f8",
  "photo-1515886657613-9f3515b0c78f",
  "photo-1529139574466-a303027c1d8b",
  "photo-1539109136881-3be0616acf4b",
  "photo-1544441893-675973e31985",
  "photo-1558769132-cb1aea458c5e",
  "photo-1566206091558-7f218b696731",
  "photo-1591047139829-d91aecb6caea",
  "photo-1603252109303-2751441dd157",
];

function hashKeyword(value: string) {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}

export function cleanTrendKeyword(keyword: string) {
  return keyword.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildTrendImageQuery(keyword: string, gender: TrendGender | string = "Unisex") {
  const base = cleanTrendKeyword(keyword);
  const genderPhrase =
    gender === "Women"
      ? "women clothing product flat lay garment detail ecommerce"
      : gender === "Men"
        ? "men clothing product flat lay garment detail ecommerce"
        : "clothing product flat lay garment detail ecommerce";

  return `${base} ${genderPhrase}`;
}

export function fallbackTrendImages(keyword: string, count = 4): TrendImage[] {
  const start = hashKeyword(keyword) % FALLBACK_PHOTOS.length;

  return Array.from({ length: count }, (_, index) => {
    const id = FALLBACK_PHOTOS[(start + index) % FALLBACK_PHOTOS.length];
    return {
      id: `${id}-${index}`,
      url: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`,
      alt: `${cleanTrendKeyword(keyword)} fashion mood`,
      credit: "Unsplash",
      creditUrl: "https://unsplash.com",
    };
  });
}
