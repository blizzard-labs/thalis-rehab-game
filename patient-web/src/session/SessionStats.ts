/**
 * Positive, non-comparative session metrics (spec §9.3 — never a raw % or
 * grade). Port of game-client SessionStats.cs; an instance here instead of a
 * C# static singleton (TS modules don't need the static-bridge trick).
 */
export class SessionStats {
  private _active = 0;
  private _best = 0;
  private _current = 0;
  private _trials = 0;

  get totalActiveSeconds(): number { return this._active; }
  get bestStreakSeconds(): number { return this._best; }
  get trialsCompleted(): number { return this._trials; }

  accumulate(dtSeconds: number, engaged: boolean): void {
    const dt = Math.max(0, dtSeconds);
    if (engaged) {
      this._active += dt;
      this._current += dt;
      if (this._current > this._best) this._best = this._current;
    } else {
      this._current = 0;
    }
  }

  incrementTrials(): void { this._trials += 1; }

  reset(): void {
    this._active = 0;
    this._best = 0;
    this._current = 0;
    this._trials = 0;
  }

  focusLine(): string {
    const minutes = Math.max(0, Math.round(this._active / 60));
    return minutes === 1 ? "You focused for 1 minute" : `You focused for ${minutes} minutes`;
  }

  streakLine(): string {
    const seconds = Math.max(0, Math.round(this._best));
    return `Your best streak was ${seconds} seconds`;
  }

  praiseLine(): string { return "Great session!"; }
}
