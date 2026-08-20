#!/usr/bin/env node
import "./load-env";
import { stageAndAtomicallyApproveFormulaSet } from "../lib/trend-styling/atomic-formula-publication";
import { createStylingEvidenceSearchProvider } from "../lib/trend-styling/evidence-provider";
import { buildEvidenceGroundedFormulaPrompt } from "../lib/trend-styling/formula-generation";
import { runFormulaStateMachine, type FormulaStateStore } from "../lib/trend-styling/formula-state-machine";
import { buildSixFormulaImageJobs } from "../lib/trend-styling/isolated-image-jobs";
import {
  createSupabaseManualJobStore,
  parseManualStylingArguments,
  prepareManualStylingJob,
  requireManualServiceRole,
  resolveManualStylingTarget,
} from "../lib/trend-styling/manual-job";
import { MANUAL_STYLING_STAGES, MANUAL_STYLING_WORKFLOW_NAME } from "../lib/trend-styling/manual-workflow";
import type { StylingMarketPlan } from "../lib/trend-styling/market-selection";
import { createConfiguredFormulaTextProvider } from "../lib/trend-styling/providers";
import { formulaProviderDiagnostic, resolveFormulaProviderConfiguration } from "../lib/trend-styling/config";
import { createConfiguredMarketInterestProvider, createSupabaseResearchStore, runResearchWorker } from "../lib/trend-styling/research-worker";
import { safeResearchDiagnostic } from "../lib/trend-styling/research-diagnostics";
import type { TrendOutfitFormula, TrendStyleEvidence } from "../lib/trend-styling/schema";
import { isolatedConceptId } from "../lib/trend-styling/concept-identity";
import { getSupabaseClient } from "../lib/supabase";

async function main() {
  const options = parseManualStylingArguments(process.argv.slice(2));
  const enabled = process.env.TREND_STYLING_INTELLIGENCE_ENABLED === "true";
  const enqueueImages = process.env.AUTO_ENQUEUE_FORMULA_IMAGES_ENABLED === "true";
  const target = resolveManualStylingTarget(options);

  if (!options.execute) {
    const prepared = await prepareManualStylingJob(options);
    console.log(JSON.stringify({ workflow: MANUAL_STYLING_WORKFLOW_NAME, jobStatus: prepared.status, ...target, dryRun: true, enabled, enqueueImages, stages: MANUAL_STYLING_STAGES }));
    return;
  }
  if (!enabled) throw new Error("Manual styling execution is disabled by TREND_STYLING_INTELLIGENCE_ENABLED");
  const formulaProviderConfiguration = resolveFormulaProviderConfiguration();
  const formulaProvider = createConfiguredFormulaTextProvider(process.env, undefined, formulaProviderConfiguration);
  console.log(formulaProviderDiagnostic(formulaProviderConfiguration));
  requireManualServiceRole();
  await prepareManualStylingJob(options, options.createJob && options.confirmManualJobCreation ? createSupabaseManualJobStore() : undefined);
  const db = getSupabaseClient();
  if (!db) throw new Error("Supabase service-role client is unavailable");

  let { data: job, error: jobError } = await db.from("trend_style_research_jobs").select("*").eq("id", target.jobId).maybeSingle();
  if (jobError) throw jobError;
  if (!job) throw new Error("Exact styling job does not exist");

  let evidence: TrendStyleEvidence[];
  let marketPlan: StylingMarketPlan;
  if (job.status === "pending") {
    const research = await runResearchWorker({
      workerId: `manual-${process.pid}`,
      store: createSupabaseResearchStore({ exactJobId: target.jobId }),
      interestProvider: createConfiguredMarketInterestProvider(),
      searchProvider: createStylingEvidenceSearchProvider(),
    });
    if (research.status !== "evidence_ready") {
      console.log(JSON.stringify({ workflow: MANUAL_STYLING_WORKFLOW_NAME, ...safeResearchDiagnostic(research) }));
      throw new Error("Manual styling research deferred");
    }
    evidence = research.evidence.map((row) => ({ ...row, trend_id: null })) as TrendStyleEvidence[];
    marketPlan = research.marketPlan;
    const refreshed = await db.from("trend_style_research_jobs").select("*").eq("id", target.jobId).maybeSingle();
    if (refreshed.error) throw refreshed.error;
    job = refreshed.data;
  } else if (job.status === "evidence_ready") {
    const saved = await db.from("trend_style_evidence").select("*").eq("concept_id", target.conceptId);
    if (saved.error) throw saved.error;
    evidence = (saved.data || []).map((row) => ({ ...row, trend_id: null })) as TrendStyleEvidence[];
    const selected = job.selected_markets || [];
    marketPlan = {
      evaluatedMarkets: job.evaluated_markets,
      strongestMarkets: selected.slice(0, 3),
      researchMarkets: selected,
      insufficientMarkets: job.evaluated_markets.filter((market: string) => !selected.includes(market)),
      selectedReasons: job.selected_market_reasons || {},
    } as StylingMarketPlan;
  } else {
    throw new Error(`Styling job is not resumable from status ${job.status}`);
  }

  if (!job?.evidence_hash) throw new Error("Evidence-ready job is missing its evidence hash");
  const setId = isolatedConceptId(`formula checkpoint ${job.id} ${job.evidence_hash}`);
  const formulaJob = {
    id: job.id,
    concept_id: job.concept_id,
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    evidence_hash: job.evidence_hash,
    set_id: setId,
    canonical_keyword: job.canonical_keyword,
    requesting_market: job.requesting_market,
    selected_markets: marketPlan.researchMarkets,
  };
  const prompt = buildEvidenceGroundedFormulaPrompt({
    conceptId: job.concept_id,
    canonicalKeyword: job.canonical_keyword,
    season: job.season,
    requestingMarket: job.requesting_market,
    marketPlan,
    evidence,
    evidenceHash: job.evidence_hash,
  });
  const store: FormulaStateStore = {
    async begin(current) {
      const { data, error } = await db.rpc("begin_trend_style_formula_generation", { target_job_id: current.id });
      if (error) throw error;
      return Boolean(data?.length);
    },
    async deferQuota(current, retryAfter, message) {
      const { error } = await db.rpc("defer_trend_style_formula_quota", { target_job_id: current.id, retry_at: retryAfter, safe_error_message: message });
      if (error) throw error;
    },
    async retainEvidenceReady(current, message) {
      const { error } = await db.rpc("return_trend_style_formula_to_evidence_ready", { target_job_id: current.id, safe_error_message: message });
      if (error) throw error;
    },
    async approveAndComplete(current, formulas) {
      return (await stageAndAtomicallyApproveFormulaSet(formulas, { jobId: current.id, conceptId: current.concept_id, setId })).formulas;
    },
    async enqueue(formulas: TrendOutfitFormula[]) {
      const { error } = await db.from("image_generation_jobs").upsert(buildSixFormulaImageJobs(formulas), { onConflict: "formula_id", ignoreDuplicates: true });
      if (error) throw error;
    },
  };
  const result = await runFormulaStateMachine({ job: formulaJob, evidence, prompt, provider: formulaProvider, store, enqueueImages });
  console.log(JSON.stringify({ workflow: MANUAL_STYLING_WORKFLOW_NAME, status: result.status, canonicalKeyword: target.canonicalKeyword, conceptId: target.conceptId, formulaCount: "formulas" in result ? result.formulas?.length || 0 : 0, imageEnqueueRequested: enqueueImages }));
  if (result.status === "invalid_formulas") {
    throw new Error(`Formula batch rejected: ${result.errors.join("; ").slice(0, 1_000)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Manual styling research failed");
  process.exitCode = 1;
});
