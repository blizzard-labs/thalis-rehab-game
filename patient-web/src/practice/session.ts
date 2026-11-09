export type Game = "garden" | "stars";
export type Source = "button" | "camera" | "eeg" | "blended";
export type Side = "left" | "right";
export const gameNames = { garden: "Garden Grow", stars: "Star Catcher" };
export const sourceNames = { button: "One button", camera: "Camera", eeg: "EEG headset", blended: "Camera + EEG" };

export interface PracticeRecord {
  id: string;
  started: string;
  game: Game;
  sources: Source[];
  elapsed: number;
  actions: number;
  rewards: number;
  measurements: Partial<Record<Source, { validSeconds: number; missingSeconds: number; weightedLevel: number }>>;
  calibration?: { method: string; accuracy: number | null };
  events: { seconds: number; kind: "action" | "pause" | "resume" | "switch" | "reward"; source: Source }[];
}

/** Observations are normalized against this player's comfortable range. */
export class PracticeRound {
  readonly record: PracticeRecord;
  source: Source;
  paused = false;
  progress = 0;
  level = 0;
  scanning = 0;
  private held = 0;
  private released = true;
  private threshold: number;
  private elapsedSinceReward = 0;

  constructor(game: Game, source: Source, readonly easy: boolean) {
    this.source = source;
    this.threshold = easy ? 0.35 : 0.55;
    this.record = { id: crypto.randomUUID(), started: new Date().toISOString(), game, sources: [source],
      elapsed: 0, actions: 0, rewards: 0, measurements: {}, events: [] };
  }

  get target() { return (this.record.rewards * 2 + 1) % 3; }
  get scanSlot() { return Math.floor(this.scanning / (this.easy ? 2.5 : 1.5)) % 3; }

  setPaused(value: boolean) {
    if (this.paused === value) return;
    this.paused = value;
    this.resetInput();
    this.log(value ? "pause" : "resume");
  }

  switchToButton() {
    if (this.source === "button") return;
    this.source = "button";
    this.record.sources.push(this.source);
    this.resetInput();
    this.log("switch");
  }

  press() {
    if (this.paused || this.source !== "button") return;
    this.record.actions++;
    this.log("action");
    if (this.record.game === "garden") {
      this.progress = Math.min(1, this.progress + 0.25);
      if (this.progress >= 1) this.reward();
    } else if (this.scanSlot === this.target) {
      this.reward();
    }
  }

  tick(dt: number, observation: number | null) {
    if (this.paused) return;
    dt = Math.min(0.25, Math.max(0, dt));
    this.record.elapsed += dt;
    this.elapsedSinceReward += dt;
    if (this.source === "button") {
      this.scanning += dt;
      return;
    }
    const measurement = this.record.measurements[this.source] ??= { validSeconds: 0, missingSeconds: 0, weightedLevel: 0 };
    if (observation === null || !Number.isFinite(observation)) {
      measurement.missingSeconds += dt;
      this.level = 0;
      this.held = 0;
      return;
    }
    this.level = Math.max(0, Math.min(1, observation));
    measurement.validSeconds += dt;
    measurement.weightedLevel += this.level * dt;
    if (this.level < this.threshold * 0.65) this.released = true;
    if (this.level < this.threshold || !this.released) { this.held = 0; return; }
    this.held += dt;
    if (this.held < 0.4) return;
    this.record.actions++;
    this.log("action");
    this.released = false;
    this.held = 0;
    this.progress = this.record.game === "garden" ? Math.min(1, this.progress + 0.25) : 1;
    if (this.progress >= 1) this.reward();
  }

  private reward() {
    this.record.rewards++;
    this.progress = 0;
    this.log("reward");
    // Keep slower players' targets comfortable. Never exceed the calibrated range.
    if (!this.easy) this.threshold = Math.max(0.35, Math.min(0.75,
      this.threshold + (this.elapsedSinceReward < 8 ? 0.03 : -0.04)));
    this.elapsedSinceReward = 0;
  }

  private resetInput() { this.held = 0; this.level = 0; this.released = false; }
  private log(kind: PracticeRecord["events"][number]["kind"]) {
    this.record.events.push({ seconds: Math.round(this.record.elapsed), kind, source: this.source });
  }
}

export async function historyStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("neuroreach-practice", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("rounds", { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("rounds", mode);
      const request = operation(tx.objectStore("rounds"));
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

export function downloadRecord(record: PracticeRecord) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `neuroreach-${record.game}-${record.started.slice(0,10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
