import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createImageGenerator, RetryableImageGenerationError } from "@/lib/images/image-generator";
import { createImageDefectValidator, runLabelForensics } from "@/lib/images/image-defect-validator";
import { analyzeImagePixels, classifyOcrWords, createOcrProvider, disposeOcrProvider, type OcrProvider } from "@/lib/images/image-pixel-analysis";
import { createImageSemanticValidator, detectImageMimeTypeFromBytes, unavailableSemanticValidation } from "@/lib/images/image-semantic-validator";
import { buildImageWorkerClaimRpc, parseImageWorkerVariant } from "@/lib/images/image-worker-claim";
import { buildTrendImageBrief } from "@/lib/images/trend-image-brief";
import {
  candidateFactsFromAnalysis,
  rankTrendConceptCandidates,
  validateTrendConceptCandidate,
} from "@/lib/images/trend-concept-validation";
import { isTrendImageAutoEnqueueEnabled } from "@/lib/trends/config";
import { buildCloudflareQuotaDeferral, localQuotaFallbackEnabled } from "@/lib/images/image-quota-deferral";

const noTextOcr: OcrProvider = {
  provider: "stub",
  async detectText() {
    return { available: true, textDetected: false, text: "", confidence: 0.99, boxes: [], provider: "stub" };
  },
};

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webpBytes = Buffer.from("RIFFxxxxWEBPVP8 ", "ascii");

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

function validProviderSemanticPayload(overrides: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = { ...validSemanticPayload(overrides) };
  delete payload.available;
  delete payload.provider;
  return payload;
}

function validProviderDefectPayload(overrides: Record<string, unknown> = {}) {
  return {
    visibleLabelDetected: false,
    imitationWritingDetected: false,
    logoOrWatermarkDetected: false,
    materialContradictsBrief: false,
    repeatedCatalogComposition: false,
    fusedHybridGarmentDetected: false,
    detectedMaterial: "genuine leather",
    subjectDescription: "a fashion material detail",
    materialDescription: "realistic material grain and stitching",
    compositionDescription: "editorial asymmetric product image",
    tagRegionDescription: "no collar label, tag or writing visible",
    rejectionReasons: [],
    confidence: 0.87,
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

test("local OCR classification catches high-confidence small label text", () => {
  const result = classifyOcrWords([
    { text: "AI", confidence: 0.93 },
  ], { provider: "local_tesseract", confidenceThreshold: 0.72, minWordLength: 2 });

  assert.equal(result.textDetected, true);
});

test("local OCR classification rejects suspicious low-confidence tag glyphs in neckline region", () => {
  const result = classifyOcrWords([
    { text: "rn", confidence: 0.45, bbox: { x0: 0.44, y0: 0.12, x1: 0.5, y1: 0.16 } },
  ], { provider: "local_tesseract", confidenceThreshold: 0.72, minWordLength: 2 });

  assert.equal(result.textDetected, true);
  assert.equal(result.suspiciousTagLikeTextDetected, true);
  assert.equal(result.suspiciousGlyphClusters?.length, 1);
});

test("OCR provider cleanup disposes after successful work", async () => {
  let disposed = false;
  const provider: OcrProvider = {
    provider: "stub",
    async detectText() {
      return { available: true, textDetected: false, text: "", confidence: 1, boxes: [], provider: "stub" };
    },
    async dispose() {
      disposed = true;
    },
  };

  try {
    await provider.detectText(Buffer.from("ok"));
  } finally {
    await disposeOcrProvider(provider);
  }

  assert.equal(disposed, true);
});

test("OCR provider cleanup disposes after failed work", async () => {
  let disposed = false;
  const provider: OcrProvider = {
    provider: "stub",
    async detectText() {
      throw new Error("ocr failed");
    },
    async dispose() {
      disposed = true;
    },
  };

  await assert.rejects(async () => {
    try {
      await provider.detectText(Buffer.from("fail"));
    } finally {
      await disposeOcrProvider(provider);
    }
  }, /ocr failed/);

  assert.equal(disposed, true);
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
  let requestPayload: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestPayload = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({
    result: { response: JSON.stringify(validProviderSemanticPayload()) },
  }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const validator = createImageSemanticValidator({
      IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const result = await validator.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: jpegBytes, candidateIndex: 0 });

    assert.equal(result.available, true);
    assert.equal(result.provider, "cloudflare");
    assert.equal(result.requiredCuesPresent, true);
    assert.equal(typeof requestPayload.image, "string");
    assert.equal(requestPayload.image.startsWith("data:image/jpeg;base64,"), true);
    assert.equal(Array.isArray(requestPayload.messages[1].content), false);
    assert.ok(requestPayload.guided_json);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare semantic validator accepts result.response as an already-parsed object", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: true,
    result: {
      response: validProviderSemanticPayload(),
    },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const validator = createImageSemanticValidator({
      IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const result = await validator.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: jpegBytes, candidateIndex: 0 });

    assert.equal(result.available, true);
    assert.equal(result.keywordMatch, 0.92);
    assert.equal(result.materialRealism, 0.86);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare semantic validator accepts result as the semantic object", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    result: validProviderSemanticPayload(),
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const validator = createImageSemanticValidator({
      IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const result = await validator.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: pngBytes, candidateIndex: 0 });

    assert.equal(result.available, true);
    assert.equal(result.provider, "cloudflare");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare semantic validator reports sanitized schema issues", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: true,
    result: {
      response: {
        keywordMatch: 0.9,
      },
    },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const validator = createImageSemanticValidator({
      IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const result = await validator.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: webpBytes, candidateIndex: 0 });

    assert.equal(result.available, false);
    assert.match(result.error || "", /responseShape=object/);
    assert.match(result.error || "", /fashionRelevance/);
    assert.equal((result.error || "").includes("base64"), false);
    assert.equal((result.error || "").includes("token"), false);
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
    const result = await validator.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: jpegBytes, candidateIndex: 0 });

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
      () => validator.validate({ brief: buildTrendImageBrief("denim"), imageBuffer: jpegBytes, candidateIndex: 0 }),
      (error) => error instanceof RetryableImageGenerationError && error.retryAfterSeconds === 90,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare defect validator accepts complete strict JSON from the full-image review", async () => {
  const sharp = (await import("sharp")).default;
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#3b2a25",
    },
  }).jpeg().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const originalFetch = globalThis.fetch;
  let requestPayload: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestPayload = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({
      result: { response: validProviderDefectPayload() },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const validator = createImageDefectValidator({
      IMAGE_DEFECT_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const result = await validator.validate({ brief: buildTrendImageBrief("leather"), imageBuffer, pixel, candidateIndex: 0 });

    assert.equal(result.available, true);
    assert.equal(result.passed, true);
    assert.equal(result.reviewAttempts, 1);
    assert.equal(requestPayload.image.startsWith("data:image/jpeg;base64,"), true);
    assert.match(requestPayload.messages[1].content, /full generated trend card image/);
    assert.match(requestPayload.messages[1].content, /collar label/);
    assert.match(requestPayload.messages[1].content, /independently of OCR/);
    assert.ok(requestPayload.guided_json);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("defect review failures block publication even with strong semantic scores", async () => {
  const sharp = (await import("sharp")).default;
  const brief = buildTrendImageBrief("oversized");
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#cad3da",
    },
  }).jpeg().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const semantic = validSemanticPayload({
    keywordMatch: 0.99,
    fashionRelevance: 0.99,
    materialRealism: 0.99,
    compositionQuality: 0.99,
    confidence: 0.99,
    materialDescription: "poplin",
  }) as any;
  const defect = {
    available: true,
    passed: false,
    visibleLabelDetected: true,
    imitationWritingDetected: false,
    logoOrWatermarkDetected: false,
    materialContradictsBrief: true,
    repeatedCatalogComposition: true,
    fusedHybridGarmentDetected: false,
    detectedMaterial: "denim/chambray",
    subjectDescription: "centered oversized shirt",
    materialDescription: "denim-like twill",
    compositionDescription: "centered product catalog garment on grey",
    tagRegionDescription: "small collar label visible",
    rejectionReasons: ["visible collar label", "material contradicts poplin", "repeated catalog composition"],
    confidence: 0.82,
    labelForensicsPassed: false,
    labelForensicsUncertain: true,
    labelForensicsReasons: ["possible white sewn-in tag with dark/red glyph detail in neckline crop"],
    reviewAttempts: 1,
    incompleteEvidenceFields: [],
    provider: "stub",
  };
  const facts = candidateFactsFromAnalysis({ brief, pixel, semantic, defect, candidateIndex: 0 });
  const result = validateTrendConceptCandidate({ brief, facts });

  assert.equal(result.passed, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("defect review detected visible label")));
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("material mismatch")));
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("centered product-catalog")));
});

test("incomplete high-confidence defect responses retry once then fail closed", async () => {
  const sharp = (await import("sharp")).default;
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#cad3da",
    },
  }).jpeg().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    result: {
      response: validProviderDefectPayload({
        visibleLabelDetected: false,
        imitationWritingDetected: false,
        logoOrWatermarkDetected: false,
        materialContradictsBrief: false,
        repeatedCatalogComposition: false,
        detectedMaterial: "",
        subjectDescription: "",
        materialDescription: "",
        compositionDescription: "",
        tagRegionDescription: "",
        rejectionReasons: [],
        confidence: 1,
      }),
    },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const incompleteFetch = globalThis.fetch;
  globalThis.fetch = (async (...arguments_: Parameters<typeof fetch>) => {
    calls += 1;
    return incompleteFetch(...arguments_);
  }) as typeof fetch;

  try {
    const validator = createImageDefectValidator({
      IMAGE_DEFECT_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const defect = await validator.validate({ brief: buildTrendImageBrief("oversized"), imageBuffer, pixel, candidateIndex: 0 });

    assert.equal(calls, 2);
    assert.equal(defect.available, false);
    assert.equal(defect.passed, false);
    assert.equal(defect.confidence, 0);
    assert.equal(defect.reviewAttempts, 2);
    assert.equal(defect.error, "defect_validator_incomplete_response");
    assert.ok(defect.incompleteEvidenceFields.includes("subjectDescription"));
    assert.deepEqual(defect.rejectionReasons, ["defect_validator_incomplete_response"]);
    const brief=buildTrendImageBrief("oversized");
    const semantic=validSemanticPayload({requiredCuesPresent:true}) as any;
    const publication=validateTrendConceptCandidate({brief,facts:candidateFactsFromAnalysis({brief,pixel,semantic,defect,candidateIndex:0})});
    assert.equal(publication.passed,false);
    assert.ok(publication.rejectionReasons.some((reason)=>reason.includes("unavailable or incomplete")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("one bounded defect-review retry uses full image plus enlarged collar and tag crops", async () => {
  const sharp = (await import("sharp")).default;
  const imageBuffer = await sharp({
    create: { width: 1024, height: 1280, channels: 3, background: "#8795a3" },
  }).jpeg().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const incomplete = validProviderDefectPayload({
    detectedMaterial: "",
    subjectDescription: "",
    materialDescription: "",
    compositionDescription: "",
    tagRegionDescription: "",
    confidence: 1,
  });
  const payloads: any[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body || "{}")));
    const response = payloads.length === 1 ? incomplete : validProviderDefectPayload();
    return new Response(JSON.stringify({ result: { response } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const validator = createImageDefectValidator({
      IMAGE_DEFECT_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const defect = await validator.validate({ brief: buildTrendImageBrief("oversized"), imageBuffer, pixel, candidateIndex: 0 });

    assert.equal(payloads.length, 2);
    assert.equal(defect.available, true);
    assert.equal(defect.passed, true);
    assert.equal(defect.reviewAttempts, 2);
    assert.match(payloads[0].messages[1].content, /full generated trend card image/);
    assert.match(payloads[1].messages[1].content, /one allowed retry/);
    assert.match(payloads[1].messages[1].content, /enlarged neckline/);
    assert.notEqual(payloads[0].image, payloads[1].image);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("visible collar label is rejected visually even when OCR misses it", async () => {
  const sharp = (await import("sharp")).default;
  const imageBuffer = await sharp({
    create: { width: 1024, height: 1280, channels: 3, background: "#a5b2bf" },
  }).jpeg().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      result: { response: validProviderDefectPayload({
        visibleLabelDetected: true,
        imitationWritingDetected: true,
        subjectDescription: "off-centre oversized shirt",
        tagRegionDescription: "a sewn rectangular collar label with fake letter-like marks is visible",
        rejectionReasons: ["visible sewn collar label despite OCR miss"],
      }) },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const validator = createImageDefectValidator({
      IMAGE_DEFECT_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const defect = await validator.validate({ brief: buildTrendImageBrief("oversized"), imageBuffer, pixel, candidateIndex: 0 });

    assert.equal(pixel.ocr.textDetected, false);
    assert.equal(calls, 1);
    assert.equal(defect.available, true);
    assert.equal(defect.passed, false);
    assert.equal(defect.visibleLabelDetected, true);
    assert.equal(defect.imitationWritingDetected, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fused hybrid layering is rejected as impossible garment construction", async () => {
  const sharp = (await import("sharp")).default;
  const brief = buildTrendImageBrief("layering");
  const imageBuffer = await sharp({
    create: { width: 1024, height: 1280, channels: 3, background: "#5f6d78" },
  }).jpeg().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    result: { response: validProviderDefectPayload({
      fusedHybridGarmentDetected: true,
      subjectDescription: "several clothing layers melted into one hybrid object",
      compositionDescription: "centred garment with collars and sleeves fused through impossible seams",
      rejectionReasons: ["layers do not have independent collars, hems, sleeves or edges"],
    }) },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const validator = createImageDefectValidator({
      IMAGE_DEFECT_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const defect = await validator.validate({ brief, imageBuffer, pixel, candidateIndex: 0 });
    const semantic = validSemanticPayload({ requiredCuesPresent: true }) as any;
    const validation = validateTrendConceptCandidate({
      brief,
      facts: candidateFactsFromAnalysis({ brief, pixel, semantic, defect, candidateIndex: 0 }),
    });

    assert.equal(defect.passed, false);
    assert.equal(defect.fusedHybridGarmentDetected, true);
    assert.equal(validation.passed, false);
    assert.ok(validation.rejectionReasons.some((reason) => reason.includes("fused or impossible hybrid garment")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publication validation independently enforces defect confidence threshold", async () => {
  const sharp = (await import("sharp")).default;
  const brief = buildTrendImageBrief("floral");
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#c88591",
    },
  }).jpeg().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const semantic = validSemanticPayload({ provider: "stub" }) as any;
  const defect = {
    ...validProviderDefectPayload({ confidence: 0.6 }),
    available: true,
    passed: true,
    provider: "stub",
    labelForensicsPassed: true,
    labelForensicsUncertain: false,
    labelForensicsReasons: [],
    reviewAttempts: 1,
    incompleteEvidenceFields: [],
  };
  const facts = candidateFactsFromAnalysis({ brief, pixel, semantic, defect, candidateIndex: 0 });
  const result = validateTrendConceptCandidate({ brief, facts });

  assert.equal(result.passed, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("defect confidence 0.60 below 0.75")));
});

test("run 29717363735 compressed tag-region regression crops fail label forensics", async () => {
  const sharp = (await import("sharp")).default;
  const fixtures = [
    "lib/images/__fixtures__/regression-crops/run-29717363735-oversized-collar-label.svg",
    "lib/images/__fixtures__/regression-crops/run-29717363735-layering-inner-neckline-writing.svg",
    "lib/images/__fixtures__/regression-crops/run-29717363735-kurta-white-neck-tag-red-writing.svg",
  ];

  for (const fixture of fixtures) {
    const imageBuffer = await sharp(readFileSync(fixture)).jpeg().toBuffer();
    const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
    const result = await runLabelForensics(imageBuffer, pixel);

    assert.equal(result.passed, false, fixture);
    assert.equal(result.uncertain, true, fixture);
    assert.ok(result.reasons.some((reason) => reason.includes("sewn-in tag") || reason.includes("neckline")), fixture);
  }
});

test("Cloudflare defect validator reports sanitized schema issues", async () => {
  const sharp = (await import("sharp")).default;
  const imageBuffer = await sharp({
    create: {
      width: 1024,
      height: 1280,
      channels: 3,
      background: "#3b2a25",
    },
  }).jpeg().toBuffer();
  const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider: noTextOcr });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    result: { response: { visibleLabelDetected: false } },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const validator = createImageDefectValidator({
      IMAGE_DEFECT_VALIDATOR_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_VISION_MODEL: "@cf/meta/llama-vision",
    } as unknown as NodeJS.ProcessEnv);
    const result = await validator.validate({ brief: buildTrendImageBrief("leather"), imageBuffer, pixel, candidateIndex: 0 });

    assert.equal(result.available, false);
    assert.match(result.error || "", /responseShape=object/);
    assert.match(result.error || "", /materialContradictsBrief/);
    assert.equal((result.error || "").includes("base64"), false);
    assert.equal((result.error || "").includes("token"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("image MIME detection identifies JPEG, PNG and WebP bytes", () => {
  assert.equal(detectImageMimeTypeFromBytes(jpegBytes), "image/jpeg");
  assert.equal(detectImageMimeTypeFromBytes(pngBytes), "image/png");
  assert.equal(detectImageMimeTypeFromBytes(webpBytes), "image/webp");
  assert.throws(() => detectImageMimeTypeFromBytes(Buffer.from("not an image")), /unsupported image MIME/);
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
      candidates: [{ content: { parts: [{ text: JSON.stringify(validProviderSemanticPayload()) }] } }],
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

test("Cloudflare FLUX image generation uses multipart form data and parses image bytes", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: BodyInit | null | undefined = null;
  let capturedHeaders: HeadersInit | undefined;
  const base64Image = Buffer.alloc(256, 7).toString("base64");
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedBody = init?.body;
    capturedHeaders = init?.headers;
    return new Response(JSON.stringify({
      result: { image: base64Image },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const cloudflare = createImageGenerator({
      IMAGE_GENERATION_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_IMAGE_MODEL: "@cf/black-forest-labs/flux-2-klein-9b",
    } as unknown as NodeJS.ProcessEnv);

    const image = await cloudflare.generate({ prompt: "test prompt", model: "ignored", imageSize: "1024x1280" });
    const form = capturedBody as unknown as FormData;
    assert.equal(image.provider, "cloudflare");
    assert.equal(image.buffer.length, 256);
    assert.ok(form instanceof FormData);
    assert.equal(form.get("prompt"), "test prompt");
    assert.equal(form.get("width"), "1024");
    assert.equal(form.get("height"), "1280");
    assert.equal((capturedHeaders as Record<string, string>)["Content-Type"], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare image generation reports authentication failure clearly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;

  try {
    const cloudflare = createImageGenerator({
      IMAGE_GENERATION_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "bad-token",
      CLOUDFLARE_IMAGE_MODEL: "@cf/black-forest-labs/flux-2-klein-9b",
    } as unknown as NodeJS.ProcessEnv);

    await assert.rejects(
      () => cloudflare.generate({ prompt: "test", model: "ignored", imageSize: "1024x1280" }),
      /authentication failed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare image generation rejects malformed image responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    result: { message: "ok but no image" },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const cloudflare = createImageGenerator({
      IMAGE_GENERATION_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "token",
      CLOUDFLARE_IMAGE_MODEL: "@cf/black-forest-labs/flux-2-klein-9b",
    } as unknown as NodeJS.ProcessEnv);

    await assert.rejects(
      () => cloudflare.generate({ prompt: "test", model: "ignored", imageSize: "1024x1280" }),
      /did not include base64 image data/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare smoke test script does not import Supabase or production queue code", () => {
  const source = readFileSync("scripts/cloudflare-image-pipeline-smoke-test.ts", "utf8");

  assert.equal(source.includes("@supabase/supabase-js"), false);
  assert.equal(source.includes("image_generation_jobs"), false);
  assert.equal(source.includes("claim_next_image_generation_job"), false);
  assert.equal(source.includes("finally"), true);
  assert.equal(source.includes("disposeOcrProvider(ocrProvider)"), true);
  assert.equal(source.includes("createImageDefectValidator"), true);
});

test("Cloudflare quality calibration is manual-only, zero-Supabase and layering-only", () => {
  const source = readFileSync("scripts/cloudflare-image-quality-calibration.ts", "utf8");
  const workflow = readFileSync(".github/workflows/cloudflare-image-quality-calibration.yml", "utf8");

  assert.equal(source.includes("@supabase/supabase-js"), false);
  assert.equal(source.includes("image_generation_jobs"), false);
  assert.equal(source.includes("claim_next_image_generation_job"), false);
  assert.equal(source.includes('DEFAULT_CALIBRATION_KEYWORDS = ["layering"]'), true);
  assert.equal(source.includes("MANUAL_CALIBRATION_MAX_CANDIDATES"), true);
  assert.equal(source.includes("CALIBRATION_MAX_TEMPORARY_IMAGES"), true);
  assert.equal(source.includes("runManualCalibrationCandidateSelection"), true);
  assert.equal(source.includes("rankTrendConceptCandidates"), false);
  assert.match(source, /layering/);
  assert.equal(source.includes("@supabase"), false);
  assert.equal(source.includes("storage.from"), false);
  assert.equal(source.includes(".upload("), false);
  assert.equal(source.includes("complete_image_generation_job"), false);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /keywords/);
  assert.match(workflow, /default: layering/);
  assert.match(workflow, /CALIBRATION_MAX_TEMPORARY_IMAGES: 3/);
  assert.equal(workflow.includes("schedule:"), false);
  assert.equal(workflow.includes("ENABLE_CLOUD_IMAGE_WORKER"), false);
});

test("production image worker disposes OCR provider from a finally block", () => {
  const source = readFileSync("scripts/ollama-image-worker.ts", "utf8");

  assert.equal(source.includes("finally"), true);
  assert.equal(source.includes("disposeOcrProvider(ocrProvider)"), true);
  assert.equal(source.includes("process.exit(1)"), false);
});

test("migration 025 remains additive and avoids destructive replacement", () => {
  const sql = readFileSync("database/025_trend_concept_pixel_validation.sql", "utf8").toLowerCase();

  assert.equal(/\bdrop\b|\bdelete\b|\btruncate\b/.test(sql), false);
  assert.equal(/create\s+or\s+replace\s+function/.test(sql), false);
  assert.ok(sql.includes("add column if not exists"));
  assert.ok(sql.includes("create index if not exists"));
});

test("migration 026 makes internal review data private and service-role scoped", () => {
  const sql = readFileSync("database/026_trend_concept_validation_security.sql", "utf8").toLowerCase();

  assert.ok(sql.includes('drop policy if exists "trend concept image reviews are readable"'));
  assert.ok(sql.includes('drop policy if exists "trend concept image candidates are readable"'));
  assert.ok(sql.includes("revoke all on table trend_concept_image_reviews from public, anon, authenticated"));
  assert.ok(sql.includes("revoke all on table trend_concept_image_candidates from public, anon, authenticated"));
  assert.ok(sql.includes("to service_role"));
  assert.ok(sql.includes("claim_next_image_generation_job_for_variant"));
});

test("variant-scoped concept worker never requests trend_women, trend_men or trend_hero", () => {
  const desiredVariant = parseImageWorkerVariant("trend_concept");
  const claim = buildImageWorkerClaimRpc({
    workerId: "cloud-worker-test",
    lockTimeoutMinutes: 30,
    desiredVariant,
  });

  assert.equal(claim.name, "claim_next_image_generation_job_for_variant");
  assert.equal(claim.args.desired_variant, "trend_concept");
  assert.notEqual(claim.args.desired_variant, "trend_women");
  assert.notEqual(claim.args.desired_variant, "trend_men");
  assert.notEqual(claim.args.desired_variant, "trend_hero");
});

test("unscoped local worker still uses the existing general claim function", () => {
  const claim = buildImageWorkerClaimRpc({
    workerId: "local-worker-test",
    lockTimeoutMinutes: 30,
    desiredVariant: null,
  });

  assert.equal(claim.name, "claim_next_image_generation_job");
  assert.equal("desired_variant" in claim.args, false);
});

test("variant-scoped SQL claims only the exact desired variant", () => {
  const sql = readFileSync("database/026_trend_concept_validation_security.sql", "utf8").toLowerCase();

  assert.ok(sql.includes("variant = desired_variant"));
  assert.ok(sql.includes("for update skip locked"));
  assert.ok(sql.includes("desired_variant not in"));
  assert.ok(sql.includes("grant execute on function claim_next_image_generation_job_for_variant"));
});

test("quota retry metadata path does not target unrelated variants", () => {
  const claim = buildImageWorkerClaimRpc({
    workerId: "cloud-worker-test",
    lockTimeoutMinutes: 30,
    desiredVariant: "trend_concept",
  });

  assert.equal(claim.args.desired_variant, "trend_concept");
  assert.equal(["trend_women", "trend_men", "trend_hero"].includes(claim.args.desired_variant), false);
});

test("Cloudflare quota defers without permanent failure and records safe retry metadata",()=>{const update=buildCloudflareQuotaDeferral({metadata:{formulaId:"formula-1"}},new RetryableImageGenerationError("quota",120,"cloudflare"),new Date("2026-07-20T00:00:00.000Z"));assert.equal(update.status,"deferred");assert.equal(update.deferred_provider,"cloudflare");assert.equal(update.deferred_reason,"quota_exhausted");assert.equal(update.retry_after,"2026-07-20T00:02:00.000Z");assert.equal(update.metadata.provider,"cloudflare");assert.equal(update.metadata.reason,"quota_exhausted");assert.equal((update.metadata as Record<string,unknown>).formulaId,"formula-1");assert.equal("image_url" in update,false);});

test("local Ollama quota fallback is explicit and passed to quota-aware claim",()=>{assert.equal(localQuotaFallbackEnabled({...process.env,ENABLE_LOCAL_OLLAMA_QUOTA_FALLBACK:"false"}),false);assert.equal(localQuotaFallbackEnabled({...process.env,ENABLE_LOCAL_OLLAMA_QUOTA_FALLBACK:"true"}),true);const blocked=buildImageWorkerClaimRpc({workerId:"local",lockTimeoutMinutes:30,workerProvider:"ollama",allowLocalFallback:false});const allowed=buildImageWorkerClaimRpc({workerId:"local",lockTimeoutMinutes:30,workerProvider:"ollama",allowLocalFallback:true});assert.equal(blocked.name,"claim_next_image_generation_job_with_quota_policy");assert.equal(blocked.args.allow_local_fallback,false);assert.equal(allowed.args.allow_local_fallback,true);});

test("quota migration gates deferred claims and worker stops after one quota response",()=>{const sql=readFileSync("database/029_image_quota_deferral.sql","utf8").toLowerCase();const worker=readFileSync("scripts/ollama-image-worker.ts","utf8");assert.ok(sql.includes("status='deferred'"));assert.ok(sql.includes("retry_after<=now()"));assert.ok(sql.includes("worker_provider='ollama' and allow_local_fallback=true"));assert.ok(sql.includes("for update skip locked"));const start=worker.lastIndexOf("if (error instanceof RetryableImageGenerationError && error.provider === \"cloudflare\")");const quotaBlock=worker.slice(start,worker.indexOf("} else {",start));assert.ok(quotaBlock.includes("deferCloudflareQuotaJob"));assert.ok(quotaBlock.includes("stopping = true"));assert.equal(quotaBlock.includes("markFailed"),false);});

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
