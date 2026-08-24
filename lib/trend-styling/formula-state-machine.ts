import type { FormulaTextProvider } from "./providers";
import { FormulaProviderQuotaError } from "./providers";
import type { ProviderFormulaOutput, TrendOutfitFormula, TrendStyleEvidence } from "./schema";
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

function formulaValidationErrors(
  formulas: TrendOutfitFormula[],
  evidence: TrendStyleEvidence[],
  job: FormulaReadyJob,
  now?: Date,
) {
  const errors = [...validateSixFormulaBatch(formulas).errors];
  const authoritativeEvidenceIds = new Set(evidence
    .filter((item) => item.concept_id === job.concept_id)
    .map((item) => item.id));
  for (const formula of formulas) {
    if (formula.concept_id !== job.concept_id) errors.push("Formula owner does not match checkpoint concept");
    if (formula.evidence_hash !== job.evidence_hash) errors.push("Formula evidence hash does not match checkpoint");
    if (new Set(formula.evidence_ids).size !== formula.evidence_ids.length) errors.push(`${formula.audience}/${formula.formula_slot} contains duplicated evidence IDs`);
    const unknownEvidenceIds = formula.evidence_ids.filter((id) => !authoritativeEvidenceIds.has(id));
    if (unknownEvidenceIds.length) errors.push(`${formula.audience}/${formula.formula_slot} cites evidence outside the saved authoritative set`);
    errors.push(...validateFormula(formula, evidence, now).errors);
  }
  return errors;
}

function semanticRepairPrompt(originalPrompt: string, previousOutput: ProviderFormulaOutput, errors: string[]) {
  return `${originalPrompt}\n\nThe previous complete formula batch failed application validation. Regenerate the entire six-formula object from the same saved evidence; do not perform research or invent evidence. Correct every listed validation error, make all three garment combinations per audience materially distinct, and use only supplied fresh evidence IDs from at least two independent domains for each formula. Validation errors: ${JSON.stringify(errors.slice(0, 40))}\nPrevious normalized batch for diagnosis only (return the required keyed response schema, not this array shape): ${JSON.stringify(previousOutput).slice(0, 30_000)}`;
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
    const context = {
      jobId: input.job.id,
      setId: input.job.set_id,
      conceptId: input.job.concept_id,
      canonicalKeyword: input.job.canonical_keyword,
      requestingMarket: input.job.requesting_market,
      selectedMarkets: input.job.selected_markets,
      authoritativeEvidenceHash: input.job.evidence_hash,
      generatedAt,
      validUntil,
    };
    let providerOutput = await input.provider.generate({ prompt: input.prompt });
    let formulas = materializeTrustedFormulaSet(providerOutput, context);
    let errors = formulaValidationErrors(formulas, input.evidence, input.job, input.now);
    if (errors.length) {
      providerOutput = await input.provider.generate({ prompt: semanticRepairPrompt(input.prompt, providerOutput, errors) });
      formulas = materializeTrustedFormulaSet(providerOutput, context);
      errors = formulaValidationErrors(formulas, input.evidence, input.job, input.now);
    }
    if (errors.length) {
      await input.store.retainEvidenceReady(input.job, errors.join("; ").slice(0, 240));
      return { status: "invalid_formulas" as const, errors };
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
