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

export const EDITORIAL_NAME_ONTOLOGY: Record<string, {
  anchors: string[];
  aliases: string[];
  verifiedSubtypes: string[];
  safeFallback: string;
}> = {
  baggy: {
    anchors: ["baggy"],
    aliases: ["oversized", "slouchy", "relaxed"],
    verifiedSubtypes: ["baggy jeans", "baggy trousers", "baggy pants"],
    safeFallback: "Baggy Silhouettes",
  },
  blazer: {
    anchors: ["blazer"],
    aliases: ["blazers"],
    verifiedSubtypes: ["oversized blazer", "tailored blazer", "boxy blazer"],
    safeFallback: "Blazers",
  },
  flared: {
    anchors: ["flared", "flare"],
    aliases: ["bootcut"],
    verifiedSubtypes: ["flared jeans", "flared trousers", "flared pants"],
    safeFallback: "Flared Silhouettes",
  },
  leather: {
    anchors: ["leather", "suede"],
    aliases: ["leathers"],
    verifiedSubtypes: ["leather jacket", "leather skirt", "leather trousers", "leather pants"],
    safeFallback: "Leather",
  },
  loose: {
    anchors: ["loose"],
    aliases: ["relaxed", "unstructured", "flowing"],
    verifiedSubtypes: ["loose shirt", "loose trousers", "loose pants", "loose tunic"],
    safeFallback: "Loose Silhouettes",
  },
  minimal: {
    anchors: ["minimal", "minimalist"],
    aliases: ["quiet", "reduced"],
    verifiedSubtypes: ["minimal shirt", "minimal dress", "minimal tailoring"],
    safeFallback: "Minimal Dressing",
  },
  tailored: {
    anchors: ["tailored", "tailoring"],
    aliases: ["sharp tailoring"],
    verifiedSubtypes: ["tailored blazer", "tailored trousers", "tailored shirt"],
    safeFallback: "Tailoring",
  },
  graphic: {
    anchors: ["graphic"],
    aliases: ["screen print", "printed graphic"],
    verifiedSubtypes: ["graphic tee", "graphic shirt", "graphic print"],
    safeFallback: "Graphic Prints",
  },
  floral: {
    anchors: ["floral"],
    aliases: ["flower print", "botanical print"],
    verifiedSubtypes: ["floral dress", "floral shirt", "floral print"],
    safeFallback: "Floral Prints",
  },
  washed: {
    anchors: ["washed", "faded"],
    aliases: ["washed denim", "faded denim"],
    verifiedSubtypes: ["washed jeans", "washed shirt", "washed jacket"],
    safeFallback: "Washed Denim",
  },
  oversized: {
    anchors: ["oversized", "oversize"],
    aliases: ["dropped shoulder", "extra large"],
    verifiedSubtypes: ["oversized shirt", "oversized blazer", "oversized jacket"],
    safeFallback: "Oversized Silhouettes",
  },
  "oversized blazer": {
    anchors: ["oversized blazer", "blazer"],
    aliases: ["boxy blazer", "relaxed blazer"],
    verifiedSubtypes: ["oversized blazer", "boxy blazer", "relaxed blazer"],
    safeFallback: "Oversized Blazers",
  },
};

export function deterministicEditorialFallback(bundle: Pick<TrendEvidenceBundle, "canonicalKeyword" | "garmentCategories" | "materials" | "patternsCraftTerms">) {
  const keyword = bundle.canonicalKeyword;
  const conservativeNames: Record<string, string> = {
    cargo: "Cargo",
    baggy: "Baggy Silhouettes",
    blazer: "Blazers",
    chinos: "Chinos",
    "co-ord": "Co-Ord Sets",
    "co-ord set": "Co-Ord Sets",
    denim: "Denim",
    flared: "Flared Silhouettes",
    floral: "Floral Prints",
    graphic: "Graphic Prints",
    kurta: "Kurta",
    leather: "Leather",
    linen: "Linen",
    jumpsuit: "Jumpsuits",
    maxi: "Maxi Lengths",
    mesh: "Mesh",
    minimal: "Minimal Dressing",
    mini: "Mini",
    pleated: "Pleated",
    printed: "Printed",
    tailored: "Tailoring",
    utility: "Utility",
    vintage: "Vintage",
    washed: "Washed Denim",
    "wide leg trousers": "Wide-Leg Trousers",
    y2k: "Y2K",
    loose: "Loose Silhouettes",
    "oversized blazer": "Oversized Blazers",
  };

  if (conservativeNames[keyword]) return conservativeNames[keyword];
  const garment = bundle.garmentCategories[0];
  const material = bundle.materials[0];
  const craft = bundle.patternsCraftTerms[0];
  if (garment && (keyword.includes(garment) || garment.includes(keyword))) return titleCaseTrend(garment);
  if (garment && ["relaxed fit", "cropped", "wide leg"].includes(keyword)) {
    return titleCaseTrend(`${keyword} ${garment}${garment.endsWith("s") ? "" : "s"}`);
  }
  if (material && garment) return titleCaseTrend(`${material} ${garment}`);
  if (craft && garment) return titleCaseTrend(`${craft} ${garment}`);
  if (keyword === "floral") return "Floral Prints";
  if (keyword === "knit") return "Knitwear";
  return titleCaseTrend(keyword);
}

const UNRELATED_CONCEPT_TERMS = [
  "denim",
  "shirt",
  "shirts",
  "pant",
  "pants",
  "trouser",
  "trousers",
  "embroidered",
  "embroidery",
  "cotton",
  "leather",
  "blazer",
  "kurta",
  "linen",
  "floral",
  "graphic",
  "minimal",
  "baggy",
  "flared",
  "loose",
  "oversized",
  "vintage",
  "maxi",
  "mini",
  "cargo",
  "utility",
  "trench",
  "chinos",
];

const GARMENT_TERMS = [
  "shirt",
  "shirts",
  "t-shirt",
  "tee",
  "jeans",
  "denim",
  "trouser",
  "trousers",
  "pant",
  "pants",
  "kurta",
  "dress",
  "dresses",
  "skirt",
  "skirts",
  "blazer",
  "blazers",
  "jacket",
  "jackets",
  "trench",
  "coat",
  "coats",
  "top",
  "tops",
  "saree",
  "shoe",
  "shoes",
  "sneaker",
  "sneakers",
  "boot",
  "boots",
  "bag",
  "bags",
];

function singularish(value: string) {
  const normalized = normaliseNameText(value);
  if (normalized.endsWith("ies")) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("s") && normalized.length > 3) return normalized.slice(0, -1);
  return normalized;
}

function normaliseNameText(value: string) {
  return value.toLowerCase().replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function containsTerm(text: string, term: string) {
  const normalized = normaliseNameText(text);
  const normalizedTerm = normaliseNameText(term);
  const normalizedSingular = singularish(normalized);
  const termSingular = singularish(normalizedTerm);
  return normalized === normalizedTerm ||
    normalizedSingular === termSingular ||
    normalized.includes(` ${normalizedTerm} `) ||
    normalized.startsWith(`${normalizedTerm} `) ||
    normalized.endsWith(` ${normalizedTerm}`) ||
    normalized.includes(` ${termSingular} `) ||
    normalized.startsWith(`${termSingular} `) ||
    normalized.endsWith(` ${termSingular}`);
}

export function validateEditorialNameSafety(displayName: string, bundle: Pick<TrendEvidenceBundle, "canonicalKeyword" | "rawKeywords" | "garmentCategories" | "materials" | "patternsCraftTerms" | "colors">) {
  const canonicalKeyword = normaliseNameText(bundle.canonicalKeyword);
  const display = normaliseNameText(displayName);
  if (!display) return { ok: false as const, reason: "Display name is empty" };

  const ontology = EDITORIAL_NAME_ONTOLOGY[canonicalKeyword];
  const anchors = ontology?.anchors || [canonicalKeyword];
  const aliases = ontology?.aliases || [];
  const verifiedSubtypes = ontology?.verifiedSubtypes || [];
  const evidenceTerms = new Set([
    canonicalKeyword,
    ...bundle.rawKeywords,
    ...bundle.garmentCategories,
    ...bundle.materials,
    ...bundle.patternsCraftTerms,
    ...bundle.colors,
  ].map(normaliseNameText));
  const hasCanonicalConcept = [...anchors, ...aliases].some((anchor) => containsTerm(display, anchor));
  const matchingSubtype = verifiedSubtypes.find((subtype) => containsTerm(display, subtype));
  const subtypeIsVerified = matchingSubtype
    ? normaliseNameText(matchingSubtype)
        .split(" ")
        .every((part) => [...evidenceTerms].some((evidenceTerm) => evidenceTerm === part || containsTerm(evidenceTerm, part) || containsTerm(part, evidenceTerm)))
    : false;

  if (!hasCanonicalConcept && !subtypeIsVerified) {
    return {
      ok: false as const,
      reason: `Display name "${displayName}" does not preserve canonical concept "${bundle.canonicalKeyword}" or a verified alias/subtype`,
    };
  }

  const trustedTerms = new Set([
    canonicalKeyword,
    ...anchors,
    ...aliases,
    ...(subtypeIsVerified && matchingSubtype ? normaliseNameText(matchingSubtype).split(" ") : []),
    ...bundle.rawKeywords,
    ...bundle.garmentCategories,
    ...bundle.materials,
    ...bundle.patternsCraftTerms,
    ...bundle.colors,
  ].map(normaliseNameText));
  const isTrustedTerm = (term: string) => {
    const normalizedTerm = normaliseNameText(term);
    return [...trustedTerms].some((trustedTerm) =>
      trustedTerm === normalizedTerm ||
      singularish(trustedTerm) === singularish(normalizedTerm) ||
      containsTerm(trustedTerm, normalizedTerm) ||
      containsTerm(normalizedTerm, trustedTerm),
    );
  };

  const unrelated = UNRELATED_CONCEPT_TERMS.filter((term) => containsTerm(display, term) && !isTrustedTerm(term));
  if (unrelated.length) {
    return {
      ok: false as const,
      reason: `Display name contains unrelated concept terms: ${unrelated.join(", ")}`,
    };
  }

  const unverifiedGarments = GARMENT_TERMS.filter((term) => containsTerm(display, term) && !isTrustedTerm(term));
  if (unverifiedGarments.length) {
    return {
      ok: false as const,
      reason: `Display name introduces garment-specific term without evidence: ${unverifiedGarments.join(", ")}`,
    };
  }

  return { ok: true as const };
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
- Treat canonicalKeyword as the source of truth.
- The display name must preserve the canonical concept or a verified alias/subtype present in evidence.
- Do not introduce a garment, material, pattern or trend that is absent from evidence.
- Do not use garment-specific names unless that garment appears in garmentCategories, rawKeywords or product evidence.
- If evidence is thin or ambiguous, use a conservative canonical name.
- Normally use 2-6 words.
- Prefer clear fashion language over hype.
- Never reuse a name from a different keyword.

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

  const safety = validateEditorialNameSafety(parsed.data.display_name, bundle);
  if (!safety.ok) return safety;

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
