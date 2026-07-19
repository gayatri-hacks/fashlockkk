import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createImageGenerator, RetryableImageGenerationError } from "@/lib/images/image-generator";
import { analyzeImagePixels, classifyOcrWords, createOcrProvider, type OcrProvider } from "@/lib/images/image-pixel-analysis";
import { createImageSemanticValidator, unavailableSemanticValidation } from "@/lib/images/image-semantic-validator";
import { buildTrendImageBrief } from "@/lib/images/trend-image-brief";
import {
  candidateFactsFromAnalysis,
  rankTrendConceptCandidates,
  validateTrendConceptCandidate,
} from "@/lib/images/trend-concept-validation";
import { isTrendImageAutoEnqueueEnabled } from "@/lib/trends/config";

const noTextOcr: OcrProvider = {
  provider: "stub",
  async detectText() {
    return { available: true, textDetected: false, text: "", confidence: 0.99, boxes: [], provider: "stub" };
  },
};

function validSemanticPayload(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    keywordMatch: 0.92,
    fashionRelevance: 0.9,
    materialRealism: 0.86,
    compositionQuality: 0.84,
    requiredCuesPresent: true,
    forbiddenCuesPresent: false,
    textDetected: false,
    logoDetected: false,
    subjectDescription: "a realistic fashion textile product photograph",
    materialDescription: "woven fabric with believable construction",
    rejectionReasons: [],
    confidence: 0.88,
    provider: "stub",
    ...overrides,
  };
}

test("pixel validation decodes real image bytes and derives a pixel perceptual hash", async () => {
  const sharp = (await import("sharp")).default;
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#6e7f95",
    },
  }).png().toBuffer();

  const analysis = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });

  assert.equal(analysis.width, 1024);
  assert.equal(analysis.height, 1280);
  assert.equal(analysis.perceptualHash.length, 64);
  assert.equal(analysis.ocr.available, true);
});

test("unavailable semantic validation prevents concept image approval", async () => {
  const sharp = (await import("sharp")).default;
  const brief = buildTrendImageBrief("denim");
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#325f92",
    },
  }).png().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const semantic = unavailableSemanticValidation("stub", "semantic service disabled in test");
  const facts = candidateFactsFromAnalysis({ brief, pixel, semantic, candidateIndex: 0 });
  const result = validateTrendConceptCandidate({ brief, facts });

  assert.equal(result.passed, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("semantic")));
});

test("local OCR classification detects real text-like words", () => {
  const result = classifyOcrWords([
    { text: "FASHLOCK", confidence: 0.91, bbox: { x0: 10, y0: 10, x1: 80, y1: 26 } },
  ], { provider: "local_tesseract", confidenceThreshold: 0.72 });

  assert.equal(result.available, true);
  assert.equal(result.textDetected, true);
  assert.equal(result.boxes.length, 1);
});

test("local OCR classification lets clean textile imagery pass the text check", () => {
  const result = classifyOcrWords([], { provider: "local_tesseract", confidenceThreshold: 0.72 });

  assert.equal(result.textDetected, false);
  assert.equal(result.text, "");
});

test("local OCR classification avoids false positives on low-confidence pattern fragments", () => {
  const result = classifyOcrWords([
    { text: "lll", confidence: 0.22 },
    { text: "xx", confidence: 0.81 },
  ], { provider: "local_tesseract", confidenceThreshold: 0.72, minWordLength: 3 });

  assert.equal(result.textDetected, false);
});

test("unavailable OCR cannot approve a concept image", async () => {
  const sharp = (await import("sharp")).default;
  const brief = buildTrendImageBrief("denim");
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#325f92",
    },
  }).png().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: createOcrProvider({ IMAGE_OCR_PROVIDER: "disabled" } as unknown as NodeJS.ProcessEnv) });
  const semantic = validSemanticPayload({ provider: "stub" }) as any;
  const facts = candidateFactsFromAnalysis({ brief, pixel, semantic, candidateIndex: 0 });
  const result = validateTrendConceptCandidate({ brief, facts });

  assert.equal(result.passed, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("OCR")));
});

test("Cloudflare semantic validator accepts strict JSON from direct REST response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    result: { response: JSON.stringify(validSemanticPayload()) },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const validator = createImageSemanticValidator({
      IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const result = await validator.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: Buffer.from("image"), candidateIndex: 0 });

    assert.equal(result.available, true);
    assert.equal(result.provider, "cloudflare");
    assert.equal(result.requiredCuesPresent, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare semantic validator rejects invalid JSON safely", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    result: { response: "this is not json" },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const validator = createImageSemanticValidator({
      IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const result = await validator.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: Buffer.from("image"), candidateIndex: 0 });

    assert.equal(result.available, false);
    assert.ok(result.rejectionReasons.some((reason) => reason.includes("non-JSON")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare semantic validator treats quota as retryable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("quota", {
    status: 429,
    headers: { "retry-after": "90" },
  })) as typeof fetch;

  try {
    const validator = createImageSemanticValidator({
      IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);

    await assert.rejects(
      () => validator.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: Buffer.from("image"), candidateIndex: 0 }),
      (error) => error instanceof RetryableImageGenerationError && error.retryAfterSeconds === 90,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini semantic fallback runs only when explicitly configured", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const requestUrl = String(url);
    urls.push(requestUrl);
    if (requestUrl.includes("validator.example.test")) {
      return new Response("offline", { status: 503 });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(validSemanticPayload({ provider: "gemini" })) }] } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const noFallback = createImageSemanticValidator({
      IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "http",
      IMAGE_SEMANTIC_VALIDATOR_URL: "https://validator.example.test",
    } as unknown as NodeJS.ProcessEnv);
    const failed = await noFallback.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: Buffer.from("image"), candidateIndex: 0 });
    assert.equal(failed.available, false);
    assert.equal(urls.length, 1);

    const withFallback = createImageSemanticValidator({
      IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "http",
      IMAGE_SEMANTIC_VALIDATOR_URL: "https://validator.example.test",
      IMAGE_SEMANTIC_VALIDATOR_FALLBACK_PROVIDER: "gemini",
      GEMINI_API_KEY: "gemini-key",
    } as unknown as NodeJS.ProcessEnv);
    const recovered = await withFallback.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: Buffer.from("image"), candidateIndex: 0 });
    assert.equal(recovered.available, true);
    assert.equal(recovered.provider, "gemini");
    assert.equal(urls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("semantic validation rejects floral bouquet instead of fashion textile", async () => {
  const sharp = (await import("sharp")).default;
  const brief = buildTrendImageBrief("floral");
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#c88591",
    },
  }).png().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const facts = candidateFactsFromAnalysis({
    brief,
    pixel,
    candidateIndex: 0,
    semantic: {
      available: true,
      keywordMatch: 0.4,
      fashionRelevance: 0.2,
      materialRealism: 0.5,
      compositionQuality: 0.7,
      requiredCuesPresent: false,
      forbiddenCuesPresent: true,
      textDetected: false,
      logoDetected: false,
      subjectDescription: "a flower bouquet in a vase",
      materialDescription: "fresh flower petals, not a garment",
      rejectionReasons: ["bouquet is not a fashion textile"],
      confidence: 0.9,
      provider: "stub",
    },
  });

  const result = validateTrendConceptCandidate({ brief, facts });
  assert.equal(result.passed, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("forbidden")));
});

test("low material realism rejects otherwise fashion-related candidates", async () => {
  const sharp = (await import("sharp")).default;
  const brief = buildTrendImageBrief("leather");
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#4a3028",
    },
  }).png().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const facts = candidateFactsFromAnalysis({
    brief,
    pixel,
    candidateIndex: 0,
    semantic: {
      available: true,
      keywordMatch: 0.9,
      fashionRelevance: 0.86,
      materialRealism: 0.31,
      compositionQuality: 0.8,
      requiredCuesPresent: true,
      forbiddenCuesPresent: false,
      textDetected: false,
      logoDetected: false,
      subjectDescription: "fashion leather surface",
      materialDescription: "plastic-looking artificial texture",
      rejectionReasons: ["material looks synthetic"],
      confidence: 0.92,
      provider: "stub",
    },
  });

  const result = validateTrendConceptCandidate({ brief, facts });
  assert.equal(result.passed, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("materialRealism")));
});

test("provider abstraction keeps Ollama local by default and Cloudflare optional", () => {
  const local = createImageGenerator({ OLLAMA_BASE_URL: "http://127.0.0.1:11434" } as unknown as NodeJS.ProcessEnv);
  assert.equal(local.provider, "ollama");

  const cloudflare = createImageGenerator({
    IMAGE_GENERATION_PROVIDER: "cloudflare",
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_API_TOKEN: "token",
    CLOUDFLARE_IMAGE_MODEL: "@cf/example/model",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(cloudflare.provider, "cloudflare");
});

test("Cloudflare quota responses are retryable and do not produce an image", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("quota", {
    status: 429,
    headers: { "retry-after": "120" },
  })) as typeof fetch;
  try {
    const cloudflare = createImageGenerator({
      IMAGE_GENERATION_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_IMAGE_MODEL: "@cf/example/model",
    } as unknown as NodeJS.ProcessEnv);

    await assert.rejects(
      () => cloudflare.generate({ prompt: "test", model: "ignored", imageSize: "1024x1280" }),
      (error) => error instanceof RetryableImageGenerationError && error.retryAfterSeconds === 120,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("migration 025 remains additive and avoids destructive replacement", () => {
  const sql = readFileSync("database/025_trend_concept_pixel_validation.sql", "utf8").toLowerCase();

  assert.equal(/\bdrop\b|\bdelete\b|\btruncate\b/.test(sql), false);
  assert.equal(/create\s+or\s+replace\s+function/.test(sql), false);
  assert.ok(sql.includes("add column if not exists"));
  assert.ok(sql.includes("create index if not exists"));
});

test("all failed candidates select no image, preserving the current production image", () => {
  const brief = buildTrendImageBrief("baggy");
  const failed = validateTrendConceptCandidate({
    brief,
    facts: {
      candidateIndex: 0,
      keywordMatch: 0,
      fashionRelevance: 0,
      materialRealism: 0,
      compositionQuality: 0,
      semanticConfidence: 0,
      sharpness: 0,
      width: 512,
      height: 512,
      aspectRatio: 1,
      overexposed: false,
      underexposed: false,
      ocrAvailable: false,
      textDetected: true,
      logoDetected: false,
      personDetected: false,
      requiredCuesPresent: false,
      forbiddenCueDetected: true,
      detectedCues: [],
      missingRequiredCues: brief.requiredVisualCues,
      dominantPalette: "beige/taupe",
      dominantColor: "#c8b898",
      compositionMode: brief.compositionMode,
      perceptualHash: "1".repeat(64),
    },
  });

  assert.equal(rankTrendConceptCandidates([failed]), null);
});

test("page requests do not enqueue image work by default", () => {
  const previous = process.env.AUTO_ENQUEUE_TREND_IMAGES_ENABLED;
  delete process.env.AUTO_ENQUEUE_TREND_IMAGES_ENABLED;
  try {
    assert.equal(isTrendImageAutoEnqueueEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.AUTO_ENQUEUE_TREND_IMAGES_ENABLED;
    else process.env.AUTO_ENQUEUE_TREND_IMAGES_ENABLED = previous;
  }
});
