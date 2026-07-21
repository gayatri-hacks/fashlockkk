import assert from "node:assert/strict";
import test from "node:test";
import { isolatedConceptId } from "./concept-identity";
import { buildInternalFormulaCandidates } from "./formula-schema-boundary";
import { createFormulaTextProvider, parseProviderFormulaOutput, ProviderFormulaValidationError } from "./providers";

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
  const cloudflare = createFormulaTextProvider("cloudflare", { env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_API_TOKEN: "test" } as unknown as NodeJS.ProcessEnv, fetchImpl: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ result: { response: creativeJson } }), { status: 200 }); } });
  assert.deepEqual(await gemini.generate({ prompt: "saved evidence" }), await cloudflare.generate({ prompt: "saved evidence" }));
  assert.match(JSON.stringify(bodies[0]), /styling_instructions/);
  assert.match(JSON.stringify(bodies[1]), /styling_instructions/);
  assert.match(JSON.stringify(bodies[0]), /responseSchema/);
  assert.match(JSON.stringify(bodies[1]), /json_object/);
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
  const provider = createFormulaTextProvider("cloudflare", { env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_API_TOKEN: "test" } as unknown as NodeJS.ProcessEnv, fetchImpl: async () => {
    calls += 1;
    return new Response(JSON.stringify({ result: { response: JSON.stringify(observedRejectedShape) } }), { status: 200 });
  } });
  await assert.rejects(provider.generate({ prompt: "saved evidence only" }), ProviderFormulaValidationError);
  assert.equal(calls, 2);
});
