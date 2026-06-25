import type { EegQualityFrame } from "./eegQualityMessage";

// Latest-only store for contact-quality frames (C2 setup). Mirrors ScoreStore's
// stable-snapshot pattern so it plugs into useSyncExternalStore without looping.

export type QualityState = { latest: EegQualityFrame | null };

const EMPTY: QualityState = { latest: null };

export class EegQualityStore {
  private subscribers = new Set<(s: QualityState) => void>();
  private snapshot: QualityState = EMPTY;

  push(frame: EegQualityFrame): void {
    this.snapshot = { latest: frame };
    for (const cb of this.subscribers) cb(this.snapshot);
  }

  getState(): QualityState {
    return this.snapshot;
  }

  subscribe(cb: (s: QualityState) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}
