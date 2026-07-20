import type { SupportedTrendRegion } from "@/lib/trends/config";
import { createStylingEvidenceSearchProvider, type PublicEvidenceResult, type StylingEvidenceSearchProvider } from "./evidence-provider";
import { deduplicateStylingSources } from "./evidence-deduplication";
import { MARKET_RESEARCH_LANGUAGES } from "./market-selection";

export async function researchSelectedMarkets(input: { keyword: string; markets: SupportedTrendRegion[]; season: string; provider?: StylingEvidenceSearchProvider }) {
  const provider = input.provider || createStylingEvidenceSearchProvider(); const results: PublicEvidenceResult[] = [];
  for (const market of input.markets) for (const language of MARKET_RESEARCH_LANGUAGES[market]) for (const audience of ["women", "men"] as const) results.push(...await provider.search({ keyword: input.keyword, audience, region: market, season: input.season, language }));
  return deduplicateStylingSources(results);
}
