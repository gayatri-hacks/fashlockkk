import { getSupabaseClient } from "@/lib/supabase";
import { trendOutfitFormulaSchema, type TrendOutfitFormula } from "./schema";
import { validateFormulaSet } from "./validation";

export function selectApprovedFormulaSetFromRows(rows:unknown[],audience:"women"|"men"){const groups=new Map<string,TrendOutfitFormula[]>();for(const row of rows){const parsed=trendOutfitFormulaSchema.safeParse(row);if(!parsed.success||parsed.data.review_status!=="approved"||parsed.data.audience!==audience)continue;const key=parsed.data.set_id||"legacy";groups.set(key,[...(groups.get(key)||[]),parsed.data]);}return [...groups.values()].filter((items)=>validateFormulaSet(items).valid).sort((a,b)=>new Date(b[0].generated_at).getTime()-new Date(a[0].generated_at).getTime())[0]||[];}

export async function getApprovedFormulaSet(input: { trendId: number; audience: "women" | "men"; region: string }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { formulas: [], state: "unavailable" as const };
  const { data, error } = await supabase.from("trend_outfit_formulas").select("*")
    .eq("trend_id", input.trendId).eq("audience", input.audience).eq("region", input.region)
    .eq("review_status", "approved").order("generated_at", { ascending: false });
  if (error) throw error;
  const formulas = selectApprovedFormulaSetFromRows(data||[],input.audience);
  if (!validateFormulaSet(formulas).valid) return { formulas: [], state: "unavailable" as const };
  const variant = input.audience === "men" ? "trend_formula_men" : "trend_formula_women";
  const { data: imageRows } = await supabase.from("generated_fashion_images").select("image_url,metadata,completed_at")
    .eq("entity_type", "trend").eq("entity_id", input.trendId).eq("variant", variant).eq("review_status", "approved").order("completed_at", { ascending: false });
  const imageByFormula = new Map<string, string>();
  for (const image of imageRows || []) {
    const formulaId = String(image.metadata?.formulaId || "");
    if (formulaId && !imageByFormula.has(formulaId)) imageByFormula.set(formulaId, image.image_url);
  }
  const withImages = formulas.map((formula) => ({ ...formula, image_url: formula.id ? imageByFormula.get(formula.id) || null : null, image_status: formula.id && imageByFormula.has(formula.id) ? "approved" as const : "unavailable" as const }));
  const retained = formulas.some((formula) => new Date(formula.valid_until) <= new Date());
  return { formulas: withImages, state: retained ? "retained_previous" as const : "approved" as const };
}

export async function getApprovedConceptFormulaSet(input:{conceptId:string;audience:"women"|"men";region:string}) { const supabase=getSupabaseClient(); if(!supabase)return {formulas:[],state:"unavailable" as const}; const {data,error}=await supabase.from("trend_outfit_formulas").select("*").eq("concept_id",input.conceptId).eq("audience",input.audience).eq("region",input.region).eq("review_status","approved").order("generated_at",{ascending:false}); if(error)throw error; const formulas=selectApprovedFormulaSetFromRows(data||[],input.audience); return {formulas,state:formulas.length===3?"approved" as const:"unavailable" as const}; }
