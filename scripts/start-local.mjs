import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = path.join(root, "patient-web");
const children = new Set();
let stopping = false;

function start(command, args, cwd = root) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
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
      if (process.platform === "win32")
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      /* Already exited. */
    }
  }
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

await import("../patient-web/scripts/prepare-camera.mjs");
await import("../patient-web/scripts/package-controller.mjs");
// Vite owns companion startup/recovery for both this launcher and direct web dev.
const vite = start(
  process.execPath,
  [
    path.join(web, "node_modules", "vite", "bin", "vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  web,
);
vite.once("error", (error) => {
  console.error(error.message);
  stop(1);
});
vite.once("exit", (code) => stop(code ?? 0));
