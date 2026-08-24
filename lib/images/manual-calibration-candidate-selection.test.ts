import assert from "node:assert/strict";
import test from "node:test";
import {
  MANUAL_CALIBRATION_MAX_CANDIDATES,
  runManualCalibrationCandidateSelection,
} from "./manual-calibration-candidate-selection";
import type { TrendConceptValidationResult } from "./trend-concept-validation";

function validation(candidateIndex: number, passed: boolean): TrendConceptValidationResult {
  return {
    passed,
    score: passed ? 0.9 : 0,
    rejectionReasons: passed ? [] : [`candidate ${candidateIndex + 1} rejected`],
    facts: { candidateIndex } as TrendConceptValidationResult["facts"],
  };
}

test("manual calibration tries sequentially and stops at the first production-selected candidate", async () => {
  const calls: number[] = [];
  const result = await runManualCalibrationCandidateSelection({
    attempt: async (candidateIndex) => {
      calls.push(candidateIndex);
      return {
        validation: validation(candidateIndex, candidateIndex === 1),
        artifact: { candidateIndex, sanitizedReport: `report-${candidateIndex}` },
      };
    },
  });

  assert.deepEqual(calls, [0, 1]);
  assert.equal(result.selected?.facts.candidateIndex, 1);
  assert.deepEqual(result.attempts.map(({ artifact }) => artifact.sanitizedReport), ["report-0", "report-1"]);
});

test("manual calibration retains three rejected reports and selects no winner", async () => {
  const result = await runManualCalibrationCandidateSelection({
    maxCandidates: 99,
    attempt: async (candidateIndex) => ({
      validation: validation(candidateIndex, false),
      artifact: { candidateIndex, rejectionReasons: [`safe rejection ${candidateIndex + 1}`] },
    }),
  });

  assert.equal(result.attempts.length, MANUAL_CALIBRATION_MAX_CANDIDATES);
  assert.equal(result.selected, null);
  assert.deepEqual(result.attempts.map(({ artifact }) => artifact.candidateIndex), [0, 1, 2]);
});
