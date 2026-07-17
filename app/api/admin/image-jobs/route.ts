import { NextResponse } from "next/server";
import { z } from "zod";
import { FASHION_IMAGE_VARIANTS, type FashionImageVariant } from "@/lib/images/build-fashion-image-prompt";
import { enqueueTrendImageJob, getGeneratedFashionImage, loadTrendImageSeed } from "@/lib/images/generated-fashion-images";
import { getSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  entityType: z.literal("trend"),
  entityId: z.coerce.number().int().positive(),
  variant: z.enum(FASHION_IMAGE_VARIANTS),
  force: z.boolean().optional().default(false),
  priority: z.coerce.number().int().optional().default(0),
});

const getSchema = z.object({
  entityType: z.literal("trend").optional().default("trend"),
  entityId: z.coerce.number().int().positive().optional(),
  variant: z.enum(FASHION_IMAGE_VARIANTS).optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(25),
});

function isAuthorized(req: Request) {
  const imageSecret = process.env.IMAGE_ADMIN_SECRET;
  const imageHeader = req.headers.get("x-image-admin-secret");
  if (imageSecret && imageHeader === imageSecret) return true;

  const adminSecret = process.env.TREND_DISCOVERY_ADMIN_KEY || process.env.ADMIN_API_KEY;
  const adminHeader = req.headers.get("x-admin-key");
  return Boolean(adminSecret && adminHeader === adminSecret);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = postSchema.parse(await req.json());
    const trend = await loadTrendImageSeed(body.entityId);

    if (!trend) {
      return NextResponse.json({ error: "Trend not found" }, { status: 404 });
    }

    const result = await enqueueTrendImageJob({
      trend,
      variant: body.variant as FashionImageVariant,
      force: body.force,
      priority: body.priority,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue image job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = getSchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
    }

    if (params.entityId && params.variant) {
      const image = await getGeneratedFashionImage({
        entityType: "trend",
        entityId: params.entityId,
        variant: params.variant,
      });

      let query = supabase
        .from("image_generation_jobs")
        .select("*")
        .eq("entity_type", "trend")
        .eq("entity_id", params.entityId)
        .eq("variant", params.variant)
        .order("created_at", { ascending: false })
        .limit(params.limit);

      if (params.status) query = query.eq("status", params.status);
      const { data: jobs, error } = await query;
      if (error) throw error;

      return NextResponse.json({ image, jobs: jobs || [] });
    }

    let query = supabase
      .from("image_generation_jobs")
      .select("*")
      .eq("entity_type", params.entityType)
      .order("created_at", { ascending: false })
      .limit(params.limit);

    if (params.entityId) query = query.eq("entity_id", params.entityId);
    if (params.variant) query = query.eq("variant", params.variant);
    if (params.status) query = query.eq("status", params.status);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ jobs: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load image jobs";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
