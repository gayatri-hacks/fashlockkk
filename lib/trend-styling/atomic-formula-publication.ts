import { randomUUID } from "crypto";
import { getSupabaseClient } from "@/lib/supabase";
import type { TrendOutfitFormula } from "./schema";
import { validateSixFormulaBatch } from "./validation";

export async function stageAndAtomicallyApproveFormulaSet(formulas:TrendOutfitFormula[], setId=randomUUID()){const result=validateSixFormulaBatch(formulas);if(!result.valid)throw new Error(result.errors.join("; "));const db=getSupabaseClient();if(!db)throw new Error("Supabase service credentials required");const rows=formulas.map((formula)=>({...formula,id:formula.id||randomUUID(),set_id:setId,review_status:"pending_review"}));const {error:insertError}=await db.from("trend_outfit_formulas").insert(rows);if(insertError)throw insertError;const {error:approveError}=await db.rpc("approve_trend_formula_set",{candidate_set_id:setId});if(approveError)throw approveError;return {setId,formulas:rows.map((formula)=>({...formula,review_status:"approved" as const}))};}
