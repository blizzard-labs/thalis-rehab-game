import { describe, it, expect } from "vitest";
import {
  sessionControlCommand,
  setModeCommand,
  fusionModeCommand,
  affectedSideCommand,
  calibratePoseCommand,
  beginRomCalibrationCommand,
} from "./sessionControl";

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

describe("fusion command builders", () => {
  it("builds a fusion_mode set_mode command", () => {
    expect(JSON.parse(fusionModeCommand("B"))).toEqual({ cmd: "set_mode", fusion_mode: "B" });
  });
  it("builds an affected_side set_mode command", () => {
    expect(JSON.parse(affectedSideCommand("left"))).toEqual({ cmd: "set_mode", affected_side: "left" });
  });
  it("builds a calibrate_pose command", () => {
    expect(JSON.parse(calibratePoseCommand())).toEqual({ cmd: "calibrate_pose" });
  });
  it("builds a begin_rom_calibration command", () => {
    expect(JSON.parse(beginRomCalibrationCommand())).toEqual({ cmd: "begin_rom_calibration" });
  });
});
