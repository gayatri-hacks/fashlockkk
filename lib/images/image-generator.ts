export type ImageGenerationProvider = "ollama" | "cloudflare";

export type GenerateImageInput = {
  prompt: string;
  model: string;
  imageSize: string;
  seed?: number;
};

export type GeneratedImage = {
  buffer: Buffer;
  provider: ImageGenerationProvider;
  model: string;
  retryAfterSeconds?: number;
};

export interface ImageGenerator {
  provider: ImageGenerationProvider;
  describe(): string;
  isReachable(): Promise<boolean>;
  generate(input: GenerateImageInput): Promise<GeneratedImage>;
}

export class RetryableImageGenerationError extends Error {
  readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "RetryableImageGenerationError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
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

function imageFromUnknownPayload(payload: any) {
  const candidates = [
    payload?.data?.[0]?.b64_json,
    payload?.result?.image,
    payload?.result?.images?.[0],
    payload?.image,
  ];
  const base64 = candidates.find((item) => typeof item === "string" && item.length > 100);
  if (!base64) throw new Error("image generation response did not include base64 image data");
  return Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64");
}

class OllamaImageGenerator implements ImageGenerator {
  readonly provider = "ollama" as const;

  constructor(private readonly baseUrl: string, private readonly timeoutMs: number) {}

  describe() {
    return `ollama:${this.baseUrl}`;
  }

  async isReachable() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { cache: "no-store" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(input: GenerateImageInput): Promise<GeneratedImage> {
    const timer = timeoutSignal(this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/v1/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          prompt: input.prompt,
          size: input.imageSize,
          response_format: "b64_json",
          seed: input.seed,
        }),
        signal: timer.controller.signal,
      });

      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      const payload = await response.json();
      return { buffer: imageFromUnknownPayload(payload), provider: this.provider, model: input.model };
    } finally {
      timer.clear();
    }
  }
}

class CloudflareImageGenerator implements ImageGenerator {
  readonly provider = "cloudflare" as const;

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  describe() {
    return `cloudflare:${this.model}`;
  }

  async isReachable() {
    return Boolean(this.accountId && this.apiToken && this.model);
  }

  async generate(input: GenerateImageInput): Promise<GeneratedImage> {
    const timer = timeoutSignal(this.timeoutMs);
    const model = this.model || input.model;
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${encodeURIComponent(model)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt: input.prompt, seed: input.seed }),
          signal: timer.controller.signal,
        },
      );

      if (response.status === 429) {
        throw new RetryableImageGenerationError(
          "Cloudflare image generation quota exhausted",
          parseRetryAfter(response.headers.get("retry-after")),
        );
      }

      if (!response.ok) throw new Error(`Cloudflare image generation returned ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (contentType.startsWith("image/")) {
        return { buffer: Buffer.from(await response.arrayBuffer()), provider: this.provider, model };
      }

      const payload = await response.json();
      return { buffer: imageFromUnknownPayload(payload), provider: this.provider, model };
    } finally {
      timer.clear();
    }
  }
}

export function createImageGenerator(env: NodeJS.ProcessEnv = process.env): ImageGenerator {
  const provider = (env.IMAGE_GENERATION_PROVIDER || "ollama").toLowerCase();
  const timeoutMs = Number(env.IMAGE_WORKER_TIMEOUT_MS || 300000);

  if (provider === "cloudflare") {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID || "";
    const apiToken = env.CLOUDFLARE_API_TOKEN || "";
    const model = env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-9b";
    if (!accountId || !apiToken) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required when IMAGE_GENERATION_PROVIDER=cloudflare");
    }
    return new CloudflareImageGenerator(accountId, apiToken, model, timeoutMs);
  }

  const baseUrl = (env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  return new OllamaImageGenerator(baseUrl, timeoutMs);
}
