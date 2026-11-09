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
