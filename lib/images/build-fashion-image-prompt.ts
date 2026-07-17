import { createHash } from "crypto";

export const FASHION_IMAGE_VARIANTS = ["trend_hero", "trend_women", "trend_men", "deep_dive", "daily_edit"] as const;

export type FashionImageVariant = (typeof FASHION_IMAGE_VARIANTS)[number];
export type FashionImageEntityType = "trend";

export type FashionImagePromptInput = {
  entityType: FashionImageEntityType;
  entityId: number;
  variant: FashionImageVariant;
  keyword: string;
  editorialName?: string | null;
  oneLiner?: string | null;
  howToWear?: string[] | null;
  model: string;
  imageSize: string;
};

export function normalizeImagePrompt(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function variantDirection(variant: FashionImageVariant) {
  if (variant === "trend_women") {
    return "Womenswear outfit, full body adult model, exact wearable styling, shoes visible.";
  }
  if (variant === "trend_men") {
    return "Menswear outfit, full body adult model, exact wearable styling, shoes visible.";
  }
  if (variant === "trend_hero") {
    return "Editorial hero look, full body adult fashion model, clear trend signal, shoes visible.";
  }
  if (variant === "daily_edit") {
    return "Daytime wearable outfit, full body adult fashion model, practical styling, shoes visible.";
  }
  return "Deep-dive outfit reference, full body adult fashion model, every garment clearly visible.";
}

export function buildFashionImagePrompt(input: FashionImagePromptInput) {
  const name = input.editorialName?.trim() || input.keyword;
  const stylingNotes = (input.howToWear || []).filter(Boolean).slice(0, 4).join("; ");

  return [
    "Photorealistic premium fashion ecommerce lookbook image.",
    variantDirection(input.variant),
    `Trend keyword: ${input.keyword}.`,
    `Editorial trend name: ${name}.`,
    input.oneLiner ? `Trend context: ${input.oneLiner}.` : "",
    stylingNotes ? `Styling direction: ${stylingNotes}.` : "",
    "Clean warm ivory studio background, natural pose, modern Indian/global fashion styling.",
    "Show the complete outfit from head to toe with fabric texture and silhouette visible.",
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
