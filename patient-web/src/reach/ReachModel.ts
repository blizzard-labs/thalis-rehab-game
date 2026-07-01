const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Logical state of the Reach & Collect mini-game — pure, renderer-agnostic
 * (mirrors PlantGrowthModel). `reach` (0..1) eases toward the live intent unit:
 * quick to extend, gentle to recede (never a punitive reset, spec §9.1). A goal
 * sits at `goalFraction` along the reach axis; holding reach at/above it briefly
 * "collects" a star and nudges the difficulty staircase (spec §9.4).
 */
export class ReachModel {
  static readonly REACH_SPEED = 0.8;   // per second, extending
  static readonly RECEDE_SPEED = 0.3;  // per second, receding (gentle)
  static readonly HOLD_S = 0.6;        // dwell at/above goal to collect
  static readonly GOAL_START = 0.65;
  static readonly GOAL_MIN = 0.55;
  static readonly GOAL_MAX = 0.9;
  static readonly STAIR_UP = 0.08;     // raise goal per success run
  static readonly STAIR_DOWN = 0.05;   // lower goal per sustained miss
  static readonly SUCCESS_RUN = 2;     // consecutive collects before raising
  static readonly MISS_MARGIN = 0.2;   // "miss" = reach below goal-this
  static readonly MISS_S = 5.0;        // sustained-miss window before lowering

  private _reach = 0;
  private _goal = ReachModel.GOAL_START;
  private _collected = 0;
  private _justCollected = false;
  private _holdTime = 0;
  private _successRun = 0;
  private _missTime = 0;

  get reach(): number { return this._reach; }
  get goalFraction(): number { return this._goal; }
  get collected(): number { return this._collected; }
  get justCollected(): boolean { return this._justCollected; }

  update(intentUnit: number, dtSeconds: number): void {
    this._justCollected = false;
    const dt = Math.max(0, dtSeconds);
    const target = clamp01(intentUnit);

    // Asymmetric ease: quick to extend, gentle to recede.
    const speed = target > this._reach ? ReachModel.REACH_SPEED : ReachModel.RECEDE_SPEED;
    const step = speed * dt;
    const delta = target - this._reach;
    if (Math.abs(delta) <= step) this._reach = target;
    else this._reach += sign(delta) * step;
    this._reach = clamp01(this._reach);

    // Collect: reach held at/above the goal for HOLD_S.
    if (this._reach >= this._goal) {
      this._holdTime += dt;
      this._missTime = 0;
      if (this._holdTime >= ReachModel.HOLD_S) {
        this._collected += 1;
        this._justCollected = true;
        this._holdTime = 0;
        this._successRun += 1;
        if (this._successRun >= ReachModel.SUCCESS_RUN) {
          this._goal = Math.min(ReachModel.GOAL_MAX, this._goal + ReachModel.STAIR_UP);
          this._successRun = 0;
        }
      }
    } else {
      this._holdTime = 0;
      // Sustained miss: reach well short of the goal lowers it (never below floor).
      if (this._reach < this._goal - ReachModel.MISS_MARGIN) {
        this._missTime += dt;
        if (this._missTime >= ReachModel.MISS_S) {
          this._goal = Math.max(ReachModel.GOAL_MIN, this._goal - ReachModel.STAIR_DOWN);
          this._missTime = 0;
          this._successRun = 0;
        }
      } else {
        this._missTime = 0;
      }
    }
  }

  reset(): void {
    this._reach = 0;
    this._goal = ReachModel.GOAL_START;
    this._collected = 0;
    this._justCollected = false;
    this._holdTime = 0;
    this._successRun = 0;
    this._missTime = 0;
  }
}
