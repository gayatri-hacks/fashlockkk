import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

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

  revalidatePath("/trends");
  revalidatePath("/api/trends/overview-data");

  return NextResponse.json({
    ok: true,
    revalidated: ["/trends", "/api/trends/overview-data"],
    revalidatedAt: new Date().toISOString(),
  });
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    route: "/api/cron/revalidate-trends",
  });
}
