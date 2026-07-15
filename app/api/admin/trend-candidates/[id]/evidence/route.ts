import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";
import { listTrendCandidateEvidence } from "@/lib/trend-candidates";

export const dynamic = "force-dynamic";

async function isAuthorized(request: Request) {
  const configuredKey = process.env.TREND_DISCOVERY_ADMIN_KEY || process.env.ADMIN_API_KEY || "";
  const suppliedKey = request.headers.get("x-admin-key") || "";

  if (configuredKey && suppliedKey === configuredKey) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    const userId = await getAuthenticatedUserId();
    return Boolean(userId);
  }

  return false;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const candidateId = Number(id);
    if (!Number.isInteger(candidateId) || candidateId <= 0) {
      return NextResponse.json({ error: "Invalid candidate id" }, { status: 400 });
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 100);
    const evidence = await listTrendCandidateEvidence(candidateId, limit);

    return NextResponse.json({
      candidateId,
      count: evidence.length,
      evidence,
    });
  } catch (error) {
    console.error("Trend candidate evidence GET failed:", error);
    return NextResponse.json({ error: "Failed to load trend candidate evidence" }, { status: 500 });
  }
}
