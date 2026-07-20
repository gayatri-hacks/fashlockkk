import { createHash } from "crypto";
import { buildFormulaOutfitPrompt, formulaImageVariant } from "@/lib/images/formula-outfit";
import type { TrendOutfitFormula } from "./schema";
import { validateSixFormulaBatch } from "./validation";

export function buildSixFormulaImageJobs(formulas: TrendOutfitFormula[]) {
  const validation=validateSixFormulaBatch(formulas); if(!validation.valid) throw new Error(validation.errors.join("; "));
  return formulas.map((formula)=>{ if(!formula.id) throw new Error("Approved formula ID required"); const prompt=buildFormulaOutfitPrompt(formula); const promptHash=createHash("sha256").update(prompt).digest("hex"); return { formula_id:formula.id, entity_type:"trend" as const, entity_id:formula.trend_id || null, variant:formulaImageVariant(formula.audience), prompt, prompt_hash:promptHash, model:process.env.OLLAMA_IMAGE_MODEL||"x/flux2-klein:4b", image_size:"1024x1024", storage_path:`formula-outfits/${formula.concept_id||formula.trend_id}/${formula.audience}/${formula.formula_slot}/${formula.id}-${promptHash.slice(0,12)}.png`, status:"pending", metadata:{formulaId:formula.id,formulaHash:formula.formula_hash,evidenceHash:formula.evidence_hash,audience:formula.audience,formulaSlot:formula.formula_slot,conceptId:formula.concept_id||null} }; });
}
export function proveDistinctFormulaJobs(jobs: ReturnType<typeof buildSixFormulaImageJobs>) { return new Set(jobs.map((job)=>job.formula_id)).size===6 && new Set(jobs.map((job)=>job.storage_path)).size===6 && new Set(jobs.map((job)=>`${job.formula_id}:${job.prompt_hash}`)).size===6; }
export function traceFormulaImageLifecycle(job:ReturnType<typeof buildSixFormulaImageJobs>[number]){const claimed={...job,status:"processing",locked_by:"test-worker"};const generated={...claimed,image_url:`https://storage.example/${job.storage_path}`};const validated={...generated,status:"validated",validation:{semantic:true,pixels:true,ocr:true,defects:true}};const published={...validated,status:"completed",database_identity:job.formula_id};return {enqueued:job,claimed,generated,validated,published};}
