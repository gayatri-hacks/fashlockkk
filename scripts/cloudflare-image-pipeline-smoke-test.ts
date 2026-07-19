#!/usr/bin/env tsx
import "./load-env";
import { createHash } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { buildFashionImagePrompt } from "../lib/images/build-fashion-image-prompt";
import { createImageGenerator, RetryableImageGenerationError } from "../lib/images/image-generator";
import { createImageDefectValidator } from "../lib/images/image-defect-validator";
import { analyzeImagePixels, createOcrProvider, disposeOcrProvider } from "../lib/images/image-pixel-analysis";
import { createImageSemanticValidator } from "../lib/images/image-semantic-validator";
import { buildTrendImageBrief } from "../lib/images/trend-image-brief";
import { candidateFactsFromAnalysis, validateTrendConceptCandidate } from "../lib/images/trend-concept-validation";

const DEFAULT_KEYWORD = "oversized";
const DEFAULT_IMAGE_SIZE = "1024x1280";
const DEFAULT_OUTPUT_DIR = ".tmp/cloudflare-image-smoke-test";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the Cloudflare smoke test`);
  return value;
}

function redact(value: string | undefined) {
  return value ? "[redacted]" : "";
}

function classifyFailure(error: unknown) {
  if (error instanceof RetryableImageGenerationError) {
    return `Cloudflare quota/rate-limit failure: ${error.message}${error.retryAfterSeconds ? `; retry after ${error.retryAfterSeconds}s` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function decodedImageMetadata(imageBuffer: Buffer) {
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Cloudflare returned malformed image bytes that Sharp could not identify");
  }
  if (imageBuffer.length < 1024) {
    throw new Error(`Cloudflare returned malformed image bytes: only ${imageBuffer.length} bytes`);
  }
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    size: imageBuffer.length,
  };
}

async function main() {
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requiredEnv("CLOUDFLARE_API_TOKEN");
  const imageModel = requiredEnv("CLOUDFLARE_IMAGE_MODEL");
  const visionModel = requiredEnv("CLOUDFLARE_VISION_MODEL");
  const keyword = (process.env.SMOKE_TEST_KEYWORD || DEFAULT_KEYWORD).trim() || DEFAULT_KEYWORD;
  const outputDir = process.env.SMOKE_TEST_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const smokeEnv = {
    ...process.env,
    IMAGE_GENERATION_PROVIDER: "cloudflare",
    IMAGE_SEMANTIC_VALIDATOR_PROVIDER: "cloudflare",
    IMAGE_SEMANTIC_VALIDATOR_FALLBACK_PROVIDER: "disabled",
    IMAGE_DEFECT_VALIDATOR_PROVIDER: "cloudflare",
    IMAGE_OCR_PROVIDER: process.env.IMAGE_OCR_PROVIDER || "local_tesseract",
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: apiToken,
    CLOUDFLARE_IMAGE_MODEL: imageModel,
    CLOUDFLARE_VISION_MODEL: visionModel,
  } as NodeJS.ProcessEnv;

  const prompt = buildFashionImagePrompt({
    entityType: "trend",
    entityId: -1,
    variant: "trend_concept",
    keyword,
    editorialName: keyword,
    model: imageModel,
    imageSize: DEFAULT_IMAGE_SIZE,
  });
  const brief = buildTrendImageBrief(keyword);
  const generator = createImageGenerator(smokeEnv);
  const ocrProvider = createOcrProvider(smokeEnv);
  const semanticValidator = createImageSemanticValidator(smokeEnv);
  const defectValidator = createImageDefectValidator(smokeEnv);

  const report: Record<string, unknown> = {
    test: "cloudflare-image-pipeline-smoke-test",
    keyword,
    imageModel,
    visionModel,
    imageSize: DEFAULT_IMAGE_SIZE,
    candidateCount: 1,
    credentials: {
      accountId: redact(accountId),
      apiToken: redact(apiToken),
    },
    promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 16),
    startedAt: new Date().toISOString(),
  };

  try {
    const generated = await generator.generate({
      prompt,
      model: imageModel,
      imageSize: DEFAULT_IMAGE_SIZE,
    });
    const metadata = await decodedImageMetadata(generated.buffer);
    const imagePath = join(outputDir, `cloudflare-smoke-${keyword.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${metadata.format}`);
    await writeFile(imagePath, generated.buffer);

    const pixel = await analyzeImagePixels(generated.buffer, { ocrProvider });
    if (!pixel.ocr.available) {
      throw new Error(`local Tesseract OCR did not complete: ${pixel.ocr.error || "provider unavailable"}`);
    }

    const semantic = await semanticValidator.validate({ brief, imageBuffer: generated.buffer, candidateIndex: 0 });
    if (!semantic.available) {
      throw new Error(`Cloudflare semantic validation failed strict JSON schema: ${semantic.error || semantic.rejectionReasons.join("; ")}`);
    }

    const defect = await defectValidator.validate({ brief, imageBuffer: generated.buffer, pixel, candidateIndex: 0 });
    if (!defect.available) {
      throw new Error(`Cloudflare defect validation failed strict JSON schema: ${defect.error || defect.rejectionReasons.join("; ")}`);
    }

    const facts = candidateFactsFromAnalysis({ brief, pixel, semantic, defect, candidateIndex: 0 });
    const validation = validateTrendConceptCandidate({ brief, facts });

    Object.assign(report, {
      completedAt: new Date().toISOString(),
      status: validation.passed ? "passed" : "failed",
      image: {
        path: imagePath,
        provider: generated.provider,
        model: generated.model,
        ...metadata,
      },
      pixel: {
        width: pixel.width,
        height: pixel.height,
        aspectRatio: pixel.aspectRatio,
        sharpness: pixel.sharpness,
        brightness: pixel.brightness,
        contrast: pixel.contrast,
        dominantPalette: pixel.dominantPalette,
        dominantColor: pixel.dominantColor,
        perceptualHash: pixel.perceptualHash,
        integrityHash: pixel.integrityHash,
      },
      ocr: {
        provider: pixel.ocr.provider,
        available: pixel.ocr.available,
        textDetected: pixel.ocr.textDetected,
        confidence: pixel.ocr.confidence,
        boxCount: pixel.ocr.boxes.length,
        suspiciousTagLikeTextDetected: Boolean(pixel.ocr.suspiciousTagLikeTextDetected),
        suspiciousGlyphClusterCount: pixel.ocr.suspiciousGlyphClusters?.length || 0,
      },
      semantic: {
        provider: semantic.provider,
        keywordMatch: semantic.keywordMatch,
        fashionRelevance: semantic.fashionRelevance,
        materialRealism: semantic.materialRealism,
        compositionQuality: semantic.compositionQuality,
        requiredCuesPresent: semantic.requiredCuesPresent,
        forbiddenCuesPresent: semantic.forbiddenCuesPresent,
        textDetected: semantic.textDetected,
        logoDetected: semantic.logoDetected,
        subjectDescription: semantic.subjectDescription,
        materialDescription: semantic.materialDescription,
        confidence: semantic.confidence,
        rejectionReasons: semantic.rejectionReasons,
      },
      defect: {
        provider: defect.provider,
        passed: defect.passed,
        visibleLabelDetected: defect.visibleLabelDetected,
        imitationWritingDetected: defect.imitationWritingDetected,
        logoOrWatermarkDetected: defect.logoOrWatermarkDetected,
        materialContradictsBrief: defect.materialContradictsBrief,
        repeatedCatalogComposition: defect.repeatedCatalogComposition,
        detectedMaterial: defect.detectedMaterial,
        subjectDescription: defect.subjectDescription,
        materialDescription: defect.materialDescription,
        compositionDescription: defect.compositionDescription,
        tagRegionDescription: defect.tagRegionDescription,
        confidence: defect.confidence,
        rejectionReasons: defect.rejectionReasons,
      },
      publicationValidation: {
        passed: validation.passed,
        score: validation.score,
        rejectionReasons: validation.rejectionReasons,
      },
    });

    await writeFile(join(outputDir, "cloudflare-smoke-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    if (!validation.passed) {
      throw new Error(`Cloudflare Image Pipeline Smoke Test failed publication validation: ${validation.rejectionReasons.join("; ")}`);
    }
    console.log("Cloudflare Image Pipeline Smoke Test passed");
    console.log(`Generated image bytes: ${metadata.size}`);
    console.log(`Decoded image: ${metadata.width}x${metadata.height} ${metadata.format}`);
    console.log(`Sharp pixel analysis: hash=${pixel.perceptualHash.slice(0, 16)} palette=${pixel.dominantPalette}`);
    console.log(`Local Tesseract OCR: available=${pixel.ocr.available} textDetected=${pixel.ocr.textDetected}`);
    console.log(`Cloudflare semantic validation: keywordMatch=${semantic.keywordMatch.toFixed(2)} materialRealism=${semantic.materialRealism.toFixed(2)}`);
    console.log(`Cloudflare defect validation: passed=${defect.passed} material=${defect.detectedMaterial || "unknown"}`);
    console.log(`Publication validation computed: passed=${validation.passed} score=${validation.score}`);
    console.log(`Redacted artifact report: ${join(outputDir, "cloudflare-smoke-report.json")}`);
  } catch (error) {
    Object.assign(report, {
      completedAt: new Date().toISOString(),
      status: "failed",
      error: classifyFailure(error),
    });
    await writeFile(join(outputDir, "cloudflare-smoke-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    throw new Error(classifyFailure(error));
  } finally {
    await disposeOcrProvider(ocrProvider);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
