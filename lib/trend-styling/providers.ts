import { ZodError } from "zod";
import { providerFormulaOutputSchema, type ProviderFormulaOutput } from "./schema";
import { resolveFormulaMaxOutputTokens, resolveFormulaProviderConfiguration, type FormulaProviderConfiguration, type FormulaProviderName } from "./config";

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

export class ProviderOutputTruncatedError extends Error {
  readonly errorCategory = "provider_output_truncated" as const;
  constructor() {
    super("provider_output_truncated");
    this.name = "ProviderOutputTruncatedError";
  }
}

export class ProviderOutputInvalidJsonError extends Error {
  readonly errorCategory = "provider_output_invalid_json" as const;
  constructor() {
    super("provider_output_invalid_json");
    this.name = "ProviderOutputInvalidJsonError";
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

function lowerCaseJsonSchemaTypes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(lowerCaseJsonSchemaTypes);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    key === "type" && typeof child === "string" ? child.toLowerCase() : lowerCaseJsonSchemaTypes(child),
  ]));
}

export const cloudflareFormulaResponseSchema = lowerCaseJsonSchemaTypes(providerFormulaResponseSchema);

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

type CloudflareFormulaResponse = {
  text: string;
  httpStatus: number;
  outputTokens: number | null;
  finishReason: string | null;
};

function numberValue(...values: unknown[]) {
  const value = values.find((item) => typeof item === "number" && Number.isFinite(item));
  return typeof value === "number" ? value : null;
}

function stringValue(...values: unknown[]) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value.trim().slice(0, 60).replace(/[^a-zA-Z0-9_.:/@-]/g, "_") : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function incompleteJsonError(error: SyntaxError) {
  return /unterminated|unexpected end|end of json input/i.test(error.message);
}

function lengthFinishReason(finishReason: string | null) {
  return Boolean(finishReason && /length|max[_ -]?tokens|token[_ -]?limit/i.test(finishReason));
}

function cloudflareDiagnostic(input: {
  model: string;
  httpStatus: number;
  text: string;
  outputTokens: number | null;
  maxTokens: number;
  finishReason: string | null;
  parseCategory: string;
}) {
  const bytes = new TextEncoder().encode(input.text).byteLength;
  return `formula_provider=cloudflare formula_model=${stringValue(input.model) || "unknown"} http_status=${input.httpStatus} response_bytes=${bytes} response_chars=${input.text.length} output_tokens=${input.outputTokens ?? "unknown"} max_tokens=${input.maxTokens} finish_reason=${stringValue(input.finishReason) || "unknown"} json_parse_category=${input.parseCategory}`;
}

function parseCloudflareFormulaResponse(
  response: CloudflareFormulaResponse,
  model: string,
  maxTokens: number,
  diagnostic: (line: string) => void,
) {
  if (lengthFinishReason(response.finishReason)) {
    diagnostic(cloudflareDiagnostic({ model, ...response, maxTokens, parseCategory: "provider_output_truncated" }));
    throw new ProviderOutputTruncatedError();
  }
  try {
    const parsed = parseProviderFormulaOutput(response.text);
    diagnostic(cloudflareDiagnostic({ model, ...response, maxTokens, parseCategory: "valid" }));
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      const truncated = incompleteJsonError(error);
      diagnostic(cloudflareDiagnostic({ model, ...response, maxTokens, parseCategory: truncated ? "provider_output_truncated" : "provider_output_invalid_json" }));
      if (truncated) throw new ProviderOutputTruncatedError();
      throw new ProviderOutputInvalidJsonError();
    }
    diagnostic(cloudflareDiagnostic({ model, ...response, maxTokens, parseCategory: "schema_invalid" }));
    throw error;
  }
}

async function generateCloudflareWithOneRetry(input: {
  call: (prompt: string) => Promise<CloudflareFormulaResponse>;
  prompt: string;
  model: string;
  maxTokens: number;
  diagnostic: (line: string) => void;
}) {
  const fullPrompt = `${input.prompt}\n\n${PROVIDER_FORMULA_SCHEMA_PROMPT}`;
  let first: CloudflareFormulaResponse;
  try {
    first = await input.call(fullPrompt);
  } catch (error) {
    if (!(error instanceof ProviderOutputInvalidJsonError)) throw error;
    const second = await input.call(`${fullPrompt}\nRegenerate the complete JSON object from the same saved evidence. Start again from the opening brace and do not append to or quote any previous output.`);
    return parseCloudflareFormulaResponse(second, input.model, input.maxTokens, input.diagnostic);
  }
  try {
    return parseCloudflareFormulaResponse(first, input.model, input.maxTokens, input.diagnostic);
  } catch (error) {
    const retryPrompt = error instanceof ProviderFormulaValidationError
      ? repairPrompt(input.prompt, first.text, error)
      : error instanceof ProviderOutputTruncatedError || error instanceof ProviderOutputInvalidJsonError
        ? `${fullPrompt}\nRegenerate the complete JSON object from the same saved evidence. Start again from the opening brace and do not append to or quote any previous output.`
        : null;
    if (!retryPrompt) throw error;
    const second = await input.call(retryPrompt);
    return parseCloudflareFormulaResponse(second, input.model, input.maxTokens, input.diagnostic);
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
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; diagnostic?: (line: string) => void; maxOutputTokens?: number } = {},
): FormulaTextProvider {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const diagnostic = options.diagnostic || ((line: string) => console.log(line));
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
    const maxTokens = options.maxOutputTokens ?? resolveFormulaMaxOutputTokens(env);
    return generateCloudflareWithOneRetry({ prompt, model, maxTokens, diagnostic, call: async (requestPrompt) => {
      const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: requestPrompt, max_tokens: maxTokens, response_format: { type: "json_schema", json_schema: cloudflareFormulaResponseSchema } }) });
      if (response.status === 429) {
        diagnostic(cloudflareDiagnostic({ model, httpStatus: response.status, text: "", outputTokens: null, maxTokens, finishReason: null, parseCategory: "quota_exhausted" }));
        throw new FormulaProviderQuotaError(name, retryAfterSeconds(response));
      }
      if (!response.ok) {
        diagnostic(cloudflareDiagnostic({ model, httpStatus: response.status, text: "", outputTokens: null, maxTokens, finishReason: null, parseCategory: "http_error" }));
        throw new Error(`Cloudflare text failed (${response.status})`);
      }
      let payload: Record<string, unknown>;
      try {
        payload = record(await response.json());
      } catch {
        diagnostic(cloudflareDiagnostic({ model, httpStatus: response.status, text: "", outputTokens: null, maxTokens, finishReason: null, parseCategory: "invalid_wrapper" }));
        throw new ProviderOutputInvalidJsonError();
      }
      const result = record(payload.result);
      const usage = record(result.usage || payload.usage);
      const rawResponse = result.response;
      const text = typeof rawResponse === "string" ? rawResponse : rawResponse && typeof rawResponse === "object" ? JSON.stringify(rawResponse) : "";
      return {
        text,
        httpStatus: response.status,
        outputTokens: numberValue(usage.completion_tokens, usage.output_tokens, usage.generated_tokens),
        finishReason: stringValue(result.finish_reason, result.stop_reason, usage.finish_reason, payload.finish_reason),
      };
    } });
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
  diagnostic?: (line: string) => void,
): FormulaTextProvider {
  const primary = createFormulaTextProvider(configuration.primary, { env, fetchImpl, diagnostic, maxOutputTokens: configuration.maxOutputTokens });
  if (configuration.fallback === "disabled") return primary;
  const fallback = createFormulaTextProvider(configuration.fallback, { env, fetchImpl, diagnostic, maxOutputTokens: configuration.maxOutputTokens });
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
