import { enqueueTrendImageJob } from "@/lib/images/generated-fashion-images";
import { buildFormulaOutfitPrompt, formulaImageVariant } from "@/lib/images/formula-outfit";
import { trendStylingConfig } from "./config";
import type { TrendOutfitFormula } from "./schema";
import { validateFormula, validateSixFormulaBatch } from "./validation";
import type { TrendStyleEvidence } from "./schema";

export async function enqueueValidatedFormulaImages(formulas: TrendOutfitFormula[], evidence: TrendStyleEvidence[]) {
  if (!trendStylingConfig.autoEnqueueFormulaImages) return { status: "disabled" as const, queued: 0 };
  if (formulas.some((formula) => !formula.trend_id)) return { status: "rejected" as const, queued: 0, errors: ["Canonical trend_id required by legacy enqueue adapter"] };
  const batch = validateSixFormulaBatch(formulas); const errors = [...batch.errors];
  for (const formula of formulas) errors.push(...validateFormula(formula, evidence).errors.map((error) => `${formula.audience}/${formula.formula_slot}: ${error}`));
  if (errors.length) return { status: "rejected" as const, queued: 0, errors };
  const results = [];
  for (const formula of formulas) {
    results.push(await enqueueTrendImageJob({ trend: { id: formula.trend_id!, keyword: formula.canonical_keyword, editorialName: formula.title }, variant: formulaImageVariant(formula.audience), outfitFormula: buildFormulaOutfitPrompt(formula), outfitOccasion: formula.occasion, gender: formula.audience, formulaId: formula.id, formulaHash: formula.formula_hash, evidenceHash: formula.evidence_hash, formulaSlot: formula.formula_slot, priority: 4 }));
  }
  return { status: "queued" as const, queued: results.length, results };
}
