import { canonicalizeTrendKeyword } from "@/lib/trends/keyword-normalization";

export function trendConceptKeywordsMatch(imageKeyword: string, trendKeyword: string) {
  const imageCanonical = canonicalizeTrendKeyword(imageKeyword || "");
  const trendCanonical = canonicalizeTrendKeyword(trendKeyword || "");
  return Boolean(imageCanonical && trendCanonical && imageCanonical === trendCanonical);
}
