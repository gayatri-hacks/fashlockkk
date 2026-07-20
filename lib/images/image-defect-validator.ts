import { z } from "zod";
import type { ImagePixelAnalysis } from "@/lib/images/image-pixel-analysis";
import { detectImageMimeTypeFromBytes } from "@/lib/images/image-semantic-validator";
import type { TrendImageBrief } from "@/lib/images/trend-image-brief";
import { RetryableImageGenerationError } from "@/lib/images/image-generator";

export type ImageDefectValidation = {
  available: boolean;
  passed: boolean;
  visibleLabelDetected: boolean;
  imitationWritingDetected: boolean;
  logoOrWatermarkDetected: boolean;
  materialContradictsBrief: boolean;
  repeatedCatalogComposition: boolean;
  detectedMaterial: string;
  subjectDescription: string;
  materialDescription: string;
  compositionDescription: string;
  tagRegionDescription: string;
  rejectionReasons: string[];
  confidence: number;
  labelForensicsPassed: boolean;
  labelForensicsUncertain: boolean;
  labelForensicsReasons: string[];
  provider: string;
  error?: string;
};

export type LabelForensicsResult = {
  passed: boolean;
  uncertain: boolean;
  reasons: string[];
};

export interface ImageDefectValidator {
  provider: string;
  validate(input: {
    brief: TrendImageBrief;
    imageBuffer: Buffer;
    pixel: ImagePixelAnalysis;
    candidateIndex: number;
  }): Promise<ImageDefectValidation>;
}

const ScoreSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim()) return Number(value);
  return value;
}, z.number().min(0).max(1));

const BooleanSchema = z.union([
  z.boolean(),
  z.enum(["true", "false", "TRUE", "FALSE"]).transform((value) => value.toLowerCase() === "true"),
]);

const DefectPayloadSchema = z.object({
  visibleLabelDetected: BooleanSchema,
  imitationWritingDetected: BooleanSchema,
  logoOrWatermarkDetected: BooleanSchema,
  materialContradictsBrief: BooleanSchema,
  repeatedCatalogComposition: BooleanSchema,
  detectedMaterial: z.string(),
  subjectDescription: z.string(),
  materialDescription: z.string(),
  compositionDescription: z.string(),
  tagRegionDescription: z.string(),
  rejectionReasons: z.array(z.coerce.string()),
  confidence: ScoreSchema,
  provider: z.coerce.string().optional(),
}).strict();

const DEFECT_GUIDED_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    visibleLabelDetected: { type: "boolean" },
    imitationWritingDetected: { type: "boolean" },
    logoOrWatermarkDetected: { type: "boolean" },
    materialContradictsBrief: { type: "boolean" },
    repeatedCatalogComposition: { type: "boolean" },
    detectedMaterial: { type: "string" },
    subjectDescription: { type: "string" },
    materialDescription: { type: "string" },
    compositionDescription: { type: "string" },
    tagRegionDescription: { type: "string" },
    rejectionReasons: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "visibleLabelDetected",
    "imitationWritingDetected",
    "logoOrWatermarkDetected",
    "materialContradictsBrief",
    "repeatedCatalogComposition",
    "detectedMaterial",
    "subjectDescription",
    "materialDescription",
    "compositionDescription",
    "tagRegionDescription",
    "rejectionReasons",
    "confidence",
  ],
};

function unavailableDefectValidation(provider: string, error: string): ImageDefectValidation {
  return {
    available: false,
    passed: false,
    visibleLabelDetected: true,
    imitationWritingDetected: true,
    logoOrWatermarkDetected: true,
    materialContradictsBrief: true,
    repeatedCatalogComposition: true,
    detectedMaterial: "",
    subjectDescription: "",
    materialDescription: "",
    compositionDescription: "",
    tagRegionDescription: "",
    rejectionReasons: [error],
    confidence: 0,
    labelForensicsPassed: false,
    labelForensicsUncertain: true,
    labelForensicsReasons: [error],
    provider,
    error,
  };
}

class UnavailableDefectValidator implements ImageDefectValidator {
  readonly provider = "unavailable";

  constructor(private readonly reason = "defect vision validator is not configured") {}

  async validate(): Promise<ImageDefectValidation> {
    return unavailableDefectValidation(this.provider, this.reason);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeShape(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value !== "object") return typeof value;
  if (depth >= 2) return "object";
  const entries = Object.keys(value as Record<string, unknown>)
    .slice(0, 12)
    .map((key) => `${key}:${safeShape((value as Record<string, unknown>)[key], depth + 1)}`);
  return `object{${entries.join(",")}}`;
}

function defectKeyCount(value: unknown) {
  if (!isPlainObject(value)) return 0;
  return [
    "visibleLabelDetected",
    "imitationWritingDetected",
    "logoOrWatermarkDetected",
    "materialContradictsBrief",
    "repeatedCatalogComposition",
    "detectedMaterial",
    "subjectDescription",
    "materialDescription",
    "compositionDescription",
    "tagRegionDescription",
    "rejectionReasons",
    "confidence",
  ].filter((key) => key in value).length;
}

function parseJsonText(text: string, provider: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const jsonText = fenced || trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(`${provider} defect validator returned non-JSON output`);
  }
}

function contentCandidate(value: unknown) {
  if (Array.isArray(value)) {
    const textPart = value.find((part) => isPlainObject(part) && typeof part.text === "string");
    return textPart && isPlainObject(textPart) ? textPart.text : undefined;
  }
  return value;
}

function normalizeDefectPayload(payload: unknown, provider: string) {
  const candidates = [
    isPlainObject(payload) && isPlainObject(payload.result) ? payload.result.response : undefined,
    isPlainObject(payload) ? payload.response : undefined,
    isPlainObject(payload) ? contentCandidate((payload.choices as any)?.[0]?.message?.content) : undefined,
    isPlainObject(payload) ? (payload.candidates as any)?.[0]?.content?.parts?.[0]?.text : undefined,
    isPlainObject(payload) && isPlainObject(payload.result) && defectKeyCount(payload.result) >= 4 ? payload.result : undefined,
    isPlainObject(payload) && defectKeyCount(payload) >= 4 ? payload : undefined,
    isPlainObject(payload) ? payload.result : undefined,
    isPlainObject(payload) ? payload.text : undefined,
    payload,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const parsed = typeof candidate === "string" ? parseJsonText(candidate, provider) : candidate;
    if (defectKeyCount(parsed) >= 4) return { parsed, shape: safeShape(payload) };
  }

  if (typeof payload === "string") return { parsed: parseJsonText(payload, provider), shape: "string" };
  return { parsed: payload, shape: safeShape(payload) };
}

function zodIssueSummary(error: z.ZodError) {
  return error.issues
    .slice(0, 12)
    .map((issue) => `${issue.path.join(".") || "(root)"}:${issue.code}`)
    .join(", ");
}

function requiredEvidenceDescriptions(data: z.infer<typeof DefectPayloadSchema>) {
  return [
    ["subjectDescription", data.subjectDescription],
    ["materialDescription", data.materialDescription],
    ["compositionDescription", data.compositionDescription],
    ["tagRegionDescription", data.tagRegionDescription],
    ["detectedMaterial", data.detectedMaterial],
  ] as const;
}

function parseStrictDefectJson(payload: unknown, provider: string, labelForensics?: LabelForensicsResult): ImageDefectValidation {
  const { parsed, shape } = normalizeDefectPayload(payload, provider);
  const result = DefectPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${provider} defect validator returned invalid JSON schema; responseShape=${shape}; issues=${zodIssueSummary(result.error)}`);
  }

  const rejectionReasons = Array.from(new Set(result.data.rejectionReasons.map(String).filter(Boolean)));
  if (result.data.confidence < 0.75) {
    rejectionReasons.push(`defect confidence ${result.data.confidence.toFixed(2)} below 0.75`);
  }
  for (const [field, value] of requiredEvidenceDescriptions(result.data)) {
    if (!value.trim()) rejectionReasons.push(`defect evidence ${field} is empty`);
  }
  if (
    !result.data.visibleLabelDetected &&
    !result.data.imitationWritingDetected &&
    !result.data.logoOrWatermarkDetected &&
    !result.data.materialContradictsBrief &&
    !result.data.repeatedCatalogComposition &&
    result.data.confidence === 0 &&
    requiredEvidenceDescriptions(result.data).every(([, value]) => !value.trim())
  ) {
    rejectionReasons.push("defect review returned a pass with no supporting evidence");
  }
  if (labelForensics?.uncertain) rejectionReasons.push("label forensics uncertain");
  if (labelForensics && !labelForensics.passed) rejectionReasons.push(...labelForensics.reasons);

  const passed =
    !result.data.visibleLabelDetected &&
    !result.data.imitationWritingDetected &&
    !result.data.logoOrWatermarkDetected &&
    !result.data.materialContradictsBrief &&
    !result.data.repeatedCatalogComposition &&
    result.data.confidence >= 0.75 &&
    requiredEvidenceDescriptions(result.data).every(([, value]) => Boolean(value.trim())) &&
    (labelForensics ? labelForensics.passed : true) &&
    rejectionReasons.length === 0;

  return {
    available: true,
    passed,
    visibleLabelDetected: result.data.visibleLabelDetected,
    imitationWritingDetected: result.data.imitationWritingDetected,
    logoOrWatermarkDetected: result.data.logoOrWatermarkDetected,
    materialContradictsBrief: result.data.materialContradictsBrief,
    repeatedCatalogComposition: result.data.repeatedCatalogComposition,
    detectedMaterial: result.data.detectedMaterial,
    subjectDescription: result.data.subjectDescription,
    materialDescription: result.data.materialDescription,
    compositionDescription: result.data.compositionDescription,
    tagRegionDescription: result.data.tagRegionDescription,
    rejectionReasons,
    confidence: result.data.confidence,
    labelForensicsPassed: labelForensics?.passed ?? true,
    labelForensicsUncertain: labelForensics?.uncertain ?? false,
    labelForensicsReasons: labelForensics?.reasons ?? [],
    provider,
  };
}

function timeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timer) };
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, seconds);
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return Math.max(1, Math.ceil((timestamp - Date.now()) / 1000));
  return undefined;
}

function dataUri(imageBuffer: Buffer) {
  const mimeType = detectImageMimeTypeFromBytes(imageBuffer);
  return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
}

export async function buildDefectReviewSheet(imageBuffer: Buffer) {
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1280;
  const crop = async (leftRatio: number, topRatio: number, widthRatio: number, heightRatio: number) => {
    const left = Math.max(0, Math.round(width * leftRatio));
    const top = Math.max(0, Math.round(height * topRatio));
    const cropWidth = Math.min(width - left, Math.round(width * widthRatio));
    const cropHeight = Math.min(height - top, Math.round(height * heightRatio));
    return sharp(imageBuffer)
      .extract({ left, top, width: Math.max(1, cropWidth), height: Math.max(1, cropHeight) })
      .resize(512, 640, { fit: "cover" })
      .png()
      .toBuffer();
  };

  const panels = [
    await sharp(imageBuffer).resize(512, 640, { fit: "cover" }).png().toBuffer(),
    await crop(0.18, 0.0, 0.64, 0.42),
    await crop(0.3, 0.02, 0.4, 0.28),
    await crop(0.2, 0.08, 0.6, 0.32),
    await crop(0.0, 0.0, 0.5, 0.45),
    await crop(0.5, 0.0, 0.5, 0.45),
  ];

  return sharp({
    create: {
      width: 1536,
      height: 1280,
      channels: 3,
      background: "#f6f2ed",
    },
  })
    .composite(panels.map((input, index) => ({
      input,
      left: (index % 3) * 512,
      top: Math.floor(index / 3) * 640,
    })))
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function runLabelForensics(imageBuffer: Buffer, pixel: ImagePixelAnalysis): Promise<LabelForensicsResult> {
  const reasons: string[] = [];
  if (pixel.ocr.suspiciousTagLikeTextDetected) {
    reasons.push("suspicious low-confidence OCR glyphs inside tag-like neckline region");
  }
  if (pixel.ocr.boxes.some((box) => {
    const bbox = box.bbox;
    if (!bbox) return false;
    const centerX = (bbox.x0 + bbox.x1) / 2;
    const centerY = (bbox.y0 + bbox.y1) / 2;
    return centerX >= 0.28 && centerX <= 0.72 && centerY >= 0.02 && centerY <= 0.38 && /[A-Za-z0-9]/.test(box.text);
  })) {
    reasons.push("OCR detected text-like marks in likely neckline or sewn-tag region");
  }

  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 1024;
    const height = metadata.height || 1280;
    const left = Math.round(width * 0.28);
    const top = Math.round(height * 0.03);
    const cropWidth = Math.round(width * 0.44);
    const cropHeight = Math.round(height * 0.32);
    const { data, info } = await sharp(imageBuffer)
      .extract({ left, top, width: Math.min(width - left, cropWidth), height: Math.min(height - top, cropHeight) })
      .resize(220, 160, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels: number[] = [];
    let redGlyphPixels = 0;
    for (let index = 0; index < data.length; index += info.channels) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      pixels.push(0.2126 * red + 0.7152 * green + 0.0722 * blue);
      if (red > 120 && red > green * 1.18 && red > blue * 1.18) redGlyphPixels += 1;
    }
    const brightRatio = pixels.filter((value) => value > 232).length / Math.max(1, pixels.length);
    const darkRatio = pixels.filter((value) => value < 80).length / Math.max(1, pixels.length);
    const redGlyphRatio = redGlyphPixels / Math.max(1, pixels.length);
    const mean = pixels.reduce((sum, value) => sum + value, 0) / Math.max(1, pixels.length);
    const variance = pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, pixels.length);
    const contrast = Math.sqrt(variance) / 255;
    if (
      (brightRatio >= 0.015 && brightRatio <= 0.34 && darkRatio >= 0.002 && contrast >= 0.08) ||
      (brightRatio >= 0.005 && redGlyphRatio >= 0.00005 && contrast >= 0.04) ||
      (brightRatio >= 0.01 && darkRatio >= 0.01 && contrast >= 0.12)
    ) {
      reasons.push("possible white sewn-in tag with dark/red glyph detail in neckline crop");
    }
  } catch (error) {
    return {
      passed: false,
      uncertain: true,
      reasons: [`label forensics crop analysis failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  return {
    passed: reasons.length === 0,
    uncertain: reasons.length > 0,
    reasons,
  };
}

function defectPrompt(brief: TrendImageBrief, pixel: ImagePixelAnalysis, candidateIndex: number) {
  return [
    "You are an independent Fashlock image defect reviewer. Return strict JSON only. Do not include markdown, prose, comments or extra keys.",
    "The supplied image is a crop sheet: it includes the full generated trend card image plus enlarged neckline, collar, upper-garment and likely label/tag detail regions.",
    `Candidate index: ${candidateIndex}`,
    `Canonical keyword: ${brief.canonicalKeyword}`,
    `Requested subject: ${brief.visualSubject}`,
    `Requested composition mode: ${brief.compositionMode}`,
    `Requested material family: ${brief.materialFamily}`,
    `Requested material description: ${brief.materialDescription}`,
    `Requested palette family: ${brief.paletteFamily}`,
    `OCR textDetected: ${pixel.ocr.textDetected}`,
    `OCR suspiciousTagLikeTextDetected: ${Boolean(pixel.ocr.suspiciousTagLikeTextDetected)}`,
    "",
    "Fail closed. Look especially at collar, neckline, placket, pocket, hem, tag and seam regions.",
    "If any collar label, sewn-in label, care tag, brand tab, fake garment tag, imitation writing, tiny letter-like mark, logo or watermark is visible, set the matching defect boolean true even if the text is unreadable.",
    "Treat uncertainty as rejection. If the crop is blurry, ambiguous or could plausibly contain a label/tag/writing, set visibleLabelDetected=true or imitationWritingDetected=true and include the uncertainty in rejectionReasons.",
    "A clean garment must show plain fabric at the inner neckline when the neckline is visible. Any white rectangle, red mark, black mark or tag-like patch there is a defect.",
    "Reject if the material visible in the image contradicts the requested material family. Example: denim/chambray-looking cloth contradicts a request for crisp poplin, voile or silk.",
    "Reject repetitive centered product-catalog composition: a garment centered front-on against a plain grey/beige wall with little asymmetry, movement, texture crop, construction focus or editorial styling.",
    "Do not award perfect scores by default. This pass is only looking for defects.",
    "JSON schema: {\"visibleLabelDetected\":boolean,\"imitationWritingDetected\":boolean,\"logoOrWatermarkDetected\":boolean,\"materialContradictsBrief\":boolean,\"repeatedCatalogComposition\":boolean,\"detectedMaterial\":\"string\",\"subjectDescription\":\"string\",\"materialDescription\":\"string\",\"compositionDescription\":\"string\",\"tagRegionDescription\":\"string\",\"rejectionReasons\":[\"string\"],\"confidence\":0-1}",
  ].join("\n");
}

class CloudflareDefectValidator implements ImageDefectValidator {
  readonly provider = "cloudflare_defect";

  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async validate(input: { brief: TrendImageBrief; imageBuffer: Buffer; pixel: ImagePixelAnalysis; candidateIndex: number }): Promise<ImageDefectValidation> {
    const reviewSheet = await buildDefectReviewSheet(input.imageBuffer);
    const labelForensics = await runLabelForensics(input.imageBuffer, input.pixel);
    const timer = timeoutSignal(this.timeoutMs);
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}/ai/run/${this.model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "Return strict JSON only. Do not include markdown, prose, comments or extra keys.",
            },
            {
              role: "user",
              content: defectPrompt(input.brief, input.pixel, input.candidateIndex),
            },
          ],
          image: dataUri(reviewSheet),
          max_tokens: 800,
          temperature: 0,
          guided_json: DEFECT_GUIDED_JSON_SCHEMA,
        }),
        signal: timer.controller.signal,
      });

      if (response.status === 429) {
        throw new RetryableImageGenerationError("Cloudflare defect validator quota exceeded", parseRetryAfter(response.headers.get("retry-after")));
      }
      if (!response.ok) {
        return unavailableDefectValidation(this.provider, `Cloudflare defect validator returned ${response.status}`);
      }

      try {
        return parseStrictDefectJson(await response.json(), this.provider, labelForensics);
      } catch (error) {
        return unavailableDefectValidation(this.provider, error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      if (error instanceof RetryableImageGenerationError) throw error;
      return unavailableDefectValidation(this.provider, error instanceof Error ? error.message : "Cloudflare defect validator failed");
    } finally {
      timer.clear();
    }
  }
}

export function createImageDefectValidator(env: NodeJS.ProcessEnv = process.env): ImageDefectValidator {
  const provider = (env.IMAGE_DEFECT_VALIDATOR_PROVIDER || "disabled").toLowerCase();
  const timeoutMs = Number(env.IMAGE_DEFECT_VALIDATOR_TIMEOUT_MS || env.IMAGE_SEMANTIC_VALIDATOR_TIMEOUT_MS || 45000);

  if (provider === "cloudflare") {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID || "";
    const token = env.CLOUDFLARE_API_TOKEN || "";
    const model = env.CLOUDFLARE_VISION_MODEL || "";
    if (!accountId || !token || !model) {
      return new UnavailableDefectValidator("Cloudflare defect validation requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and CLOUDFLARE_VISION_MODEL");
    }
    return new CloudflareDefectValidator(accountId, token, model, timeoutMs);
  }

  return new UnavailableDefectValidator();
}
