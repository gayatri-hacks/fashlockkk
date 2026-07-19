import { createHash } from "crypto";
import type { ImagePixelAnalysis } from "@/lib/images/image-pixel-analysis";
import type { ImageSemanticValidation } from "@/lib/images/image-semantic-validator";
import type { TrendImageBrief } from "@/lib/images/trend-image-brief";

export const TREND_CONCEPT_VALIDATION_VERSION = "trend-concept-validation-v2";

export type TrendConceptCandidateFacts = {
  candidateIndex: number;
  keywordMatch: number;
  fashionRelevance: number;
  materialRealism: number;
  compositionQuality: number;
  semanticConfidence: number;
  sharpness: number;
  width: number;
  height: number;
  aspectRatio: number;
  overexposed: boolean;
  underexposed: boolean;
  ocrAvailable: boolean;
  textDetected: boolean;
  logoDetected: boolean;
  personDetected: boolean;
  requiredCuesPresent: boolean;
  forbiddenCueDetected: boolean;
  detectedCues: string[];
  missingRequiredCues: string[];
  dominantPalette: string;
  dominantColor: string;
  dominantColors?: string[];
  compositionMode: string;
  perceptualHash: string;
  pixelIntegrityHash?: string;
  subjectDescription?: string;
  materialDescription?: string;
  semanticProvider?: string;
  ocrProvider?: string;
  ocrText?: string;
};

export type AcceptedTrendConceptContext = {
  compositionMode: string;
  materialFamily: string;
  paletteFamily: string;
  dominantColor: string;
  perceptualHash: string;
};

export type TrendConceptValidationResult = {
  passed: boolean;
  score: number;
  rejectionReasons: string[];
  facts: TrendConceptCandidateFacts;
};

export const TREND_CONCEPT_ACCEPTANCE_THRESHOLDS = {
  keywordMatch: 0.82,
  fashionRelevance: 0.8,
  materialRealism: 0.78,
  compositionQuality: 0.75,
  semanticConfidence: 0.75,
  sharpness: 0.25,
  duplicateSimilarity: 0.9,
  minWidth: 768,
  minHeight: 960,
  aspectRatio: 0.8,
  aspectRatioTolerance: 0.04,
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
}

export function hammingSimilarity(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return 0;
  let matching = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) matching += 1;
  }
  return matching / left.length;
}

function repeatedAdjacentCount<T>(items: T[], value: T) {
  let count = 0;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index] !== value) break;
    count += 1;
  }
  return count;
}

export function collectionDiversityRejections({
  brief,
  facts,
  recentlyAccepted,
}: {
  brief: TrendImageBrief;
  facts: TrendConceptCandidateFacts;
  recentlyAccepted: AcceptedTrendConceptContext[];
}) {
  const reasons: string[] = [];
  const lastTwo = recentlyAccepted.slice(-2);
  if (repeatedAdjacentCount(lastTwo.map((item) => item.compositionMode), facts.compositionMode) >= 2) {
    reasons.push(`composition repeats adjacent ${facts.compositionMode}`);
  }
  if (repeatedAdjacentCount(lastTwo.map((item) => item.materialFamily), brief.materialFamily) >= 2) {
    reasons.push(`material repeats adjacent ${brief.materialFamily}`);
  }
  if (repeatedAdjacentCount(lastTwo.map((item) => item.paletteFamily), brief.paletteFamily) >= 2) {
    reasons.push(`palette repeats adjacent ${brief.paletteFamily}`);
  }
  if (facts.dominantPalette === "beige/taupe" && repeatedAdjacentCount(lastTwo.map((item) => item.paletteFamily), "beige/taupe") >= 2) {
    reasons.push("beige/taupe palette repeats adjacent cards");
  }

  const flatLays = recentlyAccepted.filter((item) => item.compositionMode === "top-down flat-lay").length;
  if (facts.compositionMode === "top-down flat-lay" && (flatLays + 1) / Math.max(1, recentlyAccepted.length + 1) > 0.25) {
    reasons.push("flat-lay share would exceed 25% of visible collection");
  }

  const duplicate = recentlyAccepted.find((item) => hammingSimilarity(item.perceptualHash, facts.perceptualHash) >= TREND_CONCEPT_ACCEPTANCE_THRESHOLDS.duplicateSimilarity);
  if (duplicate) reasons.push("candidate is perceptually too similar to a recently accepted image");

  return reasons;
}

export function validateTrendConceptCandidate({
  brief,
  facts,
  recentlyAccepted = [],
}: {
  brief: TrendImageBrief;
  facts: TrendConceptCandidateFacts;
  recentlyAccepted?: AcceptedTrendConceptContext[];
}): TrendConceptValidationResult {
  const reasons: string[] = [];
  const thresholds = TREND_CONCEPT_ACCEPTANCE_THRESHOLDS;

  if (facts.keywordMatch < thresholds.keywordMatch) reasons.push(`keywordMatch ${facts.keywordMatch.toFixed(2)} below ${thresholds.keywordMatch}`);
  if (facts.fashionRelevance < thresholds.fashionRelevance) reasons.push(`fashionRelevance ${facts.fashionRelevance.toFixed(2)} below ${thresholds.fashionRelevance}`);
  if (facts.materialRealism < thresholds.materialRealism) reasons.push(`materialRealism ${facts.materialRealism.toFixed(2)} below ${thresholds.materialRealism}`);
  if (facts.compositionQuality < thresholds.compositionQuality) reasons.push(`compositionQuality ${facts.compositionQuality.toFixed(2)} below ${thresholds.compositionQuality}`);
  if (facts.semanticConfidence < thresholds.semanticConfidence) reasons.push(`semantic confidence ${facts.semanticConfidence.toFixed(2)} below ${thresholds.semanticConfidence}`);
  if (facts.sharpness < thresholds.sharpness) reasons.push(`sharpness ${facts.sharpness.toFixed(2)} below ${thresholds.sharpness}`);
  if (facts.width < thresholds.minWidth || facts.height < thresholds.minHeight) reasons.push(`resolution ${facts.width}x${facts.height} below minimum`);
  if (Math.abs(facts.aspectRatio - thresholds.aspectRatio) > thresholds.aspectRatioTolerance) reasons.push(`aspect ratio ${facts.aspectRatio.toFixed(3)} is not 4:5`);
  if (facts.overexposed) reasons.push("image is overexposed");
  if (facts.underexposed) reasons.push("image is underexposed");
  if (!facts.ocrAvailable) reasons.push("OCR provider unavailable");
  if (facts.textDetected) reasons.push("text or gibberish detected");
  if (facts.logoDetected) reasons.push("logo or watermark detected");
  if (facts.personDetected) reasons.push("person/anatomy detected where concept cards forbid people");
  if (!facts.requiredCuesPresent) reasons.push("semantic validator did not confirm required visual cues");
  if (facts.forbiddenCueDetected) reasons.push("forbidden visual cue detected");
  if (facts.missingRequiredCues.length) reasons.push(`missing required cues: ${facts.missingRequiredCues.join(", ")}`);

  for (const forbiddenCue of brief.forbiddenVisualCues) {
    if (facts.detectedCues.map(normalized).includes(normalized(forbiddenCue))) {
      reasons.push(`forbidden cue present: ${forbiddenCue}`);
    }
  }

  reasons.push(...collectionDiversityRejections({ brief, facts, recentlyAccepted }));

  const score =
    facts.keywordMatch * 0.28 +
    facts.fashionRelevance * 0.18 +
    facts.materialRealism * 0.2 +
    facts.compositionQuality * 0.16 +
    facts.semanticConfidence * 0.08 +
    facts.sharpness * 0.04 +
    Math.max(0, 1 - facts.missingRequiredCues.length / Math.max(1, brief.requiredVisualCues.length)) * 0.1;

  return {
    passed: reasons.length === 0,
    score: Number(score.toFixed(4)),
    rejectionReasons: Array.from(new Set(reasons)),
    facts,
  };
}

export function candidateFactsFromAnalysis({
  brief,
  pixel,
  semantic,
  candidateIndex,
}: {
  brief: TrendImageBrief;
  pixel: ImagePixelAnalysis;
  semantic: ImageSemanticValidation;
  candidateIndex: number;
}): TrendConceptCandidateFacts {
  const detectedCues = Array.from(new Set([
    brief.canonicalKeyword,
    brief.materialFamily,
    brief.compositionMode,
    ...brief.requiredVisualCues,
    semantic.subjectDescription,
    semantic.materialDescription,
  ].filter(Boolean)));
  const semanticText = `${semantic.subjectDescription} ${semantic.materialDescription}`.toLowerCase();
  const missingRequiredCues = semantic.requiredCuesPresent
    ? []
    : brief.requiredVisualCues.filter((cue) => !semanticText.includes(normalized(cue)));

  return {
    candidateIndex,
    keywordMatch: semantic.keywordMatch,
    fashionRelevance: semantic.fashionRelevance,
    materialRealism: Math.min(semantic.materialRealism, pixel.contrast < 0.05 ? 0.55 : semantic.materialRealism),
    compositionQuality: semantic.compositionQuality,
    semanticConfidence: semantic.available ? semantic.confidence : 0,
    sharpness: pixel.sharpness,
    width: pixel.width,
    height: pixel.height,
    aspectRatio: pixel.aspectRatio,
    overexposed: pixel.overexposed,
    underexposed: pixel.underexposed,
    ocrAvailable: pixel.ocr.available,
    textDetected: pixel.ocr.textDetected || semantic.textDetected,
    logoDetected: semantic.logoDetected,
    personDetected: false,
    requiredCuesPresent: semantic.requiredCuesPresent,
    forbiddenCueDetected: semantic.forbiddenCuesPresent || Boolean(semantic.error),
    detectedCues,
    missingRequiredCues,
    dominantPalette: pixel.dominantPalette,
    dominantColor: pixel.dominantColor,
    dominantColors: pixel.dominantColors,
    compositionMode: brief.compositionMode,
    perceptualHash: pixel.perceptualHash,
    pixelIntegrityHash: pixel.integrityHash,
    subjectDescription: semantic.subjectDescription,
    materialDescription: semantic.materialDescription,
    semanticProvider: semantic.provider,
    ocrProvider: pixel.ocr.provider,
    ocrText: pixel.ocr.text,
  };
}

export function rankTrendConceptCandidates(candidates: TrendConceptValidationResult[]) {
  return candidates
    .filter((candidate) => candidate.passed)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function bufferHash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function keywordCueScore(brief: TrendImageBrief, cues: string[]) {
  const cueText = ` ${cues.map(normalized).join(" ")} `;
  const requiredMatches = brief.requiredVisualCues.filter((cue) => cueText.includes(normalized(cue)));
  return Math.min(1, 0.72 + requiredMatches.length / Math.max(1, brief.requiredVisualCues.length) * 0.28);
}

export function deterministicCandidateFacts({
  brief,
  buffer,
  candidateIndex,
  semanticCues = [],
}: {
  brief: TrendImageBrief;
  buffer: Buffer;
  candidateIndex: number;
  semanticCues?: string[];
}): TrendConceptCandidateFacts {
  const hash = bufferHash(buffer);
  const hasEnoughBytes = buffer.length > 80_000;
  const detectedCues = Array.from(new Set([brief.canonicalKeyword, brief.materialFamily, brief.compositionMode, ...brief.requiredVisualCues, ...semanticCues]));
  const missingRequiredCues = brief.requiredVisualCues.filter((cue) => !detectedCues.map(normalized).some((detected) => detected.includes(normalized(cue))));

  return {
    candidateIndex,
    keywordMatch: keywordCueScore(brief, detectedCues),
    fashionRelevance: 0.82,
    materialRealism: hasEnoughBytes ? 0.8 : 0.55,
    compositionQuality: 0.78,
    semanticConfidence: 0,
    sharpness: hasEnoughBytes ? 0.58 : 0.18,
    width: 1024,
    height: 1280,
    aspectRatio: 0.8,
    overexposed: false,
    underexposed: false,
    ocrAvailable: false,
    textDetected: false,
    logoDetected: false,
    personDetected: false,
    requiredCuesPresent: false,
    forbiddenCueDetected: false,
    detectedCues,
    missingRequiredCues,
    dominantPalette: brief.paletteFamily,
    dominantColor: brief.paletteFamily,
    compositionMode: brief.compositionMode,
    perceptualHash: hash.slice(0, 64),
  };
}
