import { isolatedConceptId } from "./concept-identity";
import {
  computeFormulaHash,
  internalFormulaCandidateSchema,
  trendOutfitFormulaSchema,
  type InternalFormulaCandidate,
  type ProviderFormulaOutput,
  type TrendOutfitFormula,
} from "./schema";

export type TrustedFormulaContext = {
  jobId: string;
  setId: string;
  trendId?: number;
  conceptId?: string;
  canonicalKeyword: string;
  requestingMarket: string;
  selectedMarkets: string[];
  authoritativeEvidenceHash: string;
  generatedAt: string;
  validUntil: string;
};

export function buildInternalFormulaCandidates(
  output: ProviderFormulaOutput,
  context: TrustedFormulaContext,
): InternalFormulaCandidate[] {
  const ownerIdentity = context.conceptId ? `concept:${context.conceptId}` : `trend:${context.trendId}`;
  return output.formulas.map((formula) => internalFormulaCandidateSchema.parse({
    ...formula,
    id: isolatedConceptId(`formula ${context.setId} ${formula.audience} ${formula.formula_slot}`),
    set_id: context.setId,
    trend_id: context.trendId ?? null,
    concept_id: context.conceptId ?? null,
    job_id: context.jobId,
    owner_identity: ownerIdentity,
    canonical_keyword: context.canonicalKeyword,
    requesting_market: context.requestingMarket,
    selected_markets: context.selectedMarkets,
    authoritative_evidence_hash: context.authoritativeEvidenceHash,
    formula_type: "trend_outfit",
    review_status: "pending_review",
    generated_at: context.generatedAt,
    valid_until: context.validUntil,
    schema_version: 1,
  }));
}

export function toPersistedFormula(candidate: InternalFormulaCandidate): TrendOutfitFormula {
  const rationale = `${candidate.market_rationale} ${candidate.evidence_based_rationale}`.slice(0, 700);
  const base: Omit<TrendOutfitFormula, "formula_hash"> = {
    id: candidate.id,
    set_id: candidate.set_id,
    trend_id: candidate.trend_id,
    concept_id: candidate.concept_id,
    canonical_keyword: candidate.canonical_keyword,
    audience: candidate.audience,
    formula_slot: candidate.formula_slot,
    title: candidate.title,
    items: candidate.items,
    footwear: candidate.footwear,
    accessories: candidate.accessories,
    occasion: candidate.occasion,
    climate: candidate.climate,
    season: candidate.season,
    region: candidate.requesting_market,
    why_it_works: rationale,
    evidence_ids: candidate.evidence_ids,
    confidence: candidate.confidence,
    evidence_hash: candidate.authoritative_evidence_hash,
    generated_at: candidate.generated_at,
    valid_until: candidate.valid_until,
    review_status: candidate.review_status,
  };
  return trendOutfitFormulaSchema.parse({ ...base, formula_hash: computeFormulaHash(base) });
}

export function materializeTrustedFormulaSet(output: ProviderFormulaOutput, context: TrustedFormulaContext) {
  return buildInternalFormulaCandidates(output, context).map(toPersistedFormula);
}
