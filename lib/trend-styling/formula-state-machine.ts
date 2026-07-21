import type { FormulaTextProvider } from "./providers";
import { FormulaProviderQuotaError } from "./providers";
import type { TrendOutfitFormula, TrendStyleEvidence } from "./schema";
import { validateFormula, validateSixFormulaBatch } from "./validation";
import { materializeTrustedFormulaSet } from "./formula-schema-boundary";

export type FormulaReadyJob = {
  id: string;
  concept_id: string;
  attempts: number;
  max_attempts: number;
  evidence_hash: string;
  set_id: string;
  canonical_keyword: string;
  requesting_market: string;
  selected_markets: string[];
};

export interface FormulaStateStore {
  begin(job: FormulaReadyJob): Promise<boolean>;
  deferQuota(job: FormulaReadyJob, retryAfter: string, message: string): Promise<void>;
  retainEvidenceReady(job: FormulaReadyJob, message: string): Promise<void>;
  approveAndComplete(job: FormulaReadyJob, formulas: TrendOutfitFormula[]): Promise<TrendOutfitFormula[]>;
  enqueue?(formulas: TrendOutfitFormula[]): Promise<void>;
}

export function formulaQuotaRetryAt(error: FormulaProviderQuotaError, now = new Date()) {
  const seconds = Math.max(5 * 60, Math.min(24 * 60 * 60, error.retryAfterSeconds || 6 * 60 * 60));
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

export async function runFormulaStateMachine(input: {
  job: FormulaReadyJob;
  evidence: TrendStyleEvidence[];
  prompt: string;
  provider: FormulaTextProvider;
  store: FormulaStateStore;
  enqueueImages: boolean;
  now?: Date;
}) {
  if (!(await input.store.begin(input.job))) return { status: "not_ready" as const };
  try {
    const generatedAt = (input.now || new Date()).toISOString();
    const validUntil = new Date(new Date(generatedAt).getTime() + 90 * 86_400_000).toISOString();
    const providerOutput = await input.provider.generate({ prompt: input.prompt });
    const formulas = materializeTrustedFormulaSet(providerOutput, {
      jobId: input.job.id,
      setId: input.job.set_id,
      conceptId: input.job.concept_id,
      canonicalKeyword: input.job.canonical_keyword,
      requestingMarket: input.job.requesting_market,
      selectedMarkets: input.job.selected_markets,
      authoritativeEvidenceHash: input.job.evidence_hash,
      generatedAt,
      validUntil,
    });
    const batch = validateSixFormulaBatch(formulas);
    const authoritativeEvidenceIds = new Set(input.evidence
      .filter((item) => item.concept_id === input.job.concept_id)
      .map((item) => item.id));
    for (const formula of formulas) {
      if (formula.concept_id !== input.job.concept_id) batch.errors.push("Formula owner does not match checkpoint concept");
      if (formula.evidence_hash !== input.job.evidence_hash) batch.errors.push("Formula evidence hash does not match checkpoint");
      if (new Set(formula.evidence_ids).size !== formula.evidence_ids.length) batch.errors.push(`${formula.audience}/${formula.formula_slot} contains duplicated evidence IDs`);
      const unknownEvidenceIds = formula.evidence_ids.filter((id) => !authoritativeEvidenceIds.has(id));
      if (unknownEvidenceIds.length) batch.errors.push(`${formula.audience}/${formula.formula_slot} cites evidence outside the saved authoritative set`);
      batch.errors.push(...validateFormula(formula, input.evidence, input.now).errors);
    }
    if (batch.errors.length) {
      await input.store.retainEvidenceReady(input.job, batch.errors.join("; ").slice(0, 240));
      return { status: "invalid_formulas" as const, errors: batch.errors };
    }
    const approved = await input.store.approveAndComplete(input.job, formulas);
    if (approved.length !== 6 || approved.some((formula) => formula.review_status !== "approved")) throw new Error("Completed job must read back exactly six approved formulas");
    if (input.enqueueImages && input.store.enqueue) await input.store.enqueue(approved);
    return { status: "completed" as const, formulas: approved };
  } catch (error) {
    if (error instanceof FormulaProviderQuotaError) {
      const retryAfter = formulaQuotaRetryAt(error, input.now);
      await input.store.deferQuota(input.job, retryAfter, error.message);
      return { status: "deferred" as const, errorCategory: error.errorCategory, retryAfter };
    }
    await input.store.retainEvidenceReady(input.job, error instanceof Error ? error.message.slice(0, 240) : "Formula generation failed");
    throw error;
  }
}
