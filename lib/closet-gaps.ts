import { lookLibrary } from "@/lib/look-library";

export const WARDROBE_CATEGORIES = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories"] as const;

export type WardrobeCategory = (typeof WARDROBE_CATEGORIES)[number];

export type WardrobeItem = {
  id: string;
  image_url: string;
  category: WardrobeCategory | string;
  color: string | null;
  name: string | null;
  tags: string[] | null;
  created_at: string | null;
};

export type ClosetGapResult = {
  missingCategory: WardrobeCategory;
  unlockedLookCount: number;
  unlockedLookTitles: string[];
  unlockedLookColours: string[];
  sampleShopTerms: string[];
};

const CATEGORY_ORDER: WardrobeCategory[] = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories"];

const CATEGORY_KEYWORDS: Array<{ category: WardrobeCategory; keywords: string[] }> = [
  {
    category: "Dresses",
    keywords: ["dress", "gown", "kaftan"],
  },
  {
    category: "Bags",
    keywords: ["bag", "tote", "clutch", "purse", "satchel", "crossbody"],
  },
  {
    category: "Shoes",
    keywords: ["shoe", "shoes", "loafers", "sneakers", "trainers", "heels", "boots", "flats", "sandals", "mules", "slingbacks"],
  },
  {
    category: "Outerwear",
    keywords: ["jacket", "coat", "blazer", "cardigan", "overshirt", "trench", "shacket", "waistcoat", "vest"],
  },
  {
    category: "Bottoms",
    keywords: ["trousers", "pants", "jeans", "skirt", "shorts", "denim", "leggings", "chinos", "joggers", "cargo", "lehenga"],
  },
  {
    category: "Tops",
    keywords: ["top", "shirt", "tee", "t-shirt", "tank", "turtleneck", "blouse", "kurta", "polo", "sweater", "jumper", "corset", "camisole"],
  },
];

function isWardrobeCategory(value: string | null | undefined): value is WardrobeCategory {
  return WARDROBE_CATEGORIES.includes(value as WardrobeCategory);
}

export function categorizePieceText(piece: string): WardrobeCategory {
  const text = piece.toLowerCase();
  const match = CATEGORY_KEYWORDS.find(({ keywords }) =>
    keywords.some((keyword) => new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)),
  );

  return match?.category || "Accessories";
}

function uniqueLimited(values: string[], limit: number) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

export function computeClosetGaps(wardrobeItems: WardrobeItem[], gender: "female" | "male"): ClosetGapResult | null {
  if (wardrobeItems.length < 3) return null;

  const ownedCategoryCounts = CATEGORY_ORDER.reduce(
    (counts, category) => {
      counts[category] = 0;
      return counts;
    },
    {} as Record<WardrobeCategory, number>,
  );

  wardrobeItems.forEach((item) => {
    if (isWardrobeCategory(item.category)) {
      ownedCategoryCounts[item.category] += 1;
    }
  });

  const ownedCategories = new Set(
    CATEGORY_ORDER.filter((category) => ownedCategoryCounts[category] > 0),
  );

  const gaps = new Map<WardrobeCategory, typeof lookLibrary>();

  lookLibrary
    .filter((look) => look.gender === gender)
    .forEach((look) => {
      const neededCategories = new Set(look.pieces.map(categorizePieceText));
      const missingCategories = Array.from(neededCategories).filter((category) => !ownedCategories.has(category));

      if (missingCategories.length === 1) {
        const missingCategory = missingCategories[0];
        gaps.set(missingCategory, [...(gaps.get(missingCategory) || []), look]);
      }
    });

  const best = Array.from(gaps.entries())
    .filter(([, looks]) => looks.length > 0)
    .sort(([categoryA, looksA], [categoryB, looksB]) => {
      const countDelta = looksB.length - looksA.length;
      if (countDelta !== 0) return countDelta;

      const ownedDelta = ownedCategoryCounts[categoryA] - ownedCategoryCounts[categoryB];
      if (ownedDelta !== 0) return ownedDelta;

      return CATEGORY_ORDER.indexOf(categoryA) - CATEGORY_ORDER.indexOf(categoryB);
    })[0];

  if (!best) return null;

  const [missingCategory, looks] = best;

  return {
    missingCategory,
    unlockedLookCount: looks.length,
    unlockedLookTitles: uniqueLimited(
      looks.map((look) => look.title),
      6,
    ),
    unlockedLookColours: uniqueLimited(
      looks.flatMap((look) => look.colours),
      5,
    ),
    sampleShopTerms: uniqueLimited(
      looks.slice(0, 2).flatMap((look) => look.shopTerms),
      3,
    ),
  };
}
