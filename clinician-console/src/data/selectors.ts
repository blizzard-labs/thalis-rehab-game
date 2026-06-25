import type { Patient } from "./types";

// Derived metrics for the C4 history/trends screen. Pure functions over a
// patient's weekly trend series — no side effects, easy to unit-test.

export type Kpi = { value: number; delta: number };

export type Kpis = {
  classifierAccuracy: Kpi; // %
  peakErdC3: Kpi; // negative %
  elbowRom: Kpi; // degrees
  gameLevel: number;
};

function kpi(series: number[]): Kpi {
  if (series.length === 0) return { value: 0, delta: 0 };
  const value = series[series.length - 1];
  const delta = value - series[0];
  return { value, delta };
}

export function computeKpis(p: Patient): Kpis {
  return {
    classifierAccuracy: kpi(p.trends.map((t) => t.classifierAccuracy)),
    peakErdC3: kpi(p.trends.map((t) => t.peakErdC3)),
    elbowRom: kpi(p.trends.map((t) => t.elbowRom)),
    gameLevel: p.gameLevel,
  };
}
