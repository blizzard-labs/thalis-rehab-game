import type { ScoreFrame } from "./intentScoreMessage";

export type StoreState = {
  latest: ScoreFrame | null;
  buffer: ScoreFrame[];
  signalText: "Good" | "Artifact" | "—";
};

const EMPTY_STATE: StoreState = { latest: null, buffer: [], signalText: "—" };

export class ScoreStore {
  private buffer: ScoreFrame[] = [];
  private subscribers = new Set<(s: StoreState) => void>();
  // Cached immutable snapshot — must keep a stable reference between pushes so
  // React's useSyncExternalStore does not re-render in a loop.
  private snapshot: StoreState = EMPTY_STATE;

  constructor(private capacity = 100) {}

  push(frame: ScoreFrame): void {
    this.buffer.push(frame);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    this.snapshot = {
      latest: frame,
      buffer: [...this.buffer],
      signalText: frame.isArtifact ? "Artifact" : "Good",
    };
    for (const cb of this.subscribers) cb(this.snapshot);
  }

  getState(): StoreState {
    return this.snapshot;
  }

  subscribe(cb: (s: StoreState) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}
