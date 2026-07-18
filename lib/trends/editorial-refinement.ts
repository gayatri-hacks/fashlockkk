import { createHash } from "crypto";
import { z } from "zod";
import { isAiTrendRefinementEnabled, TREND_COMPUTATION_VERSION } from "@/lib/trends/config";
import { titleCaseTrend } from "@/lib/trends/keyword-normalization";

const GEMINI_MODEL = "gemini-2.5-flash";

export type TrendEvidenceBundle = {
  canonicalKeyword: string;
  rawKeywords: string[];
  garmentCategories: string[];
  fitSilhouetteModifiers: string[];
  materials: string[];
  patternsCraftTerms: string[];
  colors: string[];
  productTitlePhrases: string[];
  articlePhrases: string[];
  supportingRegions: string[];
  regionBreadth: number;
  sourceDiversity: number;
  supportCounts: {
    product: number;
    article: number;
    regionalQuery: number;
  };
  evidencePeriod: string;
};

export const TrendEditorialNameSchema = z.object({
  display_name: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1),
  used_facets: z.array(z.string()).max(12),
  reason: z.string().max(500),
});

export type TrendEditorialNameResult = z.infer<typeof TrendEditorialNameSchema>;

function compactBundle(bundle: TrendEvidenceBundle) {
  return {
    canonicalKeyword: bundle.canonicalKeyword,
    rawKeywords: bundle.rawKeywords.slice(0, 8),
    garmentCategories: bundle.garmentCategories.slice(0, 8),
    fitSilhouetteModifiers: bundle.fitSilhouetteModifiers.slice(0, 8),
    materials: bundle.materials.slice(0, 8),
    patternsCraftTerms: bundle.patternsCraftTerms.slice(0, 8),
    colors: bundle.colors.slice(0, 8),
    productTitlePhrases: bundle.productTitlePhrases.slice(0, 8),
    articlePhrases: bundle.articlePhrases.slice(0, 8),
    supportingRegions: bundle.supportingRegions.slice(0, 12),
    regionBreadth: Number(bundle.regionBreadth.toFixed(2)),
    sourceDiversity: bundle.sourceDiversity,
    supportCounts: bundle.supportCounts,
    evidencePeriod: bundle.evidencePeriod,
  };
}

export function evidenceHash(bundle: TrendEvidenceBundle) {
  return createHash("sha256")
    .update(JSON.stringify(compactBundle(bundle)))
    .digest("hex");
}

export function deterministicEditorialFallback(bundle: Pick<TrendEvidenceBundle, "canonicalKeyword" | "garmentCategories" | "materials" | "patternsCraftTerms">) {
  const keyword = bundle.canonicalKeyword;
  const garment = bundle.garmentCategories[0];
  const material = bundle.materials[0];
  const craft = bundle.patternsCraftTerms[0];
  const conservativeNames: Record<string, string> = {
    cargo: "Cargo",
    chinos: "Chinos",
    denim: "Denim",
    floral: "Floral Prints",
    graphic: "Graphic Prints",
    kurta: "Kurta",
    linen: "Linen",
    maxi: "Maxi Dresses",
    mesh: "Mesh",
    mini: "Mini",
    pleated: "Pleated",
    printed: "Printed",
    tailored: "Tailoring",
    utility: "Utility",
    vintage: "Vintage",
    washed: "Washed Denim",
    "wide leg trousers": "Wide-Leg Trousers",
    y2k: "Y2K",
  };

  if (conservativeNames[keyword]) return conservativeNames[keyword];
  if (garment && (keyword.includes(garment) || garment.includes(keyword))) return titleCaseTrend(garment);
  if (garment && ["loose", "oversized", "relaxed fit", "cropped", "wide leg"].includes(keyword)) {
    return titleCaseTrend(`${keyword} ${garment}${garment.endsWith("s") ? "" : "s"}`);
  }
  if (material && garment) return titleCaseTrend(`${material} ${garment}`);
  if (craft && garment) return titleCaseTrend(`${craft} ${garment}`);
  if (keyword === "floral") return "Floral Prints";
  if (keyword === "knit") return "Knitwear";
  return titleCaseTrend(keyword);
}

export function buildEditorialRefinementPrompt(bundle: TrendEvidenceBundle) {
  return `You are Fashlock's fashion trend naming editor.
Refine the display name for one evidence-backed trend. Use only the evidence below.

Evidence:
${JSON.stringify(compactBundle(bundle), null, 2)}

Rules:
- Return strict JSON only.
- Do not decide scores, lifecycle or market classification.
- Do not invent a garment, color, fabric, region, season, brand or cultural claim.
- Normally use 2-6 words.
- Prefer clear fashion language over hype.
- Use canonical_keyword when evidence is too thin.

Schema:
{
  "display_name": "string",
  "confidence": 0.0,
  "used_facets": ["facet copied from evidence"],
  "reason": "short evidence-based explanation"
}`;
}

function supportedFacetSet(bundle: TrendEvidenceBundle) {
  return new Set([
    bundle.canonicalKeyword,
    ...bundle.rawKeywords,
    ...bundle.garmentCategories,
    ...bundle.fitSilhouetteModifiers,
    ...bundle.materials,
    ...bundle.patternsCraftTerms,
    ...bundle.colors,
    ...bundle.supportingRegions,
  ].map((item) => item.toLowerCase()));
}

export function validateEditorialNameResult(result: unknown, bundle: TrendEvidenceBundle) {
  const parsed = TrendEditorialNameSchema.safeParse(result);
  if (!parsed.success) return { ok: false as const, reason: parsed.error.message };

  const supported = supportedFacetSet(bundle);
  const unsupported = parsed.data.used_facets.filter((facet) => !supported.has(String(facet).toLowerCase()));
  if (unsupported.length) {
    return { ok: false as const, reason: `Unsupported facets: ${unsupported.join(", ")}` };
  }

  const lowerName = parsed.data.display_name.toLowerCase();
  const hasEvidenceWord = [...supported].some((facet) => lowerName.includes(facet) || facet.includes(lowerName));
  if (!hasEvidenceWord) {
    return { ok: false as const, reason: "Display name is not grounded in evidence facets" };
  }

  return { ok: true as const, value: parsed.data };
}

async function callGeminiJson(prompt: string, timeoutMs = 12000) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      console.warn("Trend editorial Gemini refinement skipped:", response.status);
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? JSON.parse(String(text).replace(/```json|```/g, "").trim()) : null;
  } catch (error) {
    console.warn("Trend editorial Gemini refinement fallback:", error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function refineEditorialName(bundle: TrendEvidenceBundle) {
  const hash = evidenceHash(bundle);
  const fallback = deterministicEditorialFallback(bundle);

  if (!isAiTrendRefinementEnabled()) {
    return {
      displayName: fallback,
      confidence: 0,
      evidenceHash: hash,
      model: "deterministic-fallback",
      reason: "AI refinement disabled.",
      usedFacets: [bundle.canonicalKeyword],
      prompt: buildEditorialRefinementPrompt(bundle),
    };
  }

  const prompt = buildEditorialRefinementPrompt(bundle);
  const raw = await callGeminiJson(prompt);
  const validated = validateEditorialNameResult(raw, bundle);

  if (!validated.ok) {
    return {
      displayName: fallback,
      confidence: 0,
      evidenceHash: hash,
      model: "deterministic-fallback",
      reason: validated.reason,
      usedFacets: [bundle.canonicalKeyword],
      prompt,
    };
  }

  return {
    displayName: validated.value.display_name,
    confidence: validated.value.confidence,
    evidenceHash: hash,
    model: `${GEMINI_MODEL}:${TREND_COMPUTATION_VERSION}`,
    reason: validated.value.reason,
    usedFacets: validated.value.used_facets,
    prompt,
  };
}
