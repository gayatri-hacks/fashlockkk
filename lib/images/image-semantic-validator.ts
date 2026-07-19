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

const SemanticPayloadSchema = z.object({
  keywordMatch: z.coerce.number().min(0).max(1),
  fashionRelevance: z.coerce.number().min(0).max(1),
  materialRealism: z.coerce.number().min(0).max(1),
  compositionQuality: z.coerce.number().min(0).max(1),
  requiredCuesPresent: z.coerce.boolean(),
  forbiddenCuesPresent: z.coerce.boolean(),
  textDetected: z.coerce.boolean(),
  logoDetected: z.coerce.boolean(),
  subjectDescription: z.coerce.string(),
  materialDescription: z.coerce.string(),
  rejectionReasons: z.array(z.coerce.string()).default([]),
  confidence: z.coerce.number().min(0).max(1),
  provider: z.coerce.string().optional(),
});

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

function cloudflareVisionImagePayload(imageBuffer: Buffer) {
  return `data:image/png;base64,${imageBuffer.toString("base64")}`;
}

function extractResponseText(payload: any): string {
  if (typeof payload === "string") return payload;
  if (typeof payload?.result?.response === "string") return payload.result.response;
  if (typeof payload?.result?.text === "string") return payload.result.text;
  if (typeof payload?.response === "string") return payload.response;
  if (typeof payload?.text === "string") return payload.text;
  if (typeof payload?.result === "string") return payload.result;
  if (typeof payload?.choices?.[0]?.message?.content === "string") return payload.choices[0].message.content;
  if (typeof payload?.candidates?.[0]?.content?.parts?.[0]?.text === "string") {
    return payload.candidates[0].content.parts[0].text;
  }
  return JSON.stringify(payload?.result || payload);
}

function parseStrictSemanticJson(payload: unknown, provider: string): ImageSemanticValidation {
  const text = extractResponseText(payload).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const jsonText = fenced || text.match(/\{[\s\S]*\}/)?.[0] || text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`${provider} semantic validator returned non-JSON output`);
  }

  const result = SemanticPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${provider} semantic validator returned invalid JSON schema`);
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
