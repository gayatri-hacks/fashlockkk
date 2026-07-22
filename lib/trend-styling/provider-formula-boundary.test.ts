import assert from "node:assert/strict";
import test from "node:test";
import { isolatedConceptId } from "./concept-identity";
import { buildInternalFormulaCandidates } from "./formula-schema-boundary";
import { createFormulaTextProvider, parseProviderFormulaOutput, ProviderFormulaValidationError, ProviderOutputTruncatedError } from "./providers";
import { resolveFormulaMaxOutputTokens } from "./config";

const evidenceIds = [isolatedConceptId("provider evidence one"), isolatedConceptId("provider evidence two")];
const slots = ["easy_entry", "current_uniform", "editorial_push"] as const;

function creativeFormula(audience: "women" | "men", formulaSlot: typeof slots[number], index: number) {
  return {
    title: `${audience} ${formulaSlot} linen formula`,
    items: [
      { role: "top", garment: index === 0 ? "linen shirt" : index === 1 ? "linen tunic" : "linen waistcoat", silhouette: "relaxed tailored", colour: "ivory", material: "linen", styling_instruction: "tuck cleanly at the waist" },
      { role: "bottom", garment: index === 0 ? "wide trousers" : index === 1 ? "pleated skirt" : "bermuda shorts", silhouette: "structured fluid", colour: "navy", material: "linen twill", styling_instruction: "wear at the natural waist" },
    ],
    footwear: "leather loafers", accessories: ["woven belt"], styling_instructions: ["Balance the relaxed top with a defined waist"],
    occasion: "daytime city dressing", season: "current", climate: "warm humid",
    market_rationale: "Breathable tailoring and practical loafers suit warm urban dressing in the selected markets.",
    evidence_based_rationale: "The cited independent sources support linen separates, defined waists and grounded leather footwear.",
    evidence_ids: evidenceIds, confidence: 0.9,
  };
}

function wireOutput() {
  return { formulas: {
    women: Object.fromEntries(slots.map((slot, index) => [slot, creativeFormula("women", slot, index)])),
    men: Object.fromEntries(slots.map((slot, index) => [slot, creativeFormula("men", slot, index)])),
  } };
}

const observedRejectedShape = {
  owner_identity: "isolated concept controlled by provider",
  requesting_market: "IN",
  authoritative_evidence_hash: "a".repeat(64),
  formula_type: "trend_outfit",
  formulas: wireOutput().formulas,
};

test("strict provider schema rejects the observed provider-controlled metadata shape", () => {
  assert.throws(() => parseProviderFormulaOutput(JSON.stringify(observedRejectedShape)), ProviderFormulaValidationError);
});

test("the keyed provider contract cannot omit or override any audience formula_slot", () => {
  const missingSlot = wireOutput();
  delete (missingSlot.formulas.women as Partial<typeof missingSlot.formulas.women>).easy_entry;
  assert.throws(() => parseProviderFormulaOutput(JSON.stringify(missingSlot)), ProviderFormulaValidationError);
  const uncontrolledSlot = wireOutput();
  Object.assign(uncontrolledSlot.formulas.men.editorial_push, { formula_slot: "easy_entry", formula_type: "trend_outfit" });
  assert.throws(() => parseProviderFormulaOutput(JSON.stringify(uncontrolledSlot)), ProviderFormulaValidationError);
});

test("provider output does not require review_status and trusted code adds all authoritative metadata", () => {
  const parsed = parseProviderFormulaOutput(JSON.stringify(wireOutput()));
  assert.equal("review_status" in parsed.formulas[0], false);
  assert.deepEqual(parsed.formulas.map(({ audience, formula_slot }) => `${audience}:${formula_slot}`), [
    "women:easy_entry", "women:current_uniform", "women:editorial_push", "men:easy_entry", "men:current_uniform", "men:editorial_push",
  ]);
  const context = {
    jobId: isolatedConceptId("provider boundary job"), setId: isolatedConceptId("provider boundary set"), conceptId: isolatedConceptId("provider boundary concept"),
    canonicalKeyword: "linen", requestingMarket: "IN", selectedMarkets: ["IN", "GB"], authoritativeEvidenceHash: "b".repeat(64),
    generatedAt: "2026-07-21T00:00:00.000Z", validUntil: "2026-10-19T00:00:00.000Z",
  };
  const candidates = buildInternalFormulaCandidates(parsed, context);
  assert.equal(candidates.length, 6);
  assert.ok(candidates.every((candidate) => candidate.review_status === "pending_review"));
  assert.ok(candidates.every((candidate) => candidate.owner_identity === `concept:${context.conceptId}`));
  assert.ok(candidates.every((candidate) => candidate.authoritative_evidence_hash === context.authoritativeEvidenceHash));
  assert.ok(candidates.every((candidate) => candidate.requesting_market === "IN" && candidate.formula_type === "trend_outfit"));
});

test("Gemini and Cloudflare response envelopes normalize to the same strict provider schema", async () => {
  const creativeJson = JSON.stringify(wireOutput()); const bodies: unknown[] = [];
  const gemini = createFormulaTextProvider("gemini", { env: { GEMINI_API_KEY: "test" } as unknown as NodeJS.ProcessEnv, fetchImpl: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: creativeJson }] } }] }), { status: 200 }); } });
  const cloudflare = createFormulaTextProvider("cloudflare", { env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_API_TOKEN: "test" } as unknown as NodeJS.ProcessEnv, diagnostic() {}, fetchImpl: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ result: { response: wireOutput(), usage: { completion_tokens: 1800 }, finish_reason: "stop" } }), { status: 200 }); } });
  assert.deepEqual(await gemini.generate({ prompt: "saved evidence" }), await cloudflare.generate({ prompt: "saved evidence" }));
  assert.match(JSON.stringify(bodies[0]), /styling_instructions/);
  assert.match(JSON.stringify(bodies[1]), /styling_instructions/);
  assert.match(JSON.stringify(bodies[0]), /responseSchema/);
  assert.match(JSON.stringify(bodies[1]), /json_schema/);
  assert.equal((bodies[1] as { max_tokens: number }).max_tokens, 4096);
});

test("Cloudflare bounds formula output-token configuration safely", () => {
  assert.equal(resolveFormulaMaxOutputTokens({} as NodeJS.ProcessEnv), 4096);
  assert.equal(resolveFormulaMaxOutputTokens({ TREND_FORMULA_MAX_OUTPUT_TOKENS: "128" } as unknown as NodeJS.ProcessEnv), 4096);
  assert.equal(resolveFormulaMaxOutputTokens({ TREND_FORMULA_MAX_OUTPUT_TOKENS: "6144" } as unknown as NodeJS.ProcessEnv), 6144);
  assert.equal(resolveFormulaMaxOutputTokens({ TREND_FORMULA_MAX_OUTPUT_TOKENS: "999999" } as unknown as NodeJS.ProcessEnv), 8192);
});

test("observed unterminated Cloudflare JSON triggers one full regeneration and valid second response succeeds", async () => {
  const observed = '{"formulas":{"women":{"easy_entry":{"title":"linen formula';
  const bodies: Array<{ prompt: string; max_tokens: number }> = []; const diagnostics: string[] = []; const urls: string[] = [];
  const provider = createFormulaTextProvider("cloudflare", {
    env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_API_TOKEN: "test", CLOUDFLARE_TEXT_MODEL: "@cf/meta/test" } as unknown as NodeJS.ProcessEnv,
    diagnostic(line) { diagnostics.push(line); },
    fetchImpl: async (url, init) => {
      urls.push(String(url)); bodies.push(JSON.parse(String(init?.body)));
      const response = bodies.length === 1 ? observed : JSON.stringify(wireOutput());
      return new Response(JSON.stringify({ result: { response, usage: { completion_tokens: bodies.length === 1 ? 256 : 1800 } } }), { status: 200 });
    },
  });
  assert.equal((await provider.generate({ prompt: "saved evidence markets and hash" })).formulas.length, 6);
  assert.equal(bodies.length, 2);
  assert.ok(bodies.every(({ max_tokens }) => max_tokens === 4096));
  assert.match(bodies[1].prompt, /same saved evidence/);
  assert.doesNotMatch(bodies[1].prompt, /linen formula/);
  assert.ok(urls.every((url) => url.includes("api.cloudflare.com")));
  assert.match(diagnostics[0], /json_parse_category=provider_output_truncated/);
  assert.match(diagnostics[0], /response_chars=58/);
  assert.match(diagnostics[1], /json_parse_category=valid/);
});

test("Cloudflare length finish reason is truncated and a second truncation fails closed", async () => {
  let calls = 0; const diagnostics: string[] = [];
  const provider = createFormulaTextProvider("cloudflare", {
    env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_API_TOKEN: "test", CLOUDFLARE_TEXT_MODEL: "@cf/meta/test", TREND_FORMULA_MAX_OUTPUT_TOKENS: "5000" } as unknown as NodeJS.ProcessEnv,
    diagnostic(line) { diagnostics.push(line); },
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ result: { response: '{"formulas":', usage: { completion_tokens: 5000 }, finish_reason: "length" } }), { status: 200 });
    },
  });
  await assert.rejects(provider.generate({ prompt: "saved evidence" }), ProviderOutputTruncatedError);
  assert.equal(calls, 2);
  assert.equal(diagnostics.length, 2);
  assert.ok(diagnostics.every((line) => /output_tokens=5000 max_tokens=5000 finish_reason=length json_parse_category=provider_output_truncated/.test(line)));
});

test("one bounded repair can correct valid JSON without any research calls", async () => {
  const urls: string[] = []; const prompts: string[] = [];
  const provider = createFormulaTextProvider("gemini", { env: { GEMINI_API_KEY: "test" } as unknown as NodeJS.ProcessEnv, fetchImpl: async (url, init) => {
    urls.push(String(url)); prompts.push(JSON.parse(String(init?.body)).contents[0].parts[0].text);
    const text = urls.length === 1 ? JSON.stringify(observedRejectedShape) : JSON.stringify(wireOutput());
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  } });
  assert.equal((await provider.generate({ prompt: "saved evidence only" })).formulas.length, 6);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.includes("generativelanguage.googleapis.com")));
  assert.match(prompts[1], /Repair only/);
  assert.match(prompts[1], /Do not perform market discovery/);
  assert.match(prompts[1], /Saved evidence context: saved evidence only/);
});

test("a second schema-invalid response fails closed after exactly one repair", async () => {
  let calls = 0;
  const provider = createFormulaTextProvider("cloudflare", { env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_API_TOKEN: "test" } as unknown as NodeJS.ProcessEnv, diagnostic() {}, fetchImpl: async () => {
    calls += 1;
    return new Response(JSON.stringify({ result: { response: JSON.stringify(observedRejectedShape) } }), { status: 200 });
  } });
  await assert.rejects(provider.generate({ prompt: "saved evidence only" }), ProviderFormulaValidationError);
  assert.equal(calls, 2);
});
