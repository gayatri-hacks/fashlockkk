import type { TrendStyleEvidence } from "./schema";
import type { StylingMarketPlan } from "./market-selection";
import { SUPPORTED_TREND_REGIONS } from "@/lib/trends/config";

export function buildEvidenceGroundedFormulaPrompt(input: {
  trendId?: number;
  conceptId?: string;
  canonicalKeyword: string;
  season: string;
  requestingMarket: string;
  marketPlan: StylingMarketPlan;
  evidence: TrendStyleEvidence[];
  evidenceHash: string;
  now?: Date;
}) {
  if (input.marketPlan.evaluatedMarkets.length !== SUPPORTED_TREND_REGIONS.length) throw new Error("All configured markets must be evaluated");
  if (!input.trendId && !input.conceptId) throw new Error("Trend or isolated concept identity required");
  if (!input.marketPlan.strongestMarkets.length) throw new Error("No materially supported active markets");
  if (!/^[a-f0-9]{64}$/.test(input.evidenceHash)) throw new Error("Authoritative evidence hash is required");
  const cutoff = new Date((input.now || new Date()).getTime() - 120 * 86_400_000);
  const usable = input.evidence.filter((item) => input.marketPlan.researchMarkets.includes(item.region as never)
    && new Date(item.published_at) >= cutoff && new Date(item.observed_at) >= cutoff);
  if (new Set(usable.map((item) => item.source_domain)).size < 2) throw new Error("Fresh independent styling evidence is required");
  const compactEvidence = usable.map((item) => ({ id: item.id, market: item.region, audience: item.audience, published_at: item.published_at, observed_at: item.observed_at, garment_pairings: item.garment_pairings, silhouettes: item.silhouettes, materials: item.materials, colours: item.colours, footwear: item.footwear, accessories: item.accessories, styling_techniques: item.styling_techniques, source_domain: item.source_domain }));
  return `Create six evidence-grounded outfit formulas. Do not infer from the keyword alone. Every evidence-based rationale must cite supplied evidence_ids. Treat the concept, keyword, market list and evidence hash as application context only: do not copy them into response metadata and do not generate any owner, authority, review, ID, hash, type or publication fields.\nCanonical keyword: ${input.canonicalKeyword}\nSeason guidance: ${input.season}\nMarket context: ${input.requestingMarket}\nStrongest markets: ${input.marketPlan.strongestMarkets.join(", ")}\nResearch markets: ${input.marketPlan.researchMarkets.join(", ")}\nEvidence: ${JSON.stringify(compactEvidence)}`;
}
