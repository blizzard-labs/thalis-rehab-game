import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = path.join(root, "patient-web");
const children = new Set();
let stopping = false;

function start(command, args, cwd = root) {
  const child = spawn(command, args, { cwd, stdio:"inherit", detached:process.platform !== "win32" });
  children.add(child);
  child.once("close", () => children.delete(child));
  return child;
}
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    try {
      if (process.platform === "win32") spawn("taskkill", ["/PID",String(child.pid),"/T","/F"]);
      else process.kill(-child.pid,"SIGTERM");
    } catch { /* Already exited. */ }
  }
}
process.on("SIGINT",()=>stop(0));
process.on("SIGTERM",()=>stop(0));

await import("../patient-web/scripts/prepare-camera.mjs");
let companionRunning = false;
try {
  const response = await fetch("http://127.0.0.1:8766/api/health",{signal:AbortSignal.timeout(500)});
  companionRunning = response.ok && (await response.json()).app === "NeuroReach";
} catch { /* No companion listening yet. */ }

if (!companionRunning) {
  const python = process.env.NEUROREACH_PYTHON;
  const args = python ? ["signal-engine/local_companion.py"] :
    ["run","--no-capture-output","-n","eeg","python","signal-engine/local_companion.py"];
  const companion = start(python || process.env.CONDA_EXE || "conda", args);
  const hint = () => {
    if (!stopping) console.warn("EEG and staff records need the Python companion. Button and camera games remain available. See README.md for setup.");
  };
  companion.once("error",hint);
  companion.once("exit",code=>{ if(code) hint(); });
}
const vite = start(process.execPath, [path.join(web,"node_modules","vite","bin","vite.js"),"--host","127.0.0.1","--port","5173","--strictPort"],web);
vite.once("error",error=>{console.error(error.message);stop(1);});
vite.once("exit",code=>stop(code ?? 0));
