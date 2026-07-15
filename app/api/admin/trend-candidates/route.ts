import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";
import {
  listTrendCandidates,
  promoteApprovedTrendCandidates,
  setTrendCandidateStatus,
  type TrendCandidateStatus,
} from "@/lib/trend-candidates";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["pending", "approved", "rejected", "promoted", "all"]);

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

function toIds(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  }
  const single = Number(value);
  return Number.isInteger(single) && single > 0 ? [single] : [];
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedStatus = url.searchParams.get("status") || "pending";
    const status = STATUSES.has(requestedStatus) ? requestedStatus : "pending";
    const limit = Number(url.searchParams.get("limit") || 100);
    const candidates = await listTrendCandidates({
      status: status as TrendCandidateStatus | "all",
      limit,
    });

    return NextResponse.json({
      status,
      count: candidates.length,
      candidates,
    });
  } catch (error) {
    console.error("Trend candidates GET failed:", error);
    return NextResponse.json({ error: "Failed to load trend candidates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: number;
    ids?: number[];
  };

  const action = String(body.action || "").trim().toLowerCase();
  const ids = toIds(body.ids?.length ? body.ids : body.id);

  try {
    if (action === "approve") {
      const candidates = await setTrendCandidateStatus(ids, "approved");
      return NextResponse.json({ action, count: candidates.length, candidates });
    }

    if (action === "reject") {
      const candidates = await setTrendCandidateStatus(ids, "rejected");
      return NextResponse.json({ action, count: candidates.length, candidates });
    }

    if (action === "promote") {
      const result = await promoteApprovedTrendCandidates(ids);
      return NextResponse.json({ action, ...result });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("Trend candidates POST failed:", error);
    return NextResponse.json({ error: "Failed to update trend candidates" }, { status: 500 });
  }
}
