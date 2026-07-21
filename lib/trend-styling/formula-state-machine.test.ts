import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { stageAndAtomicallyApproveFormulaSet, type FormulaPublicationStore } from "./atomic-formula-publication";
import { runFormulaStateMachine, type FormulaReadyJob, type FormulaStateStore } from "./formula-state-machine";
import { LINEN_FORMULA_RESUME_TARGET, runLinenFormulaResume } from "./linen-formula-resume";
import { createConfiguredFormulaTextProvider, createFormulaTextProvider, FormulaProviderQuotaError, ProviderFormulaValidationError } from "./providers";
import { computeFormulaHash, type ProviderFormulaOutput, type TrendOutfitFormula, type TrendStyleEvidence } from "./schema";
import { isolatedConceptId } from "./concept-identity";

const now = new Date("2026-07-20T00:00:00.000Z");
const conceptId = LINEN_FORMULA_RESUME_TARGET.conceptId;
const evidenceHash = "a".repeat(64);
const evidence: TrendStyleEvidence[] = ["vogue.example", "elle.example"].flatMap((domain, domainIndex) => ["women", "men"].map((audience, audienceIndex) => ({
  id: isolatedConceptId(`evidence ${domain} ${audience}`), trend_id: null, concept_id: conceptId,
  canonical_keyword: "linen", audience: audience as "women" | "men", region: "IN", season: "current",
  garment_pairings: ["linen shirt", "trousers"], silhouettes: ["relaxed"], materials: ["linen"], colours: ["white"],
  footwear: ["loafers"], accessories: ["belt"], styling_techniques: ["tucked"], source_url: `https://${domain}/${audience}`,
  source_domain: domain, short_extract: "linen shirt with trousers", published_at: `2026-07-0${domainIndex + 1}T00:00:00.000Z`,
  observed_at: `2026-07-0${domainIndex + 1}T00:00:00.000Z`, quality_score: .9, recency_score: .9 + audienceIndex * 0,
})));
const job: FormulaReadyJob = {
  id: LINEN_FORMULA_RESUME_TARGET.jobId, concept_id: conceptId, attempts: 2, max_attempts: 3, evidence_hash: evidenceHash,
  set_id: isolatedConceptId(`formula checkpoint ${LINEN_FORMULA_RESUME_TARGET.jobId} ${evidenceHash}`),
  canonical_keyword: "linen", requesting_market: "IN", selected_markets: ["IN"],
};

function formulas(): TrendOutfitFormula[] {
  const slots = ["easy_entry", "current_uniform", "editorial_push"] as const;
  return (["women", "men"] as const).flatMap((audience) => slots.map((formula_slot, index) => {
    const base = {
      trend_id: null, concept_id: conceptId, canonical_keyword: "linen", audience, formula_slot,
      title: `${formula_slot} linen outfit`,
      items: [{ role: "top", garment: index === 0 ? "linen shirt" : index === 1 ? "linen blouse" : "linen waistcoat", silhouette: "relaxed", colour: "white", material: "linen", styling_instruction: "tuck neatly at the waist" },
        { role: "bottom", garment: index === 0 ? "tailored trousers" : index === 1 ? "pleated skirt" : "bermuda shorts", silhouette: "structured", colour: "navy", material: "linen", styling_instruction: "wear at the natural waist" }],
      footwear: "leather loafers", accessories: ["woven belt"], occasion: "daytime", climate: "warm humid", season: "current", region: "IN",
      why_it_works: "The breathable linen construction connects both garments while the precise waist and footwear balance the relaxed proportions.",
      evidence_ids: evidence.map(({ id }) => id), confidence: .9, evidence_hash: evidenceHash,
      generated_at: now.toISOString(), valid_until: "2026-10-20T00:00:00.000Z", review_status: "pending_review" as const,
    };
    return { ...base, formula_hash: computeFormulaHash(base) };
  }));
}

function providerOutput(): ProviderFormulaOutput {
  return { formulas: formulas().map(({ audience, formula_slot, title, items, footwear, accessories, occasion, season, climate, evidence_ids, confidence, why_it_works }) => ({
    audience, formula_slot, title, items, footwear, accessories, styling_instructions: ["Keep the proportions deliberate"],
    occasion, season, climate, market_rationale: why_it_works, evidence_based_rationale: why_it_works, evidence_ids, confidence,
  })) };
}

function providerWireOutput() {
  const byKey = new Map(providerOutput().formulas.map(({ audience, formula_slot, ...creative }) => [`${audience}:${formula_slot}`, creative]));
  return { formulas: Object.fromEntries((["women", "men"] as const).map((audience) => [audience, Object.fromEntries((["easy_entry", "current_uniform", "editorial_push"] as const).map((slot) => [slot, byKey.get(`${audience}:${slot}`)]))])) };
}

function memoryStore(events: string[], approved = formulas()): FormulaStateStore {
  return {
    async begin() { events.push("begin"); return true; },
    async deferQuota() { events.push("defer"); },
    async retainEvidenceReady() { events.push("retain"); },
    async approveAndComplete() { events.push("approve_complete"); return approved.map((item) => ({ ...item, review_status: "approved" as const })); },
    async enqueue() { events.push("enqueue"); },
  };
}

test("research checkpoint is evidence_ready and migration gates completed behind six approved formulas", async () => {
  const [worker, migration] = await Promise.all([readFile(new URL("./research-worker.ts", import.meta.url), "utf8"), readFile(new URL("../../database/032_trend_styling_formula_completion_state.sql", import.meta.url), "utf8")]);
  assert.match(worker, /status:"evidence_ready"/);
  assert.doesNotMatch(worker, /status:"completed"/);
  assert.match(migration, /status='formula_generating'/);
  assert.match(migration, /formula_count<>6/);
  assert.match(migration, /approved_count<>6/);
  assert.match(migration, /status='completed'/);
});

test("evidence_ready retry loads saved evidence and makes zero Serper or pytrends calls", async () => {
  const script = await readFile(new URL("../../scripts/run-manual-trend-styling-research.ts", import.meta.url), "utf8");
  const savedBranch = script.slice(script.indexOf('job.status === "evidence_ready"'), script.indexOf("} else {", script.indexOf('job.status === "evidence_ready"')));
  assert.match(savedBranch, /trend_style_evidence/);
  assert.doesNotMatch(savedBranch, /runResearchWorker|createStylingEvidenceSearchProvider|createConfiguredMarketInterestProvider/);
  assert.match(script, /buildEvidenceGroundedFormulaPrompt/);
});

test("Gemini 429 defers formula work without consuming the research attempt or enqueueing", async () => {
  const events: string[] = [];
  const result = await runFormulaStateMachine({ job, evidence, prompt: "exact evidence prompt", enqueueImages: true, now,
    provider: { name: "gemini", async generate() { throw new FormulaProviderQuotaError("gemini", 120); } }, store: memoryStore(events) });
  assert.equal(result.status, "deferred");
  assert.equal(result.retryAfter, "2026-07-20T00:05:00.000Z");
  assert.equal(job.attempts, 2);
  assert.deepEqual(events, ["begin", "defer"]);
});

test("valid six-formula completion is approval-gated and enqueue_images=false enqueues nothing", async () => {
  const events: string[] = [];
  const result = await runFormulaStateMachine({ job, evidence, prompt: "saved evidence", enqueueImages: false, now,
    provider: { name: "gemini", async generate() { return providerOutput(); } }, store: memoryStore(events) });
  assert.equal(result.status, "completed");
  assert.deepEqual(events, ["begin", "approve_complete"]);
});

test("partial formula sets retain evidence_ready and cannot invoke atomic completion", async () => {
  const events: string[] = [];
  const result = await runFormulaStateMachine({ job, evidence, prompt: "saved evidence", enqueueImages: false, now,
    provider: { name: "gemini", async generate() { return { formulas: providerOutput().formulas.slice(0, 5) } as ProviderFormulaOutput; } }, store: memoryStore(events) });
  assert.equal(result.status, "invalid_formulas");
  assert.deepEqual(events, ["begin", "retain"]);
  const publication: FormulaPublicationStore = { async stage() { events.push("stage"); }, async approveAndComplete() { events.push("rpc"); }, async readApproved() { return []; } };
  await assert.rejects(stageAndAtomicallyApproveFormulaSet(formulas().slice(0, 5), { jobId: job.id, conceptId, store: publication }), /Exactly six/);
  assert.equal(events.includes("stage"), false);
});

test("unknown or duplicated provider evidence IDs fail before atomic completion", async () => {
  for (const invalidEvidenceIds of [[...evidence.map(({ id }) => id), evidence[0].id], [...evidence.map(({ id }) => id), isolatedConceptId("unknown provider evidence")]]) {
    const events: string[] = [];
    const invalid = providerOutput();
    invalid.formulas[0].evidence_ids = invalidEvidenceIds;
    const result = await runFormulaStateMachine({ job, evidence, prompt: "saved evidence", enqueueImages: true, now,
      provider: { name: "gemini", async generate() { return invalid; } }, store: memoryStore(events) });
    assert.equal(result.status, "invalid_formulas");
    assert.deepEqual(events, ["begin", "retain"]);
  }
});

test("two schema-invalid provider responses return to evidence_ready without formulas, images, or research attempt changes", async () => {
  const events: string[] = []; let providerCalls = 0;
  const provider = createFormulaTextProvider("gemini", {
    env: { GEMINI_API_KEY: "test" } as unknown as NodeJS.ProcessEnv,
    fetchImpl: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ formulas: providerOutput().formulas, review_status: "approved" }) }] } }] }), { status: 200 });
    },
  });
  await assert.rejects(runFormulaStateMachine({ job, evidence, prompt: "saved evidence", enqueueImages: true, now, provider, store: memoryStore(events) }), ProviderFormulaValidationError);
  assert.equal(providerCalls, 2);
  assert.equal(job.attempts, 2);
  assert.deepEqual(events, ["begin", "retain"]);
});

test("formula fallback is disabled by default and configured Cloudflare receives the exact Gemini prompt", async () => {
  const disabledCalls: string[] = [];
  const disabled = createConfiguredFormulaTextProvider({ GEMINI_API_KEY: "key" } as unknown as NodeJS.ProcessEnv, async (url) => { disabledCalls.push(String(url)); return new Response("quota", { status: 429 }); });
  await assert.rejects(disabled.generate({ prompt: "exact saved evidence" }), FormulaProviderQuotaError);
  assert.equal(disabledCalls.length, 1);

  const bodies: string[] = [];
  let calls = 0;
  const configured = createConfiguredFormulaTextProvider({ GEMINI_API_KEY: "key", TREND_FORMULA_TEXT_FALLBACK_PROVIDER: "cloudflare", CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_API_TOKEN: "token" } as unknown as NodeJS.ProcessEnv, async (_url, init) => {
    bodies.push(String(init?.body)); calls += 1;
    return calls === 1 ? new Response("quota", { status: 429 }) : new Response(JSON.stringify({ result: { response: JSON.stringify(providerWireOutput()) } }), { status: 200 });
  });
  assert.deepEqual(await configured.generate({ prompt: "exact saved evidence" }), providerOutput());
  assert.equal(calls, 2);
  assert.ok(bodies.every((body) => body.includes("exact saved evidence")));
});

test("exact linen false-completed state has dry-run-first hard-bound formula-only resume", async () => {
  const dryRun = await runLinenFormulaResume(["--dry-run"]);
  assert.equal(dryRun.status, "dry_run");
  assert.equal(dryRun.jobId, LINEN_FORMULA_RESUME_TARGET.jobId);
  assert.equal(dryRun.conceptId, LINEN_FORMULA_RESUME_TARGET.conceptId);
  assert.equal(dryRun.providersCalled, false);
  await assert.rejects(runLinenFormulaResume(["--execute"]), /confirm-production-formula-resume/);
  let calls = 0;
  const resumed = await runLinenFormulaResume(["--execute", "--confirm-production-formula-resume", "--confirm-migration-032-deployed"], async (confirmation) => {
    calls += 1; assert.equal(confirmation, "CONFIRM_PRODUCTION_LINEN_FORMULA_ONLY_RESUME"); return LINEN_FORMULA_RESUME_TARGET.jobId;
  });
  assert.equal(resumed.status, "evidence_ready");
  assert.equal(calls, 1);
});

test("deterministic staging makes duplicate retries update the same formula identities", async () => {
  const staged: string[][] = [];
  const store: FormulaPublicationStore = {
    async stage(rows) { staged.push(rows.map(({ id }) => String(id))); },
    async approveAndComplete() {},
    async readApproved() { return formulas().map((item) => ({ ...item, review_status: "approved" as const })); },
  };
  const options = { jobId: job.id, conceptId, setId: isolatedConceptId(`formula checkpoint ${job.id} ${evidenceHash}`), store };
  await stageAndAtomicallyApproveFormulaSet(formulas(), options);
  await stageAndAtomicallyApproveFormulaSet(formulas(), options);
  assert.deepEqual(staged[0], staged[1]);
});
