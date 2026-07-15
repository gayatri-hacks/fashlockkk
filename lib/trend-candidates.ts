import { getSupabaseClient } from "@/lib/supabase";

export type TrendCandidateStatus = "pending" | "approved" | "rejected" | "promoted";
export type TrendCandidateEmergenceStage = "emerging" | "rising" | "peaking" | "mainstream" | "declining";

export type TrendCandidate = {
  id: number;
  phrase: string;
  normalized_phrase: string;
  source: string | null;
  source_url: string | null;
  context: string | null;
  category: string | null;
  confidence_score: number;
  evidence_count: number;
  source_diversity: number;
  growth_velocity: number;
  recency_score: number;
  emergence_stage: TrendCandidateEmergenceStage;
  supporting_evidence: Array<Record<string, unknown>>;
  last_discovered_at: string | null;
  status: TrendCandidateStatus;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type TrendCandidateEvidence = {
  id: number;
  candidate_id: number;
  phrase: string;
  normalized_phrase: string;
  source_type: string;
  source_name: string | null;
  source_url: string | null;
  source_key: string;
  context: string | null;
  evidence_kind: string | null;
  score_contribution: number;
  observed_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const TREND_CANDIDATE_SELECT =
  "id, phrase, normalized_phrase, source, source_url, context, category, confidence_score, evidence_count, source_diversity, growth_velocity, recency_score, emergence_stage, supporting_evidence, last_discovered_at, status, first_seen_at, last_seen_at, created_at, updated_at";

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeTrendCandidatePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateSort(a: TrendCandidate, b: TrendCandidate) {
  return (
    toNumber(b.confidence_score) - toNumber(a.confidence_score) ||
    toNumber(b.evidence_count) - toNumber(a.evidence_count) ||
    new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
  );
}

export async function listTrendCandidates(options?: {
  status?: TrendCandidateStatus | "all";
  limit?: number;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const status = options?.status ?? "pending";
  const limit = Math.min(Math.max(Number(options?.limit ?? 100), 1), 500);

  let query = supabase
    .from("trend_candidates")
    .select(TREND_CANDIDATE_SELECT)
    .order("confidence_score", { ascending: false })
    .order("evidence_count", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as TrendCandidate[]).sort(candidateSort);
}

export async function setTrendCandidateStatus(ids: number[], status: TrendCandidateStatus) {
  const supabase = getSupabaseClient();
  if (!supabase || ids.length === 0) return [];

  const uniqueIds = [...new Set(ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
  if (!uniqueIds.length) return [];

  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from("trend_candidates")
    .update({ status, updated_at: timestamp })
    .in("id", uniqueIds)
    .select(TREND_CANDIDATE_SELECT);

  if (error) throw error;
  return (data ?? []) as TrendCandidate[];
}

export async function promoteApprovedTrendCandidates(ids?: number[]) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { promotedCount: 0, insertedCount: 0, promotedCandidates: [] as TrendCandidate[] };
  }

  const normalizedIds = [...new Set((ids ?? []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];

  let query = supabase
    .from("trend_candidates")
    .select(TREND_CANDIDATE_SELECT)
    .eq("status", "approved")
    .order("confidence_score", { ascending: false });

  if (normalizedIds.length) {
    query = query.in("id", normalizedIds);
  }

  const { data: candidates, error: candidateError } = await query;
  if (candidateError) throw candidateError;

  const approved = (candidates ?? []) as TrendCandidate[];
  if (!approved.length) {
    return { promotedCount: 0, insertedCount: 0, promotedCandidates: [] as TrendCandidate[] };
  }

  const { data: keywords, error: keywordError } = await supabase
    .from("trend_keywords")
    .select("keyword");
  if (keywordError) throw keywordError;

  const existingKeywords = new Set(
    (keywords ?? [])
      .map((row: any) => normalizeTrendCandidatePhrase(String(row.keyword || "")))
      .filter(Boolean),
  );

  const inserts = approved
    .filter((candidate) => !existingKeywords.has(candidate.normalized_phrase))
    .map((candidate) => ({
      keyword: candidate.normalized_phrase,
      category: candidate.category || "other",
    }));

  if (inserts.length) {
    const { error: insertError } = await supabase
      .from("trend_keywords")
      .upsert(inserts, { onConflict: "keyword", ignoreDuplicates: true });
    if (insertError) throw insertError;
  }

  const timestamp = new Date().toISOString();
  const approvedIds = approved.map((candidate) => candidate.id);
  const { data: promoted, error: promoteError } = await supabase
    .from("trend_candidates")
    .update({ status: "promoted", updated_at: timestamp })
    .in("id", approvedIds)
    .select(TREND_CANDIDATE_SELECT);

  if (promoteError) throw promoteError;

  return {
    promotedCount: approved.length,
    insertedCount: inserts.length,
    promotedCandidates: (promoted ?? []) as TrendCandidate[],
  };
}

export async function listTrendCandidateEvidence(candidateId: number, limit = 100) {
  const supabase = getSupabaseClient();
  if (!supabase || !Number.isInteger(candidateId) || candidateId <= 0) return [];

  const { data, error } = await supabase
    .from("trend_candidate_evidence")
    .select(
      "id, candidate_id, phrase, normalized_phrase, source_type, source_name, source_url, source_key, context, evidence_kind, score_contribution, observed_at, metadata, created_at",
    )
    .eq("candidate_id", candidateId)
    .order("score_contribution", { ascending: false })
    .order("observed_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit), 1), 500));

  if (error) throw error;
  return (data ?? []) as TrendCandidateEvidence[];
}
