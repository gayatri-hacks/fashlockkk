#!/usr/bin/env node
import "./load-env";
import { stageAndAtomicallyApproveFormulaSet } from "../lib/trend-styling/atomic-formula-publication";
import { createStylingEvidenceSearchProvider } from "../lib/trend-styling/evidence-provider";
import { buildEvidenceGroundedFormulaPrompt } from "../lib/trend-styling/formula-generation";
import {
  createSupabaseManualJobStore,
  parseManualStylingArguments,
  prepareManualStylingJob,
  requireManualServiceRole,
  resolveManualStylingTarget,
} from "../lib/trend-styling/manual-job";
import {
  MANUAL_STYLING_STAGES,
  MANUAL_STYLING_WORKFLOW_NAME,
  runManualFirstStylingWorkflow,
} from "../lib/trend-styling/manual-workflow";
import { createFormulaTextProvider } from "../lib/trend-styling/providers";
import {
  createConfiguredMarketInterestProvider,
  createSupabaseResearchStore,
  runResearchWorker,
} from "../lib/trend-styling/research-worker";
import type { TrendStyleEvidence } from "../lib/trend-styling/schema";
import { getSupabaseClient } from "../lib/supabase";

async function main() {
  const options = parseManualStylingArguments(process.argv.slice(2));
  const enabled = process.env.TREND_STYLING_INTELLIGENCE_ENABLED === "true";
  const autoImages = process.env.AUTO_ENQUEUE_FORMULA_IMAGES_ENABLED === "true";
  const target = resolveManualStylingTarget(options);

  if (!options.execute) {
    const prepared = await prepareManualStylingJob(options);
    console.log(JSON.stringify({
      workflow: MANUAL_STYLING_WORKFLOW_NAME,
      jobStatus: prepared.status,
      canonicalKeyword: target.canonicalKeyword,
      market: target.market,
      season: target.season,
      conceptId: target.conceptId,
      dryRun: true,
      enabled,
      autoEnqueueFormulaImages: autoImages,
      stages: MANUAL_STYLING_STAGES,
    }));
    return;
  }
  if (!enabled) throw new Error("Manual styling execution is disabled by TREND_STYLING_INTELLIGENCE_ENABLED");
  requireManualServiceRole();
  const prepared = await prepareManualStylingJob(
    options,
    options.createJob && options.confirmManualJobCreation ? createSupabaseManualJobStore() : undefined,
  );
  console.log(JSON.stringify({
    workflow: MANUAL_STYLING_WORKFLOW_NAME,
    jobStatus: prepared.status,
    canonicalKeyword: target.canonicalKeyword,
    market: target.market,
    season: target.season,
    conceptId: target.conceptId,
  }));

  let researchResult: Awaited<ReturnType<typeof runResearchWorker>>;
  const result = await runManualFirstStylingWorkflow({
    enabled,
    autoEnqueueImages: autoImages,
    research: async () => {
      researchResult = await runResearchWorker({
        workerId: `manual-${process.pid}`,
        store: createSupabaseResearchStore({ exactJobId: target.jobId }),
        interestProvider: createConfiguredMarketInterestProvider(),
        searchProvider: createStylingEvidenceSearchProvider(),
      });
      if (researchResult.status !== "completed") throw new Error(`Research worker ${researchResult.status}`);
      return { evidence: researchResult.evidence };
    },
    generate: async (evidence) => {
      if (!researchResult || researchResult.status !== "completed") throw new Error("Research result unavailable");
      const job = researchResult.job;
      const typed = evidence.map((item) => ({ ...item, trend_id: null })) as TrendStyleEvidence[];
      const prompt = buildEvidenceGroundedFormulaPrompt({
        conceptId: job.concept_id,
        canonicalKeyword: job.canonical_keyword,
        season: job.season,
        requestingMarket: job.requesting_market,
        marketPlan: researchResult.marketPlan,
        evidence: typed,
      });
      return createFormulaTextProvider().generate({ prompt });
    },
    approve: async (formulas) => (await stageAndAtomicallyApproveFormulaSet(formulas)).formulas,
    enqueue: async (jobs) => {
      const db = getSupabaseClient();
      if (!db) throw new Error("Supabase service-role client is unavailable");
      const { error } = await db.from("image_generation_jobs").insert(jobs);
      if (error) throw error;
    },
  });

  console.log(JSON.stringify({
    workflow: MANUAL_STYLING_WORKFLOW_NAME,
    status: result.status,
    canonicalKeyword: target.canonicalKeyword,
    market: target.market,
    season: target.season,
    conceptId: target.conceptId,
    formulaCount: "formulas" in result ? result.formulas?.length || 0 : 0,
    imageJobs: autoImages && "jobs" in result ? result.jobs?.length || 0 : 0,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Manual styling research failed");
  process.exitCode = 1;
});
