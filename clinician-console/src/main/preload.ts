import { contextBridge, ipcRenderer } from "electron";

// The preload runs sandboxed, so it must NOT import ./config (which pulls in
// node:fs / crypto / selfsigned via cert.ts and would throw at load, wiping the
// whole bridge). Keep this in sync with SIDECAR_WS_URL / SIDECAR_PORT in config.ts.
const SIDECAR_WS_URL = "ws://localhost:8765";

contextBridge.exposeInMainWorld("neuroreach", {
  sidecarWsUrl: SIDECAR_WS_URL,
  onSidecarStatus: (cb: (s: unknown) => void) => {
    ipcRenderer.on("sidecar-status", (_e, status) => cb(status));
  },
  open: (session: unknown) => ipcRenderer.invoke("session:open", session),
  begin: (source: unknown) => ipcRenderer.invoke("session:begin", source),
  end: () => ipcRenderer.invoke("session:end"),
  setMode: (mode: unknown) => ipcRenderer.invoke("session:set-mode", mode),
  setFusionMode: (mode: unknown) => ipcRenderer.invoke("session:set-fusion-mode", mode),
  setAffectedSide: (side: unknown) => ipcRenderer.invoke("session:set-affected-side", side),
  calibratePose: () => ipcRenderer.invoke("session:calibrate-pose"),
  beginRomCalibration: () => ipcRenderer.invoke("session:begin-rom-calibration"),
  onPatientConnected: (cb: () => void) => ipcRenderer.on("patient-connected", () => cb()),
  onPatientDisconnected: (cb: () => void) => ipcRenderer.on("patient-disconnected", () => cb()),
  onPatientCheckpoint: (cb: (checkpoint: string) => void) =>
    ipcRenderer.on("patient-checkpoint", (_e, checkpoint) => cb(checkpoint)),
  sendClinicianCheckpoint: (checkpoint: unknown) =>
    ipcRenderer.invoke("session:clinician-checkpoint", checkpoint),
  getCheckpointState: () => ipcRenderer.invoke("session:checkpoint-state"),
});
