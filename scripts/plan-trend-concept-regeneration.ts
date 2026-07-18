#!/usr/bin/env tsx
import "./load-env";
import { getSupabaseClient } from "../lib/supabase";
import { TREND_COMPUTATION_VERSION } from "../lib/trends/config";
import { buildTrendImageBrief } from "../lib/images/trend-image-brief";
import {
  TREND_CONCEPT_ACCEPTANCE_THRESHOLDS,
  hammingSimilarity,
} from "../lib/images/trend-concept-validation";
import {
  validateEditorialNameSafety,
  type TrendEvidenceBundle,
} from "../lib/trends/editorial-refinement";

type GlobalTrendScoreRow = {
  canonical_keyword: string;
  editorial_display_name: string;
  primary_keyword_id: number | string | null;
  raw_keywords?: string[] | null;
  evidence_summary?: Record<string, unknown> | null;
  regions_observed?: string[] | null;
  region_breadth?: number | string | null;
  source_diversity?: number | string | null;
  latest_period?: string | null;
};

type GeneratedImageRow = {
  entity_id: number | string;
  image_url: string;
  review_status?: string | null;
  metadata?: Record<string, unknown> | null;
  validation_summary?: Record<string, unknown> | null;
  dominant_palette?: string | null;
  dominant_color?: string | null;
  composition_mode?: string | null;
  material_family?: string | null;
  perceptual_hash?: string | null;
  completed_at?: string | null;
};

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

function selectedFacts(image: GeneratedImageRow) {
  const summary = image.validation_summary || (image.metadata?.validationResults ? image.metadata : {});
  const selectedIndex = Number((summary as any).selectedCandidateIndex ?? image.metadata?.selectedCandidateIndex ?? 0);
  const results = Array.isArray((summary as any).validationResults) ? (summary as any).validationResults : [];
  const selected = results.find((result: any) => Number(result?.facts?.candidateIndex) === selectedIndex) || results[0];
  return selected?.facts || {};
}

function imageKeyword(image: GeneratedImageRow) {
  const brief = (image.metadata?.trendImageBrief || {}) as Record<string, unknown>;
  return String(brief.canonicalKeyword || image.metadata?.canonicalKeyword || image.metadata?.keyword || "").toLowerCase();
}

async function main() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase service credentials are required");

  const { data: scoreRows, error: scoreError } = await supabase
    .from("global_trend_scores")
    .select("canonical_keyword, editorial_display_name, primary_keyword_id, raw_keywords, evidence_summary, regions_observed, region_breadth, source_diversity, latest_period")
    .eq("computation_version", TREND_COMPUTATION_VERSION)
    .order("final_trend_score", { ascending: false })
    .limit(75);
  if (scoreError) throw scoreError;

  const rows = (scoreRows || []) as GlobalTrendScoreRow[];
  const ids = rows.map((row) => Number(row.primary_keyword_id)).filter(Boolean);
  const { data: imageRows, error: imageError } = await supabase
    .from("generated_fashion_images")
    .select("entity_id, image_url, review_status, metadata, validation_summary, dominant_palette, dominant_color, composition_mode, material_family, perceptual_hash, completed_at")
    .eq("entity_type", "trend")
    .eq("variant", "trend_concept")
    .in("entity_id", ids)
    .order("completed_at", { ascending: false });
  if (imageError) throw imageError;

  const latestImageById = new Map<number, GeneratedImageRow>();
  for (const image of (imageRows || []) as GeneratedImageRow[]) {
    const id = Number(image.entity_id);
    if (!latestImageById.has(id)) latestImageById.set(id, image);
  }

  const acceptedContexts: Array<{ id: number; hash: string; compositionMode: string; palette: string }> = [];
  const regenerationList = rows.flatMap((row, index) => {
    const id = Number(row.primary_keyword_id);
    const image = latestImageById.get(id);
    const bundle = bundleForRow(row);
    const nameValidation = validateEditorialNameSafety(String(row.editorial_display_name || ""), bundle);
    const reasons: string[] = [];
    const brief = buildTrendImageBrief(String(row.canonical_keyword));

    if (!nameValidation.ok) {
      reasons.push(`display name rejected: ${nameValidation.reason}`);
    }
    if (!image) {
      reasons.push("missing trend_concept image");
    } else {
      const facts = selectedFacts(image);
      const storedKeyword = imageKeyword(image);
      if (storedKeyword && storedKeyword !== String(row.canonical_keyword).toLowerCase()) {
        reasons.push(`image keyword mismatch: image=${storedKeyword} trend=${row.canonical_keyword}`);
      }
      if (facts.textDetected) reasons.push("OCR/text detected in selected image");
      if (toNumber(facts.materialRealism) > 0 && toNumber(facts.materialRealism) < TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.materialRealism) {
        reasons.push(`material quality below threshold: ${toNumber(facts.materialRealism).toFixed(2)}`);
      }
      if (Array.isArray(facts.missingRequiredCues) && facts.missingRequiredCues.length) {
        reasons.push(`semantic cues missing: ${facts.missingRequiredCues.join(", ")}`);
      }
      const hash = String(image.perceptual_hash || facts.perceptualHash || "");
      const adjacentDuplicate = hash
        ? acceptedContexts.slice(-2).find((context) => hammingSimilarity(context.hash, hash) >= TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.duplicateSimilarity)
        : null;
      if (adjacentDuplicate) reasons.push(`too similar to adjacent card id ${adjacentDuplicate.id}`);

      if (hash) {
        acceptedContexts.push({
          id,
          hash,
          compositionMode: String(image.composition_mode || facts.compositionMode || brief.compositionMode),
          palette: String(image.dominant_palette || facts.dominantPalette || brief.paletteFamily),
        });
      }
    }

    if (!reasons.length) return [];
    return [{
      position: index + 1,
      entityId: id,
      canonicalKeyword: row.canonical_keyword,
      displayName: row.editorial_display_name,
      imageUrl: image?.image_url || null,
      reviewStatus: image?.review_status || null,
      reasons,
      commandAfterApproval: `npm run images:enqueue -- --trend-id ${id} --variant trend_concept --force`,
    }];
  });

  console.log(JSON.stringify({
    dryRun: true,
    note: "No jobs were enqueued. Run only after editorial-name cleanup and human review.",
    scannedTrends: rows.length,
    regenerationCount: regenerationList.length,
    regenerationList,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
