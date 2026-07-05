import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import WebSocket from "ws";
import { SidecarSupervisor, type SidecarStatus } from "./sidecar";
import { sidecarOptions, lanServerOptions, SIDECAR_WS_URL } from "./config";
import { LanServer } from "./lan/lanServer";
import type { RelaySocket } from "./lan/scoreRelay";
import type { SessionInfo } from "./lan/pairing";
import { sessionControlCommand, setModeCommand } from "./sessionControl";

// repo root is two levels up from clinician-console/dist-main
const REPO_ROOT = join(__dirname, "..", "..");
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

let win: BrowserWindow | null = null;
let supervisor: SidecarSupervisor | null = null;
let lan: LanServer | null = null;

let controlSocket: RelaySocket | null = null;
let controlReady = false;
const controlOutbox: string[] = [];

function nodeSidecarSocket(url: string): RelaySocket {
  const ws = new WebSocket(url);
  const s: RelaySocket = {
    onmessage: null,
    onclose: null,
    onopen: null,
    send: (raw: string) => ws.send(raw),
    close: () => ws.close(),
  };
  ws.on("open", () => s.onopen?.());
  ws.on("message", (d) => s.onmessage?.({ data: d.toString() }));
  ws.on("close", () => s.onclose?.());
  ws.on("error", () => {});
  return s;
}

// Persistent control socket to the sidecar: arms/disarms the dev-mode session
// simulator on Start/End Session. Independent of the patient score relay.
function openControlSocket() {
  const s = nodeSidecarSocket(SIDECAR_WS_URL);
  controlSocket = s;
  controlReady = false;
  s.onopen = () => {
    controlReady = true;
    while (controlOutbox.length) sendControl(controlOutbox.shift()!);
  };
  s.onclose = () => {
    controlReady = false;
    controlSocket = null;
    setTimeout(openControlSocket, 1000); // reconnect like the relay
  };
}

function sendControl(raw: string) {
  // Queue until the socket is open; the onopen handler drains the outbox.
  if (!controlReady || !controlSocket) {
    controlOutbox.push(raw);
    return;
  }
  controlSocket.send?.(raw);
}

function startLan() {
  lan = new LanServer({
    ...lanServerOptions(REPO_ROOT, app.getPath("userData")),
    createSidecarSocket: nodeSidecarSocket,
  });
  lan.on("patient-connected", () => win?.webContents.send("patient-connected"));
  lan.on("patient-disconnected", () => win?.webContents.send("patient-disconnected"));
  lan.start();
  openControlSocket();

  // Decoupled session lifecycle: open() mints the pairing code only; begin()
  // arms the dev simulator (sim source only); end() disarms + closes pairing.
  ipcMain.handle("session:open", (_e, session: SessionInfo) => lan!.startSession(session));
  ipcMain.handle("session:begin", (_e, source: SessionInfo["source"]) => {
    const cmd = sessionControlCommand(source, "start");
    if (cmd) sendControl(cmd);
  });
  ipcMain.handle("session:end", () => {
    sendControl(sessionControlCommand("sim", "end")!); // end always disarms
    return lan!.endSession();
  });
  ipcMain.handle("session:set-mode", (_e, mode: "band_power_only" | "csp_lda_blend") => {
    sendControl(setModeCommand(mode));
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#1b2433",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(join(__dirname, "..", "dist", "index.html"));
}

function startSidecar() {
  supervisor = new SidecarSupervisor(sidecarOptions(REPO_ROOT));
  supervisor.on("status", (s: SidecarStatus) => win?.webContents.send("sidecar-status", s));
  supervisor.start();
}

app.whenReady().then(() => {
  createWindow();
  startSidecar();
  startLan();
});

app.on("before-quit", async (e) => {
  if (supervisor) {
    e.preventDefault();
    const s = supervisor;
    supervisor = null;
    controlSocket?.close();
    controlSocket = null;
    await lan?.stop();
    lan = null;
    await s.stop();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
