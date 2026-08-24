import {
  rankTrendConceptCandidates,
  type TrendConceptValidationResult,
} from "./trend-concept-validation";

export const MANUAL_CALIBRATION_MAX_CANDIDATES = 3;

export type ManualCalibrationCandidateAttempt<T> = {
  validation: TrendConceptValidationResult;
  artifact: T;
};

/** Manual-only adapter around the production candidate-selection decision. */
export async function runManualCalibrationCandidateSelection<T>(input: {
  maxCandidates?: number;
  attempt: (candidateIndex: number) => Promise<ManualCalibrationCandidateAttempt<T>>;
}) {
  const maximum = Math.max(
    1,
    Math.min(MANUAL_CALIBRATION_MAX_CANDIDATES, input.maxCandidates ?? MANUAL_CALIBRATION_MAX_CANDIDATES),
  );
  const attempts: ManualCalibrationCandidateAttempt<T>[] = [];

  for (let candidateIndex = 0; candidateIndex < maximum; candidateIndex += 1) {
    attempts.push(await input.attempt(candidateIndex));
    const selected = rankTrendConceptCandidates(attempts.map(({ validation }) => validation));
    if (selected) return { attempts, selected };
  }

  return { attempts, selected: null };
}
