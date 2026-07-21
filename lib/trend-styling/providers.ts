import { trendOutfitFormulaSchema, type TrendOutfitFormula } from "./schema";

export type FormulaGenerationRequest = { prompt: string };
export interface FormulaTextProvider { readonly name: "gemini" | "cloudflare" | "ollama"; generate(request: FormulaGenerationRequest): Promise<TrendOutfitFormula[]>; }

export class FormulaProviderQuotaError extends Error {
  readonly errorCategory = "quota_exhausted" as const;
  constructor(readonly provider: FormulaTextProvider["name"], readonly retryAfterSeconds: number) {
    super(`${provider} formula quota exhausted`);
    this.name = "FormulaProviderQuotaError";
  }
}

function parseResponse(text: string) {
  const value: unknown = JSON.parse(text.replace(/```json|```/g, "").trim());
  if (!Array.isArray(value)) throw new Error("Formula provider must return an array");
  return value.map((formula) => trendOutfitFormulaSchema.parse(formula));
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
  name = process.env.TREND_FORMULA_TEXT_PROVIDER || "gemini",
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): FormulaTextProvider {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  if (name === "ollama") return { name, async generate({ prompt }) {
    const endpoint = env.OLLAMA_TEXT_ENDPOINT; if (!endpoint) throw new Error("OLLAMA_TEXT_ENDPOINT is required");
    const response = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: env.OLLAMA_TEXT_MODEL || "llama3.2", prompt, stream: false }) });
    if (response.status === 429) throw new FormulaProviderQuotaError(name, retryAfterSeconds(response));
    if (!response.ok) throw new Error(`Ollama text failed (${response.status})`); return parseResponse((await response.json()).response || "");
  }};
  if (name === "cloudflare") return { name, async generate({ prompt }) {
    const account = env.CLOUDFLARE_ACCOUNT_ID, token = env.CLOUDFLARE_API_TOKEN;
    if (!account || !token) throw new Error("Cloudflare text configuration is required");
    const model = env.CLOUDFLARE_TEXT_MODEL || "@cf/meta/llama-3.1-8b-instruct";
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
    if (response.status === 429) throw new FormulaProviderQuotaError(name, retryAfterSeconds(response));
    if (!response.ok) throw new Error(`Cloudflare text failed (${response.status})`); return parseResponse((await response.json()).result?.response || "");
  }};
  if (name !== "gemini") throw new Error(`Unsupported formula provider: ${name}`);
  return { name: "gemini", async generate({ prompt }) {
    const key = env.GEMINI_API_KEY; if (!key) throw new Error("GEMINI_API_KEY is required");
    const model = env.GEMINI_FORMULA_MODEL || "gemini-2.5-flash";
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.4 } }) });
    if (response.status === 429) throw new FormulaProviderQuotaError("gemini", retryAfterSeconds(response));
    if (!response.ok) throw new Error(`Gemini formula text failed (${response.status})`); return parseResponse((await response.json()).candidates?.[0]?.content?.parts?.[0]?.text || "");
  }};
}

export function createConfiguredFormulaTextProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): FormulaTextProvider {
  const primary = createFormulaTextProvider(env.TREND_FORMULA_TEXT_PROVIDER || "gemini", { env, fetchImpl });
  const fallbackName = env.TREND_FORMULA_TEXT_FALLBACK_PROVIDER;
  if (!fallbackName || fallbackName === "disabled") return primary;
  const fallback = createFormulaTextProvider(fallbackName, { env, fetchImpl });
  if (fallback.name === primary.name) throw new Error("Formula fallback provider must differ from primary");
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
