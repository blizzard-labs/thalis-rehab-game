import { getPose, type JointAngles } from "./handPoses";
import { interpolatePoses } from "./interpolation";

export type WarmupPhase = "fixation" | "cue" | "imagine" | "rest";

export const CUE_RAMP_MS = 1250;
// Full duration of the imagine phase — must match DURATIONS.imagine in
// CalibrationScene. The hand performs a single slow open → closed grip over
// this whole window (no looping).
export const IMAGINE_DURATION_MS = 4000;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * Pure phase → pose mapping for the warm-up hand. `elapsedMs` is time since the
 * current phase began.
 *
 * - fixation / rest: hold neutral
 * - cue: ramp neutral → open once over CUE_RAMP_MS, then hold open
 * - imagine: one slow open → closedGrasp transition over IMAGINE_DURATION_MS,
 *   then hold closed
 */
export const poseForPhase = (
  phase: WarmupPhase,
  elapsedMs: number,
): JointAngles => {
  const neutral = getPose("neutral");
  const open = getPose("open");
  const closed = getPose("closedGrasp");

  switch (phase) {
    case "cue":
      return interpolatePoses(neutral, open, clamp01(elapsedMs / CUE_RAMP_MS));
    case "imagine":
      return interpolatePoses(open, closed, clamp01(elapsedMs / IMAGINE_DURATION_MS));
    case "fixation":
    case "rest":
    default:
      return neutral;
  }
};
