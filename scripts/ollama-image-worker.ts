#!/usr/bin/env tsx
import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { storagePathForFashionImage, type FashionImageVariant } from "../lib/images/build-fashion-image-prompt";
import { createImageGenerator, RetryableImageGenerationError } from "../lib/images/image-generator";
import { analyzeImagePixels, createOcrProvider } from "../lib/images/image-pixel-analysis";
import { createImageSemanticValidator } from "../lib/images/image-semantic-validator";
import { buildTrendImageBrief } from "../lib/images/trend-image-brief";
import {
  candidateFactsFromAnalysis,
  rankTrendConceptCandidates,
  TREND_CONCEPT_VALIDATION_VERSION,
  validateTrendConceptCandidate,
  type AcceptedTrendConceptContext,
  type TrendConceptValidationResult,
} from "../lib/images/trend-concept-validation";

type ImageGenerationJob = {
  id: string;
  entity_type: "trend";
  entity_id: number;
  variant: FashionImageVariant;
  prompt: string;
  prompt_hash: string;
  model: string;
  image_size: string;
  metadata?: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  storage_path?: string | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const workerId = process.env.IMAGE_WORKER_ID || `image-worker-${process.pid}`;
const pollMs = Number(process.env.IMAGE_WORKER_POLL_MS || 5000);
const bucketName = "generated-fashion-images";
const webpQuality = Number(process.env.IMAGE_WORKER_WEBP_QUALITY || 92);
const trendConceptCandidateCount = Number(process.env.TREND_CONCEPT_CANDIDATE_COUNT || 3);
const maxJobsArgIndex = process.argv.indexOf("--max-jobs");
const maxJobs = Number(
  maxJobsArgIndex >= 0 ? process.argv[maxJobsArgIndex + 1] : process.env.IMAGE_WORKER_MAX_JOBS || 0,
);
const imageGenerator = createImageGenerator();
const semanticValidator = createImageSemanticValidator();
const ocrProvider = createOcrProvider();

let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required");

const supabase = createClient(
  supabaseUrl,
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

async function claimJob() {
  const { data, error } = await supabase.rpc("claim_next_image_generation_job", {
    worker_id: workerId,
    lock_timeout_minutes: 30,
  });

  if (error) throw error;
  return ((Array.isArray(data) ? data[0] : data) || null) as ImageGenerationJob | null;
}

async function ensureBucket() {
  const bucketOptions = {
    public: true,
    allowedMimeTypes: ["image/png", "image/webp"],
  };
  const { error } = await supabase.storage.createBucket(bucketName, bucketOptions);

  if (error && !/already exists/i.test(error.message)) {
    console.warn(`Bucket check skipped: ${error.message}`);
  }

  const { error: updateError } = await supabase.storage.updateBucket(bucketName, bucketOptions);
  if (updateError) {
    console.warn(`Bucket update skipped: ${updateError.message}`);
  }
}

function replaceStorageExtension(storagePath: string, extension: "png" | "webp") {
  return storagePath.replace(/\.[^.]+$/, `.${extension}`);
}

async function encodeUploadImage(job: ImageGenerationJob, imageBuffer: Buffer) {
  if (job.variant !== "trend_concept") {
    return {
      buffer: imageBuffer,
      contentType: "image/png",
      extension: "png" as const,
    };
  }

  try {
    const sharp = (await import("sharp")).default;
    const webpBuffer = await sharp(imageBuffer)
      .rotate()
      .resize({ width: 1024, height: 1280, fit: "inside", withoutEnlargement: true })
      .sharpen({ sigma: 0.35, m1: 0.35, m2: 0.15 })
      .webp({ quality: webpQuality })
      .toBuffer();

    return {
      buffer: webpBuffer,
      contentType: "image/webp",
      extension: "webp" as const,
    };
  } catch (error) {
    console.warn(
      `WebP conversion skipped for job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      buffer: imageBuffer,
      contentType: "image/png",
      extension: "png" as const,
    };
  }
}

function trendConceptPromptForCandidate(job: ImageGenerationJob, candidateIndex: number, feedback: string[]) {
  return [
    job.prompt,
    "",
    `Candidate generation round ${candidateIndex + 1}.`,
    `Deterministic variation seed: ${Number(job.entity_id) * 100 + candidateIndex}.`,
    "Create a fresh visual solution for this exact canonical keyword and brief.",
    feedback.length ? `Previous validation feedback to avoid: ${feedback.join("; ")}.` : "",
    "Do not include letters, captions, logos, labels, watermarks or imitation writing.",
  ].filter(Boolean).join("\n");
}

async function generateImage(job: ImageGenerationJob, prompt = job.prompt, seed?: number) {
  return imageGenerator.generate({
    prompt,
    model: job.model,
    imageSize: job.image_size,
    seed,
  });
}

async function recordTrendConceptReview(job: ImageGenerationJob, payload: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.from("trend_concept_image_reviews").insert({
      job_id: job.id,
      entity_type: job.entity_type,
      entity_id: job.entity_id,
      variant: job.variant,
      canonical_keyword: payload.canonicalKeyword || job.metadata?.canonicalKeyword || job.metadata?.keyword || null,
      prompt_hash: job.prompt_hash,
      prompt: payload.prompt || job.prompt,
      generator_provider: payload.generatorProvider || imageGenerator.provider,
      generator_model: payload.generatorModel || job.model,
      prompt_version: job.metadata?.promptVersion || null,
      brief_version: job.metadata?.briefVersion || null,
      review_status: payload.reviewStatus,
      selected_candidate_index: payload.selectedCandidateIndex ?? null,
      candidate_count: payload.candidateCount,
      validation_version: TREND_CONCEPT_VALIDATION_VERSION,
      brief: payload.brief,
      validation_summary: payload,
    }).select("id").single();
    if (error) throw error;

    const reviewId = data?.id;
    const validationResults = Array.isArray(payload.validationResults) ? payload.validationResults : [];
    if (reviewId && validationResults.length) {
      const { error: candidateError } = await supabase.from("trend_concept_image_candidates").insert(
        validationResults.map((result: any) => ({
          review_id: reviewId,
          job_id: job.id,
          candidate_index: Number(result.facts?.candidateIndex || 0),
          prompt: result.prompt || null,
          generator_provider: result.generatorProvider || imageGenerator.provider,
          generator_model: result.generatorModel || job.model,
          passed: Boolean(result.passed),
          score: Number(result.score || 0),
          rejection_reasons: Array.isArray(result.rejectionReasons) ? result.rejectionReasons : [],
          facts: result.facts || {},
        })),
      );
      if (candidateError) throw candidateError;
    }
  } catch (error) {
    console.warn(`Trend concept review audit skipped for job ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function markFailedReview(job: ImageGenerationJob, error: unknown, validationResults: TrendConceptValidationResult[]) {
  const message = error instanceof Error ? error.message : String(error);
  await recordTrendConceptReview(job, {
    reviewStatus: "failed_review",
    candidateCount: validationResults.length,
    selectedCandidateIndex: null,
    validationResults,
    rejectionReasons: validationResults.map((result) => ({
      candidateIndex: result.facts.candidateIndex,
      reasons: result.rejectionReasons,
      score: result.score,
    })),
    brief: job.metadata?.trendImageBrief || null,
    errorMessage: message,
  });

  const { error: updateError } = await supabase
    .from("image_generation_jobs")
    .update({
      status: "failed_review",
      locked_at: null,
      locked_by: null,
      error_message: message,
      metadata: {
        ...(job.metadata || {}),
        validationStatus: "failed_review",
        validationVersion: TREND_CONCEPT_VALIDATION_VERSION,
        validationResults,
      },
    })
    .eq("id", job.id);

  if (updateError) {
    await markFailed(job, new Error(`failed_review: ${message}`));
  }
}

async function markFailed(job: ImageGenerationJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const { error: failError } = await supabase.rpc("fail_image_generation_job", {
    job_id: job.id,
    failure_message: message,
  });

  if (failError) {
    console.error(`Failed to update job ${job.id}: ${failError.message}`);
  }
}

async function markRetryableReview(job: ImageGenerationJob, error: RetryableImageGenerationError) {
  const retryAfter = new Date(Date.now() + (error.retryAfterSeconds || 86400) * 1000).toISOString();
  const message = `${error.message}; retry after ${retryAfter}`;
  const { error: updateError } = await supabase
    .from("image_generation_jobs")
    .update({
      status: "pending",
      locked_at: null,
      locked_by: null,
      error_message: message,
      metadata: {
        ...(job.metadata || {}),
        validationStatus: "retryable_review",
        retryAfter,
        retryReason: error.message,
      },
    })
    .eq("id", job.id);

  if (updateError) {
    await markFailed(job, new Error(`retryable review update failed: ${message}`));
  }
}

async function loadRecentlyAcceptedConceptContexts(currentEntityId: number): Promise<AcceptedTrendConceptContext[]> {
  const { data, error } = await supabase
    .from("generated_fashion_images")
    .select("entity_id, dominant_palette, dominant_color, composition_mode, material_family, perceptual_hash, metadata, completed_at")
    .eq("entity_type", "trend")
    .eq("variant", "trend_concept")
    .in("review_status", ["accepted", "legacy"])
    .order("completed_at", { ascending: false })
    .limit(24);

  if (error) {
    console.warn(`Could not load recent concept image context: ${error.message}`);
    return [];
  }

  return ((data || []) as any[])
    .filter((row) => Number(row.entity_id) !== currentEntityId)
    .reverse()
    .map((row) => {
      const metadata = (row.metadata || {}) as Record<string, any>;
      return {
        compositionMode: String(row.composition_mode || metadata.compositionMode || ""),
        materialFamily: String(row.material_family || metadata.materialFamily || ""),
        paletteFamily: String(row.dominant_palette || metadata.dominantPalette || ""),
        dominantColor: String(row.dominant_color || metadata.dominantColor || ""),
        perceptualHash: String(row.perceptual_hash || metadata.perceptualHash || ""),
      };
    })
    .filter((item) => item.compositionMode && item.materialFamily && item.paletteFamily && item.perceptualHash);
}

function failedCandidateValidation({
  brief,
  candidateIndex,
  reason,
}: {
  brief: ReturnType<typeof buildTrendImageBrief>;
  candidateIndex: number;
  reason: string;
}): TrendConceptValidationResult {
  return {
    passed: false,
    score: 0,
    rejectionReasons: [reason],
    facts: {
      candidateIndex,
      keywordMatch: 0,
      fashionRelevance: 0,
      materialRealism: 0,
      compositionQuality: 0,
      semanticConfidence: 0,
      sharpness: 0,
      width: 0,
      height: 0,
      aspectRatio: 0,
      overexposed: false,
      underexposed: false,
      ocrAvailable: false,
      textDetected: false,
      logoDetected: false,
      personDetected: false,
      requiredCuesPresent: false,
      forbiddenCueDetected: true,
      detectedCues: [],
      missingRequiredCues: brief.requiredVisualCues,
      dominantPalette: "",
      dominantColor: "",
      compositionMode: brief.compositionMode,
      perceptualHash: "",
    },
  };
}

async function processJob(job: ImageGenerationJob) {
  if (job.variant === "trend_concept") {
    await processTrendConceptJob(job);
    return;
  }

  const generated = await generateImage(job);
  const uploadImage = await encodeUploadImage(job, generated.buffer);
  const storagePath =
    replaceStorageExtension(
      job.storage_path ||
        storagePathForFashionImage({
          entityId: Number(job.entity_id),
          variant: job.variant,
          promptHash: job.prompt_hash,
        }),
      uploadImage.extension,
    );

  const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, uploadImage.buffer, {
    cacheControl: "31536000",
    contentType: uploadImage.contentType,
    upsert: true,
  });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
  const imageUrl = publicUrlData.publicUrl;
  if (!imageUrl) throw new Error("Supabase did not return a public image URL");

  const { error: completeError } = await supabase.rpc("complete_image_generation_job", {
    job_id: job.id,
    completed_image_url: imageUrl,
    completed_storage_path: storagePath,
    completed_metadata: {
      workerId,
      completedBy: generated.provider,
      generatorProvider: generated.provider,
      generatorModel: generated.model,
      generatorDescription: imageGenerator.describe(),
      contentType: uploadImage.contentType,
    },
  });

  if (completeError) throw completeError;
}

async function processTrendConceptJob(job: ImageGenerationJob) {
  const keyword = String(job.metadata?.canonicalKeyword || job.metadata?.keyword || "fashion trend");
  const brief = buildTrendImageBrief(keyword);
  const validationResults: TrendConceptValidationResult[] = [];
  const generatedBuffers = new Map<number, Buffer>();
  const generatedPrompts = new Map<number, string>();
  const feedback: string[] = [];
  const recentlyAccepted = await loadRecentlyAcceptedConceptContexts(Number(job.entity_id));

  for (let candidateIndex = 0; candidateIndex < Math.max(1, trendConceptCandidateCount); candidateIndex += 1) {
    const prompt = trendConceptPromptForCandidate(job, candidateIndex, feedback.slice(-6));
    generatedPrompts.set(candidateIndex, prompt);

    let validation: TrendConceptValidationResult;
    try {
      const generated = await generateImage(job, prompt, Number(job.entity_id) * 100 + candidateIndex);
      generatedBuffers.set(candidateIndex, generated.buffer);

      const pixel = await analyzeImagePixels(generated.buffer, { ocrProvider });
      const semantic = await semanticValidator.validate({ brief, imageBuffer: generated.buffer, candidateIndex });
      const facts = candidateFactsFromAnalysis({ brief, pixel, semantic, candidateIndex });
      validation = validateTrendConceptCandidate({ brief, facts, recentlyAccepted });
      (validation as any).generatorProvider = generated.provider;
      (validation as any).generatorModel = generated.model;
    } catch (error) {
      if (error instanceof RetryableImageGenerationError) throw error;
      validation = failedCandidateValidation({
        brief,
        candidateIndex,
        reason: error instanceof Error ? `candidate validation failed: ${error.message}` : "candidate validation failed",
      });
    }
    (validation as any).prompt = prompt;
    validationResults.push(validation);

    if (!validation.passed) {
      feedback.push(`candidate ${candidateIndex + 1}: ${validation.rejectionReasons.join(", ")}`);
    }
  }

  const selected = rankTrendConceptCandidates(validationResults);
  if (!selected) {
    await markFailedReview(job, new Error("No trend_concept candidate passed validation; existing production image was kept."), validationResults);
    return;
  }

  const selectedBuffer = generatedBuffers.get(selected.facts.candidateIndex);
  if (!selectedBuffer) throw new Error("Selected candidate buffer missing");

  const uploadImage = await encodeUploadImage(job, selectedBuffer);
  const storagePath = replaceStorageExtension(
    job.storage_path ||
      storagePathForFashionImage({
        entityId: Number(job.entity_id),
        variant: job.variant,
        promptHash: job.prompt_hash,
      }),
    uploadImage.extension,
  );

  const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, uploadImage.buffer, {
    cacheControl: "31536000",
    contentType: uploadImage.contentType,
    upsert: true,
  });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
  const imageUrl = publicUrlData.publicUrl;
  if (!imageUrl) throw new Error("Supabase did not return a public image URL");

  const validationMetadata = {
    workerId,
    completedBy: imageGenerator.provider,
    generatorProvider: (selected as any).generatorProvider || imageGenerator.provider,
    generatorModel: (selected as any).generatorModel || job.model,
    generatorDescription: imageGenerator.describe(),
    contentType: uploadImage.contentType,
    reviewStatus: "accepted",
    validationStatus: "accepted",
    validationVersion: TREND_CONCEPT_VALIDATION_VERSION,
    prompt: generatedPrompts.get(selected.facts.candidateIndex) || job.prompt,
    canonicalKeyword: brief.canonicalKeyword,
    selectedCandidateIndex: selected.facts.candidateIndex,
    candidateCount: validationResults.length,
    selectedScore: selected.score,
    dominantPalette: selected.facts.dominantPalette,
    dominantColor: selected.facts.dominantColor,
    compositionMode: selected.facts.compositionMode,
    materialFamily: brief.materialFamily,
    perceptualHash: selected.facts.perceptualHash,
    dominantColors: selected.facts.dominantColors || [],
    pixelIntegrityHash: selected.facts.pixelIntegrityHash,
    trendImageBrief: brief,
    validationResults: validationResults.map((result) => ({
      passed: result.passed,
      score: result.score,
      rejectionReasons: result.rejectionReasons,
      facts: result.facts,
      prompt: (result as any).prompt,
      generatorProvider: (result as any).generatorProvider,
      generatorModel: (result as any).generatorModel,
    })),
  };

  await recordTrendConceptReview(job, {
    ...validationMetadata,
    reviewStatus: "accepted",
    brief,
  });

  const { error: completeError } = await supabase.rpc("complete_image_generation_job", {
    job_id: job.id,
    completed_image_url: imageUrl,
    completed_storage_path: storagePath,
    completed_metadata: validationMetadata,
  });

  if (completeError) throw completeError;

  const { error: metadataUpdateError } = await supabase
    .from("generated_fashion_images")
    .update({
      dominant_colors: selected.facts.dominantColors || [],
      pixel_integrity_hash: selected.facts.pixelIntegrityHash,
      generator_provider: validationMetadata.generatorProvider,
      generator_model: validationMetadata.generatorModel,
      approved_at: new Date().toISOString(),
    })
    .eq("entity_type", job.entity_type)
    .eq("entity_id", job.entity_id)
    .eq("variant", job.variant)
    .eq("prompt_hash", job.prompt_hash);

  if (metadataUpdateError) {
    console.warn(`Accepted image metadata update skipped for job ${job.id}: ${metadataUpdateError.message}`);
  }
}

async function main() {
  await ensureBucket();
  console.log(`Image worker ${workerId} using ${imageGenerator.describe()}`);
  let processedJobs = 0;

  while (!stopping) {
    if (maxJobs > 0 && processedJobs >= maxJobs) {
      console.log(`Image worker processed configured max jobs: ${maxJobs}`);
      break;
    }

    if (!(await imageGenerator.isReachable())) {
      console.warn(`Image generator is not reachable at ${imageGenerator.describe()}; waiting.`);
      await sleep(pollMs);
      continue;
    }

    const job = await claimJob();
    if (!job) {
      await sleep(pollMs);
      continue;
    }

    console.log(`Processing job ${job.id} trend=${job.entity_id} variant=${job.variant} attempt=${job.attempts}/${job.max_attempts}`);

    try {
      await processJob(job);
      processedJobs += 1;
      console.log(`Completed job ${job.id}`);
    } catch (error) {
      console.error(`Job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof RetryableImageGenerationError) {
        await markRetryableReview(job, error);
        stopping = true;
      } else {
        await markFailed(job, error);
      }
    }
  }

  console.log("Image worker stopped.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
