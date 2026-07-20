import { createHash } from "crypto";
import type { TrendOutfitFormula } from "@/lib/trend-styling/schema";

export function formulaImageVariant(audience: TrendOutfitFormula["audience"]) { return audience === "men" ? "trend_formula_men" as const : "trend_formula_women" as const; }
export function buildFormulaOutfitPrompt(formula: TrendOutfitFormula) {
  const items = formula.items.map((item) => `${item.role}: ${item.colour} ${item.material} ${item.garment}, ${item.silhouette}; ${item.styling_instruction}`).join(". ");
  return [`Full-length editorial street-style photograph of one person wearing one coherent, complete, wearable outfit.`, `Trend: ${formula.canonical_keyword}. Audience: ${formula.audience}.`, items, `Footwear: ${formula.footwear}. Accessories: ${formula.accessories.join(", ")}.`, `Occasion: ${formula.occasion}. Climate: ${formula.climate}. Season: ${formula.season}. Market: ${formula.region}.`, "Every listed garment must be fully visible and materially recognizable. Match the listed colours, textures, silhouettes and proportions. No extra hero garment. Not a flat-lay. No text, writing, letters, labels, logos, watermarks, borders or poster design."].join("\n");
}
export function formulaImagePromptHash(formula: TrendOutfitFormula) { return createHash("sha256").update(buildFormulaOutfitPrompt(formula)).digest("hex"); }

export type OutfitSemanticObservation = { visibleGarments: string[]; trendExpressed: boolean; colourMaterialMatch: boolean; silhouetteMatch: boolean; contradictoryHeroGarment: boolean; textOrLogo: boolean; completeOutfit: boolean; flatLay: boolean };
export function validateFormulaOutfitObservation(formula: TrendOutfitFormula, observation: OutfitSemanticObservation) {
  const visible = observation.visibleGarments.map((value) => value.toLowerCase());
  const missing = formula.items.filter((item) => !visible.some((value) => value.includes(item.garment.toLowerCase()) || item.garment.toLowerCase().includes(value))).map((item) => item.garment);
  const errors = [missing.length ? `Missing essential garments: ${missing.join(", ")}` : null, !observation.trendExpressed ? "Trend is not clearly expressed" : null, !observation.colourMaterialMatch ? "Colours or materials do not match" : null, !observation.silhouetteMatch ? "Silhouette or proportion does not match" : null, observation.contradictoryHeroGarment ? "Contradictory hero garment present" : null, observation.textOrLogo ? "Text, label, logo or watermark detected" : null, !observation.completeOutfit ? "Outfit is incomplete" : null, observation.flatLay ? "Styled full outfit must not be a flat-lay" : null].filter(Boolean) as string[];
  return { accepted: errors.length === 0, errors };
}
