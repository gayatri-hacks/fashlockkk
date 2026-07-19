import type { TrendImageBrief } from "@/lib/images/trend-image-brief";

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

function numberBetweenZeroAndOne(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

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

  async validate(): Promise<ImageSemanticValidation> {
    return unavailableSemanticValidation(this.provider, "semantic vision validator is not configured");
  }
}

class HttpSemanticValidator implements ImageSemanticValidator {
  readonly provider = "http";

  constructor(private readonly url: string, private readonly key: string | undefined, private readonly timeoutMs: number) {}

  async validate(input: { brief: TrendImageBrief; imageBuffer: Buffer; candidateIndex: number }): Promise<ImageSemanticValidation> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
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
        signal: controller.signal,
      });

      if (!response.ok) {
        return unavailableSemanticValidation(this.provider, `semantic vision validator returned ${response.status}`);
      }

      const payload = await response.json();
      return {
        available: true,
        keywordMatch: numberBetweenZeroAndOne(payload.keywordMatch),
        fashionRelevance: numberBetweenZeroAndOne(payload.fashionRelevance),
        materialRealism: numberBetweenZeroAndOne(payload.materialRealism),
        compositionQuality: numberBetweenZeroAndOne(payload.compositionQuality),
        requiredCuesPresent: Boolean(payload.requiredCuesPresent),
        forbiddenCuesPresent: Boolean(payload.forbiddenCuesPresent),
        textDetected: Boolean(payload.textDetected),
        logoDetected: Boolean(payload.logoDetected),
        subjectDescription: String(payload.subjectDescription || ""),
        materialDescription: String(payload.materialDescription || ""),
        rejectionReasons: stringArray(payload.rejectionReasons),
        confidence: numberBetweenZeroAndOne(payload.confidence),
        provider: String(payload.provider || this.provider),
      };
    } catch (error) {
      return unavailableSemanticValidation(
        this.provider,
        error instanceof Error ? `semantic vision validator failed: ${error.message}` : "semantic vision validator failed",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createImageSemanticValidator(env: NodeJS.ProcessEnv = process.env): ImageSemanticValidator {
  const provider = (env.IMAGE_SEMANTIC_VALIDATOR_PROVIDER || (env.IMAGE_VISION_VALIDATOR_URL ? "http" : "")).toLowerCase();
  if (provider === "http") {
    const url = env.IMAGE_SEMANTIC_VALIDATOR_URL || env.IMAGE_VISION_VALIDATOR_URL || "";
    if (!url) throw new Error("IMAGE_SEMANTIC_VALIDATOR_URL or IMAGE_VISION_VALIDATOR_URL is required");
    return new HttpSemanticValidator(url, env.IMAGE_SEMANTIC_VALIDATOR_KEY || env.IMAGE_VISION_VALIDATOR_KEY, Number(env.IMAGE_SEMANTIC_VALIDATOR_TIMEOUT_MS || 45000));
  }
  return new UnavailableSemanticValidator();
}
