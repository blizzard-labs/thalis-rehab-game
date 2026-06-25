import { describe, it, expect } from "vitest";
import { computeKpis } from "./selectors";
import { PatientStore } from "./store";

const margaret = new PatientStore().get("#0421")!;

describe("computeKpis", () => {
  it("reports the latest classifier accuracy with delta over the window", () => {
    const k = computeKpis(margaret);
    expect(k.classifierAccuracy.value).toBe(73); // latest trend point
    expect(k.classifierAccuracy.delta).toBe(8); // 73 - 65 (first point)
  });

  it("reports latest peak ERD (C3) and elbow ROM with delta", () => {
    const k = computeKpis(margaret);
    expect(k.peakErdC3.value).toBe(-41);
    expect(k.elbowRom.value).toBe(82);
    expect(k.elbowRom.delta).toBe(11); // 82 - 71
  });

  it("passes through the adaptive game level", () => {
    expect(computeKpis(margaret).gameLevel).toBe(7);
  });

  it("handles a single trend point (zero deltas)", () => {
    const robert = new PatientStore().get("#0299")!;
    robert.trends = [robert.trends[0]];
    const k = computeKpis(robert);
    expect(k.classifierAccuracy.delta).toBe(0);
  });
});
