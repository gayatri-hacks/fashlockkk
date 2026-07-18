#!/usr/bin/env tsx
import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { storagePathForFashionImage, type FashionImageVariant } from "../lib/images/build-fashion-image-prompt";
import { buildTrendImageBrief } from "../lib/images/trend-image-brief";
import {
  deterministicCandidateFacts,
  rankTrendConceptCandidates,
  TREND_CONCEPT_VALIDATION_VERSION,
  validateTrendConceptCandidate,
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
const workerId = process.env.IMAGE_WORKER_ID || `ollama-worker-${process.pid}`;
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const pollMs = Number(process.env.IMAGE_WORKER_POLL_MS || 5000);
const timeoutMs = Number(process.env.IMAGE_WORKER_TIMEOUT_MS || 300000);
const bucketName = "generated-fashion-images";
const webpQuality = Number(process.env.IMAGE_WORKER_WEBP_QUALITY || 92);
const trendConceptCandidateCount = Number(process.env.TREND_CONCEPT_CANDIDATE_COUNT || 3);
const visionValidatorUrl = process.env.IMAGE_VISION_VALIDATOR_URL || "";
const visionValidatorKey = process.env.IMAGE_VISION_VALIDATOR_KEY || "";

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

async function isOllamaReachable() {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

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

async function generateImage(job: ImageGenerationJob) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ollamaBaseUrl}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: job.model,
        prompt: job.prompt,
        size: job.image_size,
        response_format: "b64_json",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const payload = await response.json();
    const base64 = payload?.data?.[0]?.b64_json;
    if (!base64 || typeof base64 !== "string") {
      throw new Error("Ollama response did not include b64_json image data");
    }

    return Buffer.from(base64, "base64");
  } finally {
    clearTimeout(timer);
  }
}

function trendConceptPromptForCandidate(job: ImageGenerationJob, candidateIndex: number, feedback: string[]) {
  return [
    job.prompt,
    "",
    `Candidate generation round ${candidateIndex + 1}.`,
    "Create a fresh visual solution for this exact canonical keyword and brief.",
    feedback.length ? `Previous validation feedback to avoid: ${feedback.join("; ")}.` : "",
    "Do not include letters, captions, logos, labels, watermarks or imitation writing.",
  ].filter(Boolean).join("\n");
}

async function recordTrendConceptReview(job: ImageGenerationJob, payload: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.from("trend_concept_image_reviews").insert({
      job_id: job.id,
      entity_type: job.entity_type,
      entity_id: job.entity_id,
      variant: job.variant,
      prompt_hash: job.prompt_hash,
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

async function callVisionSemanticValidator({
  brief,
  imageBuffer,
  candidateIndex,
}: {
  brief: ReturnType<typeof buildTrendImageBrief>;
  imageBuffer: Buffer;
  candidateIndex: number;
}) {
  if (!visionValidatorUrl) return null;

  try {
    const response = await fetch(visionValidatorUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(visionValidatorKey ? { Authorization: `Bearer ${visionValidatorKey}` } : {}),
      },
      body: JSON.stringify({
        validationVersion: TREND_CONCEPT_VALIDATION_VERSION,
        candidateIndex,
        brief,
        imageBase64: imageBuffer.toString("base64"),
      }),
    });

    if (!response.ok) {
      throw new Error(`vision validator returned ${response.status}`);
    }

    return await response.json() as Partial<ReturnType<typeof deterministicCandidateFacts>>;
  } catch (error) {
    console.warn(`Vision semantic validator failed for candidate ${candidateIndex + 1}: ${error instanceof Error ? error.message : String(error)}`);
    return {
      keywordMatch: 0,
      fashionRelevance: 0,
      materialRealism: 0,
      compositionQuality: 0,
      forbiddenCueDetected: true,
      detectedCues: ["vision-validator-unavailable"],
    } as Partial<ReturnType<typeof deterministicCandidateFacts>>;
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

async function processJob(job: ImageGenerationJob) {
  if (job.variant === "trend_concept") {
    await processTrendConceptJob(job);
    return;
  }

  const imageBuffer = await generateImage(job);
  const uploadImage = await encodeUploadImage(job, imageBuffer);
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
      completedBy: "ollama",
      ollamaBaseUrl,
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
  const feedback: string[] = [];

  for (let candidateIndex = 0; candidateIndex < Math.max(1, trendConceptCandidateCount); candidateIndex += 1) {
    const imageBuffer = await generateImage({
      ...job,
      prompt: trendConceptPromptForCandidate(job, candidateIndex, feedback.slice(-6)),
    });
    generatedBuffers.set(candidateIndex, imageBuffer);

    const facts = deterministicCandidateFacts({
      brief,
      buffer: imageBuffer,
      candidateIndex,
    });
    const semanticFacts = await callVisionSemanticValidator({ brief, imageBuffer, candidateIndex });
    const validation = validateTrendConceptCandidate({ brief, facts: { ...facts, ...semanticFacts } });
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
    completedBy: "ollama",
    ollamaBaseUrl,
    contentType: uploadImage.contentType,
    reviewStatus: "accepted",
    validationStatus: "accepted",
    validationVersion: TREND_CONCEPT_VALIDATION_VERSION,
    selectedCandidateIndex: selected.facts.candidateIndex,
    candidateCount: validationResults.length,
    selectedScore: selected.score,
    dominantPalette: selected.facts.dominantPalette,
    dominantColor: selected.facts.dominantColor,
    compositionMode: selected.facts.compositionMode,
    materialFamily: brief.materialFamily,
    perceptualHash: selected.facts.perceptualHash,
    trendImageBrief: brief,
    validationResults: validationResults.map((result) => ({
      passed: result.passed,
      score: result.score,
      rejectionReasons: result.rejectionReasons,
      facts: result.facts,
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
}

async function main() {
  await ensureBucket();
  console.log(`Image worker ${workerId} using ${ollamaBaseUrl}`);

  while (!stopping) {
    if (!(await isOllamaReachable())) {
      console.warn(`Ollama is not reachable at ${ollamaBaseUrl}; waiting.`);
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
      console.log(`Completed job ${job.id}`);
    } catch (error) {
      console.error(`Job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      await markFailed(job, error);
    }
  }

  console.log("Image worker stopped.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
