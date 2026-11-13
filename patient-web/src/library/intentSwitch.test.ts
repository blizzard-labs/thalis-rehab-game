import { describe, it, expect } from "vitest";
import { IntentSwitch } from "./intentSwitch";
describe("external game intent switch", () => {
  it("requires a fresh rest and sustained effort, and fires only once until released", () => {
    const gate = new IntentSwitch();
    for (let t = 0; t < 500; t += 50) expect(gate.update(0.9, t)).toBe(false);
    for (let t = 500; t <= 700; t += 50)
      expect(gate.update(0.1, t)).toBe(false);
    expect(gate.armed).toBe(true);
    for (let t = 750; t < 1000; t += 50)
      expect(gate.update(0.9, t)).toBe(false);
    expect(gate.update(0.9, 1000)).toBe(true);
    for (let t = 1050; t < 1600; t += 50)
      expect(gate.update(0.9, t)).toBe(false);
    expect(gate.armed).toBe(false);
  });
  it("does not count repeated samples or carry an effort across missing signal", () => {
    const gate = new IntentSwitch();
    for (let t = 0; t <= 250; t += 50) gate.update(0.1, t);
    gate.update(0.9, 300);
    for (let i = 0; i < 100; i++) expect(gate.update(0.9, 300)).toBe(false);
    expect(gate.update(null, null)).toBe(false);
    for (let t = 400; t <= 900; t += 50)
      expect(gate.update(0.9, t)).toBe(false);
    expect(gate.armed).toBe(false);
  });
  it("releases after pauses, long sample gaps and non-finite input", () => {
    for (const bad of [NaN, Infinity, null]) {
      const gate = new IntentSwitch();
      for (let t = 0; t <= 250; t += 50) gate.update(0.1, t);
      expect(gate.update(bad, 300)).toBe(false);
      expect(gate.armed).toBe(false);
    }
    const gate = new IntentSwitch();
    for (let t = 0; t <= 250; t += 50) gate.update(0.1, t);
    expect(gate.update(0.9, 2000)).toBe(false);
    expect(gate.armed).toBe(false);
  });
});
