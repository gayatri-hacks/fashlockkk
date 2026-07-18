import { getSupabaseClient } from "@/lib/supabase";
import { getGeneratedFashionImage, enqueueTrendImageJob } from "@/lib/images/generated-fashion-images";
import {
  SUPPORTED_TREND_REGIONS,
  TREND_COMPUTATION_VERSION,
  TREND_CONFIDENCE,
  isMultiRegionTrendsEnabled,
  regionLabel,
  type TrendLifecycle,
} from "@/lib/trends/config";
import {
  canonicalizeTrendKeyword,
  isFashionKeyword,
  titleCaseTrend,
} from "@/lib/trends/keyword-normalization";
import {
  computeGlobalTrendScores,
  computeRegionalTrendScores,
  neutralSourceConfirmation,
  type GlobalTrendScore,
  type HistoricalTrendPoint,
  type SourceConfirmation,
} from "@/lib/trends/scoring";
import {
  deterministicEditorialFallback,
  evidenceHash,
  refineEditorialName,
  type TrendEvidenceBundle,
} from "@/lib/trends/editorial-refinement";
import {
  configuredTrendRegions,
  globalPeriodCoverage,
  latestComparableCompletePeriod,
  shouldUseHistoricalPoint,
  type RegionPeriodStatus,
} from "@/lib/trends/period-finalization";

type TrendKeywordRow = {
  id: number;
  keyword: string;
};

type HistoricalRow = {
  keyword_id: number | string | null;
  month: string | null;
  google_score: number | string | null;
  market: string | null;
};

type OverviewTrend = {
  id: number;
  keyword: string;
  editorialName: string;
  oneLiner: string;
  howToWear: string[];
  shopSearchTerms: string[];
  pexelsImageUrl: string | null;
  velocity: TrendLifecycle;
  topMarkets: Array<{ code: string; market: string }>;
  trendData: Array<{ month: string; value: number }>;
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchAllRows<T>(queryFactory: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>, pageSize = 1000) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadKeywordMap(supabase: any) {
  const rows = await fetchAllRows<TrendKeywordRow>((from, to) =>
    supabase.from("trend_keywords").select("id, keyword").order("id", { ascending: true }).range(from, to),
  );
  return new Map(rows.map((row) => [Number(row.id), String(row.keyword)]));
}

export async function loadHistoricalTrendPoints(supabase: any) {
  const keywordMap = await loadKeywordMap(supabase);
  const periodStatuses = await loadRegionPeriodStatuses(supabase);
  const configuredRegions = configuredTrendRegions();
  const latestComparable = latestComparableCompletePeriod({
    configuredRegions,
    statuses: periodStatuses,
    now: new Date(),
  });
  const statusByRegionMonth = new Map(
    periodStatuses.map((status) => [`${status.region}:${status.periodMonth}`, status.periodStatus]),
  );
  const rawRows = await fetchAllRows<HistoricalRow>((from, to) =>
    supabase
      .from("historical_trend_data")
      .select("keyword_id, month, google_score, market")
      .order("month", { ascending: true })
      .range(from, to),
  );

  const points: HistoricalTrendPoint[] = [];
  const primaryKeywordIds = new Map<string, number>();

  for (const row of rawRows) {
    const keywordId = Number(row.keyword_id);
    const rawKeyword = keywordMap.get(keywordId);
    const region = String(row.market || "").toUpperCase();
    const period = row.month || "";
    if (!keywordId || !rawKeyword || !region || !period) continue;
    if (!shouldUseHistoricalPoint({
      month: period,
      periodStatus: statusByRegionMonth.get(`${region}:${period}`),
      latestComparablePeriod: latestComparable?.periodMonth,
    })) continue;
    const canonicalKeyword = canonicalizeTrendKeyword(rawKeyword);
    if (!isFashionKeyword(canonicalKeyword)) continue;
    if (!primaryKeywordIds.has(canonicalKeyword)) primaryKeywordIds.set(canonicalKeyword, keywordId);
    points.push({
      keywordId,
      rawKeyword,
      canonicalKeyword,
      region,
      period,
      score: toNumber(row.google_score),
    });
  }

  return {
    points,
    primaryKeywordIds,
    rawRowCount: rawRows.length,
    keywordCount: keywordMap.size,
    periodStatuses,
    latestComparablePeriod: latestComparable?.periodMonth || null,
    latestComparableCoverage: latestComparable,
  };
}

export async function loadRegionPeriodStatuses(supabase: any): Promise<RegionPeriodStatus[]> {
  try {
    const rows = await fetchAllRows<any>((from, to) =>
      supabase
        .from("trend_period_region_status")
        .select("region, period_month, period_status, provider_ready, row_count, keyword_count, finalized_at")
        .order("period_month", { ascending: true })
        .range(from, to),
    );

    return rows.map((row) => ({
      region: String(row.region || "").toUpperCase(),
      periodMonth: String(row.period_month || ""),
      periodStatus: row.period_status,
      providerReady: Boolean(row.provider_ready),
      rowCount: Number(row.row_count || 0),
      keywordCount: Number(row.keyword_count || 0),
      finalizedAt: row.finalized_at || null,
    })).filter((row) => row.region && row.periodMonth);
  } catch (error) {
    console.warn("Trend period status unavailable; historical rows will be treated as complete:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

function keywordMatches(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function extractEvidenceFacets(keyword: string, phrases: string[]) {
  const pool = `${keyword} ${phrases.join(" ")}`.toLowerCase();
  const matchTerms = (terms: string[]) => terms.filter((term) => pool.includes(term));
  return {
    garmentCategories: matchTerms(["shirt", "t-shirt", "tee", "jeans", "denim", "trouser", "pant", "kurta", "dress", "skirt", "blazer", "jacket", "trench", "coat", "top", "saree", "shoe", "sneaker", "boot", "bag"]),
    fitSilhouetteModifiers: matchTerms(["loose", "oversized", "relaxed", "wide leg", "cropped", "flared", "barrel", "mini", "maxi", "tailored", "layering"]),
    materials: matchTerms(["linen", "cotton", "denim", "leather", "silk", "satin", "mesh", "knit", "handloom"]),
    patternsCraftTerms: matchTerms(["embroidered", "embroidery", "printed", "print", "graphic", "floral", "washed", "pleated", "crochet"]),
    colors: matchTerms(["white", "black", "blue", "indigo", "maroon", "green", "saffron", "camel", "olive", "brown", "cream", "navy", "charcoal"]),
  };
}

export async function loadSourceConfirmations(supabase: any, canonicalKeywords: string[]) {
  const confirmations = new Map<string, SourceConfirmation>();
  const keywords = new Set(canonicalKeywords);

  let evidenceRows: any[] = [];
  try {
    evidenceRows = await fetchAllRows<any>((from, to) =>
      supabase
        .from("trend_candidate_evidence")
        .select("normalized_phrase, source_type, source_name, context, evidence_kind, observed_at")
        .order("observed_at", { ascending: false })
        .range(from, to),
    );
  } catch (error) {
    console.warn("Trend candidate evidence unavailable for source confirmation:", error instanceof Error ? error.message : String(error));
  }

  let productRows: any[] = [];
  try {
    productRows = await fetchAllRows<any>((from, to) =>
      supabase
        .from("products")
        .select("title, source_id, category_id, scraped_at")
        .order("scraped_at", { ascending: false })
        .range(from, to),
    );
  } catch (error) {
    console.warn("Products unavailable for source confirmation:", error instanceof Error ? error.message : String(error));
  }

  for (const canonicalKeyword of keywords) {
    const evidence = evidenceRows.filter((row) => canonicalizeTrendKeyword(String(row.normalized_phrase || "")) === canonicalKeyword);
    const productMatches = productRows.filter((row) => keywordMatches(String(row.title || ""), canonicalKeyword)).slice(0, 20);
    const sourceKeys = new Set([
      ...evidence.map((row) => `${row.source_type}:${row.source_name || ""}`),
      ...productMatches.map((row) => `product:${row.source_id || row.category_id || "unknown"}`),
    ].filter(Boolean));
    const articleSupportCount = evidence.filter((row) => String(row.source_type || "").includes("article")).length;
    const productSupportCount = productMatches.length;
    const phrases = [
      ...evidence.map((row) => String(row.context || "")).filter(Boolean),
      ...productMatches.map((row) => String(row.title || "")).filter(Boolean),
    ].slice(0, 20);
    const facets = extractEvidenceFacets(canonicalKeyword, phrases);
    const diversityScore = Math.min(100, sourceKeys.size * 22);
    const supportScore = Math.min(100, (productSupportCount + articleSupportCount + evidence.length) * 8);
    const sourceConfirmation = sourceKeys.size ? Math.round(diversityScore * 0.55 + supportScore * 0.45) : neutralSourceConfirmation(canonicalKeyword).sourceConfirmation;

    confirmations.set(canonicalKeyword, {
      sourceConfirmation,
      sourceDiversity: sourceKeys.size,
      productSupportCount,
      articleSupportCount,
      evidenceFacets: Array.from(new Set([canonicalKeyword, ...Object.values(facets).flat()])),
      evidenceSummary: {
        productTitlePhrases: productMatches.map((row) => String(row.title || "")).slice(0, 8),
        evidencePhrases: evidence.map((row) => String(row.context || "")).filter(Boolean).slice(0, 8),
        ...facets,
      },
    });
  }

  return confirmations;
}

export function evidenceBundleForScore(score: GlobalTrendScore): TrendEvidenceBundle {
  const summary = score.evidence.evidenceSummary as any;
  return {
    canonicalKeyword: score.canonicalKeyword,
    rawKeywords: score.rawKeywords,
    garmentCategories: Array.isArray(summary.garmentCategories) ? summary.garmentCategories : [],
    fitSilhouetteModifiers: Array.isArray(summary.fitSilhouetteModifiers) ? summary.fitSilhouetteModifiers : [],
    materials: Array.isArray(summary.materials) ? summary.materials : [],
    patternsCraftTerms: Array.isArray(summary.patternsCraftTerms) ? summary.patternsCraftTerms : [],
    colors: Array.isArray(summary.colors) ? summary.colors : [],
    productTitlePhrases: Array.isArray(summary.productTitlePhrases) ? summary.productTitlePhrases : [],
    articlePhrases: Array.isArray(summary.evidencePhrases) ? summary.evidencePhrases : [],
    supportingRegions: score.regionsObserved,
    regionBreadth: score.regionBreadth,
    sourceDiversity: score.sourceDiversity,
    supportCounts: {
      product: score.evidence.productSupportCount,
      article: score.evidence.articleSupportCount,
      regionalQuery: score.regionsObserved.length,
    },
    evidencePeriod: score.latestPeriod,
  };
}

export async function computeMultiRegionTrendScores(supabase: any) {
  const {
    points,
    primaryKeywordIds,
    rawRowCount,
    keywordCount,
    periodStatuses,
    latestComparablePeriod,
    latestComparableCoverage,
  } = await loadHistoricalTrendPoints(supabase);
  const supportedRegions = Array.from(new Set(points.map((point) => point.region)));
  const regionalScores = computeRegionalTrendScores(points);
  const canonicalKeywords = Array.from(new Set(regionalScores.map((score) => score.canonicalKeyword)));
  const sourceConfirmations = await loadSourceConfirmations(supabase, canonicalKeywords);
  const globalScores = computeGlobalTrendScores({
    regionalScores,
    sourceConfirmations,
    supportedRegionCount: Math.max(1, supportedRegions.length || SUPPORTED_TREND_REGIONS.length),
    primaryKeywordIds,
  }).sort((a, b) => b.finalTrendScore - a.finalTrendScore);

  return {
    rawRowCount,
    keywordCount,
    supportedRegions,
    regionalScores,
    globalScores,
    periodStatuses,
    latestComparablePeriod,
    latestComparableCoverage,
  };
}

function chunk<T>(items: T[], size = 200) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function upsertRows(supabase: any, table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (const batch of chunk(rows)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw error;
  }
}

async function startPipelineRun(supabase: any, dryRun: boolean) {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: running, error: runningError } = await supabase
      .from("trend_pipeline_runs")
      .select("id, started_at")
      .eq("status", "running")
      .gte("started_at", cutoff)
      .limit(1)
      .maybeSingle();

    if (runningError) throw runningError;
    if (running) {
      const error = new Error(`Trend pipeline already running since ${running.started_at}`);
      error.name = "TrendPipelineOverlapError";
      throw error;
    }

    const { data, error } = await supabase
      .from("trend_pipeline_runs")
      .insert({
        computation_version: TREND_COMPUTATION_VERSION,
        status: "running",
        dry_run: dryRun,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data?.id ? String(data.id) : null;
  } catch (error) {
    if (error instanceof Error && error.name === "TrendPipelineOverlapError") throw error;
    console.warn("Trend pipeline run ledger unavailable:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function finishPipelineRun(
  supabase: any,
  runId: string | null,
  status: "completed" | "failed",
  metadata: Record<string, unknown>,
  errorMessage?: string,
) {
  if (!runId) return;
  try {
    await supabase
      .from("trend_pipeline_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        rows_read: Number(metadata.rawRowCount || 0),
        regional_scores: Number(metadata.regionalScoreCount || 0),
        global_scores: Number(metadata.globalScoreCount || 0),
        ai_attempts: Number(metadata.aiAttempts || 0),
        error_message: errorMessage || null,
        metadata,
      })
      .eq("id", runId);
  } catch (error) {
    console.warn("Trend pipeline run ledger update failed:", error instanceof Error ? error.message : String(error));
  }
}

export async function recomputeMultiRegionTrends({
  dryRun = true,
  limit = 75,
  refineNames = false,
  enqueueImages = false,
}: {
  dryRun?: boolean;
  limit?: number;
  refineNames?: boolean;
  enqueueImages?: boolean;
} = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase service credentials are required");

  const runId = dryRun ? null : await startPipelineRun(supabase, dryRun);
  const startedAt = new Date().toISOString();
  try {
    const computed = await computeMultiRegionTrendScores(supabase);
    const globalScores = computed.globalScores.slice(0, limit);
    const currentHashes = new Map<string, string>();
    const editorialByKeyword = new Map<string, Awaited<ReturnType<typeof refineEditorialName>>>();
    const maxAi = TREND_CONFIDENCE.maxAiTrendsPerRun;

    if (!dryRun) {
      await upsertRows(
        supabase,
        "trend_keyword_aliases",
        globalScores.flatMap((score) =>
          score.rawKeywords.map((rawKeyword) => ({
            raw_keyword: rawKeyword,
            canonical_keyword: score.canonicalKeyword,
            mapping_type: rawKeyword === score.canonicalKeyword ? "self" : "format_alias",
            mapping_confidence: 1,
            evidence: { regions: score.regionsObserved },
            updated_at: startedAt,
          })),
        ),
        "raw_keyword",
      );
    }

    let aiAttempts = 0;
    for (const score of globalScores) {
      const bundle = evidenceBundleForScore(score);
      const hash = evidenceHash(bundle);
      currentHashes.set(score.canonicalKeyword, hash);

      let refinement = {
        displayName: deterministicEditorialFallback(bundle),
        confidence: 0,
        evidenceHash: hash,
        model: "deterministic-fallback",
        reason: "Deterministic fallback.",
        usedFacets: [score.canonicalKeyword],
        prompt: "",
      };

      if (refineNames && aiAttempts < maxAi) {
        const { data: cachedName } = await supabase
          .from("trend_editorial_names")
          .select("editorial_display_name, ai_confidence, model_config_version, rationale, used_facets")
          .eq("canonical_keyword", score.canonicalKeyword)
          .eq("evidence_hash", hash)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cachedName?.editorial_display_name) {
          refinement = {
            displayName: String(cachedName.editorial_display_name),
            confidence: toNumber(cachedName.ai_confidence),
            evidenceHash: hash,
            model: String(cachedName.model_config_version || "cached"),
            reason: String(cachedName.rationale || "Cached refinement."),
            usedFacets: Array.isArray(cachedName.used_facets) ? cachedName.used_facets : [score.canonicalKeyword],
            prompt: "",
          };
        } else {
          aiAttempts += 1;
          refinement = await refineEditorialName(bundle);
        }
      }

      editorialByKeyword.set(score.canonicalKeyword, refinement);
    }

    if (!dryRun) {
      const selectedKeywords = new Set(globalScores.map((score) => score.canonicalKeyword));
      if (computed.latestComparablePeriod && computed.periodStatuses.length) {
        const coverage = globalPeriodCoverage({
          periodMonth: computed.latestComparablePeriod,
          configuredRegions: configuredTrendRegions(),
          statuses: computed.periodStatuses,
        });
        await upsertRows(
          supabase,
          "trend_global_period_status",
          [{
            period_month: coverage.periodMonth,
            period_status: coverage.periodStatus,
            expected_regions: coverage.expectedRegions,
            complete_regions: coverage.completeRegions,
            missing_regions: coverage.missingRegions,
            material_coverage_ratio: coverage.materialCoverageRatio,
            is_materially_complete: coverage.isMateriallyComplete,
            computed_at: startedAt,
            metadata: { computationVersion: TREND_COMPUTATION_VERSION },
          }],
          "period_month",
        );
      }

      const regionalRows = computed.regionalScores
        .filter((score) => selectedKeywords.has(score.canonicalKeyword))
        .map((score) => ({
          canonical_keyword: score.canonicalKeyword,
          raw_keywords: score.rawKeywords,
          region: score.region,
          latest_period: score.latestPeriod,
          current_interest_percentile: score.currentInterestPercentile,
          velocity_percentile: score.velocityPercentile,
          acceleration_percentile: score.accelerationPercentile,
          positive_period_persistence: score.positivePeriodPersistence,
          negative_period_persistence: score.negativePeriodPersistence,
          regional_rank: score.regionalRank,
          observation_count: score.observationCount,
          data_freshness: score.dataFreshness,
          regional_momentum: score.regionalMomentum,
          confidence: score.confidence,
          computation_version: TREND_COMPUTATION_VERSION,
          computed_at: startedAt,
        }));

      const globalRows = globalScores.map((score) => {
        const refinement = editorialByKeyword.get(score.canonicalKeyword);
        return {
          canonical_keyword: score.canonicalKeyword,
          primary_keyword_id: score.primaryKeywordId,
          raw_keywords: score.rawKeywords,
          editorial_display_name: refinement?.displayName || titleCaseTrend(score.canonicalKeyword),
          lifecycle: score.lifecycle,
          market_classification: score.marketClassification,
          india_momentum: score.indiaMomentum,
          cross_region_momentum: score.crossRegionMomentum,
          region_breadth: score.regionBreadth,
          regions_observed: score.regionsObserved,
          regions_rising: score.regionsRising,
          regions_fading: score.regionsFading,
          lead_regions: score.leadRegions,
          fashion_lead_market_momentum: score.fashionLeadMarketMomentum,
          source_diversity: score.sourceDiversity,
          persistence: score.persistence,
          confidence: score.confidence,
          final_trend_score: score.finalTrendScore,
          latest_period: score.latestPeriod,
          evidence_hash: refinement?.evidenceHash || currentHashes.get(score.canonicalKeyword),
          evidence_summary: score.evidence.evidenceSummary,
          computation_version: TREND_COMPUTATION_VERSION,
          computed_at: startedAt,
        };
      });

      const editorialRows = globalScores.map((score) => {
        const refinement = editorialByKeyword.get(score.canonicalKeyword);
        return {
          canonical_keyword: score.canonicalKeyword,
          editorial_display_name: refinement?.displayName || titleCaseTrend(score.canonicalKeyword),
          evidence_hash: refinement?.evidenceHash || currentHashes.get(score.canonicalKeyword),
          evidence_summary: evidenceBundleForScore(score),
          ai_confidence: refinement?.confidence || 0,
          model_config_version: refinement?.model || "deterministic-fallback",
          used_facets: refinement?.usedFacets || [score.canonicalKeyword],
          rationale: refinement?.reason || "Deterministic fallback.",
          updated_at: startedAt,
        };
      });

      await upsertRows(supabase, "regional_trend_scores", regionalRows, "canonical_keyword,region,latest_period,computation_version");
      await upsertRows(supabase, "global_trend_scores", globalRows, "canonical_keyword,computation_version");
      await upsertRows(supabase, "trend_editorial_names", editorialRows, "canonical_keyword,evidence_hash");

      if (enqueueImages) {
        for (const score of globalScores) {
          if (!score.primaryKeywordId) continue;
          const existing = await getGeneratedFashionImage({ entityType: "trend", entityId: score.primaryKeywordId, variant: "trend_concept" });
          if (existing?.image_url) continue;
          const refinement = editorialByKeyword.get(score.canonicalKeyword);
          await enqueueTrendImageJob({
            trend: {
              id: score.primaryKeywordId,
              keyword: score.canonicalKeyword,
              editorialName: refinement?.displayName || titleCaseTrend(score.canonicalKeyword),
            },
            variant: "trend_concept",
            priority: 2,
          });
        }
      }
    }

    const result = {
      dryRun,
      computedAt: startedAt,
      rawRowCount: computed.rawRowCount,
      keywordCount: computed.keywordCount,
      supportedRegions: computed.supportedRegions,
      latestComparablePeriod: computed.latestComparablePeriod,
      latestComparableCoverage: computed.latestComparableCoverage ? {
        completeRegions: computed.latestComparableCoverage.completeRegions,
        missingRegions: computed.latestComparableCoverage.missingRegions,
        materialCoverageRatio: Number(computed.latestComparableCoverage.materialCoverageRatio.toFixed(2)),
      } : null,
      regionalScoreCount: computed.regionalScores.length,
      globalScoreCount: computed.globalScores.length,
      selectedCount: globalScores.length,
      aiAttempts,
      preview: globalScores.slice(0, 20).map((score) => ({
        canonicalKeyword: score.canonicalKeyword,
        displayName: editorialByKeyword.get(score.canonicalKeyword)?.displayName || titleCaseTrend(score.canonicalKeyword),
        lifecycle: score.lifecycle,
        marketClassification: score.marketClassification,
        regionsObserved: score.regionsObserved,
        finalTrendScore: Number(score.finalTrendScore.toFixed(2)),
        confidence: Number(score.confidence.toFixed(2)),
      })),
    };

    await finishPipelineRun(supabase, runId, "completed", result);
    return result;
  } catch (error) {
    await finishPipelineRun(supabase, runId, "failed", { dryRun, computedAt: startedAt }, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function getMultiRegionTrendOverview() {
  if (!isMultiRegionTrendsEnabled()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("global_trend_scores")
      .select("*")
      .eq("computation_version", TREND_COMPUTATION_VERSION)
      .order("computed_at", { ascending: false })
      .order("final_trend_score", { ascending: false })
      .limit(90);

    if (error) throw error;
    if (!data?.length) return null;

    const deduped = new Map<string, any>();
    for (const row of data) {
      if (!deduped.has(row.canonical_keyword)) deduped.set(row.canonical_keyword, row);
    }

    const rows = [...deduped.values()].filter((row) => row.lifecycle !== "INSUFFICIENT_DATA");
    if (!rows.length) return null;

    const keywordIds = rows.map((row) => Number(row.primary_keyword_id)).filter(Boolean);
    const historyById = new Map<number, Array<{ month: string; value: number }>>();
    if (keywordIds.length) {
      const { data: historyRows, error: historyError } = await supabase
        .from("historical_trend_data")
        .select("keyword_id, month, google_score, market")
        .in("keyword_id", keywordIds)
        .order("month", { ascending: true })
        .limit(2500);
      if (historyError) throw historyError;

      for (const point of historyRows || []) {
        const keywordId = Number(point.keyword_id);
        if (String(point.market || "") !== "IN" && historyRows?.some((item: any) => Number(item.keyword_id) === keywordId && item.market === "IN")) continue;
        const list = historyById.get(keywordId) || [];
        list.push({ month: String(point.month), value: toNumber(point.google_score) });
        historyById.set(keywordId, list.slice(-24));
      }
    }

    const toTrend = (row: any): OverviewTrend => {
      const id = Number(row.primary_keyword_id || 0);
      const canonical = String(row.canonical_keyword);
      const markets = (Array.isArray(row.regions_observed) ? row.regions_observed : []).slice(0, 3);
      return {
        id: id || Math.abs(canonical.split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)),
        keyword: canonical,
        editorialName: String(row.editorial_display_name || titleCaseTrend(canonical)),
        oneLiner: `${titleCaseTrend(canonical)} is being tracked from verified regional fashion signals.`,
        howToWear: ["Use the trend as the lead piece", "Balance it with quieter staples", "Keep the styling intentional"],
        shopSearchTerms: [canonical, `${canonical} outfit`, `${canonical} fashion`],
        pexelsImageUrl: null,
        velocity: row.lifecycle,
        topMarkets: markets.map((code: string) => ({ code, market: regionLabel(code) })),
        trendData: historyById.get(id) || [],
      };
    };

    return {
      trendingTrends: rows
        .filter((row) => row.lifecycle === "RISING" || row.lifecycle === "PEAKING")
        .slice(0, 6)
        .map(toTrend),
      cycleTrends: rows
        .filter((row) => row.lifecycle === "RISING" || row.lifecycle === "PEAKING" || row.lifecycle === "FADING")
        .slice(0, 50)
        .map(toTrend),
    };
  } catch (error) {
    console.warn("Multi-region trend overview unavailable, falling back:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function findMultiRegionTrendForSearch(keyword: string) {
  if (!isMultiRegionTrendsEnabled()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const canonical = canonicalizeTrendKeyword(keyword);
  try {
    const { data: alias } = await supabase
      .from("trend_keyword_aliases")
      .select("canonical_keyword")
      .ilike("raw_keyword", `%${canonical}%`)
      .limit(1)
      .maybeSingle();

    const searchCanonical = alias?.canonical_keyword || canonical;
    const { data, error } = await supabase
      .from("global_trend_scores")
      .select("*")
      .or(`canonical_keyword.ilike.%${searchCanonical}%,editorial_display_name.ilike.%${keyword}%`)
      .eq("computation_version", TREND_COMPUTATION_VERSION)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: Number(data.primary_keyword_id || 0),
      keyword: String(data.canonical_keyword),
      editorialName: String(data.editorial_display_name || titleCaseTrend(String(data.canonical_keyword))),
      oneLiner: `${titleCaseTrend(String(data.canonical_keyword))} is being tracked from verified regional fashion signals.`,
      story: `Fashlock is reading this from ${Array.isArray(data.regions_observed) ? data.regions_observed.join(", ") : "regional"} trend evidence.`,
      howToWear: ["Let the trend lead the outfit", "Anchor it with familiar basics", "Keep proportions clean"],
      styleDirections: [
        { occasion: "WORK", text: "Keep the styling minimal and intentional." },
        { occasion: "WEEKEND", text: "Relax it with clean everyday staples." },
        { occasion: "EVENING", text: "Sharpen it with refined accessories." },
      ],
      shopSearchTerms: [String(data.canonical_keyword)],
      pexelsImageUrl: null,
      generatedImageUrl: null,
      velocity: data.lifecycle,
      topMarkets: (Array.isArray(data.regions_observed) ? data.regions_observed : []).slice(0, 3).map((code: string) => ({ code, market: regionLabel(code) })),
      trendData: [],
    };
  } catch {
    return null;
  }
}
