import { z } from "zod";

export const lailaTrendContextSchema = z.object({ trendId: z.string().min(1), keyword: z.string().min(1), formulaId: z.string().uuid(), audience: z.enum(["women", "men"]), market: z.string().min(2), source: z.literal("trend-card") });
export type LailaTrendContext = z.infer<typeof lailaTrendContextSchema>;
export function readLailaTrendContext(params: URLSearchParams) { return lailaTrendContextSchema.safeParse(Object.fromEntries(params)).data || null; }
export function buildLailaTrendUrl(context: LailaTrendContext) { const params = new URLSearchParams(context); return `/style?${params.toString()}`; }
export function buildSignInReturnUrl(context: LailaTrendContext) { return `/signin?next=${encodeURIComponent(buildLailaTrendUrl(context))}`; }
export function buildLailaPersonalisationPrompt(context: LailaTrendContext, wardrobe: string[] = []) {
  return `Personalize approved ${context.keyword} formula ${context.formulaId} for the ${context.audience} edit in ${context.market}. Use my saved wardrobe${wardrobe.length ? ` (${wardrobe.join(", ")})` : ""}, style brief, fit preferences, occasion, and local weather/climate when available. Keep the canonical trend visible and explain any item swaps.`;
}
