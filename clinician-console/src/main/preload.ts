import { contextBridge, ipcRenderer } from "electron";
import { SIDECAR_WS_URL } from "./config";

contextBridge.exposeInMainWorld("neuroreach", {
  sidecarWsUrl: SIDECAR_WS_URL,
  onSidecarStatus: (cb: (s: unknown) => void) => {
    ipcRenderer.on("sidecar-status", (_e, status) => cb(status));
  },
  startSession: (session: unknown) => ipcRenderer.invoke("start-session", session),
  endSession: () => ipcRenderer.invoke("end-session"),
  onPatientConnected: (cb: () => void) => ipcRenderer.on("patient-connected", () => cb()),
  onPatientDisconnected: (cb: () => void) => ipcRenderer.on("patient-disconnected", () => cb()),
});
