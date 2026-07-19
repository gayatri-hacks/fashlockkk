import { z } from "zod";
import type { TrendImageBrief } from "@/lib/images/trend-image-brief";
import { RetryableImageGenerationError } from "@/lib/images/image-generator";

export type ImageSemanticValidation = {
  available: boolean;
  keywordMatch: number;
  fashionRelevance: number;
  materialRealism: number;
  compositionQuality: number;
  requiredCuesPresent: boolean;
  forbiddenCuesPresent: boolean;
  textDetected: boolean;
  logoDetected: boolean;
  subjectDescription: string;
  materialDescription: string;
  rejectionReasons: string[];
  confidence: number;
  provider: string;
  error?: string;
};

export interface ImageSemanticValidator {
  provider: string;
  validate(input: {
    brief: TrendImageBrief;
    imageBuffer: Buffer;
    candidateIndex: number;
  }): Promise<ImageSemanticValidation>;
}

const ScoreSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim()) return Number(value);
  return value;
}, z.number().min(0).max(1));

const BooleanSchema = z.union([
  z.boolean(),
  z.enum(["true", "false", "TRUE", "FALSE"]).transform((value) => value.toLowerCase() === "true"),
]);

const SemanticPayloadSchema = z.object({
  keywordMatch: ScoreSchema,
  fashionRelevance: ScoreSchema,
  materialRealism: ScoreSchema,
  compositionQuality: ScoreSchema,
  requiredCuesPresent: BooleanSchema,
  forbiddenCuesPresent: BooleanSchema,
  textDetected: BooleanSchema,
  logoDetected: BooleanSchema,
  subjectDescription: z.string(),
  materialDescription: z.string(),
  rejectionReasons: z.array(z.coerce.string()),
  confidence: ScoreSchema,
  provider: z.coerce.string().optional(),
}).strict();

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export function unavailableSemanticValidation(provider: string, error: string): ImageSemanticValidation {
  return {
    available: false,
    keywordMatch: 0,
    fashionRelevance: 0,
    materialRealism: 0,
    compositionQuality: 0,
    requiredCuesPresent: false,
    forbiddenCuesPresent: true,
    textDetected: false,
    logoDetected: false,
    subjectDescription: "",
    materialDescription: "",
    rejectionReasons: [error],
    confidence: 0,
    provider,
    error,
  };
}

class UnavailableSemanticValidator implements ImageSemanticValidator {
  readonly provider = "unavailable";

  constructor(private readonly reason = "semantic vision validator is not configured") {}

  async validate(): Promise<ImageSemanticValidation> {
    return unavailableSemanticValidation(this.provider, this.reason);
  }
}

function semanticPrompt(brief: TrendImageBrief, candidateIndex: number) {
  return [
    "You are validating a generated Fashlock trend concept image.",
    "Return strict JSON only. Do not include markdown, prose, comments or extra keys.",
    `Candidate index: ${candidateIndex}`,
    `Canonical keyword: ${brief.canonicalKeyword}`,
    `Display name: ${brief.displayName}`,
    `Composition mode: ${brief.compositionMode}`,
    `Material family: ${brief.materialFamily}`,
    `Color family: ${brief.paletteFamily}`,
    `Required visual cues: ${brief.requiredVisualCues.join(", ")}`,
    `Forbidden cues: ${brief.forbiddenVisualCues.join(", ")}`,
    "",
    "Score whether the image genuinely shows the canonical fashion concept, realistic fashion material, and the requested editorial product composition.",
    "Reject fake typography, watermarks, logos, poster layouts, non-fashion subjects, unrelated garments, wrong materials and poor material realism.",
    "JSON schema: {\"keywordMatch\":0-1,\"fashionRelevance\":0-1,\"materialRealism\":0-1,\"compositionQuality\":0-1,\"requiredCuesPresent\":boolean,\"forbiddenCuesPresent\":boolean,\"textDetected\":boolean,\"logoDetected\":boolean,\"subjectDescription\":\"string\",\"materialDescription\":\"string\",\"rejectionReasons\":[\"string\"],\"confidence\":0-1}",
  ].join("\n");
}

const SEMANTIC_GUIDED_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    keywordMatch: { type: "number", minimum: 0, maximum: 1 },
    fashionRelevance: { type: "number", minimum: 0, maximum: 1 },
    materialRealism: { type: "number", minimum: 0, maximum: 1 },
    compositionQuality: { type: "number", minimum: 0, maximum: 1 },
    requiredCuesPresent: { type: "boolean" },
    forbiddenCuesPresent: { type: "boolean" },
    textDetected: { type: "boolean" },
    logoDetected: { type: "boolean" },
    subjectDescription: { type: "string" },
    materialDescription: { type: "string" },
    rejectionReasons: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "keywordMatch",
    "fashionRelevance",
    "materialRealism",
    "compositionQuality",
    "requiredCuesPresent",
    "forbiddenCuesPresent",
    "textDetected",
    "logoDetected",
    "subjectDescription",
    "materialDescription",
    "rejectionReasons",
    "confidence",
  ],
};

export function detectImageMimeTypeFromBytes(imageBuffer: Buffer) {
  if (imageBuffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (
    imageBuffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    imageBuffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  throw new Error("unsupported image MIME type for semantic vision validation");
}

function cloudflareVisionImagePayload(imageBuffer: Buffer) {
  const mimeType = detectImageMimeTypeFromBytes(imageBuffer);
  return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function semanticKeyCount(value: unknown) {
  if (!isPlainObject(value)) return 0;
  return [
    "keywordMatch",
    "fashionRelevance",
    "materialRealism",
    "compositionQuality",
    "requiredCuesPresent",
    "forbiddenCuesPresent",
    "textDetected",
    "logoDetected",
    "subjectDescription",
    "materialDescription",
    "rejectionReasons",
    "confidence",
  ].filter((key) => key in value).length;
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

function parseSemanticJsonText(text: string, provider: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const jsonText = fenced || trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(`${provider} semantic validator returned non-JSON output`);
  }
}

function contentCandidate(value: unknown) {
  if (Array.isArray(value)) {
    const textPart = value.find((part) => isPlainObject(part) && typeof part.text === "string");
    return textPart && isPlainObject(textPart) ? textPart.text : undefined;
  }
  return value;
}

function normalizeSemanticPayload(payload: unknown, provider: string) {
  const candidates = [
    isPlainObject(payload) && isPlainObject(payload.result) ? payload.result.response : undefined,
    isPlainObject(payload) ? payload.response : undefined,
    isPlainObject(payload) ? contentCandidate((payload.choices as any)?.[0]?.message?.content) : undefined,
    isPlainObject(payload) ? (payload.candidates as any)?.[0]?.content?.parts?.[0]?.text : undefined,
    isPlainObject(payload) && isPlainObject(payload.result) && semanticKeyCount(payload.result) >= 4 ? payload.result : undefined,
    isPlainObject(payload) && semanticKeyCount(payload) >= 4 ? payload : undefined,
    isPlainObject(payload) ? payload.result : undefined,
    isPlainObject(payload) ? payload.text : undefined,
    payload,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const parsed = typeof candidate === "string" ? parseSemanticJsonText(candidate, provider) : candidate;
    if (semanticKeyCount(parsed) >= 4) {
      return { parsed, shape: safeShape(payload) };
    }
  }

  if (typeof payload === "string") return { parsed: parseSemanticJsonText(payload, provider), shape: "string" };
  return { parsed: payload, shape: safeShape(payload) };
}

function zodIssueSummary(error: z.ZodError) {
  return error.issues
    .slice(0, 12)
    .map((issue) => `${issue.path.join(".") || "(root)"}:${issue.code}`)
    .join(", ");
}

function parseStrictSemanticJson(payload: unknown, provider: string): ImageSemanticValidation {
  const { parsed, shape } = normalizeSemanticPayload(payload, provider);

  const result = SemanticPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `${provider} semantic validator returned invalid JSON schema; responseShape=${shape}; issues=${zodIssueSummary(result.error)}`,
    );
  }

  return {
    available: true,
    keywordMatch: result.data.keywordMatch,
    fashionRelevance: result.data.fashionRelevance,
    materialRealism: result.data.materialRealism,
    compositionQuality: result.data.compositionQuality,
    requiredCuesPresent: result.data.requiredCuesPresent,
    forbiddenCuesPresent: result.data.forbiddenCuesPresent,
    textDetected: result.data.textDetected,
    logoDetected: result.data.logoDetected,
    subjectDescription: result.data.subjectDescription,
    materialDescription: result.data.materialDescription,
    rejectionReasons: stringArray(result.data.rejectionReasons),
    confidence: result.data.confidence,
    provider,
  };
}

async function fetchJsonWithRetryableQuota(
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") || 86400);
      throw new RetryableImageGenerationError(`${provider} semantic validator quota exceeded`, retryAfter);
    }
    if (!response.ok) {
      return { unavailableError: `${provider} semantic validator returned ${response.status}` };
    }
    return response.json();
  } catch (error) {
    if (error instanceof RetryableImageGenerationError) throw error;
    return {
      unavailableError: error instanceof Error ? `${provider} semantic validator failed: ${error.message}` : `${provider} semantic validator failed`,
    };
  } finally {
    clearTimeout(timer);
  }
}

class HttpSemanticValidator implements ImageSemanticValidator {
  readonly provider = "http";

  constructor(private readonly url: string, private readonly key: string | undefined, private readonly timeoutMs: number) {}

  async validate(input: { brief: TrendImageBrief; imageBuffer: Buffer; candidateIndex: number }): Promise<ImageSemanticValidation> {
    const payload = await fetchJsonWithRetryableQuota(this.provider, this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}),
      },
      body: JSON.stringify({
        candidateIndex: input.candidateIndex,
        canonicalKeyword: input.brief.canonicalKeyword,
        brief: input.brief,
        imageBase64: input.imageBuffer.toString("base64"),
      }),
    }, this.timeoutMs);

    if ((payload as any)?.unavailableError) {
      return unavailableSemanticValidation(this.provider, String((payload as any).unavailableError));
    }

    try {
      return parseStrictSemanticJson(payload, this.provider);
    } catch (error) {
      return unavailableSemanticValidation(this.provider, error instanceof Error ? error.message : String(error));
    }
  }
}

class CloudflareSemanticValidator implements ImageSemanticValidator {
  readonly provider = "cloudflare";

  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async validate(input: { brief: TrendImageBrief; imageBuffer: Buffer; candidateIndex: number }): Promise<ImageSemanticValidation> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}/ai/run/${this.model}`;
    const payload = await fetchJsonWithRetryableQuota(this.provider, url, {
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
            content: semanticPrompt(input.brief, input.candidateIndex),
          },
        ],
        image: cloudflareVisionImagePayload(input.imageBuffer),
        max_tokens: 700,
        temperature: 0,
        guided_json: SEMANTIC_GUIDED_JSON_SCHEMA,
      }),
    }, this.timeoutMs);

    if ((payload as any)?.unavailableError) {
      return unavailableSemanticValidation(this.provider, String((payload as any).unavailableError));
    }

    try {
      return parseStrictSemanticJson(payload, this.provider);
    } catch (error) {
      return unavailableSemanticValidation(this.provider, error instanceof Error ? error.message : String(error));
    }
  }
}

class GeminiSemanticValidator implements ImageSemanticValidator {
  readonly provider = "gemini";

  constructor(private readonly apiKey: string, private readonly model: string, private readonly timeoutMs: number) {}

  async validate(input: { brief: TrendImageBrief; imageBuffer: Buffer; candidateIndex: number }): Promise<ImageSemanticValidation> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const payload = await fetchJsonWithRetryableQuota(this.provider, url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: semanticPrompt(input.brief, input.candidateIndex) },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: input.imageBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
        },
      }),
    }, this.timeoutMs);

    if ((payload as any)?.unavailableError) {
      return unavailableSemanticValidation(this.provider, String((payload as any).unavailableError));
    }

    try {
      return parseStrictSemanticJson(payload, this.provider);
    } catch (error) {
      return unavailableSemanticValidation(this.provider, error instanceof Error ? error.message : String(error));
    }
  }
}

class FallbackSemanticValidator implements ImageSemanticValidator {
  readonly provider: string;

  constructor(private readonly primary: ImageSemanticValidator, private readonly fallback: ImageSemanticValidator) {
    this.provider = `${primary.provider}+${fallback.provider}`;
  }

  async validate(input: { brief: TrendImageBrief; imageBuffer: Buffer; candidateIndex: number }): Promise<ImageSemanticValidation> {
    const primaryResult = await this.primary.validate(input);
    if (primaryResult.available) return primaryResult;
    const fallbackResult = await this.fallback.validate(input);
    if (fallbackResult.available) return fallbackResult;
    return {
      ...primaryResult,
      rejectionReasons: [...primaryResult.rejectionReasons, ...fallbackResult.rejectionReasons],
      error: [primaryResult.error, fallbackResult.error].filter(Boolean).join("; "),
      provider: this.provider,
    };
  }
}

function createPrimaryValidator(env: NodeJS.ProcessEnv): ImageSemanticValidator {
  const provider = (env.IMAGE_SEMANTIC_VALIDATOR_PROVIDER || (env.IMAGE_VISION_VALIDATOR_URL ? "http" : "disabled")).toLowerCase();
  const timeoutMs = Number(env.IMAGE_SEMANTIC_VALIDATOR_TIMEOUT_MS || 45000);

  if (provider === "cloudflare") {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID || "";
    const token = env.CLOUDFLARE_API_TOKEN || "";
    const model = env.CLOUDFLARE_VISION_MODEL || "";
    if (!accountId || !token || !model) {
      return new UnavailableSemanticValidator("Cloudflare semantic validation requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and CLOUDFLARE_VISION_MODEL");
    }
    return new CloudflareSemanticValidator(accountId, token, model, timeoutMs);
  }

  if (provider === "gemini") {
    const apiKey = env.GEMINI_API_KEY || "";
    if (!apiKey) return new UnavailableSemanticValidator("Gemini semantic validation requires GEMINI_API_KEY");
    return new GeminiSemanticValidator(apiKey, env.GEMINI_VISION_MODEL || "gemini-2.5-flash", timeoutMs);
  }

  if (provider === "http") {
    const url = env.IMAGE_SEMANTIC_VALIDATOR_URL || env.IMAGE_VISION_VALIDATOR_URL || "";
    if (!url) return new UnavailableSemanticValidator("IMAGE_SEMANTIC_VALIDATOR_URL or IMAGE_VISION_VALIDATOR_URL is required");
    return new HttpSemanticValidator(url, env.IMAGE_SEMANTIC_VALIDATOR_KEY || env.IMAGE_VISION_VALIDATOR_KEY, timeoutMs);
  }

  return new UnavailableSemanticValidator();
}

export function createImageSemanticValidator(env: NodeJS.ProcessEnv = process.env): ImageSemanticValidator {
  const primary = createPrimaryValidator(env);
  const fallbackProvider = (env.IMAGE_SEMANTIC_VALIDATOR_FALLBACK_PROVIDER || "disabled").toLowerCase();
  if (fallbackProvider === "gemini" && primary.provider !== "gemini") {
    const apiKey = env.GEMINI_API_KEY || "";
    if (!apiKey) return primary;
    return new FallbackSemanticValidator(
      primary,
      new GeminiSemanticValidator(apiKey, env.GEMINI_VISION_MODEL || "gemini-2.5-flash", Number(env.IMAGE_SEMANTIC_VALIDATOR_TIMEOUT_MS || 45000)),
    );
  }
  return primary;
}
