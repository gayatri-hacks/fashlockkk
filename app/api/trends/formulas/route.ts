import { NextResponse } from "next/server";
import { trendStylingConfig } from "@/lib/trend-styling/config";
import { getApprovedFormulaSet } from "@/lib/trend-styling/repository";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!trendStylingConfig.enabled) return NextResponse.json({ formulas: [], state: "disabled" }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const trendId = Number(params.get("trendId")); const audience = params.get("audience"); const region = params.get("region") || "IN";
  if (!Number.isInteger(trendId) || !["women", "men"].includes(audience || "")) return NextResponse.json({ error: "Invalid trendId or audience" }, { status: 400 });
  try { return NextResponse.json(await getApprovedFormulaSet({ trendId, audience: audience as "women" | "men", region })); }
  catch (error) { console.error("Approved formula read failed", error); return NextResponse.json({ formulas: [], state: "unavailable" }, { status: 503 }); }
}
