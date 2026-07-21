import type { TrendOutfitFormula, TrendStyleEvidence } from "./schema";
import type { EvidenceInsert } from "./research-worker";
import { buildSixFormulaImageJobs } from "./isolated-image-jobs";
import { validateFormula, validateSixFormulaBatch } from "./validation";

export const MANUAL_STYLING_WORKFLOW_NAME="manual-trend-styling-research";
export const MANUAL_STYLING_STAGES=["market_discovery","styling_research","evidence_ready","formula_generating","formula_validation","atomic_approval_and_completion","optional_image_enqueue"] as const;
export async function runManualFirstStylingWorkflow(input:{enabled:boolean;autoEnqueueImages:boolean;research:()=>Promise<{evidence:EvidenceInsert[]}>;generate:(evidence:EvidenceInsert[])=>Promise<TrendOutfitFormula[]>;approve:(formulas:TrendOutfitFormula[])=>Promise<TrendOutfitFormula[]>;enqueue?:(jobs:ReturnType<typeof buildSixFormulaImageJobs>)=>Promise<void>}){
  if(!input.enabled)return {status:"disabled" as const,stages:MANUAL_STYLING_STAGES};
  const research=await input.research();if(new Set(research.evidence.map((item)=>item.source_domain)).size<2)return {status:"insufficient_evidence" as const};
  const evidence=research.evidence.map((item)=>({...item,trend_id:null})) as TrendStyleEvidence[];
  const generated=await input.generate(research.evidence);const validation=validateSixFormulaBatch(generated);
  for(const formula of generated)validation.errors.push(...validateFormula(formula,evidence).errors.map((error)=>`${formula.audience}/${formula.formula_slot}: ${error}`));
  if(validation.errors.length)return {status:"invalid_formulas" as const,errors:validation.errors};
  const approved=await input.approve(generated);const jobs=buildSixFormulaImageJobs(approved);if(input.autoEnqueueImages&&input.enqueue)await input.enqueue(jobs);
  return {status:"completed" as const,formulas:approved,jobs,imageEnqueued:input.autoEnqueueImages};
}
