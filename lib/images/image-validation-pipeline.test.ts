import test from "node:test";
import assert from "node:assert/strict";
import { createImageGenerator, RetryableImageGenerationError } from "@/lib/images/image-generator";
import { analyzeImagePixels, type OcrProvider } from "@/lib/images/image-pixel-analysis";
import { unavailableSemanticValidation } from "@/lib/images/image-semantic-validator";
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
    return { available: true, textDetected: false, text: "", confidence: 0.99, provider: "stub" };
  },
};

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
