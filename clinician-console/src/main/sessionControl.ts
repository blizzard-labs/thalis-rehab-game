import type { SessionInfo } from "./lan/pairing";

export type SessionAction = "start" | "end";

/**
 * The sidecar control command to send for a given source + action, or null
 * when nothing should be sent. Only a "sim" start arms the simulator; end
 * always disarms (harmless if never armed).
 */
export function sessionControlCommand(
  source: SessionInfo["source"],
  action: SessionAction,
): string | null {
  if (action === "end") return JSON.stringify({ cmd: "end_session" });
  return source === "sim" ? JSON.stringify({ cmd: "start_session" }) : null;
}

export function setModeCommand(mode: "band_power_only" | "csp_lda_blend"): string {
  return JSON.stringify({ cmd: "set_mode", mode });
}

// V2-2c vision fusion controls. The sidecar's set_mode command accepts an
// optional fusion_mode / affected_side (leaving the classifier mode untouched).
export function fusionModeCommand(mode: "A" | "B" | "C"): string {
  return JSON.stringify({ cmd: "set_mode", fusion_mode: mode });
}

export function affectedSideCommand(side: "left" | "right"): string {
  return JSON.stringify({ cmd: "set_mode", affected_side: side });
}

export function calibratePoseCommand(): string {
  return JSON.stringify({ cmd: "calibrate_pose" });
}

export function beginRomCalibrationCommand(): string {
  return JSON.stringify({ cmd: "begin_rom_calibration" });
}
