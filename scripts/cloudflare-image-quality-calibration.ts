#!/usr/bin/env tsx
import "./load-env";
import { createHash } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { buildFashionImagePrompt } from "../lib/images/build-fashion-image-prompt";
import { createImageDefectValidator } from "../lib/images/image-defect-validator";
import { createImageGenerator, RetryableImageGenerationError } from "../lib/images/image-generator";
import { analyzeImagePixels, createOcrProvider, disposeOcrProvider } from "../lib/images/image-pixel-analysis";
import { createImageSemanticValidator } from "../lib/images/image-semantic-validator";
import { buildTrendImageBrief } from "../lib/images/trend-image-brief";
import { candidateFactsFromAnalysis, validateTrendConceptCandidate } from "../lib/images/trend-concept-validation";

const CALIBRATION_KEYWORDS = ["oversized", "floral", "leather", "layering", "kurta"] as const;
const MAX_TEMPORARY_IMAGES = 5;
const IMAGE_SIZE = "1024x1280";
const OUTPUT_DIR = ".tmp/cloudflare-image-quality-calibration";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the Cloudflare image quality calibration`);
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

function calibrationDirection(keyword: string) {
  const directions: Record<string, string> = {
    oversized:
      "Manual calibration emphasis: avoid a centered front-on shirt on a grey wall. Create a suspended, off-centre oversized garment with visible dropped shoulders, oversized collar and asymmetric air around the cloth.",
    floral:
      "Manual calibration emphasis: make this a macro fashion textile or garment-surface study with botanical print registration, not a bouquet, vase or decorative flower object.",
    leather:
      "Manual calibration emphasis: make this an architectural leather construction still-life with dark leather grain, edge highlights and stitching, not denim, chambray or cotton.",
    layering:
      "Manual calibration emphasis: make this an asymmetric overlap of multiple garment materials with visible stacked collars, hems and texture contrast, not one centered garment.",
    kurta:
      "Manual calibration emphasis: make this an edge-to-edge cropped kurta construction detail in indigo, maroon, forest green or restrained saffron; no caption panel, no decorative border and no fake writing.",
  };
  return directions[keyword] || "";
}

function promptForKeyword(keyword: string, imageModel: string) {
  const basePrompt = buildFashionImagePrompt({
    entityType: "trend",
    entityId: -1,
    variant: "trend_concept",
    keyword,
    editorialName: keyword,
    model: imageModel,
    imageSize: IMAGE_SIZE,
  });

  return [
    basePrompt,
    "",
    "Manual quality calibration requirement: this preview belongs to a five-card diversity set. Vary composition, palette and material from the other calibration keywords. Avoid repetitive centered garment-on-neutral-wall product catalog imagery.",
    calibrationDirection(keyword),
  ].filter(Boolean).join("\n");
}

function relative(path: string) {
  return path.split("/").pop() || path;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function contactSheetHtml(reports: any[]) {
  const cards = reports.map((report) => `
    <article>
      <img src="${htmlEscape(relative(report.image?.path))}" alt="${htmlEscape(report.keyword)} preview" />
      <h2>${htmlEscape(report.keyword)}</h2>
      <p><strong>Status:</strong> ${htmlEscape(report.status)}</p>
      <p><strong>Composition:</strong> ${htmlEscape(report.brief?.compositionMode)} / ${htmlEscape(report.defect?.compositionDescription)}</p>
      <p><strong>Material:</strong> ${htmlEscape(report.brief?.materialFamily)} / ${htmlEscape(report.defect?.detectedMaterial)}</p>
      <p><strong>Semantic:</strong> keyword ${htmlEscape(report.semantic?.keywordMatch)} material ${htmlEscape(report.semantic?.materialRealism)}</p>
      <p><strong>Defects:</strong> ${htmlEscape((report.defect?.rejectionReasons || []).join("; ") || "none")}</p>
      <p><strong>Publication:</strong> ${htmlEscape(report.publicationValidation?.passed)} score ${htmlEscape(report.publicationValidation?.score)}</p>
    </article>
  `).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fashlock Cloudflare Image Quality Calibration</title>
  <style>
    body { margin: 24px; font-family: Arial, sans-serif; background: #faf7f4; color: #2c2418; }
    h1 { font-size: 24px; font-weight: 500; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
    article { background: white; border: 1px solid #e5ded5; padding: 12px; }
    img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; background: #eee8df; }
    h2 { margin: 12px 0 8px; font-size: 18px; text-transform: capitalize; }
    p { font-size: 12px; line-height: 1.45; }
  </style>
</head>
<body>
  <h1>Fashlock Cloudflare Image Quality Calibration</h1>
  <p>Manual-only artifact. No Supabase reads or writes. No queue claims. One candidate per keyword.</p>
  <section class="grid">${cards}</section>
</body>
</html>
`;
}

async function main() {
  if (CALIBRATION_KEYWORDS.length > MAX_TEMPORARY_IMAGES) {
    throw new Error(`Calibration would generate ${CALIBRATION_KEYWORDS.length} images, exceeding max ${MAX_TEMPORARY_IMAGES}`);
  }

  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requiredEnv("CLOUDFLARE_API_TOKEN");
  const imageModel = requiredEnv("CLOUDFLARE_IMAGE_MODEL");
  const visionModel = requiredEnv("CLOUDFLARE_VISION_MODEL");
  const outputDir = process.env.CALIBRATION_OUTPUT_DIR || OUTPUT_DIR;

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const calibrationEnv = {
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

  const generator = createImageGenerator(calibrationEnv);
  const ocrProvider = createOcrProvider(calibrationEnv);
  const semanticValidator = createImageSemanticValidator(calibrationEnv);
  const defectValidator = createImageDefectValidator(calibrationEnv);
  const reports: any[] = [];

  try {
    for (const [index, keyword] of CALIBRATION_KEYWORDS.entries()) {
      const brief = buildTrendImageBrief(keyword);
      const prompt = promptForKeyword(keyword, imageModel);
      const report: Record<string, unknown> = {
        test: "cloudflare-image-quality-calibration",
        keyword,
        imageModel,
        visionModel,
        imageSize: IMAGE_SIZE,
        candidateCount: 1,
        credentials: {
          accountId: redact(accountId),
          apiToken: redact(apiToken),
        },
        brief: {
          canonicalKeyword: brief.canonicalKeyword,
          compositionMode: brief.compositionMode,
          paletteFamily: brief.paletteFamily,
          materialFamily: brief.materialFamily,
          visualSubject: brief.visualSubject,
        },
        promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 16),
        startedAt: new Date().toISOString(),
      };

      try {
        const generated = await generator.generate({ prompt, model: imageModel, imageSize: IMAGE_SIZE, seed: 9000 + index });
        const metadata = await decodedImageMetadata(generated.buffer);
        const imagePath = join(outputDir, `${String(index + 1).padStart(2, "0")}-${keyword}.${metadata.format}`);
        await writeFile(imagePath, generated.buffer);

        const pixel = await analyzeImagePixels(generated.buffer, { ocrProvider });
        if (!pixel.ocr.available) throw new Error(`local Tesseract OCR did not complete: ${pixel.ocr.error || "provider unavailable"}`);

        const semantic = await semanticValidator.validate({ brief, imageBuffer: generated.buffer, candidateIndex: 0 });
        if (!semantic.available) throw new Error(`Cloudflare semantic validation failed strict JSON schema: ${semantic.error || semantic.rejectionReasons.join("; ")}`);

        const defect = await defectValidator.validate({ brief, imageBuffer: generated.buffer, pixel, candidateIndex: 0 });
        if (!defect.available) throw new Error(`Cloudflare defect validation failed strict JSON schema: ${defect.error || defect.rejectionReasons.join("; ")}`);

        const facts = candidateFactsFromAnalysis({ brief, pixel, semantic, defect, candidateIndex: 0 });
        const validation = validateTrendConceptCandidate({ brief, facts });

        Object.assign(report, {
          completedAt: new Date().toISOString(),
          status: validation.passed ? "passed" : "failed",
          image: { path: imagePath, provider: generated.provider, model: generated.model, ...metadata },
          pixel: {
            width: pixel.width,
            height: pixel.height,
            aspectRatio: pixel.aspectRatio,
            sharpness: pixel.sharpness,
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
            suspiciousTagLikeTextDetected: Boolean(pixel.ocr.suspiciousTagLikeTextDetected),
            suspiciousGlyphClusterCount: pixel.ocr.suspiciousGlyphClusters?.length || 0,
            confidence: pixel.ocr.confidence,
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
      } catch (error) {
        Object.assign(report, {
          completedAt: new Date().toISOString(),
          status: "failed",
          error: classifyFailure(error),
        });
      }

      reports.push(report);
      await writeFile(join(outputDir, `${String(index + 1).padStart(2, "0")}-${keyword}.json`), `${JSON.stringify(report, null, 2)}\n`);
      console.log(`${keyword}: ${report.status}`);
    }

    await writeFile(join(outputDir, "calibration-report.json"), `${JSON.stringify({
      test: "cloudflare-image-quality-calibration",
      imageCount: reports.length,
      maxTemporaryImages: MAX_TEMPORARY_IMAGES,
      candidateCountPerKeyword: 1,
      keywords: CALIBRATION_KEYWORDS,
      generatedAt: new Date().toISOString(),
      reports,
    }, null, 2)}\n`);
    await writeFile(join(outputDir, "index.html"), contactSheetHtml(reports));

    const failures = reports.filter((report) => report.status !== "passed");
    if (failures.length) {
      throw new Error(`Cloudflare image quality calibration failed for: ${failures.map((report) => report.keyword).join(", ")}`);
    }

    console.log("Cloudflare Image Quality Calibration passed");
    console.log(`Generated ${reports.length} temporary images with one candidate each.`);
    console.log(`Artifact directory: ${outputDir}`);
  } finally {
    await disposeOcrProvider(ocrProvider);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
