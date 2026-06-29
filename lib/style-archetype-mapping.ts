import type { StyleArchetype } from "@/lib/discover-editorial";

type StyleProfileLike = {
  vibe?: string | null;
  style_personality?: string[] | null;
  colour_palette?: string[] | null;
};

const ARCHETYPE_KEYWORDS: Record<StyleArchetype, string[]> = {
  Romantic: [
    "romantic",
    "romance",
    "soft",
    "feminine",
    "coquette",
    "dreamy",
    "delicate",
    "sensual",
    "blush",
    "lace",
    "ribbon",
    "pearl",
    "drape",
    "chiffon",
  ],
  Minimalist: [
    "minimal",
    "minimalist",
    "minimalism",
    "quiet",
    "clean",
    "restrained",
    "capsule",
    "simple",
    "sleek",
    "understated",
    "ivory",
    "charcoal",
    "monochrome",
    "neutral",
  ],
  "Avant-Garde": [
    "avant",
    "avant-garde",
    "experimental",
    "sculptural",
    "architectural",
    "edgy",
    "asymmetrical",
    "conceptual",
    "dramatic",
    "artful",
    "futuristic",
  ],
  "Street Muse": [
    "street",
    "streetwear",
    "off-duty",
    "sneaker",
    "denim",
    "cargo",
    "oversized",
    "urban",
    "y2k",
    "sporty",
    "utility",
    "casual",
  ],
  Classic: [
    "classic",
    "polished",
    "tailored",
    "tailoring",
    "timeless",
    "elegant",
    "refined",
    "structured",
    "preppy",
    "heritage",
    "chic",
    "blazer",
    "black",
  ],
  Bohemian: [
    "bohemian",
    "boho",
    "earthy",
    "craft",
    "handcrafted",
    "vintage",
    "eclectic",
    "free",
    "fringe",
    "suede",
    "crochet",
    "embroidered",
    "handloom",
    "artisanal",
    "terracotta",
  ],
};

const ARCHETYPE_ORDER = Object.keys(ARCHETYPE_KEYWORDS) as StyleArchetype[];

export function mapProfileToArchetypes(profile: StyleProfileLike | null | undefined): StyleArchetype[] {
  if (!profile) return [];

  const profileText = [
    profile.vibe,
    ...(profile.style_personality ?? []),
    ...(profile.colour_palette ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!profileText.trim()) return [];

  return ARCHETYPE_ORDER.filter((archetype) =>
    ARCHETYPE_KEYWORDS[archetype].some((keyword) => profileText.includes(keyword)),
  );
}

export const styleArchetypeKeywordMap = ARCHETYPE_KEYWORDS;
