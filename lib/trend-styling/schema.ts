import { createHash } from "crypto";
import { z } from "zod";

export const FORMULA_SLOTS = ["easy_entry", "current_uniform", "editorial_push"] as const;
export const AUDIENCES = ["women", "men"] as const;
export const REVIEW_STATUSES = ["draft", "pending_review", "approved", "rejected", "superseded"] as const;

const preciseText = z.string().trim().min(2).max(240);

export const formulaItemSchema = z.object({
  role: preciseText,
  garment: preciseText,
  silhouette: preciseText,
  colour: preciseText,
  material: preciseText,
  styling_instruction: preciseText,
}).strict();

export const providerFormulaCreativeSchema = z.object({
  title: preciseText,
  items: z.array(formulaItemSchema).min(2).max(10),
  footwear: preciseText,
  accessories: z.array(preciseText).min(1).max(8),
  styling_instructions: z.array(preciseText).min(1).max(8),
  occasion: preciseText,
  season: preciseText,
  climate: preciseText,
  market_rationale: z.string().trim().min(30).max(700),
  evidence_based_rationale: z.string().trim().min(30).max(700),
  evidence_ids: z.array(z.string().uuid()).min(2).max(30),
  confidence: z.number().min(0).max(1),
}).strict();

export const providerFormulaSchema = providerFormulaCreativeSchema.extend({
  audience: z.enum(AUDIENCES),
  formula_slot: z.enum(FORMULA_SLOTS),
}).strict();

const providerAudienceFormulaSetSchema = z.object({
  easy_entry: providerFormulaCreativeSchema,
  current_uniform: providerFormulaCreativeSchema,
  editorial_push: providerFormulaCreativeSchema,
}).strict();

export const providerFormulaOutputSchema = z.object({
  formulas: z.object({ women: providerAudienceFormulaSetSchema, men: providerAudienceFormulaSetSchema }).strict(),
}).strict().transform(({ formulas }) => ({
  formulas: AUDIENCES.flatMap((audience) => FORMULA_SLOTS.map((formula_slot) => providerFormulaSchema.parse({
    ...formulas[audience][formula_slot], audience, formula_slot,
  }))),
}));

export type ProviderFormula = z.infer<typeof providerFormulaSchema>;
export type ProviderFormulaOutput = z.infer<typeof providerFormulaOutputSchema>;

export const internalFormulaCandidateSchema = providerFormulaSchema.extend({
  id: z.string().uuid(),
  set_id: z.string().uuid(),
  trend_id: z.number().int().nullable(),
  concept_id: z.string().uuid().nullable(),
  job_id: z.string().uuid(),
  owner_identity: preciseText,
  canonical_keyword: preciseText,
  requesting_market: preciseText,
  selected_markets: z.array(preciseText).min(1),
  authoritative_evidence_hash: z.string().regex(/^[a-f0-9]{64}$/),
  formula_type: z.literal("trend_outfit"),
  review_status: z.literal("pending_review"),
  generated_at: z.string().datetime(),
  valid_until: z.string().datetime(),
  schema_version: z.literal(1),
}).strict().refine((value) => Boolean(value.trend_id) !== Boolean(value.concept_id), "Exactly one trend_id or concept_id is required");

export type InternalFormulaCandidate = z.infer<typeof internalFormulaCandidateSchema>;

export const trendOutfitFormulaSchema = z.object({
  id: z.string().uuid().optional(),
  trend_id: z.number().int().nullable().optional(),
  concept_id: z.string().uuid().nullable().optional(),
  set_id: z.string().uuid().optional(),
  canonical_keyword: preciseText,
  audience: z.enum(AUDIENCES),
  formula_slot: z.enum(FORMULA_SLOTS),
  title: preciseText,
  items: z.array(formulaItemSchema).min(2).max(10),
  footwear: preciseText,
  accessories: z.array(preciseText).min(1).max(8),
  occasion: preciseText,
  climate: preciseText,
  season: preciseText,
  region: preciseText,
  why_it_works: z.string().trim().min(30).max(700),
  evidence_ids: z.array(z.string().uuid()).min(2).max(30),
  confidence: z.number().min(0).max(1),
  evidence_hash: z.string().regex(/^[a-f0-9]{64}$/),
  formula_hash: z.string().regex(/^[a-f0-9]{64}$/),
  generated_at: z.string().datetime(),
  valid_until: z.string().datetime(),
  review_status: z.enum(REVIEW_STATUSES),
  image_url: z.string().url().nullable().optional(),
  image_status: z.enum(["approved", "pending", "unavailable", "retained_previous"]).optional(),
}).strict().refine((value) => Boolean(value.trend_id) !== Boolean(value.concept_id), "Exactly one trend_id or concept_id is required");

export type TrendOutfitFormula = z.infer<typeof trendOutfitFormulaSchema>;

export const trendStyleEvidenceSchema = z.object({
  id: z.string().uuid(),
  trend_id: z.number().int().nullable().optional(),
  concept_id: z.string().uuid().nullable().optional(),
  canonical_keyword: preciseText,
  audience: z.enum(AUDIENCES),
  region: preciseText,
  season: preciseText,
  garment_pairings: z.array(preciseText).min(1),
  silhouettes: z.array(preciseText).min(1),
  materials: z.array(preciseText).min(1),
  colours: z.array(preciseText).min(1),
  footwear: z.array(preciseText).min(1),
  accessories: z.array(preciseText),
  styling_techniques: z.array(preciseText).min(1),
  source_url: z.string().url(),
  source_domain: preciseText,
  short_extract: z.string().trim().max(500),
  published_at: z.string().datetime(),
  observed_at: z.string().datetime(),
  quality_score: z.number().min(0).max(1),
  recency_score: z.number().min(0).max(1),
}).strict().refine((value) => Boolean(value.trend_id) !== Boolean(value.concept_id), "Exactly one trend_id or concept_id is required");

export type TrendStyleEvidence = z.infer<typeof trendStyleEvidenceSchema>;

export function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(sortValue(value))).digest("hex");
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortValue(child)]));
  }
  return value;
}

export function computeEvidenceHash(evidence: TrendStyleEvidence[]) {
  return stableHash(evidence.map(({ id, audience, region, season, source_url, published_at, observed_at, garment_pairings, silhouettes, materials, colours, footwear, accessories, styling_techniques, quality_score, recency_score }) => ({ id, audience, region, season, source_url, published_at, observed_at, garment_pairings, silhouettes, materials, colours, footwear, accessories, styling_techniques, quality_score, recency_score })).sort((a, b) => a.id.localeCompare(b.id)));
}

export function computeFormulaHash(formula: Omit<TrendOutfitFormula, "formula_hash">) {
  const hashable = { ...formula };
  delete hashable.id;
  delete hashable.image_url;
  delete hashable.image_status;
  return stableHash(hashable);
}
