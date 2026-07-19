#!/usr/bin/env tsx
import "./load-env";
import { getSupabaseClient } from "../lib/supabase";
import { analyzeImagePixels, createOcrProvider, downloadImagePixels } from "../lib/images/image-pixel-analysis";
import { createImageSemanticValidator } from "../lib/images/image-semantic-validator";
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
import { trendConceptKeywordsMatch } from "../lib/images/trend-concept-regeneration-plan";

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

type AuditStatus =
  | "metadata_match"
  | "needs_deterministic_review"
  | "needs_semantic_review"
  | "approved"
  | "regenerate"
  | "false_positive_alias"
  | "legacy_unreviewed"
  | "technical_failure";

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
  const metadataOnly = process.argv.includes("--metadata-only");
  const semanticReview = process.argv.includes("--semantic-review");
  const ocrProvider = createOcrProvider();
  const semanticValidator = semanticReview ? createImageSemanticValidator() : null;

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
  const regenerationList = [];
  const auditRows: Array<{
    position: number;
    entityId: number;
    canonicalKeyword: string;
    displayName: string;
    status: AuditStatus;
    imageUrl: string | null;
    reviewStatus: string | null;
    reasons: string[];
    commandAfterApproval?: string;
  }> = [];

  for (const [index, row] of rows.entries()) {
    const id = Number(row.primary_keyword_id);
    const image = latestImageById.get(id);
    const bundle = bundleForRow(row);
    const nameValidation = validateEditorialNameSafety(String(row.editorial_display_name || ""), bundle);
    const reasons: string[] = [];
    let status: AuditStatus = "metadata_match";
    let semanticReviewedThisRun = false;
    let semanticReviewUnavailable = false;
    const brief = buildTrendImageBrief(String(row.canonical_keyword));

    if (!nameValidation.ok) {
      reasons.push(`display name rejected: ${nameValidation.reason}`);
    }
    if (!image) {
      reasons.push("missing trend_concept image");
      status = "regenerate";
    } else {
      const facts = selectedFacts(image);
      const storedKeyword = imageKeyword(image);
      if (storedKeyword && !trendConceptKeywordsMatch(storedKeyword, String(row.canonical_keyword))) {
        reasons.push(`image keyword mismatch: image=${storedKeyword} trend=${row.canonical_keyword}`);
      } else if (storedKeyword && storedKeyword !== String(row.canonical_keyword).toLowerCase()) {
        status = "false_positive_alias";
      }
      let pixelHash = String(image.perceptual_hash || facts.perceptualHash || "");
      let pixelPalette = String(image.dominant_palette || facts.dominantPalette || brief.paletteFamily);
      if (metadataOnly) {
        status = "needs_deterministic_review";
        if (facts.textDetected) reasons.push("OCR/text detected in selected image");
        if (toNumber(facts.materialRealism) > 0 && toNumber(facts.materialRealism) < TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.materialRealism) {
          reasons.push(`material quality below threshold: ${toNumber(facts.materialRealism).toFixed(2)}`);
        }
      } else {
        try {
          const imageBuffer = await downloadImagePixels(image.image_url);
          const pixel = await analyzeImagePixels(imageBuffer, { ocrProvider });
          pixelHash = pixel.perceptualHash;
          pixelPalette = pixel.dominantPalette;
          if (!pixel.ocr.available) reasons.push("OCR provider unavailable for pixel audit");
          if (pixel.ocr.textDetected) reasons.push("OCR/text detected in selected image");
          if (pixel.sharpness < TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.sharpness) reasons.push(`pixel sharpness below threshold: ${pixel.sharpness.toFixed(2)}`);
          if (pixel.overexposed) reasons.push("pixel audit detected overexposure");
          if (pixel.underexposed) reasons.push("pixel audit detected underexposure");
          if (Math.abs(pixel.aspectRatio - TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.aspectRatio) > TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.aspectRatioTolerance) {
            reasons.push(`pixel aspect ratio is not 4:5: ${pixel.aspectRatio.toFixed(3)}`);
          }
          if (semanticValidator) {
            const semantic = await semanticValidator.validate({ brief, imageBuffer, candidateIndex: 0 });
            if (!semantic.available) {
              semanticReviewUnavailable = true;
              reasons.push(`semantic review unavailable: ${semantic.error || semantic.provider}`);
            } else {
              semanticReviewedThisRun = true;
              if (semantic.keywordMatch < TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.keywordMatch) reasons.push(`keywordMatch ${semantic.keywordMatch.toFixed(2)} below threshold`);
              if (semantic.fashionRelevance < TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.fashionRelevance) reasons.push(`fashionRelevance ${semantic.fashionRelevance.toFixed(2)} below threshold`);
              if (semantic.materialRealism < TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.materialRealism) reasons.push(`materialRealism ${semantic.materialRealism.toFixed(2)} below threshold`);
              if (semantic.compositionQuality < TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.compositionQuality) reasons.push(`compositionQuality ${semantic.compositionQuality.toFixed(2)} below threshold`);
              if (semantic.confidence < TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.semanticConfidence) reasons.push(`semantic confidence ${semantic.confidence.toFixed(2)} below threshold`);
              if (!semantic.requiredCuesPresent) reasons.push("missing required visual cue");
              if (semantic.forbiddenCuesPresent) reasons.push("forbidden visual cue");
              if (semantic.textDetected) reasons.push("semantic text detection");
              if (semantic.logoDetected) reasons.push("semantic logo/watermark detection");
            }
          }
        } catch (error) {
          reasons.push(`pixel audit failed: ${error instanceof Error ? error.message : String(error)}`);
          status = "technical_failure";
        }
      }
      if (Array.isArray(facts.missingRequiredCues) && facts.missingRequiredCues.length) {
        reasons.push(`semantic cues missing: ${facts.missingRequiredCues.join(", ")}`);
      }
      const hash = pixelHash;
      const adjacentDuplicate = hash
        ? acceptedContexts.slice(-2).find((context) => hammingSimilarity(context.hash, hash) >= TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.duplicateSimilarity)
        : null;
      if (adjacentDuplicate) reasons.push(`too similar to adjacent card id ${adjacentDuplicate.id}`);

      if (hash) {
        acceptedContexts.push({
          id,
          hash,
          compositionMode: String(image.composition_mode || facts.compositionMode || brief.compositionMode),
          palette: pixelPalette,
        });
      }
    }

    if (status !== "technical_failure" && reasons.length) {
      status = semanticReviewUnavailable
        ? "needs_semantic_review"
        : reasons.some((reason) => /OCR provider unavailable|pixel audit failed/i.test(reason))
        ? "technical_failure"
        : "regenerate";
    }

    if (image && status === "metadata_match") {
      const facts = selectedFacts(image);
      const semanticReviewed = Boolean(
        image.review_status === "accepted" &&
        (facts.semanticProvider || toNumber(facts.semanticConfidence) >= TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.semanticConfidence),
      ) || semanticReviewedThisRun;
      status = semanticReviewed ? "approved" : image.review_status === "legacy" ? "legacy_unreviewed" : "needs_semantic_review";
    }

    if (image && (status === "false_positive_alias" || status === "legacy_unreviewed")) {
      const facts = selectedFacts(image);
      const semanticReviewed = Boolean(
        image.review_status === "accepted" &&
        (facts.semanticProvider || toNumber(facts.semanticConfidence) >= TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.semanticConfidence),
      ) || semanticReviewedThisRun;
      if (!semanticReviewed) status = "needs_semantic_review";
    }

    const auditRow = {
      position: index + 1,
      entityId: id,
      canonicalKeyword: String(row.canonical_keyword),
      displayName: String(row.editorial_display_name),
      status,
      imageUrl: image?.image_url || null,
      reviewStatus: image?.review_status || null,
      reasons,
      ...(status === "regenerate" ? { commandAfterApproval: `npm run images:enqueue -- --trend-id ${id} --variant trend_concept --force` } : {}),
    };
    auditRows.push(auditRow);

    if (reasons.length) {
      regenerationList.push(auditRow);
    }
  }

  const byStatus = auditRows.reduce<Record<string, typeof auditRows>>((groups, row) => {
    groups[row.status] ||= [];
    groups[row.status].push(row);
    return groups;
  }, {});

  console.log(JSON.stringify({
    dryRun: true,
    pixelAudit: !metadataOnly,
    semanticReview,
    note: "No jobs were enqueued. Run only after editorial-name cleanup and human review.",
    scannedTrends: rows.length,
    regenerationCount: regenerationList.length,
    report: {
      safeToKeep: byStatus.approved || [],
      regenerate: byStatus.regenerate || [],
      needsSemanticReview: [
        ...(byStatus.needs_semantic_review || []),
        ...(byStatus.legacy_unreviewed || []),
      ],
      technicalFailure: byStatus.technical_failure || [],
      falsePositiveAlias: byStatus.false_positive_alias || [],
      needsDeterministicReview: byStatus.needs_deterministic_review || [],
    },
    regenerationList,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
