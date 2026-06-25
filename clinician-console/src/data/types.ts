// Domain types for the clinician console (specsv2 §11 data model, wireframe
// C1/C4/C5). This prototype keeps everything in memory — no persistence — but
// the shapes mirror the SQLite tables a real sidecar would expose over REST,
// so swapping the in-memory store for a REST client later is mechanical.

export type AffectedSide = "Left" | "Right";
export type SessionMode = "Covert MI" | "Blended" | "Active";
export type Trend = "improving" | "steady" | "check-in";
export type ContactQuality = "good" | "check" | "poor";
export type ReachAxis = "Horizontal" | "Vertical";

export type MiniGame =
  | "Garden Grow"
  | "Reach & Collect"
  | "River Rowing"
  | "Star Catcher";

export const ALL_MINI_GAMES: MiniGame[] = [
  "Garden Grow",
  "Reach & Collect",
  "River Rowing",
  "Star Catcher",
];

export type ClinicalScore = {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Fugl-Meyer Upper Extremity, 0–66. */
  fmaUe: number;
  /** Action Research Arm Test, 0–57. */
  arat: number;
};

/** One weekly proxy-metric sample for the C4 trends chart. */
export type TrendPoint = {
  /** ISO date of the week. */
  date: string;
  classifierAccuracy: number; // 0–100 %
  peakErdC3: number; // negative % (more negative = stronger ERD)
  elbowRom: number; // degrees
};

export type Protocol = {
  mode: SessionMode;
  /** EEG weight 0–1; movement weight is (1 - eegWeight). */
  eegWeight: number;
  reachAxis: ReachAxis;
  trialsPerBlock: number;
  imageryWindowSec: number;
  restIntervalSec: string; // e.g. "2-3"
  blocksPerSession: number;
  layoutSide: AffectedSide; // hemianopia layout side
  enabledGames: MiniGame[];
  /** Set when calibration auto-switched the mode (specsv2 §6.5 quality gate). */
  autoSwitchedNote?: string;
};

export type Patient = {
  id: string; // e.g. "#0421"
  name: string;
  sex: "F" | "M";
  age: number;
  diagnosis: string; // e.g. "L-hemiparesis"
  onsetMonths: number;
  affectedSide: AffectedSide;
  mode: SessionMode;
  enrolled: string; // ISO date
  sessionCount: number;
  contraindications: string; // "" → "no contraindications"
  lastSession: string; // human label e.g. "Today", "2d ago"
  trend: Trend;
  gameLevel: number; // current adaptive difficulty level (specsv2 §9.4)
  scores: ClinicalScore[];
  trends: TrendPoint[];
  protocol: Protocol;
};
