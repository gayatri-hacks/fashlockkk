import test from "node:test";
import assert from "node:assert/strict";
import { buildTrendImageBrief } from "@/lib/images/trend-image-brief";
import {
  rankTrendConceptCandidates,
  validateTrendConceptCandidate,
  type AcceptedTrendConceptContext,
  type TrendConceptCandidateFacts,
} from "@/lib/images/trend-concept-validation";

function facts(overrides: Partial<TrendConceptCandidateFacts> = {}): TrendConceptCandidateFacts {
  return {
    candidateIndex: 0,
    keywordMatch: 0.9,
    fashionRelevance: 0.9,
    materialRealism: 0.86,
    compositionQuality: 0.84,
    semanticConfidence: 0.88,
    sharpness: 0.6,
    width: 1024,
    height: 1280,
    aspectRatio: 0.8,
    overexposed: false,
    underexposed: false,
    ocrAvailable: true,
    textDetected: false,
    logoDetected: false,
    personDetected: false,
    requiredCuesPresent: true,
    forbiddenCueDetected: false,
    detectedCues: ["baggy", "wide proportions", "exaggerated trouser volume", "heavy fabric folds"],
    missingRequiredCues: [],
    dominantPalette: "washed indigo",
    dominantColor: "indigo",
    compositionMode: "ghost-form silhouette",
    perceptualHash: "0".repeat(64),
    ...overrides,
  };
}

test("OCR/text detection rejects a candidate", () => {
  const brief = buildTrendImageBrief("baggy");
  const result = validateTrendConceptCandidate({ brief, facts: facts({ textDetected: true }) });

  assert.equal(result.passed, false);
  assert.ok(result.rejectionReasons.includes("text or gibberish detected"));
});

test("similarity rejection blocks near-duplicate candidates", () => {
  const brief = buildTrendImageBrief("baggy");
  const recentlyAccepted: AcceptedTrendConceptContext[] = [{
    compositionMode: "macro texture",
    materialFamily: "denim",
    paletteFamily: "indigo",
    dominantColor: "indigo",
    perceptualHash: "0".repeat(64),
  }];
  const result = validateTrendConceptCandidate({ brief, facts: facts(), recentlyAccepted });

  assert.equal(result.passed, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("perceptually too similar")));
});

test("collection diversity rejects the third adjacent same composition", () => {
  const brief = buildTrendImageBrief("baggy");
  const recentlyAccepted: AcceptedTrendConceptContext[] = [
    { compositionMode: "ghost-form silhouette", materialFamily: "linen", paletteFamily: "blue", dominantColor: "blue", perceptualHash: "0".repeat(64) },
    { compositionMode: "ghost-form silhouette", materialFamily: "wool", paletteFamily: "green", dominantColor: "green", perceptualHash: "1".repeat(64) },
  ];
  const result = validateTrendConceptCandidate({
    brief,
    facts: facts({ perceptualHash: "2".repeat(64) }),
    recentlyAccepted,
  });

  assert.equal(result.passed, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("composition repeats adjacent")));
});

test("candidate ranking selects highest-scoring valid candidate only", () => {
  const brief = buildTrendImageBrief("baggy");
  const low = validateTrendConceptCandidate({
    brief,
    facts: facts({ candidateIndex: 0, keywordMatch: 0.83, fashionRelevance: 0.81, materialRealism: 0.79, compositionQuality: 0.76, perceptualHash: "3".repeat(64) }),
  });
  const rejected = validateTrendConceptCandidate({
    brief,
    facts: facts({ candidateIndex: 1, keywordMatch: 0.99, textDetected: true, perceptualHash: "4".repeat(64) }),
  });
  const high = validateTrendConceptCandidate({
    brief,
    facts: facts({ candidateIndex: 2, keywordMatch: 0.95, fashionRelevance: 0.93, materialRealism: 0.9, compositionQuality: 0.88, perceptualHash: "5".repeat(64) }),
  });

  const selected = rankTrendConceptCandidates([low, rejected, high]);

  assert.equal(selected?.facts.candidateIndex, 2);
});
