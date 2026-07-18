import test from "node:test";
import assert from "node:assert/strict";
import {
  deterministicEditorialFallback,
  evidenceHash,
  validateEditorialNameResult,
  type TrendEvidenceBundle,
} from "@/lib/trends/editorial-refinement";

const bundle: TrendEvidenceBundle = {
  canonicalKeyword: "loose",
  rawKeywords: ["loose", "loose shirt"],
  garmentCategories: ["shirt"],
  fitSilhouetteModifiers: ["loose"],
  materials: ["cotton"],
  patternsCraftTerms: [],
  colors: ["white"],
  productTitlePhrases: ["white loose cotton shirt"],
  articlePhrases: [],
  supportingRegions: ["IN", "FR"],
  regionBreadth: 20,
  sourceDiversity: 2,
  supportCounts: { product: 3, article: 0, regionalQuery: 2 },
  evidencePeriod: "2026-06-01",
};

test("evidence hash is stable for unchanged evidence", () => {
  assert.equal(evidenceHash(bundle), evidenceHash({ ...bundle }));
});

test("fallback uses supported evidence without inventing detail", () => {
  assert.equal(deterministicEditorialFallback(bundle), "Loose Shirts");
});

test("AI validation accepts supported facets", () => {
  const result = validateEditorialNameResult({
    display_name: "Loose Shirts",
    confidence: 0.8,
    used_facets: ["loose", "shirt"],
    reason: "Supported by shirt and loose evidence.",
  }, bundle);

  assert.equal(result.ok, true);
});

test("AI validation rejects unsupported facets", () => {
  const result = validateEditorialNameResult({
    display_name: "Red Leather Jackets",
    confidence: 0.8,
    used_facets: ["red", "leather", "jacket"],
    reason: "Unsupported invention.",
  }, bundle);

  assert.equal(result.ok, false);
});
