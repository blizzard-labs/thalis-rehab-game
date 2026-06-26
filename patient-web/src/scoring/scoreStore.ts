import type { ScoreFrame } from "./intentScoreMessage";

/** Fixed circular buffer of score frames (default 600 = 30 s @ 20 Hz). */
export class ScoreStore {
  private buf: ScoreFrame[] = [];
  private head = 0; // index of the next write
  private count = 0;

  constructor(private capacity = 600) {}

  push(f: ScoreFrame): void {
    this.buf[this.head] = f;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.buf = [];
    this.head = 0;
    this.count = 0;
  }

  /** i=0 is most recent, i=1 next, … returns null past the filled range. */
  private at(i: number): ScoreFrame | null {
    if (i < 0 || i >= this.count) return null;
    const idx = (this.head - 1 - i + this.capacity * 2) % this.capacity;
    return this.buf[idx] ?? null;
  }

  latest(): ScoreFrame | null {
    return this.at(0);
  }

  recentAverage(n: number): number {
    const k = Math.min(n, this.count);
    if (k === 0) return 0;
    let sum = 0;
    for (let i = 0; i < k; i++) sum += this.at(i)!.intentScore;
    return sum / k;
  }

  streakAboveThreshold(threshold: number): number {
    let streak = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.at(i)!.intentScore >= threshold) streak++;
      else break;
    }
    return streak;
  }
}
