#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { storagePathForFashionImage, type FashionImageVariant } from "../lib/images/build-fashion-image-prompt";

type ImageGenerationJob = {
  id: string;
  entity_type: "trend";
  entity_id: number;
  variant: FashionImageVariant;
  prompt: string;
  prompt_hash: string;
  model: string;
  image_size: string;
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
    allowedMimeTypes: ["image/png"],
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
  const imageBuffer = await generateImage(job);
  const storagePath =
    job.storage_path ||
    storagePathForFashionImage({
      entityId: Number(job.entity_id),
      variant: job.variant,
      promptHash: job.prompt_hash,
    });

  const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, imageBuffer, {
    cacheControl: "31536000",
    contentType: "image/png",
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
    },
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
