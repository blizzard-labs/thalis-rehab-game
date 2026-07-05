import { describe, it, expect } from "vitest";
import { sessionControlCommand, setModeCommand } from "./sessionControl";

describe("setModeCommand", () => {
  it("builds a set_mode command frame", () => {
    expect(setModeCommand("csp_lda_blend")).toBe(
      JSON.stringify({ cmd: "set_mode", mode: "csp_lda_blend" }),
    );
    expect(setModeCommand("band_power_only")).toBe(
      JSON.stringify({ cmd: "set_mode", mode: "band_power_only" }),
    );
  });
});

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
