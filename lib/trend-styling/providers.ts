import { ZodError } from "zod";
import { providerFormulaOutputSchema, type ProviderFormulaOutput } from "./schema";
import { resolveFormulaProviderConfiguration, type FormulaProviderConfiguration, type FormulaProviderName } from "./config";

export type FormulaGenerationRequest = { prompt: string };
export interface FormulaTextProvider { readonly name: "gemini" | "cloudflare" | "ollama"; generate(request: FormulaGenerationRequest): Promise<ProviderFormulaOutput>; }

export class FormulaProviderQuotaError extends Error {
  readonly errorCategory = "quota_exhausted" as const;
  constructor(readonly provider: FormulaTextProvider["name"], readonly retryAfterSeconds: number) {
    super(`${provider} formula quota exhausted`);
    this.name = "FormulaProviderQuotaError";
  }
}

export class ProviderFormulaValidationError extends Error {
  constructor(readonly issuePaths: string[]) {
    super(`Formula provider response failed strict validation at: ${issuePaths.join(", ")}`);
    this.name = "ProviderFormulaValidationError";
  }
}

const formulaItemResponseSchema = {
  type: "OBJECT", additionalProperties: false,
  required: ["role", "garment", "silhouette", "colour", "material", "styling_instruction"],
  properties: Object.fromEntries(["role", "garment", "silhouette", "colour", "material", "styling_instruction"].map((key) => [key, { type: "STRING" }])),
};

const formulaCreativeResponseSchema = {
  type: "OBJECT", additionalProperties: false,
  required: ["title", "items", "footwear", "accessories", "styling_instructions", "occasion", "season", "climate", "market_rationale", "evidence_based_rationale", "evidence_ids", "confidence"],
  properties: {
    title: { type: "STRING" }, items: { type: "ARRAY", minItems: 2, maxItems: 10, items: formulaItemResponseSchema },
    footwear: { type: "STRING" }, accessories: { type: "ARRAY", minItems: 1, maxItems: 8, items: { type: "STRING" } },
    styling_instructions: { type: "ARRAY", minItems: 1, maxItems: 8, items: { type: "STRING" } },
    occasion: { type: "STRING" }, season: { type: "STRING" }, climate: { type: "STRING" },
    market_rationale: { type: "STRING" }, evidence_based_rationale: { type: "STRING" },
    evidence_ids: { type: "ARRAY", minItems: 2, maxItems: 30, items: { type: "STRING" } },
    confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
  },
} as const;

const audienceSetResponseSchema = {
  type: "OBJECT", additionalProperties: false, required: ["easy_entry", "current_uniform", "editorial_push"],
  properties: { easy_entry: formulaCreativeResponseSchema, current_uniform: formulaCreativeResponseSchema, editorial_push: formulaCreativeResponseSchema },
} as const;

export const providerFormulaResponseSchema = {
  type: "OBJECT", additionalProperties: false, required: ["formulas"],
  properties: {
    formulas: {
      type: "OBJECT", additionalProperties: false, required: ["women", "men"],
      properties: { women: audienceSetResponseSchema, men: audienceSetResponseSchema },
    },
  },
} as const;

export const PROVIDER_FORMULA_SCHEMA_PROMPT = `Return one JSON object with exactly one root key, "formulas". "formulas" must be an object with exactly two keys, "women" and "men". Each audience must be an object with exactly three keys: "easy_entry", "current_uniform", and "editorial_push". Trusted application code derives audience and formula_slot from these six keys, so never include audience or formula_slot inside a formula. Each formula may contain only: title, items, footwear, accessories, styling_instructions, occasion, season, climate, market_rationale, evidence_based_rationale, evidence_ids, confidence. Each item may contain only: role, garment, silhouette, colour, material, styling_instruction. Never return formula_type, IDs, hashes, owner identity, requesting-market authority, review or approval state, timestamps, publication state, or any other root keys.`;

function cleanJsonText(text: string) {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export function parseProviderFormulaOutput(text: string): ProviderFormulaOutput {
  const value: unknown = JSON.parse(cleanJsonText(text));
  try {
    return providerFormulaOutputSchema.parse(value);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const paths = [...new Set(error.issues.map((issue) => issue.path.length ? issue.path.join(".") : "<root>"))].slice(0, 24);
    throw new ProviderFormulaValidationError(paths);
  }
}

function repairPrompt(savedEvidencePrompt: string, previous: string, error: ProviderFormulaValidationError) {
  return `${PROVIDER_FORMULA_SCHEMA_PROMPT}\nRepair only the following syntactically valid formula JSON using the same saved evidence context. Do not perform market discovery, search, trend research, or evidence retrieval. Validation issue paths: ${JSON.stringify(error.issuePaths)}\nSaved evidence context: ${savedEvidencePrompt.slice(0, 30_000)}\nPrevious formula JSON: ${cleanJsonText(previous).slice(0, 30_000)}`;
}

async function generateWithOneRepair(call: (prompt: string) => Promise<string>, prompt: string) {
  const first = await call(`${prompt}\n\n${PROVIDER_FORMULA_SCHEMA_PROMPT}`);
  try {
    return parseProviderFormulaOutput(first);
  } catch (error) {
    if (!(error instanceof ProviderFormulaValidationError)) throw error;
    const repaired = await call(repairPrompt(prompt, first, error));
    return parseProviderFormulaOutput(repaired);
  }
}

function retryAfterSeconds(response: Response) {
  const raw = response.headers.get("retry-after");
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(86_400, Math.ceil(seconds));
  if (raw) {
    const at = new Date(raw).getTime();
    if (Number.isFinite(at)) return Math.max(300, Math.min(86_400, Math.ceil((at - Date.now()) / 1_000)));
  }
  return 6 * 60 * 60;
}

export function createFormulaTextProvider(
  name: FormulaProviderName,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): FormulaTextProvider {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  if (name === "ollama") return { name, async generate({ prompt }) {
    const endpoint = env.OLLAMA_TEXT_ENDPOINT; if (!endpoint) throw new Error("OLLAMA_TEXT_ENDPOINT is required");
    return generateWithOneRepair(async (requestPrompt) => {
      const response = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: env.OLLAMA_TEXT_MODEL || "llama3.2", prompt: requestPrompt, stream: false, format: "json" }) });
      if (response.status === 429) throw new FormulaProviderQuotaError(name, retryAfterSeconds(response));
      if (!response.ok) throw new Error(`Ollama text failed (${response.status})`);
      return (await response.json()).response || "";
    }, prompt);
  }};
  if (name === "cloudflare") return { name, async generate({ prompt }) {
    const account = env.CLOUDFLARE_ACCOUNT_ID, token = env.CLOUDFLARE_API_TOKEN;
    if (!account || !token) throw new Error("Cloudflare text configuration is required");
    const model = env.CLOUDFLARE_TEXT_MODEL || "@cf/meta/llama-3.1-8b-instruct";
    return generateWithOneRepair(async (requestPrompt) => {
      const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: requestPrompt, response_format: { type: "json_object" } }) });
      if (response.status === 429) throw new FormulaProviderQuotaError(name, retryAfterSeconds(response));
      if (!response.ok) throw new Error(`Cloudflare text failed (${response.status})`);
      return (await response.json()).result?.response || "";
    }, prompt);
  }};
  if (name !== "gemini") throw new Error(`Unsupported formula provider: ${name}`);
  return { name: "gemini", async generate({ prompt }) {
    const key = env.GEMINI_API_KEY; if (!key) throw new Error("GEMINI_API_KEY is required");
    const model = env.GEMINI_FORMULA_MODEL || "gemini-2.5-flash";
    return generateWithOneRepair(async (requestPrompt) => {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: requestPrompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: providerFormulaResponseSchema, temperature: 0.4 } }) });
      if (response.status === 429) throw new FormulaProviderQuotaError("gemini", retryAfterSeconds(response));
      if (!response.ok) throw new Error(`Gemini formula text failed (${response.status})`);
      return (await response.json()).candidates?.[0]?.content?.parts?.[0]?.text || "";
    }, prompt);
  }};
}

export function createConfiguredFormulaTextProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
  configuration: FormulaProviderConfiguration = resolveFormulaProviderConfiguration(env),
): FormulaTextProvider {
  const primary = createFormulaTextProvider(configuration.primary, { env, fetchImpl });
  if (configuration.fallback === "disabled") return primary;
  const fallback = createFormulaTextProvider(configuration.fallback, { env, fetchImpl });
  return {
    name: primary.name,
    async generate(request) {
      try { return await primary.generate(request); }
      catch (error) {
        if (!(error instanceof FormulaProviderQuotaError)) throw error;
        return fallback.generate(request);
      }
    },
  };
}
