import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { SidecarSupervisor, type SidecarStatus } from "./sidecar";
import { sidecarOptions } from "./config";

// repo root is two levels up from clinician-console/dist-main
const REPO_ROOT = join(__dirname, "..", "..");
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

let win: BrowserWindow | null = null;
let supervisor: SidecarSupervisor | null = null;

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
});

app.on("before-quit", async (e) => {
  if (supervisor) {
    e.preventDefault();
    const s = supervisor;
    supervisor = null;
    await s.stop();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
