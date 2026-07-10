import type { ScoreFrame } from "../scoring/intentScoreMessage";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export type JointId = "shoulder_flexion" | "shoulder_abduction" | "elbow_extension";
export type RomTarget = { joint: JointId; label: string; cue: string; targetDeg: number };

const CATALOGUE: { joint: JointId; label: string; cue: string }[] = [
  { joint: "shoulder_flexion", label: "Reach up high", cue: "Lift your affected arm up in front of you — reach the net to the star." },
  { joint: "shoulder_abduction", label: "Reach out wide", cue: "Lift your affected arm out to the side — reach the net to the star." },
  { joint: "elbow_extension", label: "Straighten your arm", cue: "Stretch your affected arm out straight — reach the net to the star." },
];

export const DEFAULT_TARGETS: Record<JointId, number> = {
  shoulder_flexion: 60,
  shoulder_abduction: 55,
  elbow_extension: 150,
};

type TrialLog = { joint: JointId; targetDeg: number; achievedDeg: number; compensationFlag: boolean };

/**
 * Logical state of the verified-ROM trial loop — pure, renderer-agnostic
 * (mirrors ReachModel/PlantGrowthModel). Cycles a catalogue of joint targets;
 * each trial the patient's MEASURED joint angle (from the score frame's
 * `joints`) is compared against a per-patient calibrated target. A star is
 * collected when the achieved angle meets the target AND the EEG engagement
 * gate is satisfied, held for HOLD_S; then a brief rest and the next joint.
 */
export class RomTrialModel {
  static readonly HOLD_S = 0.6;
  static readonly REST_S = 1.5;

  private _targets: Record<JointId, number>;
  private _idx = 0;
  private _reach = 0;
  private _collected = 0;
  private _justCollected = false;
  private _holdTime = 0;
  private _restTime = 0;
  private _phase: "reaching" | "rest" = "reaching";
  private _lastTrial: TrialLog | null = null;

  constructor(targets: Partial<Record<JointId, number>> = {}) {
    this._targets = { ...DEFAULT_TARGETS, ...targets };
  }

  private measured(frame: ScoreFrame): number | null {
    const j = frame.joints;
    if (!j || !j.poseValid) return null;
    switch (this.current.joint) {
      case "shoulder_flexion": return j.shoulderFlexionDeg;
      case "shoulder_abduction": return j.shoulderAbductionDeg;
      case "elbow_extension": return j.elbowDeg;
    }
  }

  get current(): RomTarget {
    const c = CATALOGUE[this._idx];
    return { ...c, targetDeg: this._targets[c.joint] };
  }
  get reach(): number { return this._reach; }
  get collected(): number { return this._collected; }
  get justCollected(): boolean { return this._justCollected; }
  get phase() { return this._phase; }
  get lastTrial() { return this._lastTrial; }

  update(frame: ScoreFrame | null, engaged: boolean, dtSeconds: number): void {
    this._justCollected = false;
    const dt = Math.max(0, dtSeconds);

    if (this._phase === "rest") {
      this._reach = 0;
      this._restTime += dt;
      if (this._restTime >= RomTrialModel.REST_S) {
        this._idx = (this._idx + 1) % CATALOGUE.length;
        this._restTime = 0;
        this._phase = "reaching";
      }
      return;
    }

    const deg = frame ? this.measured(frame) : null;
    const target = this.current.targetDeg;
    this._reach = deg === null || target <= 0 ? 0 : clamp01(deg / target);

    if (deg !== null && this._reach >= 1 && engaged) {
      this._holdTime += dt;
      if (this._holdTime >= RomTrialModel.HOLD_S) {
        this._collected += 1;
        this._justCollected = true;
        this._holdTime = 0;
        this._lastTrial = {
          joint: this.current.joint, targetDeg: target, achievedDeg: deg,
          compensationFlag: Boolean(frame?.compensationFlag),
        };
        this._phase = "rest";
      }
    } else {
      this._holdTime = 0;
    }
  }
}
