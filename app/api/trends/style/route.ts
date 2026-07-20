import { NextResponse } from "next/server";
import { trendStylingConfig } from "@/lib/trend-styling/config";
import { getApprovedFormulaSet } from "@/lib/trend-styling/repository";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const trendId = Number(params.get("trendId")); const region = params.get("region") || "IN";
  if (!trendStylingConfig.enabled) return NextResponse.json({ formulas: { women: [], men: [] }, state: "disabled" });
  if (!Number.isInteger(trendId)) return NextResponse.json({ error: "Missing trendId" }, { status: 400 });
  try {
    const [women, men] = await Promise.all([getApprovedFormulaSet({ trendId, audience: "women", region }), getApprovedFormulaSet({ trendId, audience: "men", region })]);
    return NextResponse.json({ formulas: { women: women.formulas, men: men.formulas }, states: { women: women.state, men: men.state }, region });
  } catch (error) { console.error("Trend styling cache read failed", error); return NextResponse.json({ formulas: { women: [], men: [] }, state: "unavailable" }, { status: 503 }); }
}
