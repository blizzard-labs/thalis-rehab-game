import { describe, it, expect } from "vitest";
import { sessionControlCommand } from "./sessionControl";

describe("sessionControlCommand", () => {
  it("arms the simulator when starting a sim session", () => {
    expect(sessionControlCommand("sim", "start")).toBe(JSON.stringify({ cmd: "start_session" }));
  });
  it("does not arm when starting a live session", () => {
    expect(sessionControlCommand("live", "start")).toBeNull();
  });
  it("always disarms on end (sim or live)", () => {
    expect(sessionControlCommand("sim", "end")).toBe(JSON.stringify({ cmd: "end_session" }));
    expect(sessionControlCommand("live", "end")).toBe(JSON.stringify({ cmd: "end_session" }));
  });
});
