import { describe, expect, it } from "vitest";
import { PracticeRound } from "./session";

describe("practice inputs", () => {
  it("requires the switch to select the lit star and ignores actions during rest", () => {
    const r = new PracticeRound("stars", "button", true);
    r.press();
    expect(r.record.rewards).toBe(0);
    for (let i = 0; i < 10; i++) r.tick(0.25, null);
    r.press();
    expect(r.record.rewards).toBe(1);
    r.setPaused(true);
    r.press();
    r.tick(0.25, null);
    expect(r.record.actions).toBe(2);
    expect(r.record.elapsed).toBe(2.5);
  });
  it("requires fresh effort and a release between measured trials", () => {
    const r = new PracticeRound("stars", "camera", true);
    for (const level of [0, 1, null, 1, 1, 1, 1]) r.tick(0.25, level);
    expect(r.record.rewards).toBe(1);
    r.tick(0.25, 0);
    r.tick(0.25, 1);
    r.tick(0.25, 1);
    expect(r.record.rewards).toBe(2);
    r.switchInput("button");
    r.tick(0.25, 1);
    expect(r.record.sources).toEqual(["camera", "button"]);
  });
});

it("pauses for the planned rest before finishing the second clinic block", () => {
  const r = new PracticeRound("garden", "button", true, "clinic");
  r.record.elapsed = 539.9;
  r.tick(0.2, null);
  expect(r.paused).toBe(true);
  r.setPaused(false);
  r.tick(0.2, null);
  expect(r.paused).toBe(false);
  r.record.elapsed = 1079.9;
  r.tick(0.2, null);
  expect(r.scheduleFinished).toBe(true);
});

it("restores a scheduled rest, the active source, and timing samples after reloading", () => {
  const r = new PracticeRound("garden", "blended", false, "clinic");
  r.record.elapsed = 539.9;
  r.inputSampleMs = 100;
  r.recordPaint(170);
  r.switchInput("eeg");
  r.tick(0.2, 0);
  const resumed = PracticeRound.restore(structuredClone(r.record), false);
  expect(resumed.paused).toBe(true);
  expect(resumed.source).toBe("eeg");
  resumed.setPaused(false);
  resumed.tick(0.2, 0);
  expect(resumed.paused).toBe(false);
  resumed.inputSampleMs = 200;
  resumed.recordPaint(280);
  expect(resumed.record.feedback).toMatchObject({ count: 2, p95Ms: 80 });
});

it("retains the measured latency summary of a legacy checkpoint", () => {
  const r = new PracticeRound("stars", "eeg", true);
  r.record.feedback = { count: 36, p95Ms: 77 };
  const resumed = PracticeRound.restore(r.record, true);
  resumed.inputSampleMs = 100;
  resumed.recordPaint(190);
  expect(resumed.record.feedback).toEqual({ count: 36, p95Ms: 77 });
});

it("grows the chosen flower from four actions and keeps the bed across a rest or reload", () => {
  const round = new PracticeRound("garden", "button", true);
  round.chooseSeed("Sunflower");
  round.press();
  round.chooseSeed("Poppy");
  round.setPaused(true);
  round.press();
  round.setPaused(false);
  for (let i = 0; i < 3; i++) round.press();
  expect(round.flowerBed.bed).toEqual(["Sunflower"]);
  const resumed = PracticeRound.restore(structuredClone(round.record), true);
  resumed.chooseSeed("Poppy");
  for (let i = 0; i < 4; i++) resumed.press();
  expect(resumed.flowerBed.bed).toEqual(["Sunflower", "Poppy"]);
  expect(resumed.record.rewards).toBe(2);
});

it("tracks off-target camera effort without awarding a star until the hoop overlaps", () => {
  const round = new PracticeRound("stars", "blended", true);
  round.tick(0.2, 0, false);
  for (let i = 0; i < 5; i++) round.tick(0.2, 0.8, false);
  expect(round.record.rewards).toBe(0);
  for (let i = 0; i < 2; i++) round.tick(0.2, 0.8, true);
  expect(round.record.rewards).toBe(1);
  expect(round.record.measurements.blended!.validSeconds).toBeCloseTo(1.6);
});

it("credits a first camera hold without a trip to rest, and requires leaving the caught star for the next one", () => {
  const round = new PracticeRound("stars", "camera", true);
  let time = 1000;
  const update = (cleared: boolean, onTarget = true, nearTarget = onTarget) => {
    time += 100;
    round.tick(0.1, 1, onTarget, { time, cleared, nearTarget, neural: null });
  };
  update(true);
  update(true);
  for (let i = 0; i < 10; i++)
    round.tick(0.1, 1, true, {
      time,
      cleared: true,
      nearTarget: true,
      neural: null,
    });
  expect(round.record.rewards).toBe(0);
  update(true, false, true); // brief jitter just outside the hoop
  expect(round.catchProgress).toBeGreaterThan(0);
  for (let i = 0; i < 4; i++) update(true);
  expect(round.record.rewards).toBe(1);
  for (let i = 0; i < 12; i++) update(false);
  expect(round.record.rewards).toBe(1);
  update(true, false);
  for (let i = 0; i < 6; i++) update(true);
  expect(round.record.rewards).toBe(2);
});

it("drops a partial hold on missing frames, and waits for fresh EEG release in blended play", () => {
  const round = new PracticeRound("stars", "blended", true);
  let time = 1000;
  const update = (neural: number | null) => {
    time += 100;
    round.tick(0.1, neural === null ? null : 0.4 + 0.6 * neural, true, {
      time,
      cleared: true,
      nearTarget: true,
      neural,
    });
  };
  for (let i = 0; i < 8; i++) update(1);
  expect(round.record.rewards).toBe(0);
  update(0);
  update(1);
  expect(round.catchProgress).toBeGreaterThan(0);
  update(null);
  expect(round.catchProgress).toBe(0);
  for (let i = 0; i < 5; i++) update(1);
  expect(round.record.rewards).toBe(1);
  for (let i = 0; i < 9; i++) update(1);
  expect(round.record.rewards).toBe(1);
});

it("accepts EEG release and camera departure in either order between blended catches", () => {
  for (const relaxFirst of [true, false]) {
    const round = new PracticeRound("stars", "blended", true);
    let time = 0;
    const sample = (neural: number, cleared: boolean, onTarget = true) => {
      time += 100;
      round.tick(0.1, 0.4 + 0.6 * neural, onTarget, {
        time,
        cleared,
        nearTarget: onTarget,
        neural,
      });
    };
    sample(0, true);
    for (let i = 0; i < 4; i++) sample(1, true);
    expect(round.record.rewards).toBe(1);
    sample(relaxFirst ? 0 : 1, !relaxFirst, false);
    sample(relaxFirst ? 1 : 0, relaxFirst, false);
    for (let i = 0; i < 5; i++) sample(1, true);
    expect(round.record.rewards).toBe(2);
  }
});

it("keeps every chosen bloom beyond six and resumes planting in an older partial bed", () => {
  const round = new PracticeRound("garden", "button", true);
  for (let i = 0; i < 14; i++) {
    round.chooseSeed(i % 2 ? "Sunflower" : "Poppy");
    for (let water = 0; water < 4; water++) round.press();
  }
  expect(round.flowerBed.bed).toEqual(
    Array.from({ length: 14 }, (_, i) => (i % 2 ? "Sunflower" : "Poppy")),
  );
  const older = structuredClone(round.record);
  older.garden!.bed = older.garden!.bed.slice(-6);
  const resumed = PracticeRound.restore(older, true);
  resumed.chooseSeed("Aster");
  for (let water = 0; water < 4; water++) resumed.press();
  expect(resumed.record.rewards).toBe(15);
  expect(resumed.flowerBed.bed).toEqual([
    ...round.flowerBed.bed.slice(-6),
    "Aster",
  ]);
});
