export const trendStylingConfig = {
  enabled: process.env.TREND_STYLING_INTELLIGENCE_ENABLED === "true",
  weeklyRefreshEnabled: process.env.ENABLE_WEEKLY_TREND_STYLE_REFRESH === "true",
  autoEnqueueFormulaImages: process.env.AUTO_ENQUEUE_FORMULA_IMAGES_ENABLED === "true",
  searchResearchEnqueueEnabled: process.env.TREND_SEARCH_RESEARCH_ENQUEUE_ENABLED === "true",
  provider: process.env.TREND_FORMULA_TEXT_PROVIDER || "gemini",
  fallbackProvider: process.env.TREND_FORMULA_TEXT_FALLBACK_PROVIDER || "disabled",
  minimumIndependentSources: 2,
  evidenceMaxAgeDays: Number(process.env.TREND_STYLE_EVIDENCE_MAX_AGE_DAYS || 120),
} as const;
