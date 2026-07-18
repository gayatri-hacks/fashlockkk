import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { recomputeMultiRegionTrends } from "@/lib/trends/multi-region-pipeline";
import { TREND_COMPUTATION_VERSION } from "@/lib/trends/config";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request) {
  const secret = process.env.TREND_PIPELINE_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || headerSecret === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const result = await recomputeMultiRegionTrends({
    dryRun: body.dryRun !== false,
    limit: Number(body.limit || 75),
    refineNames: body.refineNames === true,
    enqueueImages: body.enqueueImages === true,
  });

  if (!result.dryRun) {
    revalidatePath("/trends");
  }

  return NextResponse.json({
    ok: true,
    computationVersion: TREND_COMPUTATION_VERSION,
    ...result,
  });
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    route: "/api/cron/recompute-trends",
    computationVersion: TREND_COMPUTATION_VERSION,
    defaultMode: "dryRun",
  });
}
