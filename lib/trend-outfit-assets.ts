import { readFile } from "node:fs/promises";
import path from "node:path";
import { rankLookLibrary } from "@/lib/look-library";
import { getSupabaseClient } from "@/lib/supabase";

export type TrendOutfitAssetSource =
  | "ollama"
  | "pexels"
  | "product_catalog"
  | "look_library"
  | "fallback";

export type TrendOutfitAssetStatus = "pending" | "approved" | "rejected";

export type TrendOutfitAsset = {
  id: number;
  trend_keyword: string;
  normalized_trend_keyword: string;
  asset_context: string;
  audience: string;
  outfit_formula: string;
  outfit_title: string;
  image_url: string;
  image_source: TrendOutfitAssetSource;
  prompt: string | null;
  status: TrendOutfitAssetStatus;
  created_at: string;
  updated_at: string;
};

type ResolveFallbackOptions = {
  trendKeyword?: string;
  outfitFormula?: string;
  outfitTitle?: string;
  gender?: "women" | "men";
  assetContext?: string;
  audience?: string;
};

type ResolveLiveOllamaOptions = ResolveFallbackOptions & {
  enabled?: boolean;
};

type GeneratedOllamaImage = {
  base64?: string;
  filePath?: string;
  imageUrl?: string;
  mimeType: string;
  prompt: string;
};

type ResolvedImage = {
  imageUrl: string;
  imageSource: TrendOutfitAssetSource;
  asset?: TrendOutfitAsset | null;
  cached?: boolean;
};

const TREND_OUTFIT_ASSET_SELECT =
  "id, trend_keyword, normalized_trend_keyword, asset_context, audience, outfit_formula, outfit_title, image_url, image_source, prompt, status, created_at, updated_at";

const DEFAULT_FALLBACK_IMAGE: Record<"women" | "men", string> = {
  women: "/looks/female-carolyn-bessette-uniform.jpg",
  men: "/looks/male-timothee-off-duty.jpg",
};

const DEFAULT_OLLAMA_IMAGE_MODEL = "x/flux2-klein:4b";
const DEFAULT_OLLAMA_IMAGE_API_URL = "http://localhost:11434/api/generate";
const DEFAULT_TREND_OUTFIT_ASSET_BUCKET = "trend-outfits";
const TREND_CARD_OUTFIT_FORMULA = "trend card outfit";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const activeOllamaGenerations = new Map<string, Promise<ResolvedImage | null>>();

function describeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  const details = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  return {
    message: details.message,
    code: details.code,
    details: details.details,
    hint: details.hint,
  };
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function scoreTextMatch(haystack: string, needle: string) {
  if (!needle) return 0;
  if (haystack === needle) return 12;
  if (haystack.includes(needle)) return 6;
  return 0;
}

function buildProductTerms(keyword: string, outfitFormula: string) {
  const formulaPieces = outfitFormula
    .split("+")
    .map((piece) => piece.trim())
    .filter(Boolean)
    .slice(0, 3);

  return unique([keyword, ...formulaPieces]).slice(0, 4);
}

function isLiveOllamaEnabled(enabled?: boolean) {
  if (enabled === false) return false;
  return process.env.OLLAMA_IMAGE_ENABLED?.toLowerCase() === "true";
}

function isLocalhostEndpoint(value: string) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getOllamaEndpoint() {
  const configuredEndpoint = process.env.OLLAMA_IMAGE_API_URL?.trim();

  if (!configuredEndpoint) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      console.warn("Live Ollama trend outfit image skipped: OLLAMA_IMAGE_API_URL is required in production.");
      return null;
    }
    return DEFAULT_OLLAMA_IMAGE_API_URL;
  }

  if ((process.env.NODE_ENV === "production" || process.env.VERCEL) && isLocalhostEndpoint(configuredEndpoint)) {
    console.warn("Live Ollama trend outfit image skipped: localhost Ollama endpoint is not allowed in production.");
    return null;
  }

  return configuredEndpoint;
}

function getStorageBucketName() {
  return process.env.TREND_OUTFIT_ASSET_BUCKET?.trim() || DEFAULT_TREND_OUTFIT_ASSET_BUCKET;
}

function getStoragePublicUrl(bucket: string, path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) return null;
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path.replace(/^\//, "")}`;
}

function imageExtensionForMimeType(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

function mimeTypeForImagePath(value: string) {
  const extension = path.extname(value).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function normalizeBase64(value: string) {
  return value.replace(/\s/g, "");
}

function isLikelyBase64Image(value: string) {
  const normalized = normalizeBase64(value);
  if (normalized.length < 120 || normalized.length % 4 === 1) return false;
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(normalized)) return false;

  try {
    const decoded = Buffer.from(normalized, "base64");
    if (decoded.length < 64) return false;
    const signature = decoded.subarray(0, 12).toString("hex");
    return (
      signature.startsWith("89504e47") ||
      signature.startsWith("ffd8ff") ||
      signature.startsWith("52494646")
    );
  } catch {
    return false;
  }
}

function isLikelyImagePath(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return false;
  const withoutFileScheme = trimmed.replace(/^file:\/\//i, "");
  return IMAGE_EXTENSIONS.has(path.extname(withoutFileScheme.split(/[?#]/)[0]).toLowerCase());
}

function collectOllamaImageCandidates(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;
  const data = Array.isArray(body.data) ? body.data : [];
  const candidates: unknown[] = [
    body.image,
    body.image_url,
    body.imageUrl,
    body.url,
    body.path,
    body.file,
    body.response,
    Array.isArray(body.images) ? body.images[0] : undefined,
  ];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    candidates.push(row.b64_json, row.image, row.image_url, row.imageUrl, row.url, row.path, row.file);
  }

  return candidates.filter(Boolean);
}

function trendStylingCue(keyword: string, audience: string = "her") {
  const normalized = normalizeTrendOutfitKeyword(keyword);
  const isHim = audience === "him" || audience === "men";

  if (/\bold money|quiet luxury|stealth wealth\b/.test(normalized)) {
    return isHim
      ? "understated luxury menswear, linen shirt, tailored trousers, loafers, neutral palette, polished old money restraint"
      : "quiet luxury, neutral palette, tailored trousers, fine knitwear, elegant minimal accessories, polished old money styling";
  }
  if (/\beast west bag|shoulder bag|handbag\b/.test(normalized)) {
    return isHim
      ? "minimal menswear outfit with a sleek horizontal crossbody or structured compact bag interpretation, clean tailoring"
      : "sleek east west handbag featured prominently, modern city styling, clean tailoring, polished accessories";
  }
  if (/\bcapri|pedal pusher\b/.test(normalized)) {
    return isHim
      ? "cropped ankle-length trousers, summer shirt, loafers, clean warm-weather menswear proportions"
      : "slim capri pants as the hero piece, fitted top, warm weather styling, balanced proportions, ballet flats or slingbacks";
  }
  if (/\bballet flat|mary jane\b/.test(normalized)) {
    return isHim
      ? "sleek low-profile loafers or ballet-flat-inspired minimal footwear, polished soft tailoring, wearable city menswear"
      : "ballet flats clearly visible, feminine polished styling, soft proportions, wearable city outfit";
  }
  if (/\bsage green|green\b/.test(normalized)) {
    return isHim
      ? "sage green shirt, jacket, or trousers as the core visual signal, refined relaxed menswear styling"
      : "soft sage green dress, co-ord, or shirt palette as the core visual signal, fresh refined styling, tonal accessories";
  }
  if (/\bstriped shirt|stripe\b/.test(normalized)) {
    return isHim
      ? "striped shirt with tailored casual menswear styling, relaxed trousers, clean loafers or minimal sneakers"
      : "crisp striped shirt or relaxed striped button down, effortless chic styling, clean denim or tailored bottom";
  }
  if (/\bdenim jacket\b/.test(normalized)) {
    return "layered denim jacket, casual elevated styling, clean base layers, contemporary proportions";
  }
  if (/\boxford shirt\b/.test(normalized)) {
    return "crisp oxford shirt, elevated basics, neat tailoring, minimal city styling";
  }
  if (/\bstriped kurta|kurta\b/.test(normalized)) {
    return "contemporary Indian-inspired kurta styling, refined ethnic-modern outfit, clean accessories";
  }
  if (/\bboxy fit|boxy\b/.test(normalized)) {
    return isHim
      ? "structured boxy menswear silhouette, relaxed proportions, architectural overshirt or jacket, clean modern styling"
      : "structured boxy silhouette, relaxed proportions, architectural top layer, clean modern styling";
  }
  if (/\bbutter yellow\b/.test(normalized)) {
    return isHim
      ? "butter yellow shirt or knit as the main color signal, restrained warm palette, polished menswear styling"
      : "butter yellow as the main color signal, soft warm palette, polished feminine styling";
  }
  if (/\bmini\b/.test(normalized)) {
    return isHim
      ? "short proportions interpreted through tailored shorts, compact accessories, or mini bag, tasteful trend-relevant menswear styling"
      : "mini skirt, mini dress, or mini bag styled tastefully, polished proportions, fashion editorial styling";
  }
  return isHim
    ? "trend-forward wearable menswear styling, strong silhouette, refined color palette, polished modern accessories"
    : "trend-forward wearable styling, strong silhouette, refined color palette, polished modern accessories";
}

export function buildTrendCardOutfitFormula(trendKeyword: string, audience: string = "her") {
  const normalized = normalizeTrendOutfitKeyword(trendKeyword || "fashion trend");
  const wearer = audience === "him" || audience === "men" ? "men's" : "women's";
  return `${wearer} ${normalized} outfit + ${trendStylingCue(normalized, audience)}`;
}

function buildLiveOllamaPrompt({
  trendKeyword,
  outfitFormula,
  outfitTitle,
  gender = "women",
  audience,
}: ResolveFallbackOptions) {
  const normalizedKeyword = normalizeTrendOutfitKeyword(trendKeyword || outfitFormula || "fashion trend");
  const normalizedAudience = audience || (gender === "men" ? "him" : "her");
  const formula = String(outfitFormula || buildTrendCardOutfitFormula(normalizedKeyword, normalizedAudience)).trim();
  const title = String(outfitTitle || "Trend outfit").trim();
  const modelDescription = gender === "men" ? "One adult male model only." : "One adult female model only.";
  const audienceDirection = gender === "men"
    ? "Generate a polished men's fashion outfit image that interprets the same trend in a wearable menswear way."
    : "Generate a polished women's fashion outfit image for the trend.";

  return [
    "Photorealistic fashion ecommerce lookbook image.",
    audienceDirection,
    modelDescription,
    "Full body visible head to toe with shoes visible.",
    "Soft studio lighting, cream or warm ivory background.",
    "Modern premium styling, contemporary fashion, minimal composition.",
    `Trend keyword: ${normalizedKeyword}.`,
    `Trend-specific styling cues: ${trendStylingCue(normalizedKeyword, normalizedAudience)}.`,
    `Outfit title: ${title}.`,
    `Outfit formula: ${formula}.`,
    "Make the exact garments in the formula clearly visible.",
    "No text, no watermark, no props, no border, no collage.",
  ].join("\n");
}

function decodeOllamaImagePayload(payload: unknown): Omit<GeneratedOllamaImage, "prompt"> | null {
  if (!payload || typeof payload !== "object") return null;

  const body = payload as {
    data?: Array<{ b64_json?: unknown; mime_type?: unknown; mimeType?: unknown }>;
    mime_type?: unknown;
    mimeType?: unknown;
  };
  let mimeType = String(body.mime_type || body.mimeType || body.data?.[0]?.mime_type || body.data?.[0]?.mimeType || "image/png");
  const candidates = collectOllamaImageCandidates(payload);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const text = String(candidate);
    const dataUrlMatch = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+/);
    if (dataUrlMatch) {
      const [header, encoded] = dataUrlMatch[0].split(",", 2);
      mimeType = header.replace("data:", "").split(";")[0] || mimeType;
      return encoded && isLikelyBase64Image(encoded) ? { base64: normalizeBase64(encoded), mimeType } : null;
    }

    if (/^https?:\/\//i.test(text.trim())) {
      return { imageUrl: text.trim(), mimeType: mimeTypeForImagePath(text) };
    }

    if (isLikelyImagePath(text)) {
      const filePath = text.trim().replace(/^file:\/\//i, "");
      return { filePath, mimeType: mimeTypeForImagePath(filePath) };
    }

    if (isLikelyBase64Image(text)) {
      return { base64: normalizeBase64(text), mimeType };
    }
  }

  return null;
}

export function normalizeTrendOutfitKeyword(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTrendOutfitFormula(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/[^a-z0-9+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function findApprovedTrendOutfitAsset(options: {
  trendKeyword?: string;
  outfitFormula?: string;
  assetContext?: string;
  audience?: string;
}) {
  const supabase = getSupabaseClient();
  const normalizedKeyword = normalizeTrendOutfitKeyword(options.trendKeyword || "");
  const assetContext = options.assetContext || "trend-detail";
  const audience = options.audience || "her";

  if (!supabase || !normalizedKeyword) {
    return null;
  }

  const { data, error } = await supabase
    .from("trend_outfit_assets")
    .select(TREND_OUTFIT_ASSET_SELECT)
    .eq("normalized_trend_keyword", normalizedKeyword)
    .eq("asset_context", assetContext)
    .eq("audience", audience)
    .eq("status", "approved")
    .limit(24);

  if (error) throw error;

  const normalizedFormula = normalizeTrendOutfitFormula(options.outfitFormula || "");
  const assets = (data ?? []) as TrendOutfitAsset[];

  return (
    assets.sort((a, b) => {
      const aScore =
        scoreTextMatch(normalizeTrendOutfitFormula(a.outfit_formula), normalizedFormula) +
        scoreTextMatch(a.outfit_title.toLowerCase(), normalizedFormula);
      const bScore =
        scoreTextMatch(normalizeTrendOutfitFormula(b.outfit_formula), normalizedFormula) +
        scoreTextMatch(b.outfit_title.toLowerCase(), normalizedFormula);
      return bScore - aScore || b.id - a.id;
    })[0] || null
  );
}

export async function findReusableTrendOutfitAsset(options: {
  trendKeyword?: string;
  outfitFormula?: string;
  assetContext?: string;
  audience?: string;
}) {
  const supabase = getSupabaseClient();
  const normalizedKeyword = normalizeTrendOutfitKeyword(options.trendKeyword || "");
  const assetContext = options.assetContext || "trend-detail";
  const audience = options.audience || "her";

  if (!supabase || !normalizedKeyword) {
    return null;
  }

  const normalizedFormula = normalizeTrendOutfitFormula(options.outfitFormula || TREND_CARD_OUTFIT_FORMULA);
  const { data, error } = await supabase
    .from("trend_outfit_assets")
    .select(TREND_OUTFIT_ASSET_SELECT)
    .eq("normalized_trend_keyword", normalizedKeyword)
    .eq("asset_context", assetContext)
    .eq("audience", audience)
    .in("status", ["approved", "pending"])
    .limit(32);

  if (error) throw error;

  const assets = (data ?? []) as TrendOutfitAsset[];
  return (
    assets.sort((a, b) => {
      const aFormula = normalizeTrendOutfitFormula(a.outfit_formula);
      const bFormula = normalizeTrendOutfitFormula(b.outfit_formula);
      const aScore =
        (a.status === "approved" ? 100 : 0) +
        (a.image_source === "ollama" ? 20 : 0) +
        scoreTextMatch(aFormula, normalizedFormula) +
        scoreTextMatch(a.outfit_title.toLowerCase(), normalizedFormula);
      const bScore =
        (b.status === "approved" ? 100 : 0) +
        (b.image_source === "ollama" ? 20 : 0) +
        scoreTextMatch(bFormula, normalizedFormula) +
        scoreTextMatch(b.outfit_title.toLowerCase(), normalizedFormula);
      return bScore - aScore || b.id - a.id;
    })[0] || null
  );
}

async function generateLiveOllamaTrendOutfitImage(options: ResolveLiveOllamaOptions): Promise<GeneratedOllamaImage | null> {
  if (!isLiveOllamaEnabled(options.enabled)) return null;

  const endpoint = getOllamaEndpoint();
  if (!endpoint) return null;

  const model = process.env.OLLAMA_IMAGE_MODEL || DEFAULT_OLLAMA_IMAGE_MODEL;
  const timeoutMs = Math.min(Math.max(Number(process.env.OLLAMA_IMAGE_TIMEOUT_MS || 180000), 1000), 300000);
  const prompt = buildLiveOllamaPrompt(options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.info("New Ollama generation started", {
      trendKeyword: options.trendKeyword,
      model,
      timeoutMs,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Ollama generation failed", {
        trendKeyword: options.trendKeyword,
        status: response.status,
        body: await response.text(),
      });
      return null;
    }

    const decoded = decodeOllamaImagePayload(await response.json());
    if (!decoded) {
      console.error("Ollama generation failed", {
        trendKeyword: options.trendKeyword,
        reason: "missing decodable image payload",
        model,
      });
      return null;
    }

    return { ...decoded, prompt };
  } catch (error) {
    console.error("Ollama generation failed", {
      trendKeyword: options.trendKeyword,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadGeneratedTrendOutfitImage({
  bytes,
  mimeType,
  normalizedKeyword,
  normalizedFormula,
}: {
  bytes: Buffer;
  mimeType: string;
  normalizedKeyword: string;
  normalizedFormula: string;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const bucket = getStorageBucketName();
  const extension = imageExtensionForMimeType(mimeType);
  const filename = `${normalizedKeyword.replace(/\s+/g, "-")}-${normalizedFormula.replace(/\s+/g, "-").slice(0, 72)}.${extension}`;
  const path = `${normalizedKeyword.replace(/\s+/g, "-")}/${filename}`;

  try {
    await supabase.storage.createBucket(bucket, { public: true });
  } catch {
    // Bucket may already exist or may be managed outside this route.
  }

  try {
    const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) throw error;
    return getStoragePublicUrl(bucket, path);
  } catch (error) {
    console.error("Trend outfit Ollama storage upload failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function resolveGeneratedImageUrl({
  generated,
  normalizedKeyword,
  normalizedFormula,
}: {
  generated: GeneratedOllamaImage;
  normalizedKeyword: string;
  normalizedFormula: string;
}) {
  if (generated.base64) {
    const bytes = Buffer.from(generated.base64, "base64");
    return (
      (await uploadGeneratedTrendOutfitImage({
        bytes,
        mimeType: generated.mimeType,
        normalizedKeyword,
        normalizedFormula,
      })) || `data:${generated.mimeType};base64,${generated.base64}`
    );
  }

  if (generated.filePath) {
    try {
      const bytes = await readFile(generated.filePath);
      return await uploadGeneratedTrendOutfitImage({
        bytes,
        mimeType: generated.mimeType,
        normalizedKeyword,
        normalizedFormula,
      });
    } catch (error) {
      console.error("Trend outfit Ollama file-path upload failed:", error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  return generated.imageUrl || null;
}

export async function resolveLiveOllamaTrendOutfitImage(options: ResolveLiveOllamaOptions): Promise<ResolvedImage | null> {
  const generated = await generateLiveOllamaTrendOutfitImage(options);
  if (!generated) return null;

  const imageUrl = generated.base64
    ? `data:${generated.mimeType};base64,${generated.base64}`
    : generated.imageUrl || generated.filePath || null;
  if (!imageUrl) return null;

  return {
    imageUrl,
    imageSource: "ollama",
  };
}

export async function generateAndPersistTrendOutfitAsset(options: ResolveLiveOllamaOptions): Promise<ResolvedImage | null> {
  const normalizedKeyword = normalizeTrendOutfitKeyword(options.trendKeyword || options.outfitFormula || "");
  if (!normalizedKeyword) return null;

  const assetContext = options.assetContext || "trend-detail";
  const audience = options.audience || (assetContext === "trend-card" ? "neutral" : options.gender === "men" ? "him" : "her");
  const outfitFormula = options.outfitFormula?.trim() || buildTrendCardOutfitFormula(normalizedKeyword, audience);
  const normalizedFormula = normalizeTrendOutfitFormula(outfitFormula || TREND_CARD_OUTFIT_FORMULA);
  const generationKey = `${assetContext}:${audience}:${normalizedKeyword}:${normalizedFormula}`;
  const active = activeOllamaGenerations.get(generationKey);
  if (active) {
    console.info("Duplicate Ollama generation joined", { trendKeyword: normalizedKeyword, generationKey });
    return active;
  }

  const generation = (async () => {
    const generated = await generateLiveOllamaTrendOutfitImage({
      ...options,
      trendKeyword: normalizedKeyword,
      outfitFormula,
      assetContext,
      audience,
    });
    if (!generated) return null;

    const supabase = getSupabaseClient();
    const imageUrl = await resolveGeneratedImageUrl({
      generated,
      normalizedKeyword,
      normalizedFormula,
    });

    if (!imageUrl) return null;

    if (!supabase) {
      return { imageUrl, imageSource: "ollama" as const };
    }

    try {
      const assetPayload = {
        trend_keyword: options.trendKeyword || normalizedKeyword,
        normalized_trend_keyword: normalizedKeyword,
        asset_context: assetContext,
        audience,
        outfit_formula: outfitFormula,
        outfit_title: options.outfitTitle || `${normalizedKeyword} trend outfit`,
        image_url: imageUrl,
        image_source: "ollama",
        prompt: generated.prompt,
        status: "pending",
        updated_at: new Date().toISOString(),
      };

      const { data: existing, error: existingError } = await supabase
        .from("trend_outfit_assets")
        .select("id")
        .eq("normalized_trend_keyword", normalizedKeyword)
        .eq("asset_context", assetContext)
        .eq("audience", audience)
        .eq("outfit_formula", outfitFormula)
        .maybeSingle();

      if (existingError) throw existingError;

      const query = existing?.id
        ? supabase.from("trend_outfit_assets").update(assetPayload).eq("id", existing.id)
        : supabase.from("trend_outfit_assets").insert(assetPayload);

      const { data, error } = await query
        .select(TREND_OUTFIT_ASSET_SELECT)
        .single();

      if (error) throw error;
      return {
        imageUrl,
        imageSource: "ollama" as const,
        asset: (data ?? null) as TrendOutfitAsset | null,
      };
    } catch (error) {
      console.error("Trend outfit Ollama asset persistence failed:", describeSupabaseError(error));
      return { imageUrl, imageSource: "ollama" as const };
    }
  })();

  activeOllamaGenerations.set(generationKey, generation);
  try {
    return await generation;
  } finally {
    activeOllamaGenerations.delete(generationKey);
  }
}

async function resolveLookLibraryImage({
  trendKeyword,
  outfitFormula,
  outfitTitle,
  gender = "women",
}: ResolveFallbackOptions): Promise<ResolvedImage | null> {
  const ranked = rankLookLibrary({
    trendDrivers: unique([trendKeyword, outfitFormula, outfitTitle]),
    gender: gender === "men" ? "male" : "female",
  }).filter((look) => Boolean(look.heroImage));

  const match = ranked[0];
  if (!match?.heroImage) return null;

  return {
    imageUrl: match.heroImage,
    imageSource: "look_library",
  };
}

async function resolveProductImage({
  trendKeyword,
  outfitFormula,
}: ResolveFallbackOptions): Promise<ResolvedImage | null> {
  const supabase = getSupabaseClient();
  const normalizedKeyword = normalizeTrendOutfitKeyword(trendKeyword || "");
  if (!supabase || !normalizedKeyword) return null;

  const terms = buildProductTerms(normalizedKeyword, outfitFormula || "");
  const orFilter = terms
    .map((term) => term.replace(/[%(),]/g, " ").trim())
    .filter(Boolean)
    .map((term) => `title.ilike.%${term}%`)
    .join(",");

  if (!orFilter) return null;

  const { data, error } = await supabase
    .from("products")
    .select("title, image_url, scraped_at")
    .or(orFilter)
    .not("image_url", "is", null)
    .order("scraped_at", { ascending: false })
    .limit(12);

  if (error) {
    console.error("Trend outfit asset product fallback failed:", error.message);
    return null;
  }

  const rows = (data ?? []).filter((row: any) => typeof row?.image_url === "string" && row.image_url);
  const best = rows
    .map((row: any) => {
      const title = String(row.title || "").toLowerCase();
      const score = terms.reduce((total, term) => total + (title.includes(term.toLowerCase()) ? 3 : 0), 0);
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (!best?.row?.image_url) return null;

  return {
    imageUrl: String(best.row.image_url),
    imageSource: "product_catalog",
  };
}

async function resolvePexelsImage({
  trendKeyword,
  outfitFormula,
}: ResolveFallbackOptions): Promise<ResolvedImage | null> {
  const key = process.env.PEXELS_API_KEY;
  const normalizedKeyword = normalizeTrendOutfitKeyword(trendKeyword || "");
  if (!key || !normalizedKeyword) return null;

  const query = [normalizedKeyword, outfitFormula, "full body fashion lookbook minimal"]
    .filter(Boolean)
    .join(" ");

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=8`,
      {
        headers: {
          Authorization: key,
        },
        next: { revalidate: 21600 },
      },
    );

    if (!response.ok) {
      console.error("Trend outfit asset Pexels fallback failed:", response.status);
      return null;
    }

    const payload = (await response.json()) as { photos?: Array<{ src?: { large2x?: string; large?: string }; width?: number; height?: number; alt?: string }> };
    const photo = (payload.photos || [])
      .filter((item) => Number(item.width || 0) >= 700 && Number(item.height || 0) >= 900)
      .filter((item) => !/portrait|headshot|close up|close-up|makeup/i.test(String(item.alt || "")))[0];

    const imageUrl = photo?.src?.large2x || photo?.src?.large;
    if (!imageUrl) return null;

    return {
      imageUrl,
      imageSource: "pexels",
    };
  } catch (error) {
    console.error("Trend outfit asset Pexels fallback error:", error);
    return null;
  }
}

export async function resolveTrendOutfitFallback(options: ResolveFallbackOptions): Promise<ResolvedImage> {
  const gender = options.gender === "men" ? "men" : "women";

  const lookLibraryImage = await resolveLookLibraryImage({ ...options, gender });
  if (lookLibraryImage) return lookLibraryImage;

  const productImage = await resolveProductImage(options);
  if (productImage) return productImage;

  const pexelsImage = await resolvePexelsImage(options);
  if (pexelsImage) return pexelsImage;

  return {
    imageUrl: DEFAULT_FALLBACK_IMAGE[gender],
    imageSource: "fallback",
  };
}

export async function listTrendOutfitAssets(options?: {
  status?: TrendOutfitAssetStatus | "all";
  normalizedKeyword?: string;
  limit?: number;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("trend_outfit_assets")
    .select(TREND_OUTFIT_ASSET_SELECT)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(Number(options?.limit ?? 100), 1), 500));

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  if (options?.normalizedKeyword) {
    query = query.eq("normalized_trend_keyword", normalizeTrendOutfitKeyword(options.normalizedKeyword));
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TrendOutfitAsset[];
}

export async function setTrendOutfitAssetStatus(ids: number[], status: TrendOutfitAssetStatus) {
  const supabase = getSupabaseClient();
  if (!supabase || !ids.length) return [];

  const uniqueIds = [...new Set(ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
  if (!uniqueIds.length) return [];

  const { data, error } = await supabase
    .from("trend_outfit_assets")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", uniqueIds)
    .select(TREND_OUTFIT_ASSET_SELECT);

  if (error) throw error;
  return (data ?? []) as TrendOutfitAsset[];
}
