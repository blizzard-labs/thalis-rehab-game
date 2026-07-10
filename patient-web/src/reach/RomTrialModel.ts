import type { ScoreFrame } from "../scoring/intentScoreMessage";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export type ReachDir = "up" | "side" | "down";
export type JointId = "shoulder_flexion" | "shoulder_abduction" | "elbow_extension";

/** Normalized reach magnitude (torso-lengths) treated as a "full" reach, and the
 *  capture radius around the goal. Tunable after a live visual check. */
export const REACH_MAG = 1.1;
export const REACH_CAP_R = 0.5;

export type Trial = {
  joint: JointId; dir: ReachDir; label: string; cue: string;
  goal: { x: number; y: number };
};

/** +1/−1 screen-x sign toward the affected side (affected-left reaches screen-left). */
export const sideSign = (affectedSide: string) => (affectedSide === "left" ? -1 : 1);

const CATALOGUE: { joint: JointId; dir: ReachDir; label: string; cue: string }[] = [
  { joint: "shoulder_flexion", dir: "up", label: "Reach up high",
    cue: "Lift your affected arm up — reach the net to the star above." },
  { joint: "shoulder_abduction", dir: "side", label: "Reach out wide",
    cue: "Lift your affected arm out to the side — reach the net to the star." },
  { joint: "elbow_extension", dir: "down", label: "Straighten your arm",
    cue: "Stretch your affected arm down straight — reach the net to the star." },
];

type TrialLog = { joint: JointId; dir: ReachDir; achieved: number; compensationFlag: boolean };

/**
 * Directional reach trial loop. Each trial has a goal position in reach space
 * (wrist offset from the shoulder, torso-normalized; +x toward the affected
 * side, +y up). The patient's measured wrist offset drives everything; a star
 * is collected when the wrist is within REACH_CAP_R of the goal AND the EEG gate
 * is engaged, held for HOLD_S; then a brief rest and the next direction.
 */
export class RomTrialModel {
  static readonly HOLD_S = 0.5;
  static readonly REST_S = 1.2;

  private _side: string;
  private _idx = 0;
  private _reach = 0;
  private _collected = 0;
  private _justCollected = false;
  private _holdTime = 0;
  private _restTime = 0;
  private _phase: "reaching" | "rest" = "reaching";
  private _lastTrial: TrialLog | null = null;

  constructor(affectedSide: string = "right") {
    this._side = affectedSide;
  }

  private goalFor(dir: ReachDir): { x: number; y: number } {
    switch (dir) {
      case "up": return { x: 0, y: REACH_MAG };
      case "down": return { x: 0, y: -REACH_MAG };
      case "side": return { x: sideSign(this._side) * REACH_MAG, y: 0 };
    }
  }

  private wrist(frame: ScoreFrame): { x: number; y: number } | null {
    const j = frame.joints;
    if (!j || !j.poseValid || j.wristDx === null || j.wristDy === null) return null;
    // reach space: +x toward affected side (screen), +y up.
    return { x: j.wristDx * sideSign(this._side), y: -j.wristDy };
  }

  get current(): Trial {
    const c = CATALOGUE[this._idx];
    return { ...c, goal: this.goalFor(c.dir) };
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

    const w = frame ? this.wrist(frame) : null;
    const g = this.current.goal;
    const dist = w === null ? Infinity : Math.hypot(w.x - g.x, w.y - g.y);
    this._reach = w === null ? 0 : clamp01(1 - dist / REACH_MAG);

    if (dist <= REACH_CAP_R && engaged) {
      this._holdTime += dt;
      if (this._holdTime >= RomTrialModel.HOLD_S) {
        this._collected += 1;
        this._justCollected = true;
        this._holdTime = 0;
        this._lastTrial = {
          joint: this.current.joint, dir: this.current.dir, achieved: this._reach,
          compensationFlag: Boolean(frame?.compensationFlag),
        };
        this._phase = "rest";
      }
    } else {
      this._holdTime = 0;
    }
  }
}
