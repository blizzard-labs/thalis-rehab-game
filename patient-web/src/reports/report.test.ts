import { expect, it } from "vitest";
import { PracticeRound } from "../practice/session";
import { progressReport, sessionReport, type Visit } from "./report";
import { csvReport } from "./export";
import type { Interval } from "./measurements";

const reader = {
  name: "Test participant",
  assessments: [
    { date: "2026-09-15", fma: 0, arat: 0 },
    { date: "2026-10-26", fma: 12, arat: 8 },
    { date: "2027-01-01", fma: 16, arat: 9 },
  ],
};
function visit(date: string, seconds: number, mean: number): Visit {
  const record = new PracticeRound("stars", "camera", true).record;
  record.started = date + "T12:00:00Z";
  record.elapsed = seconds;
  record.arm = "left";
  record.actions = 2;
  record.rewards = 1;
  record.measurements.camera = {
    validSeconds: seconds,
    missingSeconds: 0,
    weightedLevel: seconds * 0.4,
  };
  const bins: Interval[] = [];
  for (let t = 0; t < seconds; t += 30) {
    const n = Math.min(30, seconds - t);
    bins.push({
      index: t / 30,
      source: "camera",
      seconds: n,
      above: 0,
      metrics: {
        elbow: { seconds: n, integral: n * mean, peak: mean },
        input: { seconds: n, integral: 40 * n, peak: 40 },
      },
    });
  }
  record.intervals = bins;
  record.events = [
    { kind: "action", source: "camera", seconds: 0 },
    { kind: "action", source: "camera", seconds: seconds / 2 },
    { kind: "reward", source: "camera", seconds },
  ];
  return { record, status: "complete" };
}
it("reconciles interval totals, never copies a future assessment, and recovers event trends for legacy sessions", () => {
  const v = visit("2026-10-12", 60, 85),
    r = sessionReport(v, reader);
  expect(
    r.sections.find((s) => s.title === "Practice timeline")?.table?.rows,
  ).toEqual([
    ["0:00–0:30", "1", "0", "40"],
    ["0:30–1:00", "1", "1", "40"],
  ]);
  expect(
    r.sections.find((s) => s.title === "Latest recorded assessment")?.table
      ?.rows,
  ).toEqual([["0", "0"]]);
  expect(
    r.sections.find((s) => s.title === "Movement over time")?.plot?.values,
  ).toEqual([85, 85]);
  delete v.record.intervals;
  v.record.events.shift();
  const legacy = sessionReport(v, reader);
  expect(
    legacy.sections.find((s) => s.title === "Practice timeline")?.table
      ?.rows[0][1],
  ).toBe("—");
  expect(legacy.sections.some((s) => s.title === "Movement over time")).toBe(
    false,
  );
});
it("weights weekly measures by observed time, excludes incomplete and synthetic visits, and preserves gaps", () => {
  const a = visit("2026-10-05", 30, 50),
    b = visit("2026-10-06", 90, 100),
    c = visit("2026-10-26", 30, 95);
  const s = visit("2026-10-15", 30, 170);
  s.record.usedSyntheticEeg = true;
  const interrupted = visit("2026-10-26", 30, 180);
  interrupted.status = "interrupted";
  const r = progressReport(
    [a, b, c, s, interrupted],
    reader,
    4,
    undefined,
    "2026-11-01",
  );
  expect(r.stats[0][1]).toBe("3");
  expect(r.summary).toContain("1 completed synthetic");
  expect(
    r.sections.find((x) => x.title === "Sensor trends")?.plot?.values,
  ).toEqual([87.5, null, null, 95]);
  expect(
    r.sections.find((x) => x.title === "Clinician-entered assessments")?.table
      ?.rows,
  ).toEqual([
    ["2026-09-15 · prior", "0", "0"],
    ["2026-10-26", "12", "8"],
  ]);
  expect(
    progressReport([a], reader, 4, "fruit", "2026-11-01").stats[0][1],
  ).toBe("0");
});
it("escapes user text, distinguishes no visits and avoids invented zero measurements", () => {
  const v = visit("2026-10-12", 30, 90);
  v.note = '=HYPERLINK("a,b")\nsecond line';
  expect(csvReport(sessionReport(v, reader))).toContain(
    `"'=HYPERLINK(""a,b"")\nsecond line"`,
  );
  const r = progressReport([], { name: "Guest" }, 4, undefined, "2026-10-12");
  expect(r.sections.some((s) => s.title === "Sensor trends")).toBe(false);
  expect(r.sections[0].table?.rows).toHaveLength(4);
});

it("embeds a four-week comparison as of the visit and keeps missing weeks empty", () => {
  const first = visit("2026-10-05", 30, 77),
    last = visit("2026-10-26", 60, 100);
  const future = visit("2026-11-02", 60, 160);
  const result = sessionReport(last, reader, [first, last, future]);
  const trend = result.sections.find(
    (section) => section.title === "Four-week trend",
  )!;
  expect(trend.tiles?.find((t) => t.label.includes("Elbow"))?.values).toEqual([
    77,
    null,
    null,
    100,
  ]);
  expect(trend.table?.columns).not.toContain("11-02");
});
