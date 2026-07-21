import type { FormulaTextProvider } from "./providers";
import { FormulaProviderQuotaError } from "./providers";
import type { TrendOutfitFormula, TrendStyleEvidence } from "./schema";
import { validateFormula, validateSixFormulaBatch } from "./validation";

export type FormulaReadyJob = {
  id: string;
  concept_id: string;
  attempts: number;
  max_attempts: number;
  evidence_hash: string;
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
    const formulas = await input.provider.generate({ prompt: input.prompt });
    const batch = validateSixFormulaBatch(formulas);
    for (const formula of formulas) {
      if (formula.concept_id !== input.job.concept_id) batch.errors.push("Formula owner does not match checkpoint concept");
      if (formula.evidence_hash !== input.job.evidence_hash) batch.errors.push("Formula evidence hash does not match checkpoint");
      batch.errors.push(...validateFormula(formula, input.evidence, input.now).errors);
    }
    if (batch.errors.length) {
      await input.store.retainEvidenceReady(input.job, batch.errors.join("; ").slice(0, 240));
      return { status: "invalid_formulas" as const, errors: batch.errors };
    }
    const approved = await input.store.approveAndComplete(input.job, formulas);
    if (approved.length !== 6) throw new Error("Completed job must read back exactly six approved formulas");
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
