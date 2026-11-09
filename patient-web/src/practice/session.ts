export type Game = "garden" | "stars";
export type Source = "button" | "camera" | "eeg" | "blended";
export type Side = "left" | "right";
export const gameNames = { garden: "Garden Grow", stars: "Star Catcher" };
export const sourceNames = {
  button: "One button",
  camera: "Camera",
  eeg: "EEG headset",
  blended: "Camera + EEG",
};

export interface PracticeRecord {
  id: string;
  started: string;
  game: Game;
  sources: Source[];
  elapsed: number;
  actions: number;
  rewards: number;
  measurements: Partial<
    Record<
      Source,
      { validSeconds: number; missingSeconds: number; weightedLevel: number }
    >
  >;
  feedback?: { count: number; p95Ms: number };
  schedule?: "short" | "clinic";
  calibration?: {
    method: string;
    accuracy: number | null;
    synthetic?: boolean;
  };
  events: {
    seconds: number;
    kind: "action" | "pause" | "resume" | "switch" | "reward";
    source: Source;
  }[];
}

/** Observations are normalized against this player's comfortable range. */
export class PracticeRound {
  readonly record: PracticeRecord;
  source: Source;
  paused = false;
  progress = 0;
  level = 0;
  scanning = 0;
  inputSampleMs: number | null = null;
  private paintedSample: number | null = null;
  private latencyBuckets = new Map<number, number>();

  private held = 0;
  private released = false;
  get needsRest() {
    return !this.released;
  }
  private threshold: number;
  private elapsedSinceReward = 0;
  private restTaken = false;
  scheduleFinished = false;

  constructor(
    game: Game,
    source: Source,
    readonly easy: boolean,
    schedule?: PracticeRecord["schedule"],
  ) {
    this.source = source;
    this.threshold = easy ? 0.35 : 0.55;
    this.record = {
      id: crypto.randomUUID(),
      started: new Date().toISOString(),
      game,
      sources: [source],
      schedule,
      elapsed: 0,
      actions: 0,
      rewards: 0,
      measurements: {},
      events: [],
    };
  }

  get target() {
    return (this.record.rewards * 2 + 1) % 3;
  }
  get scanSlot() {
    return Math.floor(this.scanning / (this.easy ? 2.5 : 1.5)) % 3;
  }

  setPaused(value: boolean) {
    if (this.paused === value) return;
    this.paused = value;
    this.resetInput();
    this.log(value ? "pause" : "resume");
  }

  switchInput(next: "button" | "camera" | "eeg") {
    if (next === this.source || (next !== "button" && this.source !== "blended")) return;
    this.source = next;
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
    if (this.paused || this.scheduleFinished) return;
    dt = Math.min(0.25, Math.max(0, dt));
    this.record.elapsed += dt;
    const elapsed = this.record.elapsed;
    const schedule = this.record.schedule;
    if (
      (schedule === "short" && elapsed >= 300) ||
      (schedule === "clinic" && elapsed >= 1080)
    ) {
      this.scheduleFinished = true;
      this.setPaused(true);
      return;
    }
    if (schedule === "clinic" && elapsed >= 540 && !this.restTaken) {
      this.restTaken = true;
      this.setPaused(true);
      return;
    }
    this.elapsedSinceReward += dt;
    if (this.source === "button") {
      this.scanning += dt;
      return;
    }
    const measurement = (this.record.measurements[this.source] ??= {
      validSeconds: 0,
      missingSeconds: 0,
      weightedLevel: 0,
    });
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
    if (this.level < this.threshold || !this.released) {
      this.held = 0;
      return;
    }
    this.held += dt;
    if (this.held < 0.4) return;
    this.record.actions++;
    this.log("action");
    this.released = false;
    this.held = 0;
    this.progress =
      this.record.game === "garden" ? Math.min(1, this.progress + 0.25) : 1;
    if (this.progress >= 1) this.reward();
  }

  recordPaint(timeMs: number) {
    if (
      this.paused ||
      this.inputSampleMs === null ||
      this.paintedSample === this.inputSampleMs
    )
      return;
    this.paintedSample = this.inputSampleMs;
    const delay = Math.round(timeMs - this.inputSampleMs);
    if (delay < 0 || delay > 10000) return;
    this.latencyBuckets.set(delay, (this.latencyBuckets.get(delay) ?? 0) + 1);
    const count = (this.record.feedback?.count ?? 0) + 1;
    const rank = Math.ceil(count * 0.95);
    let total = 0;
    for (const bucket of [...this.latencyBuckets.keys()].sort(
      (a, b) => a - b,
    )) {
      total += this.latencyBuckets.get(bucket)!;
      if (total >= rank) {
        this.record.feedback = { count, p95Ms: bucket };
        return;
      }
    }
  }

  private reward() {
    this.record.rewards++;
    this.progress = 0;
    this.log("reward");
    // Keep slower players' targets comfortable. Never exceed the calibrated range.
    if (!this.easy)
      this.threshold = Math.max(
        0.35,
        Math.min(
          0.75,
          this.threshold + (this.elapsedSinceReward < 8 ? 0.03 : -0.04),
        ),
      );
    this.elapsedSinceReward = 0;
  }

  private resetInput() {
    this.held = 0;
    this.level = 0;
    this.released = false;
    this.inputSampleMs = null;
  }
  private log(kind: PracticeRecord["events"][number]["kind"]) {
    this.record.events.push({
      seconds: Math.round(this.record.elapsed),
      kind,
      source: this.source,
    });
  }
}

export async function historyStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("neuroreach-practice", 1);
    open.onupgradeneeded = () =>
      open.result.createObjectStore("rounds", { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("rounds", mode);
      const request = operation(tx.objectStore("rounds"));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

export function downloadRecord(record: PracticeRecord) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `neuroreach-${record.game}-${record.started.slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
