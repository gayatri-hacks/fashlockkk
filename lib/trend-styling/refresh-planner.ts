import { stableHash } from "./schema";

export type RefreshCandidate = { trendId: number; audience: "women" | "men"; region: string; selectedMarkets?: string[]; approvedMarkets?: string[] | null; evidenceHash: string; approvedEvidenceHash?: string | null; season: string; approvedSeason?: string | null };
export function planFormulaRefresh(candidates: RefreshCandidate[]) {
  return candidates.map((candidate) => { const marketsChanged = stableHash([...(candidate.selectedMarkets || [])].sort()) !== stableHash([...(candidate.approvedMarkets || [])].sort()); return ({ ...candidate, planId: stableHash(candidate), action: candidate.evidenceHash !== candidate.approvedEvidenceHash || candidate.season !== candidate.approvedSeason || marketsChanged ? "refresh" as const : "retain" as const,
    reasons: [candidate.evidenceHash !== candidate.approvedEvidenceHash ? "evidence_changed" : null, candidate.season !== candidate.approvedSeason ? "season_changed" : null, marketsChanged ? "markets_changed" : null].filter(Boolean) }); });
}
