import { describe, expect, it } from "vitest";
import { PracticeRound } from "./session";

describe("practice inputs", () => {
  it("requires the switch to select the lit star and ignores actions during rest", () => {
    const r = new PracticeRound("stars", "button", true);
    r.press(); expect(r.record.rewards).toBe(0);
    for (let i=0; i<10; i++) r.tick(0.25, null);
    r.press(); expect(r.record.rewards).toBe(1);
    r.setPaused(true); r.press(); r.tick(.25, null);
    expect(r.record.actions).toBe(2); expect(r.record.elapsed).toBe(2.5);
  });
  it("requires fresh effort and a release between measured trials", () => {
    const r = new PracticeRound("stars", "camera", true);
    for (const level of [1,null,1,1,1,1]) r.tick(.25, level);
    expect(r.record.rewards).toBe(1);
    r.tick(.25,0); r.tick(.25,1); r.tick(.25,1);
    expect(r.record.rewards).toBe(2);
    r.switchToButton(); r.tick(.25,1);
    expect(r.record.sources).toEqual(["camera","button"]);
  });
});
