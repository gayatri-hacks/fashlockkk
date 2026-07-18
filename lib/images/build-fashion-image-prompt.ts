import { createHash } from "crypto";

export const FASHION_IMAGE_VARIANTS = ["trend_concept", "trend_hero", "trend_women", "trend_men", "deep_dive", "daily_edit"] as const;

export type FashionImageVariant = (typeof FASHION_IMAGE_VARIANTS)[number];
export type FashionImageEntityType = "trend";
export type TrendConceptCategory =
  | "silhouette_or_fit"
  | "fabric_or_craft"
  | "garment"
  | "pattern_or_print"
  | "colour"
  | "aesthetic_or_mood";

export type FashionImagePromptInput = {
  entityType: FashionImageEntityType;
  entityId: number;
  variant: FashionImageVariant;
  keyword: string;
  editorialName?: string | null;
  oneLiner?: string | null;
  howToWear?: string[] | null;
  outfitFormula?: string | null;
  outfitOccasion?: string | null;
  gender?: "women" | "men" | null;
  model: string;
  imageSize: string;
};

export function normalizeImagePrompt(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function syntheticTrendIdForKeyword(keyword: string) {
  const normalized = normalizeImagePrompt(keyword.toLowerCase()) || "fashion trend";
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  const id = Number(BigInt(`0x${hash}`) % 9000000000000n) + 1000000000;
  return -id;
}

const CONCEPT_CATEGORY_TERMS: Record<TrendConceptCategory, string[]> = {
  silhouette_or_fit: [
    "oversized",
    "loose",
    "boxy",
    "fitted",
    "cropped",
    "wide-leg",
    "wide leg",
    "barrel leg",
    "relaxed fit",
    "slouchy",
    "baggy",
    "tailored fit",
  ],
  fabric_or_craft: [
    "embroidered",
    "embroidery",
    "denim",
    "linen",
    "crochet",
    "satin",
    "sequined",
    "sequin",
    "knitted",
    "knit",
    "lace",
    "leather",
    "suede",
    "silk",
    "tweed",
    "mesh",
    "sheer",
  ],
  garment: [
    "trench",
    "kurta",
    "blazer",
    "corset",
    "polo",
    "cardigan",
    "shirt",
    "skirt",
    "dress",
    "jacket",
    "coat",
    "vest",
    "waistcoat",
    "trouser",
    "trousers",
    "jeans",
    "cargo",
    "chinos",
  ],
  pattern_or_print: [
    "striped",
    "stripe",
    "floral",
    "checked",
    "check",
    "plaid",
    "polka dot",
    "animal print",
    "leopard",
    "zebra",
    "gingham",
    "graphic",
  ],
  colour: [
    "sage green",
    "butter yellow",
    "burgundy",
    "cobalt blue",
    "cherry red",
    "powder blue",
    "baby pink",
    "cream",
    "ivory",
    "white",
    "black",
    "brown",
    "grey",
    "gray",
    "red",
    "blue",
    "green",
    "yellow",
    "pink",
    "purple",
    "orange",
  ],
  aesthetic_or_mood: [
    "old money",
    "quiet luxury",
    "coastal",
    "y2k",
    "bohemian",
    "boho",
    "minimal",
    "streetwear",
    "utility",
    "preppy",
    "romantic",
    "vintage",
    "western",
    "coquette",
  ],
};

function normalizedSearchText(value: string) {
  return normalizeImagePrompt(value.toLowerCase().replace(/[-_/]+/g, " "));
}

function includesConceptTerm(searchText: string, term: string) {
  const normalizedTerm = normalizedSearchText(term);
  return searchText === normalizedTerm || searchText.includes(` ${normalizedTerm} `);
}

export function classifyTrendConceptCategory(keyword: string, editorialName?: string | null): TrendConceptCategory {
  const searchText = ` ${normalizedSearchText([keyword, editorialName || ""].filter(Boolean).join(" "))} `;

  for (const category of Object.keys(CONCEPT_CATEGORY_TERMS) as TrendConceptCategory[]) {
    if (CONCEPT_CATEGORY_TERMS[category].some((term) => includesConceptTerm(searchText, term))) {
      return category;
    }
  }

  return "aesthetic_or_mood";
}

function trendConceptDirection(category: TrendConceptCategory, keyword: string) {
  if (category === "silhouette_or_fit") {
    return `Create a sculptural garment composition, ghost form or carefully draped garment that emphasizes the proportion, volume and shape of ${keyword}. Use negative space to make the silhouette instantly readable.`;
  }
  if (category === "fabric_or_craft") {
    return `Create a macro or close editorial study of ${keyword} texture, stitches, weave, embellishment and construction. Show tactile material detail with crisp focus and rich surface depth.`;
  }
  if (category === "garment") {
    return `Create an elevated product still-life or cropped study of the garment's most recognizable construction details for ${keyword}. Focus on seams, closures, lapels, plackets, hems, buttons, folds or hardware. Do not show a complete styled outfit.`;
  }
  if (category === "pattern_or_print") {
    return `Create a refined close-up or sculptural arrangement emphasizing the repeating ${keyword} pattern. Make the rhythm, scale and placement of the print the main subject.`;
  }
  if (category === "colour") {
    return `Create a monochromatic editorial composition using folded fabrics, fashion materials and subtle objects in the ${keyword} colour family. Keep the palette nuanced, premium and tonal.`;
  }
  return `Create a fashion-editorial still-life using garment fragments, materials and a small number of relevant objects to communicate the ${keyword} aesthetic. Avoid generic lifestyle stock photography.`;
}

function buildTrendConceptImagePrompt(input: FashionImagePromptInput) {
  const keyword = input.keyword.trim() || input.editorialName?.trim() || "fashion trend";
  const category = classifyTrendConceptCategory(keyword, input.editorialName);

  return [
    `Editorial fashion concept photograph representing the trend keyword "${keyword}".`,
    "",
    trendConceptDirection(category, keyword),
    "",
    `The image must clearly communicate ${keyword} through shape, proportion, texture, construction, pattern, colour or visual mood rather than through a person wearing an outfit.`,
    "",
    "Premium luxury fashion-magazine art direction, photorealistic materials, warm neutral studio setting, soft directional light, subtle realistic shadows, sophisticated minimal composition.",
    "",
    "Vertical 4:5 image designed for a fashion trend card. Keep the main subject in the centre or upper-middle of the frame and keep the lower portion visually clean enough for the card's title overlay.",
    "",
    "No person, no face, no body, no complete styled outfit, no runway scene, no text, no letters, no watermark, no logo, no brand marks, no collage and no product-advertisement layout.",
  ].join("\n");
}

function variantDirection(variant: FashionImageVariant) {
  if (variant === "trend_women") {
    return "Womenswear outfit, full body adult model, exact wearable styling, shoes visible, complete outfit visible from head to toe.";
  }
  if (variant === "trend_men") {
    return "Menswear outfit, full body adult model, exact wearable styling, shoes visible, complete outfit visible from head to toe.";
  }
  if (variant === "trend_hero") {
    return "Editorial hero look, full body adult fashion model, clear trend signal, complete outfit visible from head to toe, extra margin above head and below shoes.";
  }
  if (variant === "daily_edit") {
    return "Daytime wearable outfit, full body adult fashion model, practical styling, shoes visible.";
  }
  return "Deep-dive outfit reference, full body adult fashion model, every garment clearly visible.";
}

export function buildFashionImagePrompt(input: FashionImagePromptInput) {
  if (input.variant === "trend_concept") {
    return buildTrendConceptImagePrompt(input);
  }

  const name = input.editorialName?.trim() || input.keyword;
  const stylingNotes = (input.howToWear || []).filter(Boolean).slice(0, 4).join("; ");
  const outfitFormula = input.outfitFormula?.trim();
  const outfitOccasion = input.outfitOccasion?.trim();
  const genderDirection =
    input.gender === "men"
      ? "Use menswear proportions and styling."
      : input.gender === "women"
        ? "Use womenswear proportions and styling."
        : "";

  return [
    "Photorealistic premium fashion ecommerce lookbook image.",
    variantDirection(input.variant),
    genderDirection,
    `Trend keyword: ${input.keyword}.`,
    `Editorial trend name: ${name}.`,
    outfitOccasion ? `Occasion: ${outfitOccasion}.` : "",
    outfitFormula ? `Exact outfit formula to show: ${outfitFormula}. Every listed garment must be visible.` : "",
    input.oneLiner ? `Trend context: ${input.oneLiner}.` : "",
    stylingNotes ? `Styling direction: ${stylingNotes}.` : "",
    "Clean warm ivory studio background, natural pose, modern Indian/global fashion styling, no props.",
    "Full body framing: head, torso, legs, shoes, and feet must all be visible inside the image.",
    "Camera far enough back for the whole outfit. Do not crop the head, hem, shoes, or feet.",
    "No text, no logos, no watermark, no collage, no extra people, no cropped feet.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function createFashionPromptHash({
  prompt,
  model,
  imageSize,
  variant,
}: {
  prompt: string;
  model: string;
  imageSize: string;
  variant: FashionImageVariant;
}) {
  const normalized = normalizeImagePrompt([prompt, model, imageSize, variant].join("\n"));
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export function storagePathForFashionImage({
  entityId,
  variant,
  promptHash,
}: {
  entityId: number;
  variant: FashionImageVariant;
  promptHash: string;
}) {
  return `trends/${entityId}/${variant}/${promptHash}.png`;
}
