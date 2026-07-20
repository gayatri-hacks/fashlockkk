import { trendOutfitFormulaSchema, type TrendOutfitFormula } from "./schema";

export type FormulaGenerationRequest = { prompt: string };
export interface FormulaTextProvider { readonly name: "gemini" | "cloudflare" | "ollama"; generate(request: FormulaGenerationRequest): Promise<TrendOutfitFormula[]>; }

function parseResponse(text: string) {
  const value: unknown = JSON.parse(text.replace(/```json|```/g, "").trim());
  if (!Array.isArray(value)) throw new Error("Formula provider must return an array");
  return value.map((formula) => trendOutfitFormulaSchema.parse(formula));
}

export function createFormulaTextProvider(name = process.env.TREND_FORMULA_TEXT_PROVIDER || "gemini"): FormulaTextProvider {
  if (name === "ollama") return { name, async generate({ prompt }) {
    const endpoint = process.env.OLLAMA_TEXT_ENDPOINT; if (!endpoint) throw new Error("OLLAMA_TEXT_ENDPOINT is required");
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OLLAMA_TEXT_MODEL || "llama3.2", prompt, stream: false }) });
    if (!response.ok) throw new Error(`Ollama text failed (${response.status})`); return parseResponse((await response.json()).response || "");
  }};
  if (name === "cloudflare") return { name, async generate({ prompt }) {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
    if (!account || !token) throw new Error("Cloudflare text configuration is required");
    const model = process.env.CLOUDFLARE_TEXT_MODEL || "@cf/meta/llama-3.1-8b-instruct";
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
    if (!response.ok) throw new Error(`Cloudflare text failed (${response.status})`); return parseResponse((await response.json()).result?.response || "");
  }};
  if (name !== "gemini") throw new Error(`Unsupported formula provider: ${name}`);
  return { name: "gemini", async generate({ prompt }) {
    const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("GEMINI_API_KEY is required");
    const model = process.env.GEMINI_FORMULA_MODEL || "gemini-2.5-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.4 } }) });
    if (!response.ok) throw new Error(`Gemini formula text failed (${response.status})`); return parseResponse((await response.json()).candidates?.[0]?.content?.parts?.[0]?.text || "");
  }};
}
