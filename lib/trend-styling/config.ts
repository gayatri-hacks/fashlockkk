export type FormulaProviderName = "gemini" | "cloudflare" | "ollama";

export type FormulaProviderConfiguration = {
  primary: FormulaProviderName;
  fallback: FormulaProviderName | "disabled";
  model: string;
};

function providerName(value: string | undefined, label: string): FormulaProviderName {
  const normalized = value?.trim();
  if (normalized === "gemini" || normalized === "cloudflare" || normalized === "ollama") return normalized;
  throw new Error(`${label} must be gemini, cloudflare or ollama`);
}

function requireValue(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the configured formula provider`);
  return value;
}

function validateProviderConfiguration(provider: FormulaProviderName, env: NodeJS.ProcessEnv) {
  if (provider === "cloudflare") {
    requireValue(env, "CLOUDFLARE_ACCOUNT_ID");
    requireValue(env, "CLOUDFLARE_API_TOKEN");
    return requireValue(env, "CLOUDFLARE_TEXT_MODEL");
  }
  if (provider === "ollama") {
    requireValue(env, "OLLAMA_TEXT_ENDPOINT");
    return env.OLLAMA_TEXT_MODEL?.trim() || "llama3.2";
  }
  requireValue(env, "GEMINI_API_KEY");
  return env.GEMINI_FORMULA_MODEL?.trim() || "gemini-2.5-flash";
}

export function resolveFormulaProviderConfiguration(env: NodeJS.ProcessEnv = process.env): FormulaProviderConfiguration {
  const primary = providerName(env.TREND_FORMULA_TEXT_PROVIDER, "TREND_FORMULA_TEXT_PROVIDER");
  const requestedFallback = env.TREND_FORMULA_TEXT_FALLBACK_PROVIDER?.trim() || "disabled";
  const fallback = requestedFallback === "disabled" || requestedFallback === primary
    ? "disabled"
    : providerName(requestedFallback, "TREND_FORMULA_TEXT_FALLBACK_PROVIDER");
  const model = validateProviderConfiguration(primary, env);
  if (fallback !== "disabled") validateProviderConfiguration(fallback, env);
  return { primary, fallback, model };
}

export function formulaProviderDiagnostic(config: FormulaProviderConfiguration) {
  return `formula_provider=${config.primary} formula_fallback=${config.fallback} formula_model=${config.model}`;
}

export const trendStylingConfig = {
  enabled: process.env.TREND_STYLING_INTELLIGENCE_ENABLED === "true",
  weeklyRefreshEnabled: process.env.ENABLE_WEEKLY_TREND_STYLE_REFRESH === "true",
  autoEnqueueFormulaImages: process.env.AUTO_ENQUEUE_FORMULA_IMAGES_ENABLED === "true",
  searchResearchEnqueueEnabled: process.env.TREND_SEARCH_RESEARCH_ENQUEUE_ENABLED === "true",
  provider: process.env.TREND_FORMULA_TEXT_PROVIDER || "disabled",
  fallbackProvider: process.env.TREND_FORMULA_TEXT_FALLBACK_PROVIDER || "disabled",
  minimumIndependentSources: 2,
  evidenceMaxAgeDays: Number(process.env.TREND_STYLE_EVIDENCE_MAX_AGE_DAYS || 120),
} as const;
