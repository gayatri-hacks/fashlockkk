#!/usr/bin/env tsx
import "./load-env";
import { getSupabaseClient } from "../lib/supabase";
import { TREND_COMPUTATION_VERSION } from "../lib/trends/config";
import {
  deterministicEditorialFallback,
  validateEditorialNameSafety,
  type TrendEvidenceBundle,
} from "../lib/trends/editorial-refinement";

type GlobalTrendScoreRow = {
  canonical_keyword: string;
  editorial_display_name: string;
  raw_keywords?: string[] | null;
  evidence_hash?: string | null;
  evidence_summary?: Record<string, unknown> | null;
  regions_observed?: string[] | null;
  region_breadth?: number | string | null;
  source_diversity?: number | string | null;
  latest_period?: string | null;
  computation_version: string;
};

function parseArgs(argv: string[]) {
  return {
    write: argv.includes("--write"),
    confirmed: argv.includes("--confirm-production-cleanup"),
    limit: Number(argv[argv.indexOf("--limit") + 1] || 500),
  };
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bundleForRow(row: GlobalTrendScoreRow): TrendEvidenceBundle {
  const summary = row.evidence_summary || {};
  return {
    canonicalKeyword: String(row.canonical_keyword),
    rawKeywords: asStringArray(row.raw_keywords).length ? asStringArray(row.raw_keywords) : [String(row.canonical_keyword)],
    garmentCategories: asStringArray(summary.garmentCategories),
    fitSilhouetteModifiers: asStringArray(summary.fitSilhouetteModifiers),
    materials: asStringArray(summary.materials),
    patternsCraftTerms: asStringArray(summary.patternsCraftTerms),
    colors: asStringArray(summary.colors),
    productTitlePhrases: asStringArray(summary.productTitlePhrases),
    articlePhrases: asStringArray((summary as any).evidencePhrases || (summary as any).articlePhrases),
    supportingRegions: asStringArray(row.regions_observed),
    regionBreadth: toNumber(row.region_breadth),
    sourceDiversity: toNumber(row.source_diversity),
    supportCounts: {
      product: asStringArray(summary.productTitlePhrases).length,
      article: asStringArray((summary as any).evidencePhrases || (summary as any).articlePhrases).length,
      regionalQuery: asStringArray(row.regions_observed).length,
    },
    evidencePeriod: String(row.latest_period || ""),
  };
}

async function fetchRows(supabase: any, limit: number) {
  const { data, error } = await supabase
    .from("global_trend_scores")
    .select("canonical_keyword, editorial_display_name, raw_keywords, evidence_hash, evidence_summary, regions_observed, region_breadth, source_diversity, latest_period, computation_version")
    .eq("computation_version", TREND_COMPUTATION_VERSION)
    .order("final_trend_score", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as GlobalTrendScoreRow[];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.write && !options.confirmed) {
    throw new Error("Refusing to write without --confirm-production-cleanup");
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase service credentials are required");

  const rows = await fetchRows(supabase, options.limit);
  const contaminated = rows.flatMap((row) => {
    const bundle = bundleForRow(row);
    const validation = validateEditorialNameSafety(String(row.editorial_display_name || ""), bundle);
    if (validation.ok) return [];
    const fallbackName = deterministicEditorialFallback(bundle);
    return [{
      canonicalKeyword: row.canonical_keyword,
      currentName: row.editorial_display_name,
      fallbackName,
      evidenceHash: row.evidence_hash || null,
      rejectionReason: validation.reason,
      computationVersion: row.computation_version,
      bundle,
    }];
  });

  if (options.write) {
    const now = new Date().toISOString();
    for (const item of contaminated) {
      const { error: scoreError } = await supabase
        .from("global_trend_scores")
        .update({ editorial_display_name: item.fallbackName })
        .eq("canonical_keyword", item.canonicalKeyword)
        .eq("computation_version", TREND_COMPUTATION_VERSION);
      if (scoreError) throw scoreError;

      if (item.evidenceHash) {
        const { error: nameError } = await supabase
          .from("trend_editorial_names")
          .upsert({
            canonical_keyword: item.canonicalKeyword,
            editorial_display_name: item.fallbackName,
            evidence_hash: item.evidenceHash,
            evidence_summary: item.bundle,
            ai_confidence: 0,
            model_config_version: `deterministic-fallback:${TREND_COMPUTATION_VERSION}`,
            used_facets: [item.canonicalKeyword],
            rationale: `Controlled cleanup: ${item.rejectionReason}`,
            updated_at: now,
          }, { onConflict: "canonical_keyword,evidence_hash" });
        if (nameError) throw nameError;
      }
    }
  }

  console.log(JSON.stringify({
    dryRun: !options.write,
    writeRequires: "Add --write --confirm-production-cleanup to apply these exact fallback names.",
    scanned: rows.length,
    contaminatedCount: contaminated.length,
    contaminated: contaminated.map(({ bundle: _bundle, ...item }) => item),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
