import { describe, it, expect } from "vitest";
import { config } from "../config";

describe("scaffold sanity", () => {
  it("exposes a ws url and a patient profile", () => {
    expect(config.wsUrl).toBe("ws://localhost:8765");
    expect(config.patient.firstName.length).toBeGreaterThan(0);
    expect(["left", "right"]).toContain(config.patient.affectedSide);
  });
});
