import { createHash } from "crypto";
import {
  briefToPromptSection,
  buildTrendImageBrief,
  TREND_IMAGE_PROMPT_VERSION,
} from "@/lib/images/trend-image-brief";

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
export type TrendConceptCompositionMode =
  | "macro texture"
  | "top-down flat-lay"
  | "suspended garment"
  | "suspended fabric"
  | "sculptural draping"
  | "ghost-form silhouette"
  | "cropped construction detail"
  | "architectural product still-life"
  | "asymmetric garment arrangement";

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
    "chikankari",
    "kantha",
    "zardozi",
    "handloom",
  ],
  garment: [
    "trench",
    "kurta",
    "sari",
    "saree",
    "lehenga",
    "dupatta",
    "anarkali",
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

function conceptCompositionDirection(mode: TrendConceptCompositionMode) {
  const directions: Record<TrendConceptCompositionMode, string> = {
    "macro texture":
      "Composition mode: macro texture. Use a close camera, shallow depth of field and tactile surface detail so the material fills the frame with varied focus.",
    "top-down flat-lay":
      "Composition mode: top-down flat-lay. Arrange garments, fabric swatches or construction details from above with refined negative space and an intentional product-photography layout.",
    "suspended garment":
      "Composition mode: suspended garment. Let a recognizable garment hang, float or arc through the frame with visible air, movement and asymmetry.",
    "suspended fabric":
      "Composition mode: suspended fabric. Let fabric hang, float or arc through the frame with visible air, movement and asymmetry instead of a static centred garment.",
    "sculptural draping":
      "Composition mode: sculptural draping. Shape the material into dimensional folds, curves and volume, like an elegant atelier study of silhouette.",
    "ghost-form silhouette":
      "Composition mode: ghost-form silhouette. Shape the garment as if on an invisible body or dress form, with no person visible, so the silhouette and garment volume are unmistakable.",
    "cropped construction detail":
      "Composition mode: cropped construction detail. Frame the neckline, placket, seam, button, pocket, hem, weave or closure closely so craftsmanship becomes the subject.",
    "architectural product still-life":
      "Composition mode: architectural product still-life. Stage the garment or detail with structured shadows, clean planes and a premium product-photography sense of form.",
    "asymmetric garment arrangement":
      "Composition mode: asymmetric garment arrangement. Place the garment off-centre with deliberate negative space, angled folds and an editorial still-life sense of movement.",
  };

  return directions[mode];
}

const TREND_CONCEPT_ANTI_TEXT =
  "Create only an edge-to-edge fashion photograph. No poster layout, no magazine page, no footer, no caption area, no title bar, no border, no graphic panel, no typography, no letters, no numbers, no symbols, no imitation writing, no label, no watermark, no logo and no brand marks anywhere in the image. No sewn neck tags, no inner collar labels, no care tags, no brand tabs and no fake garment labels. If an inner neckline or collar is visible, it must be plain uninterrupted fabric with no tag patch, no red mark, no black mark and no letter-like details. The website will add all interface text separately.";

function buildTrendConceptImagePrompt(input: FashionImagePromptInput) {
  const keyword = input.keyword.trim() || "fashion trend";
  const brief = buildTrendImageBrief(keyword);

  return [
    `Premium editorial fashion product photography representing canonical trend keyword "${brief.canonicalKeyword}".`,
    `Prompt version: ${TREND_IMAGE_PROMPT_VERSION}.`,
    "",
    briefToPromptSection(brief),
    "",
    conceptCompositionDirection(brief.compositionMode as TrendConceptCompositionMode),
    `Subject treatment: ${brief.visualSubject}.`,
    `Material direction: ${brief.materialDescription}. Require photorealistic fibre detail, believable stitching, accurate seams, natural folds and realistic material weight. Reject plasticky, blanket-like, melted or low-detail fabric.`,
    `Palette direction: ${brief.paletteFamily}.`,
    `Construction details to make visible: ${brief.constructionDetails.join(", ")}.`,
    `Required visual cues: ${brief.requiredVisualCues.join(", ")}.`,
    `Forbidden visual cues: ${brief.forbiddenVisualCues.join(", ")}.`,
    "",
    `The image must clearly communicate ${brief.canonicalKeyword} through shape, proportion, texture, construction, pattern, colour or visual mood rather than through a person wearing an outfit.`,
    "",
    "Premium editorial fashion product photography, photorealistic materials, soft editorial lighting, subtle realistic shadows, elegant styling and sophisticated composition. Allow the backdrop, palette and composition to vary by trend while staying premium.",
    "",
    "Vertical 4:5 edge-to-edge product photograph with consistent premium framing. Keep the lower portion visually calm enough for the website overlay when possible, but never create a built-in text area or graphic panel.",
    "",
    TREND_CONCEPT_ANTI_TEXT,
    "No person, no face, no body, no complete styled outfit, no runway scene, no collage and no product-advertisement layout.",
  ]
    .filter(Boolean)
    .join("\n");
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
