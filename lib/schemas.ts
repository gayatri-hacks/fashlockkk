import { z } from "zod";

export const productFiltersSchema = z.object({
  search: z.string().optional().default(""),
  source: z.string().optional().default(""),
  brand: z.string().optional().default(""),
  category: z.string().optional().default(""),
  color: z.string().optional().default(""),
});

export const trendQuerySchema = z.object({
  weeks: z.coerce.number().int().min(2).max(24).optional().default(6),
});

export const scrapeSourceSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  listing_url: z.string().url(),
});

export type ProductFiltersInput = z.infer<typeof productFiltersSchema>;
export type TrendQueryInput = z.infer<typeof trendQuerySchema>;
export type ScrapeSourceInput = z.infer<typeof scrapeSourceSchema>;
