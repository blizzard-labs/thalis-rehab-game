import type { ScoreFrame } from "./intentScoreMessage";

export type StoreState = {
  latest: ScoreFrame | null;
  buffer: ScoreFrame[];
  signalText: "Good" | "Artifact" | "—";
};

export class ScoreStore {
  private buffer: ScoreFrame[] = [];
  private subscribers = new Set<(s: StoreState) => void>();

  constructor(private capacity = 100) {}

  push(frame: ScoreFrame): void {
    this.buffer.push(frame);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    const state = this.getState();
    for (const cb of this.subscribers) cb(state);
  }

  getState(): StoreState {
    const latest = this.buffer.length ? this.buffer[this.buffer.length - 1] : null;
    let signalText: StoreState["signalText"] = "—";
    if (latest) signalText = latest.isArtifact ? "Artifact" : "Good";
    return { latest, buffer: [...this.buffer], signalText };
  }

  subscribe(cb: (s: StoreState) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}
