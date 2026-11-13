/** One selection per sustained effort, separated by fresh resting observations. */
export class IntentSwitch {
  armed = false;
  progress = 0;
  private last = -Infinity;
  private restSince: number | null = null;
  private highSince: number | null = null;
  reset() {
    this.armed = false;
    this.progress = 0;
    this.last = -Infinity;
    this.restSince = this.highSince = null;
  }
  update(level: number | null, stamp: number | null) {
    if (
      level === null ||
      !Number.isFinite(level) ||
      stamp === null ||
      !Number.isFinite(stamp)
    ) {
      this.reset();
      return false;
    }
    if (stamp <= this.last) return false;
    if (stamp - this.last > 650) {
      this.restSince = this.highSince = null;
      this.progress = 0;
      this.armed = false;
    }
    this.last = stamp;
    if (!this.armed) {
      if (level < 0.3) {
        this.restSince ??= stamp;
        if (stamp - this.restSince >= 180) {
          this.armed = true;
          this.restSince = null;
        }
      } else this.restSince = null;
      return false;
    }
    if (level >= 0.62) {
      this.highSince ??= stamp;
      this.progress = Math.min(1, (stamp - this.highSince) / 240);
      if (this.progress >= 1) {
        this.armed = false;
        this.highSince = null;
        this.progress = 0;
        return true;
      }
    } else {
      this.highSince = null;
      this.progress = 0;
    }
    return false;
  }
}
