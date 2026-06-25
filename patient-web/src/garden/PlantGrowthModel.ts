const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Logical growth state of the garden plant — pure, renderer-agnostic.
 * Verbatim port of game-client PlantGrowthModel.cs (spec §9.1): growth is
 * quick, wilt is slow/gentle (never a punitive reset); bloom uses a dwell
 * timer + hysteresis so it does not flicker at the threshold.
 */
export class PlantGrowthModel {
  static readonly GROW_SPEED = 0.8; // per second
  static readonly WILT_SPEED = 0.3; // per second
  static readonly BLOOM_ON = 0.75;
  static readonly BLOOM_OFF = 0.6;
  static readonly BLOOM_DWELL_S = 3.0;

  private _current = 0;
  private _target = 0;
  private _bloom = false;
  private _aboveTime = 0;

  get currentGrowth(): number { return this._current; }
  get targetGrowth(): number { return this._target; }
  get isBloom(): boolean { return this._bloom; }

  update(intentScore01: number, dtSeconds: number): void {
    this._target = clamp01(intentScore01);
    const speed = this._target > this._current ? PlantGrowthModel.GROW_SPEED : PlantGrowthModel.WILT_SPEED;
    const step = speed * Math.max(0, dtSeconds);
    const delta = this._target - this._current;
    if (Math.abs(delta) <= step) this._current = this._target;
    else this._current += sign(delta) * step;
    this._current = clamp01(this._current);
    this.updateBloom(dtSeconds);
  }

  private updateBloom(dtSeconds: number): void {
    if (this._current > PlantGrowthModel.BLOOM_ON) {
      this._aboveTime += Math.max(0, dtSeconds);
      if (this._aboveTime >= PlantGrowthModel.BLOOM_DWELL_S) this._bloom = true;
    } else {
      this._aboveTime = 0;
    }
    if (this._current < PlantGrowthModel.BLOOM_OFF) {
      this._bloom = false;
      this._aboveTime = 0;
    }
  }

  reset(): void {
    this._current = 0;
    this._target = 0;
    this._bloom = false;
    this._aboveTime = 0;
  }
}
