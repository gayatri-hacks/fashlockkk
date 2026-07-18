import test from "node:test";
import assert from "node:assert/strict";
import {
  deterministicEditorialFallback,
  evidenceHash,
  validateEditorialNameSafety,
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
  assert.equal(deterministicEditorialFallback(bundle), "Loose Silhouettes");
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

function contaminationBundle(canonicalKeyword: string): TrendEvidenceBundle {
  return {
    canonicalKeyword,
    rawKeywords: [canonicalKeyword],
    garmentCategories: [],
    fitSilhouetteModifiers: [canonicalKeyword],
    materials: [],
    patternsCraftTerms: [],
    colors: [],
    productTitlePhrases: [],
    articlePhrases: [],
    supportingRegions: ["IN"],
    regionBreadth: 10,
    sourceDiversity: 1,
    supportCounts: { product: 1, article: 0, regionalQuery: 1 },
    evidencePeriod: "2026-07-01",
  };
}

test("editorial-name safety prevents leather becoming Denim Shirt", () => {
  assert.equal(validateEditorialNameSafety("Denim Shirt", contaminationBundle("leather")).ok, false);
  assert.equal(deterministicEditorialFallback(contaminationBundle("leather")), "Leather");
});

test("editorial-name safety prevents blazer becoming Denim Denim", () => {
  assert.equal(validateEditorialNameSafety("Denim Denim", contaminationBundle("blazer")).ok, false);
  assert.equal(deterministicEditorialFallback(contaminationBundle("blazer")), "Blazers");
});

test("editorial-name safety prevents flared becoming Embroidered Pant", () => {
  assert.equal(validateEditorialNameSafety("Embroidered Pant", contaminationBundle("flared")).ok, false);
  assert.equal(deterministicEditorialFallback(contaminationBundle("flared")), "Flared Silhouettes");
});

test("editorial-name safety prevents baggy becoming Cotton Pant", () => {
  assert.equal(validateEditorialNameSafety("Cotton Pant", contaminationBundle("baggy")).ok, false);
  assert.equal(deterministicEditorialFallback(contaminationBundle("baggy")), "Baggy Silhouettes");
});

test("editorial-name safety prevents minimal becoming Cotton Shirt", () => {
  assert.equal(validateEditorialNameSafety("Cotton Shirt", contaminationBundle("minimal")).ok, false);
  assert.equal(deterministicEditorialFallback(contaminationBundle("minimal")), "Minimal Dressing");
});

test("editorial-name safety prevents loose becoming Loose Trousers when trouser evidence is absent", () => {
  const result = validateEditorialNameSafety("Loose Trousers", {
    ...contaminationBundle("loose"),
    garmentCategories: ["shirt"],
    rawKeywords: ["loose", "loose shirt"],
  });

  assert.equal(result.ok, false);
  assert.equal(deterministicEditorialFallback(contaminationBundle("loose")), "Loose Silhouettes");
});

test("editorial-name safety accepts garment names only when that garment is evidenced", () => {
  const result = validateEditorialNameSafety("Loose Shirts", {
    ...contaminationBundle("loose"),
    garmentCategories: ["shirt"],
    rawKeywords: ["loose", "loose shirt"],
  });

  assert.equal(result.ok, true);
});

test("editorial-name safety rejects stale names reused for another keyword", () => {
  const result = validateEditorialNameResult({
    display_name: "Graphic Prints",
    confidence: 0.9,
    used_facets: ["leather"],
    reason: "This stale result came from a different keyword.",
  }, {
    ...contaminationBundle("leather"),
    materials: ["leather"],
  });

  assert.equal(result.ok, false);
});
