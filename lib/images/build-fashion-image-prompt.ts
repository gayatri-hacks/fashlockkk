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
export type TrendConceptCompositionMode =
  | "macro texture"
  | "top-down flat-lay"
  | "suspended garment"
  | "suspended fabric"
  | "sculptural draping"
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

function deterministicConceptIndex(keyword: string, salt: string, modulo: number) {
  const normalized = normalizedSearchText(keyword) || "fashion trend";
  const hash = createHash("sha256").update(`${salt}:${normalized}`).digest("hex").slice(0, 8);
  return Number.parseInt(hash, 16) % modulo;
}

function matchesAnyConceptTerm(keyword: string, terms: string[]) {
  const searchText = ` ${normalizedSearchText(keyword)} `;
  return terms.some((term) => includesConceptTerm(searchText, term));
}

function isLooseConcept(keyword: string) {
  return matchesAnyConceptTerm(keyword, ["loose"]);
}

function isKurtaConcept(keyword: string) {
  return matchesAnyConceptTerm(keyword, ["kurta"]);
}

function keywordColourPalette(keyword: string) {
  const normalizedKeyword = normalizedSearchText(keyword);
  const colourTerms = CONCEPT_CATEGORY_TERMS.colour.map((term) => normalizedSearchText(term));
  const matchingColour = colourTerms.find((term) => normalizedKeyword === term);
  if (!matchingColour) return null;

  return `Palette family: nuanced tonal variations of ${keyword}, sophisticated and fashion-relevant rather than randomly bright.`;
}

function isIndianConcept(keyword: string) {
  return matchesAnyConceptTerm(keyword, [
    "kurta",
    "sari",
    "saree",
    "lehenga",
    "dupatta",
    "anarkali",
    "chikankari",
    "kantha",
    "zardozi",
    "handloom",
  ]);
}

function conceptCompositionMode(category: TrendConceptCategory, keyword: string): TrendConceptCompositionMode {
  const normalizedKeyword = normalizedSearchText(keyword);

  if (isLooseConcept(normalizedKeyword) || matchesAnyConceptTerm(normalizedKeyword, ["oversized", "slouchy"])) {
    return "suspended garment";
  }
  if (isKurtaConcept(normalizedKeyword)) {
    return "cropped construction detail";
  }

  const categoryModes: Record<TrendConceptCategory, TrendConceptCompositionMode[]> = {
    silhouette_or_fit: ["suspended garment", "sculptural draping", "asymmetric garment arrangement"],
    fabric_or_craft: ["macro texture", "cropped construction detail", "top-down flat-lay"],
    garment: ["cropped construction detail", "architectural product still-life", "asymmetric garment arrangement"],
    pattern_or_print: ["macro texture", "sculptural draping", "top-down flat-lay"],
    colour: ["top-down flat-lay", "suspended fabric", "sculptural draping"],
    aesthetic_or_mood: ["architectural product still-life", "top-down flat-lay", "asymmetric garment arrangement"],
  };
  const modes = categoryModes[category];
  return modes[deterministicConceptIndex(keyword, "trend-concept-composition", modes.length)];
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
    "cropped construction detail":
      "Composition mode: cropped construction detail. Frame the neckline, placket, seam, button, pocket, hem, weave or closure closely so craftsmanship becomes the subject.",
    "architectural product still-life":
      "Composition mode: architectural product still-life. Stage the garment or detail with structured shadows, clean planes and a premium product-photography sense of form.",
    "asymmetric garment arrangement":
      "Composition mode: asymmetric garment arrangement. Place the garment off-centre with deliberate negative space, angled folds and an editorial still-life sense of movement.",
  };

  return directions[mode];
}

function trendConceptColourFamily(category: TrendConceptCategory, keyword: string) {
  const normalizedKeyword = normalizedSearchText(keyword);
  const colourOverride = keywordColourPalette(keyword);
  if (colourOverride) return colourOverride;

  if (isLooseConcept(normalizedKeyword) || matchesAnyConceptTerm(normalizedKeyword, ["oversized", "slouchy", "baggy", "relaxed fit"])) {
    return "Palette family: cool white, mist grey and pale blue-grey, with airy highlights and no beige-on-beige styling.";
  }
  if (matchesAnyConceptTerm(normalizedKeyword, ["embroidered", "embroidery", "crochet", "lace", "knitted", "knit", "tweed"])) {
    return "Palette family: multicolour threadwork, restrained jewel colours or material-specific craft colours on a sophisticated textile base.";
  }
  if (matchesAnyConceptTerm(normalizedKeyword, ["trench", "coat", "outerwear"])) {
    return "Palette family: camel, olive, navy, charcoal or stone outerwear tones against a contrasting backdrop, not a flat matching beige wall.";
  }
  if (isIndianConcept(normalizedKeyword)) {
    return "Palette family: deep indigo, muted maroon, forest green, restrained saffron or natural handloom tones, elegant and Indian-inspired.";
  }
  if (matchesAnyConceptTerm(normalizedKeyword, ["denim", "jeans"])) {
    return "Palette family: indigo, washed blue, rinsed denim and authentic twill variation.";
  }
  if (matchesAnyConceptTerm(normalizedKeyword, ["leather", "suede"])) {
    return "Palette family: black, oxblood, dark brown or natural leather tones with controlled highlights.";
  }
  if (matchesAnyConceptTerm(normalizedKeyword, ["y2k", "colour blocking", "color blocking", "cobalt", "cherry red", "graphic"])) {
    return "Palette family: higher-contrast and more energetic fashion palettes, balanced with premium restraint.";
  }
  if (matchesAnyConceptTerm(normalizedKeyword, ["quiet luxury", "old money", "minimal", "tailored"])) {
    return "Palette family: restrained cream, chocolate, charcoal, navy or stone with expensive tonal contrast.";
  }
  if (category === "pattern_or_print") {
    return `Palette family: fashion-relevant colours that clearly reveal the ${keyword} pattern, with enough contrast to make the repeat readable.`;
  }
  if (category === "silhouette_or_fit") {
    return "Palette family: cool white, mist grey, pale blue-grey or another airy relevant palette chosen to make shape and movement readable.";
  }
  if (category === "colour") {
    return `Palette family: nuanced tonal variations of ${keyword}, sophisticated and fashion-relevant rather than randomly bright.`;
  }

  const fallbackFamilies = [
    "Palette family: smoky ivory, slate, muted rose and soft black accents.",
    "Palette family: olive, stone, ink blue and natural canvas neutrals.",
    "Palette family: chocolate, charcoal, restrained cream and muted metallic shadows.",
  ];
  return fallbackFamilies[deterministicConceptIndex(keyword, "trend-concept-colour", fallbackFamilies.length)];
}

function trendConceptDirection(category: TrendConceptCategory, keyword: string) {
  const normalizedKeyword = normalizedSearchText(keyword);

  if (isLooseConcept(normalizedKeyword)) {
    return "Subject treatment: Show a recognisably loose fashion garment: an oversized lightweight button-down shirt or unstructured tunic photographed without a person. Keep the collar, button placket, cuffs, extra-wide body and flowing sleeves clearly visible. Suspend or drape it asymmetrically so it communicates air, freedom, movement and loose volume. It must not resemble a bedsheet, curtain, hammock or interior textile.";
  }
  if (isKurtaConcept(normalizedKeyword)) {
    return `Subject treatment: Create a close editorial study of a kurta neckline, placket, weave, buttons and fabric surface. Show Indian garment construction and material richness without another full beige garment hanging against a neutral wall.`;
  }
  if (matchesAnyConceptTerm(normalizedKeyword, ["oversized", "slouchy"])) {
    return `Subject treatment: Create an airy study of ${keyword} using excess drape, soft volume and flowing cloth in motion. Use an asymmetrical or suspended composition with visible negative space, not a beige garment against a beige wall.`;
  }
  if (category === "silhouette_or_fit") {
    return `Subject treatment: Create a sculptural garment composition, ghost form or carefully draped garment that emphasizes the proportion, volume and shape of ${keyword}. Use negative space to make the silhouette instantly readable.`;
  }
  if (category === "fabric_or_craft") {
    return `Subject treatment: Create a macro or close editorial study of ${keyword} texture, stitches, weave, embellishment and construction. Show tactile material detail with crisp focus and rich surface depth.`;
  }
  if (category === "garment") {
    return `Subject treatment: Create an elevated product still-life or cropped study of the garment's most recognizable construction details for ${keyword}. Focus on seams, closures, lapels, plackets, hems, buttons, folds or hardware. Do not show a complete styled outfit.`;
  }
  if (category === "pattern_or_print") {
    return `Subject treatment: Create a refined close-up or sculptural arrangement emphasizing the repeating ${keyword} pattern. Make the rhythm, scale and placement of the print the main subject.`;
  }
  if (category === "colour") {
    return `Subject treatment: Create a monochromatic editorial composition using folded fabrics, fashion materials and subtle objects in the ${keyword} colour family. Keep the palette nuanced, premium and tonal.`;
  }
  return `Subject treatment: Create an editorial fashion product still-life using garment fragments, materials and a small number of relevant objects to communicate the ${keyword} aesthetic. Avoid generic lifestyle stock photography.`;
}

const TREND_CONCEPT_ANTI_TEXT =
  "Create only an edge-to-edge fashion photograph. No poster layout, no magazine page, no footer, no caption area, no title bar, no border, no graphic panel, no typography, no letters, no numbers, no symbols, no imitation writing, no label, no watermark, no logo and no brand marks anywhere in the image. The website will add all interface text separately.";

function buildTrendConceptImagePrompt(input: FashionImagePromptInput) {
  const keyword = input.keyword.trim() || input.editorialName?.trim() || "fashion trend";
  const category = classifyTrendConceptCategory(keyword, input.editorialName);
  const compositionMode = conceptCompositionMode(category, keyword);
  const normalizedKeyword = normalizedSearchText(keyword);

  return [
    `Editorial fashion concept photograph representing the trend keyword "${keyword}".`,
    "",
    trendConceptDirection(category, keyword),
    isKurtaConcept(normalizedKeyword)
      ? "Fill the entire frame with the kurta fabric and construction details."
      : "",
    "",
    conceptCompositionDirection(compositionMode),
    trendConceptColourFamily(category, keyword),
    "",
    `The image must clearly communicate ${keyword} through shape, proportion, texture, construction, pattern, colour or visual mood rather than through a person wearing an outfit.`,
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
