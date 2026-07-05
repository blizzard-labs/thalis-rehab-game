import { contextBridge, ipcRenderer } from "electron";
import { SIDECAR_WS_URL } from "./config";

contextBridge.exposeInMainWorld("neuroreach", {
  sidecarWsUrl: SIDECAR_WS_URL,
  onSidecarStatus: (cb: (s: unknown) => void) => {
    ipcRenderer.on("sidecar-status", (_e, status) => cb(status));
  },
  open: (session: unknown) => ipcRenderer.invoke("session:open", session),
  begin: (source: unknown) => ipcRenderer.invoke("session:begin", source),
  end: () => ipcRenderer.invoke("session:end"),
  setMode: (mode: unknown) => ipcRenderer.invoke("session:set-mode", mode),
  onPatientConnected: (cb: () => void) => ipcRenderer.on("patient-connected", () => cb()),
  onPatientDisconnected: (cb: () => void) => ipcRenderer.on("patient-disconnected", () => cb()),
});
