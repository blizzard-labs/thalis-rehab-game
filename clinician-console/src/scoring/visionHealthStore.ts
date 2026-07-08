import type { VisionHealthFrame } from "./visionHealthMessage";

// Latest-only store for vision_health frames. Mirrors EegQualityStore's
// stable-snapshot pattern so it plugs into useSyncExternalStore without looping.

export type VisionHealthState = { latest: VisionHealthFrame | null };

const EMPTY: VisionHealthState = { latest: null };

export class VisionHealthStore {
  private subscribers = new Set<(s: VisionHealthState) => void>();
  private snapshot: VisionHealthState = EMPTY;

  push(frame: VisionHealthFrame): void {
    this.snapshot = { latest: frame };
    for (const cb of this.subscribers) cb(this.snapshot);
  }

  getState(): VisionHealthState {
    return this.snapshot;
  }

  subscribe(cb: (s: VisionHealthState) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}
