import type { TrendOutfitFormula, TrendStyleEvidence } from "./schema";
import { FORMULA_SLOTS, trendOutfitFormulaSchema } from "./schema";

const VAGUE = /\b(piece|layer|top)\b/i;
const STOP_WORDS = new Set(["the", "and", "with", "style", "look", "trend", "wear"]);

export type ValidationResult = { valid: boolean; errors: string[] };

function tokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2 && !STOP_WORDS.has(word)) || []);
}

function overlap(a: Set<string>, b: Set<string>) {
  const shared = [...a].filter((value) => b.has(value)).length;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

export function validateFormula(formula: unknown, evidence: TrendStyleEvidence[], now = new Date()): ValidationResult {
  const parsed = trendOutfitFormulaSchema.safeParse(formula);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  const value = parsed.data;
  const errors: string[] = [];
  const garmentText = value.items.map((item) => item.garment).join(" ");
  if (VAGUE.test(garmentText)) errors.push("Formula contains vague garment language");
  const keywordTokens = tokens(value.canonical_keyword);
  const formulaTokens = tokens([value.title, garmentText, ...value.items.map((item) => `${item.silhouette} ${item.material} ${item.styling_instruction}`)].join(" "));
  if (![...keywordTokens].some((token) => formulaTokens.has(token))) errors.push("Canonical trend is not visibly expressed");
  if (new Date(value.valid_until) <= now) errors.push("Formula evidence is stale");
  const supporting = evidence.filter((item) => value.evidence_ids.includes(item.id));
  const preferredCutoff = new Date(now); preferredCutoff.setUTCDate(preferredCutoff.getUTCDate() - 60);
  const preferred = supporting.filter((item) => new Date(item.published_at) >= preferredCutoff && new Date(item.observed_at) >= preferredCutoff);
  const independentDomains = new Set(preferred.map((item) => item.source_domain.toLowerCase()));
  if (independentDomains.size < 2) errors.push("At least two independent evidence domains are required");
  const oldestAllowed = new Date(now); oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - 120);
  if (supporting.some((item) => new Date(item.published_at) < oldestAllowed || new Date(item.observed_at) < oldestAllowed)) errors.push("Supporting evidence is stale");
  if (supporting.some((item) => new Date(item.observed_at) > new Date(value.generated_at))) errors.push("Formula predates supporting evidence");
  if (value.items.length < 2 || !value.footwear || !value.accessories.length) errors.push("Outfit is incomplete");
  if (/versatile|elevates? the look|perfect balance|adds interest/i.test(value.why_it_works)) errors.push("Why-it-works explanation is generic");
  return { valid: errors.length === 0, errors };
}

export function validateFormulaSet(formulas: TrendOutfitFormula[]): ValidationResult {
  const errors: string[] = [];
  if (formulas.length !== 3) errors.push("Exactly three formulas are required");
  for (const slot of FORMULA_SLOTS) if (formulas.filter((formula) => formula.formula_slot === slot).length !== 1) errors.push(`Exactly one ${slot} formula is required`);
  if (new Set(formulas.map((formula) => formula.audience)).size > 1) errors.push("Formula set mixes audiences");
  if (new Set(formulas.map((formula) => formula.trend_id || formula.concept_id)).size > 1) errors.push("Formula set mixes owners");
  for (let left = 0; left < formulas.length; left += 1) {
    for (let right = left + 1; right < formulas.length; right += 1) {
      const a = tokens(formulas[left].items.map((item) => item.garment).join(" "));
      const b = tokens(formulas[right].items.map((item) => item.garment).join(" "));
      if (overlap(a, b) >= 0.75) errors.push(`${formulas[left].formula_slot} and ${formulas[right].formula_slot} are substantially duplicated`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateSixFormulaBatch(formulas: TrendOutfitFormula[]): ValidationResult {
  const errors: string[] = [];
  if (formulas.length !== 6) errors.push("Exactly six formulas are required before image enqueue");
  for (const audience of ["women", "men"] as const) {
    const result = validateFormulaSet(formulas.filter((formula) => formula.audience === audience));
    errors.push(...result.errors.map((error) => `${audience}: ${error}`));
  }
  if (new Set(formulas.map((formula) => formula.evidence_hash)).size !== 1) errors.push("Six-formula batch must share one authoritative evidence hash");
  return { valid: errors.length === 0, errors };
}
