import type { Source } from "../practice/session";

export const intervalSeconds = 30;
export const metricLabels = {
  input: ["Game input", "%"],
  reach: ["Calibrated reach", "%"],
  shoulder: ["Upper-arm elevation", "°"],
  elbow: ["Elbow opening", "°"],
  tilt: ["Frontal trunk tilt", "°"],
  muC3: ["C3 mu ERD", "%"],
  muCz: ["Cz mu ERD", "%"],
  muC4: ["C4 mu ERD", "%"],
  classifier: ["Imagery probability", "%"],
} as const;
export type Metric = keyof typeof metricLabels;
export type Readings = Partial<Record<Metric, number>>;
export type Measure = { seconds: number; integral: number; peak: number };
export type Interval = {
  index: number;
  source: Source;
  seconds: number;
  above: number;
  metrics: Partial<Record<Metric, Measure>>;
};

// Weight by observed play time. A repeated display frame is not a new EEG trial.
export function recordInterval(
  rows: Interval[],
  start: number,
  end: number,
  source: Source,
  threshold: number,
  readings: Readings,
) {
  while (start < end) {
    const index = Math.floor(start / intervalSeconds);
    const until = Math.min(end, (index + 1) * intervalSeconds);
    const seconds = until - start;
    let row = rows[rows.length - 1];
    if (!row || row.index !== index || row.source !== source) {
      row = { index, source, seconds: 0, above: 0, metrics: {} };
      rows.push(row);
    }
    row.seconds += seconds;
    if (readings.input !== undefined && readings.input >= threshold * 100)
      row.above += seconds;
    for (const metric of Object.keys(readings) as Metric[]) {
      const value = readings[metric];
      if (value === undefined || !Number.isFinite(value)) continue;
      const measure = row.metrics[metric] ?? {
        seconds: 0,
        integral: 0,
        peak: value,
      };
      measure.seconds += seconds;
      measure.integral += value * seconds;
      measure.peak = Math.max(measure.peak, value);
      row.metrics[metric] = measure;
    }
    start = until;
  }
}
