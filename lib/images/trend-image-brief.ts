import { createHash } from "crypto";
import { titleCaseTrend } from "@/lib/trends/keyword-normalization";

export const TREND_IMAGE_BRIEF_VERSION = "trend-concept-brief-v2";
export const TREND_IMAGE_PROMPT_VERSION = "trend-concept-prompt-v3";

export const COMPOSITION_MODES = [
  "macro texture",
  "top-down flat-lay",
  "suspended garment",
  "cropped construction detail",
  "sculptural draping",
  "ghost-form silhouette",
  "architectural product still-life",
  "asymmetric garment arrangement",
] as const;

export type CompositionMode = (typeof COMPOSITION_MODES)[number];

export type TrendImageBrief = {
  canonicalKeyword: string;
  displayName: string;
  visualSubject: string;
  category: string;
  materialFamily: string;
  materialDescription: string;
  compositionMode: CompositionMode;
  paletteFamily: string;
  constructionDetails: string[];
  requiredVisualCues: string[];
  forbiddenVisualCues: string[];
};

type BriefPreset = Omit<TrendImageBrief, "canonicalKeyword" | "displayName">;

const MATERIAL_REGISTRY: Record<string, string> = {
  vintage: "velvet, rayon, tweed or archival silk with believable age and fibre variation",
  graphic: "screen-printed cotton jersey, sturdy canvas or technical nylon with visible ink sitting on cloth",
  floral: "silk, chiffon or printed cotton with visible textile print registration",
  leather: "black, espresso or oxblood genuine leather with grain, edge highlights and realistic weight",
  loose: "crisp poplin, voile or flowing silk with airy folds and garment structure",
  baggy: "washed denim or structured twill with clear heavy-volume trouser construction",
  minimal: "structured wool, crepe or crisp poplin with reduced seams and restrained styling",
  denim: "authentic indigo denim twill with weave, fading and seam abrasion",
  washed: "washed blue denim twill with authentic fade variation and cotton texture",
  flared: "denim twill, suiting crepe or compact cotton with a visibly widening hem",
  maxi: "chiffon, satin or flowing crepe with long fluid drape",
  blazer: "worsted wool or suiting twill with lapels, darts, shoulder structure and crisp seams",
  tailored: "worsted wool or suiting twill with lapels, darts, pressed seams and sharp construction",
  cargo: "ripstop, canvas or waxed cotton with pocket flaps, tape seams and utilitarian hardware",
  utility: "ripstop, canvas or waxed cotton with functional pockets and hardware",
  oversized: "blue or white poplin, denim or wool with exaggerated scale and dropped shoulder structure",
  linen: "authentic flax slub with visible weave and natural irregularity",
  kurta: "handloom cotton or silk with neckline, placket, buttons, weave and Indian construction detail",
  trench: "cotton gabardine with storm flap, belt, topstitching and structured collar",
  layering: "contrasting materials such as jersey, wool, poplin, denim and technical nylon",
  streetwear: "heavyweight jersey, denim and technical nylon with modern streetwear finish",
  cropped: "crisp cotton, compact knit or suiting fabric with a visibly shortened hem",
  mini: "structured wool, denim or crepe with a clearly short mini length",
};

const PRESETS: Record<string, BriefPreset> = {
  floral: {
    visualSubject: "fashion textile or garment surface with visible floral print",
    category: "pattern_or_print",
    materialFamily: "printed silk/chiffon/cotton",
    materialDescription: MATERIAL_REGISTRY.floral,
    compositionMode: "macro texture",
    paletteFamily: "botanical colour with sophisticated contrast",
    constructionDetails: ["printed repeat", "fabric edge", "soft folds"],
    requiredVisualCues: ["visible floral print", "fashion textile", "repeat scale"],
    forbiddenVisualCues: ["bouquet", "loose flowers", "vase", "garden-only image"],
  },
  baggy: {
    visualSubject: "baggy trousers or denim with exaggerated wide volume",
    category: "silhouette_or_fit",
    materialFamily: "washed denim or structured twill",
    materialDescription: MATERIAL_REGISTRY.baggy,
    compositionMode: "ghost-form silhouette",
    paletteFamily: "washed indigo, slate or garment-dyed olive",
    constructionDetails: ["wide leg", "low volume folds", "belt loops", "side seams"],
    requiredVisualCues: ["exaggerated trouser volume", "wide proportions", "heavy fabric folds"],
    forbiddenVisualCues: ["slim fit", "leggings", "plain beige sheet"],
  },
  oversized: {
    visualSubject: "oversized shirt or jacket with dropped shoulders and extra-wide body",
    category: "silhouette_or_fit",
    materialFamily: "poplin, denim or wool",
    materialDescription: MATERIAL_REGISTRY.oversized,
    compositionMode: "suspended garment",
    paletteFamily: "blue poplin, cool white, charcoal or washed denim",
    constructionDetails: ["dropped shoulder", "wide body", "large sleeve", "overscale collar"],
    requiredVisualCues: ["oversized proportions", "recognizable garment", "extra fabric volume"],
    forbiddenVisualCues: ["regular slim shirt", "blanket", "curtain"],
  },
  tailored: {
    visualSubject: "tailored jacket or trouser construction detail",
    category: "construction",
    materialFamily: "worsted wool suiting",
    materialDescription: MATERIAL_REGISTRY.tailored,
    compositionMode: "cropped construction detail",
    paletteFamily: "charcoal, navy, stone or chocolate",
    constructionDetails: ["lapel", "dart", "pressed seam", "buttonhole", "structured shoulder"],
    requiredVisualCues: ["sharp seam", "tailored construction", "wool texture"],
    forbiddenVisualCues: ["soft jersey", "linen blanket", "unstructured tee"],
  },
  flared: {
    visualSubject: "trousers or denim with a visibly widening hem",
    category: "silhouette_or_fit",
    materialFamily: "denim or structured crepe",
    materialDescription: MATERIAL_REGISTRY.flared,
    compositionMode: "asymmetric garment arrangement",
    paletteFamily: "indigo, black, cream crepe or dark rinse denim",
    constructionDetails: ["knee-to-hem widening", "outer seam", "hem sweep"],
    requiredVisualCues: ["widening hem", "trouser or denim leg", "flare shape"],
    forbiddenVisualCues: ["straight leg", "embroidery-only detail", "skirt"],
  },
  graphic: {
    visualSubject: "screen-printed fashion textile or garment",
    category: "pattern_or_print",
    materialFamily: "screen-printed cotton or nylon",
    materialDescription: MATERIAL_REGISTRY.graphic,
    compositionMode: "cropped construction detail",
    paletteFamily: "higher-contrast ink on white, black, grey or saturated cloth",
    constructionDetails: ["ink edge", "ribbed collar", "stitched hem", "cotton grain"],
    requiredVisualCues: ["screen print", "garment surface", "fashion textile"],
    forbiddenVisualCues: ["poster", "abstract object", "readable letters", "logo"],
  },
  minimal: {
    visualSubject: "reduced fashion construction with clean lines and restrained styling",
    category: "aesthetic_or_mood",
    materialFamily: "structured wool, crepe or crisp poplin",
    materialDescription: MATERIAL_REGISTRY.minimal,
    compositionMode: "architectural product still-life",
    paletteFamily: "ivory, charcoal, navy, black or chocolate with restrained contrast",
    constructionDetails: ["clean seam", "hidden closure", "precise fold", "reduced silhouette"],
    requiredVisualCues: ["minimal construction", "sharp reduction", "premium material"],
    forbiddenVisualCues: ["plain beige T-shirt", "busy print", "extra ornament"],
  },
  loose: {
    visualSubject: "oversized lightweight white button-down shirt or unstructured tunic without a person",
    category: "silhouette_or_fit",
    materialFamily: "poplin, voile or silk",
    materialDescription: MATERIAL_REGISTRY.loose,
    compositionMode: "suspended garment",
    paletteFamily: "cool white, mist grey and very pale blue-grey",
    constructionDetails: ["collar", "button placket", "cuffs", "extra-wide body", "flowing sleeves"],
    requiredVisualCues: ["recognizable loose garment", "airiness", "movement", "loose volume"],
    forbiddenVisualCues: ["bedsheet", "curtain", "hammock", "interior textile", "beige garment against beige wall"],
  },
  kurta: {
    visualSubject: "edge-to-edge close study of kurta neckline, placket, weave and fabric",
    category: "indian_garment",
    materialFamily: "handloom cotton or silk",
    materialDescription: MATERIAL_REGISTRY.kurta,
    compositionMode: "cropped construction detail",
    paletteFamily: "deep indigo, muted maroon, forest green, restrained saffron or natural handloom",
    constructionDetails: ["neckline", "placket", "buttons", "weave", "handloom texture"],
    requiredVisualCues: ["kurta construction", "Indian garment detail", "fabric richness"],
    forbiddenVisualCues: ["poster layout", "caption panel", "typography", "letters", "symbols", "full beige garment"],
  },
  denim: {
    visualSubject: "authentic denim twill garment detail",
    category: "fabric_or_craft",
    materialFamily: "denim",
    materialDescription: MATERIAL_REGISTRY.denim,
    compositionMode: "macro texture",
    paletteFamily: "indigo and washed blue",
    constructionDetails: ["twill weave", "rivets", "topstitching", "fade"],
    requiredVisualCues: ["visible denim twill", "indigo cotton", "seam detail"],
    forbiddenVisualCues: ["linen", "smooth satin", "beige cotton sheet"],
  },
  washed: {
    visualSubject: "washed denim garment surface with authentic fading",
    category: "fabric_or_craft",
    materialFamily: "washed denim",
    materialDescription: MATERIAL_REGISTRY.washed,
    compositionMode: "macro texture",
    paletteFamily: "washed blue, faded indigo and pale abrasion",
    constructionDetails: ["fade", "whisker", "twill weave", "seam abrasion"],
    requiredVisualCues: ["washed effect", "denim twill", "authentic fading"],
    forbiddenVisualCues: ["plain cotton", "flat beige cloth"],
  },
  linen: {
    visualSubject: "linen garment or textile with authentic flax slub",
    category: "fabric_or_craft",
    materialFamily: "linen",
    materialDescription: MATERIAL_REGISTRY.linen,
    compositionMode: "macro texture",
    paletteFamily: "flax, white, ink, olive or natural handloom neutrals",
    constructionDetails: ["flax slub", "visible weave", "soft wrinkle"],
    requiredVisualCues: ["linen weave", "natural slub", "garment construction"],
    forbiddenVisualCues: ["plastic sheen", "flat polyester", "blanket-like fabric"],
  },
  leather: {
    visualSubject: "genuine leather garment construction detail with grain, seams and edge highlights",
    category: "fabric_or_craft",
    materialFamily: "genuine leather",
    materialDescription: MATERIAL_REGISTRY.leather,
    compositionMode: "architectural product still-life",
    paletteFamily: "black, oxblood, espresso or dark brown with controlled highlights",
    constructionDetails: ["leather grain", "edge highlight", "stitched seam", "material thickness"],
    requiredVisualCues: ["leather grain", "fashion garment detail", "realistic material weight"],
    forbiddenVisualCues: ["denim", "chambray", "cotton shirt", "plastic vinyl", "fake pebbled texture"],
  },
  trench: {
    visualSubject: "trench coat construction details in cotton gabardine",
    category: "classic_outerwear",
    materialFamily: "cotton gabardine",
    materialDescription: MATERIAL_REGISTRY.trench,
    compositionMode: "cropped construction detail",
    paletteFamily: "camel, olive or stone with contrasting backdrop",
    constructionDetails: ["storm flap", "belt", "epaulette", "topstitching"],
    requiredVisualCues: ["trench construction", "gabardine texture", "outerwear detail"],
    forbiddenVisualCues: ["sleeveless vest", "plain beige wall-only composition"],
  },
  utility: {
    visualSubject: "utility garment details with pockets and hardware",
    category: "aesthetic_or_mood",
    materialFamily: "ripstop canvas",
    materialDescription: MATERIAL_REGISTRY.utility,
    compositionMode: "architectural product still-life",
    paletteFamily: "olive, khaki, black, stone or waxed brown",
    constructionDetails: ["cargo pocket", "snap", "zip", "reinforced seam"],
    requiredVisualCues: ["functional pockets", "utility hardware", "structured fabric"],
    forbiddenVisualCues: ["plain shirt", "soft drapey beige cloth"],
  },
  layering: {
    visualSubject: "contrasting layered garment materials",
    category: "styling_system",
    materialFamily: "mixed materials",
    materialDescription: MATERIAL_REGISTRY.layering,
    compositionMode: "asymmetric garment arrangement",
    paletteFamily: "navy, grey, ivory, denim, black or muted green in layered contrast",
    constructionDetails: ["overlap", "collar stack", "hem stack", "texture contrast"],
    requiredVisualCues: ["visible layers", "contrasting materials", "overlap"],
    forbiddenVisualCues: ["single flat fabric", "identical beige pieces"],
  },
  cropped: {
    visualSubject: "cropped garment with clearly shortened hem",
    category: "silhouette_or_fit",
    materialFamily: "cotton, knit or suiting",
    materialDescription: MATERIAL_REGISTRY.cropped,
    compositionMode: "ghost-form silhouette",
    paletteFamily: "black, white, denim blue, grey or muted colour",
    constructionDetails: ["shortened hem", "waistline", "edge stitching"],
    requiredVisualCues: ["cropped length", "garment hem", "proportion shift"],
    forbiddenVisualCues: ["full-length garment", "random fabric rectangle"],
  },
  mini: {
    visualSubject: "mini skirt or mini dress length construction",
    category: "silhouette_or_fit",
    materialFamily: "structured wool, denim or crepe",
    materialDescription: MATERIAL_REGISTRY.mini,
    compositionMode: "asymmetric garment arrangement",
    paletteFamily: "black, ivory, indigo, charcoal or muted red",
    constructionDetails: ["short hem", "waistband", "zip or seam", "compact proportion"],
    requiredVisualCues: ["mini length", "short hem", "fashion garment"],
    forbiddenVisualCues: ["maxi length", "blank textile", "random small object"],
  },
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function deterministicIndex(keyword: string, salt: string, modulo: number) {
  const hash = createHash("sha256").update(`${salt}:${normalized(keyword)}`).digest("hex").slice(0, 8);
  return Number.parseInt(hash, 16) % modulo;
}

export function canonicalTrendKeyword(value: string) {
  return normalized(value);
}

export function trustedAliasesForKeyword(canonicalKeyword: string) {
  const aliases: Record<string, string[]> = {
    flared: ["flare", "flared leg", "bootcut"],
    oversized: ["oversize", "dropped shoulder"],
    loose: ["relaxed", "unstructured"],
    minimal: ["minimalist", "reduced"],
    washed: ["washed denim", "faded denim"],
    graphic: ["screen print", "printed"],
  };
  return aliases[canonicalKeyword] || [];
}

function fallbackBrief(canonicalKeyword: string): BriefPreset {
  const modes: CompositionMode[] = [
    "macro texture",
    "suspended garment",
    "cropped construction detail",
    "sculptural draping",
    "architectural product still-life",
    "asymmetric garment arrangement",
  ];
  const mode = modes[deterministicIndex(canonicalKeyword, "fallback-composition", modes.length)];
  return {
    visualSubject: `fashion garment or textile study representing ${canonicalKeyword}`,
    category: "aesthetic_or_mood",
    materialFamily: "keyword-appropriate fashion material",
    materialDescription: "realistic fibre detail, believable stitching, accurate seams, natural folds and material weight",
    compositionMode: mode,
    paletteFamily: "fashion-relevant colour family selected for the keyword, avoiding repetitive beige/taupe unless essential",
    constructionDetails: ["seam", "fold", "edge", "surface texture"],
    requiredVisualCues: [canonicalKeyword, "fashion material", "garment construction"],
    forbiddenVisualCues: ["non-fashion object", "typography", "logo", "watermark", "gibberish text"],
  };
}

export function buildTrendImageBrief(keyword: string): TrendImageBrief {
  const canonicalKeyword = canonicalTrendKeyword(keyword || "fashion trend");
  const preset = PRESETS[canonicalKeyword] || fallbackBrief(canonicalKeyword);
  return {
    canonicalKeyword,
    displayName: titleCaseTrend(canonicalKeyword),
    ...preset,
  };
}

export function briefToPromptSection(brief: TrendImageBrief) {
  return [
    `Structured TrendImageBrief version: ${TREND_IMAGE_BRIEF_VERSION}.`,
    `canonicalKeyword: ${brief.canonicalKeyword}`,
    `displayName: ${brief.displayName}`,
    `visualSubject: ${brief.visualSubject}`,
    `category: ${brief.category}`,
    `materialFamily: ${brief.materialFamily}`,
    `materialDescription: ${brief.materialDescription}`,
    `compositionMode: ${brief.compositionMode}`,
    `paletteFamily: ${brief.paletteFamily}`,
    `constructionDetails: ${brief.constructionDetails.join(", ")}`,
    `requiredVisualCues: ${brief.requiredVisualCues.join(", ")}`,
    `forbiddenVisualCues: ${brief.forbiddenVisualCues.join(", ")}`,
  ].join("\n");
}
