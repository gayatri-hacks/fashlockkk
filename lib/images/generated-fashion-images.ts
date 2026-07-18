import { getSupabaseClient } from "@/lib/supabase";
import {
  buildFashionImagePrompt,
  createFashionPromptHash,
  storagePathForFashionImage,
  type FashionImageEntityType,
  type FashionImageVariant,
} from "@/lib/images/build-fashion-image-prompt";

export const DEFAULT_OLLAMA_IMAGE_MODEL = process.env.OLLAMA_IMAGE_MODEL || "x/flux2-klein:4b";
export const DEFAULT_OLLAMA_IMAGE_SIZE = process.env.OLLAMA_IMAGE_SIZE || "1024x1024";
export const DEFAULT_OLLAMA_CONCEPT_IMAGE_SIZE = process.env.OLLAMA_CONCEPT_IMAGE_SIZE || "1024x1280";

export type TrendImageSeed = {
  id: number;
  keyword: string;
  editorialName?: string | null;
  oneLiner?: string | null;
  howToWear?: string[] | null;
};

export type GeneratedFashionImage = {
  id: string;
  entity_type: FashionImageEntityType;
  entity_id: number;
  variant: FashionImageVariant;
  prompt_hash: string;
  model: string;
  image_size: string;
  storage_path: string;
  image_url: string;
  metadata?: Record<string, unknown> | null;
};

export async function getGeneratedFashionImage({
  entityType,
  entityId,
  variant,
  promptHash,
}: {
  entityType: FashionImageEntityType;
  entityId: number;
  variant: FashionImageVariant;
  promptHash?: string | null;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  let query = supabase
    .from("generated_fashion_images")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("variant", variant)
    .order("completed_at", { ascending: false })
    .limit(1);

  if (promptHash) query = query.eq("prompt_hash", promptHash);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.warn("Generated fashion image lookup skipped:", error.message);
    return null;
  }

  return (data || null) as GeneratedFashionImage | null;
}

export async function getGeneratedFashionImagesForTrends(entityIds: number[], variants: FashionImageVariant[]) {
  const supabase = getSupabaseClient();
  const ids = Array.from(new Set(entityIds.filter(Boolean)));
  if (!supabase || !ids.length || !variants.length) return new Map<string, GeneratedFashionImage>();

  const { data, error } = await supabase
    .from("generated_fashion_images")
    .select("*")
    .eq("entity_type", "trend")
    .in("entity_id", ids)
    .in("variant", variants)
    .order("completed_at", { ascending: false });

  if (error) {
    console.warn("Generated fashion images bulk lookup skipped:", error.message);
    return new Map<string, GeneratedFashionImage>();
  }

  const images = new Map<string, GeneratedFashionImage>();
  for (const row of data || []) {
    const key = `${row.entity_id}:${row.variant}`;
    if (!images.has(key)) images.set(key, row as GeneratedFashionImage);
  }
  return images;
}

export async function loadTrendImageSeed(entityId: number): Promise<TrendImageSeed | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("trend_keywords")
    .select("id, keyword")
    .eq("id", entityId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: Number(data.id),
    keyword: String(data.keyword),
    editorialName: String(data.keyword),
  };
}

export function buildTrendImageJobPayload({
  trend,
  variant,
  outfitFormula,
  outfitOccasion,
  gender,
  model = DEFAULT_OLLAMA_IMAGE_MODEL,
  imageSize,
}: {
  trend: TrendImageSeed;
  variant: FashionImageVariant;
  outfitFormula?: string | null;
  outfitOccasion?: string | null;
  gender?: "women" | "men" | null;
  model?: string;
  imageSize?: string;
}) {
  const resolvedImageSize = imageSize || (variant === "trend_concept" ? DEFAULT_OLLAMA_CONCEPT_IMAGE_SIZE : DEFAULT_OLLAMA_IMAGE_SIZE);
  const prompt = buildFashionImagePrompt({
    entityType: "trend",
    entityId: trend.id,
    variant,
    keyword: trend.keyword,
    editorialName: trend.editorialName,
    oneLiner: trend.oneLiner,
    howToWear: trend.howToWear,
    outfitFormula,
    outfitOccasion,
    gender,
    model,
    imageSize: resolvedImageSize,
  });
  const promptHash = createFashionPromptHash({ prompt, model, imageSize: resolvedImageSize, variant });

  return {
    entity_type: "trend" as const,
    entity_id: trend.id,
    variant,
    prompt,
    prompt_hash: promptHash,
    model,
    image_size: resolvedImageSize,
    storage_path: storagePathForFashionImage({ entityId: trend.id, variant, promptHash }),
    metadata: {
      keyword: trend.keyword,
      editorialName: trend.editorialName || trend.keyword,
      outfitFormula: outfitFormula || null,
      outfitOccasion: outfitOccasion || null,
      gender: gender || null,
    },
  };
}

export async function enqueueTrendImageJob({
  trend,
  variant,
  outfitFormula,
  outfitOccasion,
  gender,
  force = false,
  priority = 0,
  model = DEFAULT_OLLAMA_IMAGE_MODEL,
  imageSize,
}: {
  trend: TrendImageSeed;
  variant: FashionImageVariant;
  outfitFormula?: string | null;
  outfitOccasion?: string | null;
  gender?: "women" | "men" | null;
  force?: boolean;
  priority?: number;
  model?: string;
  imageSize?: string;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase service credentials are required");

  const payload = buildTrendImageJobPayload({ trend, variant, outfitFormula, outfitOccasion, gender, model, imageSize });

  if (!force) {
    if (variant === "trend_concept") {
      const existingConceptImage = await getGeneratedFashionImage({
        entityType: "trend",
        entityId: trend.id,
        variant,
      });
      if (existingConceptImage?.image_url) {
        return { status: "completed" as const, image: existingConceptImage, job: null, payload };
      }

      const { data: existingConceptJob, error: existingConceptJobError } = await supabase
        .from("image_generation_jobs")
        .select("*")
        .eq("entity_type", "trend")
        .eq("entity_id", trend.id)
        .eq("variant", variant)
        .in("status", ["pending", "processing", "completed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingConceptJobError) throw existingConceptJobError;
      if (existingConceptJob) return { status: "existing_job" as const, image: null, job: existingConceptJob, payload };
    }

    const existingImage = await getGeneratedFashionImage({
      entityType: "trend",
      entityId: trend.id,
      variant,
      promptHash: payload.prompt_hash,
    });
    if (existingImage?.prompt_hash === payload.prompt_hash) {
      return { status: "completed" as const, image: existingImage, job: null, payload };
    }

    const { data: existingJob, error: existingJobError } = await supabase
      .from("image_generation_jobs")
      .select("*")
      .eq("entity_type", "trend")
      .eq("entity_id", trend.id)
      .eq("variant", variant)
      .eq("prompt_hash", payload.prompt_hash)
      .maybeSingle();

    if (existingJobError) throw existingJobError;
    if (existingJob) return { status: "existing_job" as const, image: null, job: existingJob, payload };
  }

  const { data: job, error } = await supabase
    .from("image_generation_jobs")
    .upsert(
      {
        ...payload,
        status: "pending",
        priority,
        attempts: 0,
        error_message: null,
        locked_at: null,
        locked_by: null,
      },
      { onConflict: "entity_type,entity_id,variant,prompt_hash" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return { status: "queued" as const, image: null, job, payload };
}
