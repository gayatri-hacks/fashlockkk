import { NextResponse } from "next/server";
import { canonicalizeTrendKeyword, isFashionKeyword } from "@/lib/trends/keyword-normalization";
import { trendStylingConfig } from "@/lib/trend-styling/config";
import { getApprovedConceptFormulaSet } from "@/lib/trend-styling/repository";
import { getSupabaseClient } from "@/lib/supabase";
import { isolatedConceptId } from "@/lib/trend-styling/concept-identity";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const canonicalKeyword = canonicalizeTrendKeyword(String(body.keyword || "").slice(0, 120));
  const market = String(body.market || "IN").toUpperCase(); const audience = body.audience === "men" ? "men" : "women";
  if (!canonicalKeyword || !isFashionKeyword(canonicalKeyword)) return NextResponse.json({ error: "Unsupported fashion keyword" }, { status: 400 });
  const conceptId = isolatedConceptId(canonicalKeyword);
  const cached = await getApprovedConceptFormulaSet({ conceptId, audience, region: market }).catch(() => ({ formulas: [], state: "unavailable" as const }));
  if (cached.formulas.length === 3 && cached.state === "approved") return NextResponse.json({ ...cached, canonicalKeyword, conceptId, queued: false });
  // SECURITY: Keep TREND_SEARCH_RESEARCH_ENQUEUE_ENABLED=false for public traffic.
  // This enqueue path must remain disabled until authentication, per-user throttling,
  // rate limiting, and abuse protection are implemented and reviewed.
  if (trendStylingConfig.searchResearchEnqueueEnabled) {
    const supabase = getSupabaseClient();
    if (supabase) { await supabase.from("trend_style_concepts").upsert({id:conceptId,canonical_keyword:canonicalKeyword,source_context:"user_search"},{onConflict:"id"}); await supabase.from("trend_style_research_jobs").upsert({ canonical_keyword: canonicalKeyword, concept_id: conceptId, requesting_market: market, season: String(body.season || "current"), source_context: "user_search", evaluated_markets: [], selected_markets: [], status: "pending" }, { onConflict: "canonical_keyword,requesting_market,season,source_context", ignoreDuplicates: true }).then(({ error }) => { if (error && error.code !== "23505") console.warn("Style research enqueue skipped", error.message); }); }
  }
  return NextResponse.json({ formulas: cached.formulas, state: cached.formulas.length ? "retained_previous" : "researching", canonicalKeyword, conceptId, queued: trendStylingConfig.searchResearchEnqueueEnabled });
}
