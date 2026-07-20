import type { PublicEvidenceResult } from "./evidence-provider";

function normalized(value: string) { return value.toLowerCase().replace(/https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function tokens(value: string) { return new Set(normalized(value).split(" ").filter((token) => token.length > 2)); }
function similarity(a: string, b: string) { const left = tokens(a), right = tokens(b); const shared = [...left].filter((token) => right.has(token)).length; return shared / Math.max(1, new Set([...left, ...right]).size); }
export function deduplicateStylingSources(results: PublicEvidenceResult[]) {
  const kept: PublicEvidenceResult[] = [];
  for (const result of results) {
    const canonicalUrl = normalized(result.url);
    if (kept.some((item) => normalized(item.url) === canonicalUrl || similarity(`${item.title} ${item.shortExtract}`, `${result.title} ${result.shortExtract}`) >= .82)) continue;
    kept.push(result);
  }
  return kept;
}
