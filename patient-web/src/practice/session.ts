import { scanTargetSlot } from "./constellations";
import { PlantGrowthModel } from "../garden/PlantGrowthModel";
import { seedAt, type Seed } from "../garden/seeds";

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

export type CameraStarFrame = {
  time: number | null;
  cleared: boolean;
  nearTarget: boolean;
  neural: number | null;
};
const holdSeconds = 0.4;

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
  feedback?: { count: number; p95Ms: number; buckets?: Record<number, number> };
  schedule?: "short" | "clinic";
  garden?: { next: Seed; bed: Seed[]; goal?: number };
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
  readonly plant = new PlantGrowthModel();
  get flowerBed() {
    if (!this.record.garden) {
      // Older records may only know the total. The meadow draws those
      // earlier blooms without attributing a seed choice to the player.
      this.record.garden = { next: seedAt(this.record.rewards), bed: [] };
    }
    return this.record.garden;
  }
  chooseSeed(seed: Seed) {
    if (this.record.game === "garden" && !this.paused && this.progress === 0)
      this.flowerBed.next = seed;
  }
  inputSampleMs: number | null = null;
  private paintedSample: number | null = null;

  private held = 0;
  private clearedCatch = false;
  private relaxedImagery = false;
  private cameraFrameTime: number | null = null;
  private insideTime: number | null = null;
  get catchProgress() {
    return Math.min(1, this.held / holdSeconds);
  }
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

  static restore(record: PracticeRecord, easy: boolean) {
    const round = new PracticeRound(
      record.game,
      record.sources[0],
      easy,
      record.schedule,
    );
    Object.assign(round.record, record);
    round.source = record.sources[record.sources.length - 1];
    round.progress = record.game === "garden" ? (record.actions % 4) / 4 : 0;
    let lastReward = 0;
    let buttonStart = 0;
    for (const event of record.events) {
      if (event.kind === "pause" || event.kind === "resume")
        round.paused = event.kind === "pause";
      if (event.kind === "switch" && event.source === "button")
        buttonStart = event.seconds;
      if (event.kind === "reward") {
        round.adjustDifficulty(event.seconds - lastReward);
        lastReward = event.seconds;
      }
    }
    round.elapsedSinceReward = Math.max(0, record.elapsed - lastReward);
    round.scanning =
      round.source === "button" ? Math.max(0, record.elapsed - buttonStart) : 0;
    round.restTaken = record.schedule === "clinic" && record.elapsed >= 540;
    round.scheduleFinished =
      (record.schedule === "clinic" && record.elapsed >= 1080) ||
      (record.schedule === "short" && record.elapsed >= 300);
    // A new display must observe fresh rest and effort after sensor setup.
    return round;
  }

  get starIndex() {
    return this.record.rewards - (this.celebrating ? 1 : 0);
  }
  get celebrating() {
    return this.record.rewards > 0 && this.elapsedSinceReward < 0.85;
  }
  get effortReach() {
    return Math.min(1, this.level / this.threshold);
  }
  moveScan(direction: number) {
    if (this.source !== "button" || this.paused) return;
    this.scanning =
      ((this.scanSlot + direction + 3) % 3) * (this.easy ? 2.5 : 1.5);
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
    if (
      next === this.source ||
      (next !== "button" && this.source !== "blended")
    )
      return;
    this.source = next;
    this.record.sources.push(this.source);
    this.resetInput();
    this.log("switch");
  }

  press(onTarget = this.scanSlot === scanTargetSlot(this.record.rewards)) {
    if (this.paused || this.source !== "button") return;
    this.record.actions++;
    this.log("action");
    if (this.record.game === "garden") {
      if (this.progress === 0) this.plant.reset();
      this.progress = Math.min(1, this.progress + 0.25);
      if (this.progress >= 1) this.reward();
    } else if (onTarget) {
      this.reward();
    }
  }

  tick(
    dt: number,
    observation: number | null,
    onTarget = true,
    cameraStar?: CameraStarFrame | null,
  ) {
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
    if (this.record.game === "garden") {
      const flowering = this.record.rewards > 0 && this.progress === 0;
      const effort = this.source === "button" ? 0 : this.level * 0.14;
      this.plant.update(
        flowering ? 1 : 0.12 + this.progress * 0.88 + effort,
        dt,
      );
    }
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
      this.clearHold();
      return;
    }
    this.level = Math.max(0, Math.min(1, observation));
    measurement.validSeconds += dt;
    measurement.weightedLevel += this.level * dt;
    if (cameraStar) {
      this.holdCameraStar(cameraStar, onTarget);
    } else {
      if (this.level < this.threshold * 0.65) this.released = true;
      const engaged = this.level >= this.threshold && this.released && onTarget;
      this.held = engaged ? this.held + dt : 0;
    }
    if (this.held < holdSeconds) return;
    this.record.actions++;
    this.log("action");
    this.released = false;
    this.clearHold();
    if (this.record.game === "garden" && this.progress === 0)
      this.plant.reset();
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
    const previous = this.record.feedback;
    // Older checkpoints contain only a percentile. Preserve that measured sample
    // set when the underlying distribution cannot be reconstructed.
    if (previous && !previous.buckets) return;
    const buckets = previous?.buckets ?? {};
    buckets[delay] = (buckets[delay] ?? 0) + 1;
    const count = (previous?.count ?? 0) + 1;
    const rank = Math.ceil(count * 0.95);
    let total = 0;
    for (const bucket of Object.keys(buckets)
      .map(Number)
      .sort((a, b) => a - b)) {
      total += buckets[bucket];
      if (total >= rank) {
        this.record.feedback = { count, p95Ms: bucket, buckets };
        return;
      }
    }
  }

  private reward() {
    if (this.record.game === "garden") {
      const garden = this.flowerBed;
      garden.bed.push(garden.next);
      garden.next = seedAt(this.record.rewards + 1);
    }
    this.record.rewards++;
    this.progress = 0;
    this.log("reward");
    this.adjustDifficulty(this.elapsedSinceReward);
    this.elapsedSinceReward = 0;
  }

  private adjustDifficulty(interval: number) {
    if (!this.easy)
      this.threshold = Math.max(
        0.35,
        Math.min(0.75, this.threshold + (interval < 8 ? 0.03 : -0.04)),
      );
  }

  private holdCameraStar(frame: CameraStarFrame, onTarget: boolean) {
    const previous = this.cameraFrameTime;
    if (frame.time === null) {
      this.clearHold();
      return;
    }
    if (frame.time === previous) return; // Several display ticks may show the same camera frame.
    if (
      previous !== null &&
      (frame.time < previous || frame.time - previous > 500)
    )
      this.clearHold();
    this.cameraFrameTime = frame.time;
    const cameraOnly = this.source === "camera";
    // A blended player may relax before or after moving away from the last star.
    this.clearedCatch ||= frame.cleared;
    this.relaxedImagery ||=
      frame.neural !== null && frame.neural < this.threshold * 0.65;
    if (this.clearedCatch && (cameraOnly || this.relaxedImagery))
      this.released = true;
    const ready = this.released && (cameraOnly || this.level >= this.threshold);
    if (!onTarget || !ready) {
      // Brief edge jitter can interrupt a hold without erasing it. Time outside
      // the hoop never adds to the hold, and missing tracking clears it.
      if (
        !ready ||
        !frame.nearTarget ||
        this.insideTime === null ||
        frame.time - this.insideTime > 160
      ) {
        this.held = 0;
        this.insideTime = null;
      }
      return;
    }
    if (previous !== null && this.insideTime === previous) {
      this.held += Math.min(0.25, (frame.time - previous) / 1000);
    }
    this.insideTime = frame.time;
  }

  private clearHold() {
    this.clearedCatch = false;
    this.relaxedImagery = false;
    this.held = 0;
    this.cameraFrameTime = null;
    this.insideTime = null;
  }

  private resetInput() {
    this.clearHold();
    this.level = 0;
    this.released = false;
    this.inputSampleMs = null;
  }
  private log(kind: PracticeRecord["events"][number]["kind"]) {
    this.record.events.push({
      seconds: this.record.elapsed,
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
