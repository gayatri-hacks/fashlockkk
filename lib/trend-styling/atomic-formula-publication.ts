import { randomUUID } from "crypto";
import { getSupabaseClient } from "@/lib/supabase";
import type { TrendOutfitFormula } from "./schema";
import { validateSixFormulaBatch } from "./validation";
import { isolatedConceptId } from "./concept-identity";

export interface FormulaPublicationStore {
  stage(rows: TrendOutfitFormula[]): Promise<void>;
  approveAndComplete(setId: string, jobId: string): Promise<void>;
  readApproved(conceptId: string, setId: string): Promise<TrendOutfitFormula[]>;
}

export function createSupabaseFormulaPublicationStore(): FormulaPublicationStore {
  const db = getSupabaseClient();
  if (!db) throw new Error("Supabase service credentials required");
  return {
    async stage(rows) {
      const { error } = await db.from("trend_outfit_formulas").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    },
    async approveAndComplete(setId, jobId) {
      const { data, error } = await db.rpc("approve_trend_formula_set_and_complete_job", { candidate_set_id: setId, target_job_id: jobId });
      if (error) throw error;
      if (data !== jobId) throw new Error("Atomic formula completion did not return the expected job");
    },
    async readApproved(conceptId, setId) {
      const { data, error } = await db.from("trend_outfit_formulas").select("*").eq("concept_id", conceptId).eq("set_id", setId).eq("review_status", "approved");
      if (error) throw error;
      return (data || []) as TrendOutfitFormula[];
    },
  };
}

export async function stageAndAtomicallyApproveFormulaSet(
  formulas: TrendOutfitFormula[],
  options: { jobId?: string; conceptId?: string; setId?: string; store?: FormulaPublicationStore } = {},
) {
  const result = validateSixFormulaBatch(formulas);
  if (!result.valid) throw new Error(result.errors.join("; "));
  const setId = options.setId || randomUUID();
  const conceptId = options.conceptId || formulas[0]?.concept_id || undefined;
  const rows = formulas.map((formula) => ({
    ...formula,
    id: formula.id || isolatedConceptId(`formula ${setId} ${formula.audience} ${formula.formula_slot}`),
    set_id: setId,
    review_status: "pending_review" as const,
  }));

  if (!options.jobId || !conceptId) {
    const db = getSupabaseClient();
    if (!db) throw new Error("Supabase service credentials required");
    const { error: insertError } = await db.from("trend_outfit_formulas").insert(rows);
    if (insertError) throw insertError;
    const { error: approveError } = await db.rpc("approve_trend_formula_set", { candidate_set_id: setId });
    if (approveError) throw approveError;
    return { setId, formulas: rows.map((formula) => ({ ...formula, review_status: "approved" as const })) };
  }

  const store = options.store || createSupabaseFormulaPublicationStore();
  await store.stage(rows);
  await store.approveAndComplete(setId, options.jobId);
  const approved = await store.readApproved(conceptId, setId);
  if (approved.length !== 6) throw new Error("Completed formula read-back must contain exactly six approved rows");
  return { setId, formulas: approved };
}
