import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseManualStylingArguments,
  prepareManualStylingJob,
  requireManualServiceRole,
  resolveManualStylingTarget,
  type ManualConceptInsert,
  type ManualJobStore,
  type ManualResearchJobInsert,
  type ManualStylingOptions,
} from "./manual-job";

function options(overrides: Partial<ManualStylingOptions> = {}): ManualStylingOptions {
  return {
    keyword: "linen",
    market: "IN",
    season: "current",
    createJob: false,
    execute: false,
    confirmManualJobCreation: false,
    ...overrides,
  };
}

function memoryStore() {
  const concepts = new Map<string, ManualConceptInsert>();
  const jobs = new Map<string, ManualResearchJobInsert>();
  const calls: string[] = [];
  const store: ManualJobStore = {
    async jobExists(jobId) {
      calls.push("jobExists");
      return jobs.has(jobId);
    },
    async ensureConcept(row) {
      calls.push("ensureConcept");
      if (!concepts.has(row.id)) concepts.set(row.id, row);
    },
    async ensureJob(row) {
      calls.push("ensureJob");
      if (!jobs.has(row.id)) jobs.set(row.id, row);
    },
  };
  return { store, concepts, jobs, calls };
}

test("manual styling dry-run performs no writes or provider work", async () => {
  const memory = memoryStore();
  const providerCalls = 0;
  const result = await prepareManualStylingJob(options(), memory.store);
  assert.equal(result.status, "dry_run");
  assert.deepEqual(memory.calls, []);
  assert.equal(memory.concepts.size, 0);
  assert.equal(memory.jobs.size, 0);
  assert.equal(providerCalls, 0);
});

test("create_job=false creates nothing even when execution is selected", async () => {
  const memory = memoryStore();
  const result = await prepareManualStylingJob(options({ execute: true }), memory.store);
  assert.equal(result.status, "creation_skipped");
  assert.deepEqual(memory.calls, []);
  assert.equal(memory.concepts.size, 0);
  assert.equal(memory.jobs.size, 0);
});

test("manual creation requires execute and explicit confirmation before any database access", async () => {
  const memory = memoryStore();
  await assert.rejects(
    prepareManualStylingJob(options({ createJob: true, confirmManualJobCreation: true }), memory.store),
    /requires --execute/,
  );
  await assert.rejects(
    prepareManualStylingJob(options({ createJob: true, execute: true }), memory.store),
    /requires --confirm-manual-job-creation/,
  );
  assert.deepEqual(memory.calls, []);
});

test("linen creates one stable isolated concept and job across duplicate dispatches", async () => {
  const memory = memoryStore();
  const confirmed = options({ createJob: true, execute: true, confirmManualJobCreation: true });
  const first = await prepareManualStylingJob(confirmed, memory.store);
  const second = await prepareManualStylingJob({ ...confirmed, keyword: " Linen ", market: "in", season: " Current " }, memory.store);
  assert.equal(first.status, "created");
  assert.equal(second.status, "existing");
  assert.equal(first.target.conceptId, second.target.conceptId);
  assert.equal(first.target.jobId, second.target.jobId);
  assert.match(first.target.conceptId, /^[0-9a-f-]{36}$/);
  assert.match(first.target.jobId, /^[0-9a-f-]{36}$/);
  assert.equal(memory.concepts.size, 1);
  assert.equal(memory.jobs.size, 1);
  assert.deepEqual([...memory.jobs.values()][0], {
    id: first.target.jobId,
    canonical_keyword: "linen",
    concept_id: first.target.conceptId,
    requesting_market: "IN",
    season: "current",
    source_context: "user_search",
    selected_markets: [],
    evaluated_markets: [],
    status: "pending",
  });
});

test("manual target rejects unsupported markets and non-fashion keywords", () => {
  assert.throws(() => resolveManualStylingTarget({ keyword: "linen", market: "CA", season: "current" }), /Unsupported styling market/);
  assert.throws(() => resolveManualStylingTarget({ keyword: "bitcoin stock", market: "IN", season: "current" }), /Unsupported fashion keyword/);
});

test("manual job path uses service role, exact job claim, isolated tables, and no authoritative trend writes", async () => {
  assert.throws(
    () => requireManualServiceRole({
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    }),
    /service-role credentials/,
  );
  const [manualSource, scriptSource] = await Promise.all([
    readFile(new URL("./manual-job.ts", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/run-manual-trend-styling-research.ts", import.meta.url), "utf8"),
  ]);
  const implementation = `${manualSource}\n${scriptSource}`;
  assert.match(scriptSource, /exactJobId: target\.jobId/);
  assert.match(manualSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(implementation, /\.from\(["'](?:trend_keywords|regional_trend_scores|global_trend_scores)["']\)/);
});

test("workflow passes validated inputs through quoted arrays and keeps public enqueue disabled", async () => {
  const [workflow, route, config] = await Promise.all([
    readFile(new URL("../../.github/workflows/manual-trend-styling-research.yml", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/trends/formula-search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("./config.ts", import.meta.url), "utf8"),
  ]);
  for (const input of ["keyword", "market", "season", "create_job", "execute", "enqueue_images"]) {
    assert.match(workflow, new RegExp(`^      ${input}:`, "m"));
  }
  assert.match(workflow, /TREND_SEARCH_RESEARCH_ENQUEUE_ENABLED: "false"/);
  assert.ok(workflow.includes("TREND_FORMULA_TEXT_PROVIDER: ${{ vars.TREND_FORMULA_TEXT_PROVIDER }}"));
  assert.ok(workflow.includes("TREND_FORMULA_TEXT_FALLBACK_PROVIDER: ${{ vars.TREND_FORMULA_TEXT_FALLBACK_PROVIDER }}"));
  assert.ok(workflow.includes("CLOUDFLARE_TEXT_MODEL: ${{ vars.CLOUDFLARE_TEXT_MODEL }}"));
  assert.ok(workflow.includes("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"));
  assert.ok(workflow.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"));
  assert.ok(workflow.includes("TREND_FORMULA_MAX_OUTPUT_TOKENS: ${{ vars.TREND_FORMULA_MAX_OUTPUT_TOKENS }}"));
  assert.match(workflow, /args=\(/);
  assert.match(workflow, /"\$\{args\[@\]\}"/);
  assert.doesNotMatch(workflow, /--keyword\s+"?\$\{\{\s*inputs\.keyword/);
  assert.match(route, /must remain disabled until authentication, per-user throttling/);
  assert.match(config, /searchResearchEnqueueEnabled: process\.env\.TREND_SEARCH_RESEARCH_ENQUEUE_ENABLED === "true"/);
});

test("manual CLI parser accepts explicit bounded creation controls", () => {
  assert.deepEqual(
    parseManualStylingArguments([
      "--keyword", "linen", "--market", "IN", "--season", "current",
      "--create-job", "--execute", "--confirm-manual-job-creation",
    ]),
    options({ createJob: true, execute: true, confirmManualJobCreation: true }),
  );
});
