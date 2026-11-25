import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// Only the development host launches processes. The public web build has no
// process-launch endpoint. An already-running companion is never taken over.
export function superviseCompanion({
  root = projectRoot,
  url = "http://127.0.0.1:8766/api/health",
  command = process.env.NEUROREACH_PYTHON || process.env.CONDA_EXE || "conda",
  args = process.env.NEUROREACH_PYTHON
    ? [path.join(root, "signal-engine/local_companion.py")]
    : [
        "run",
        "--no-capture-output",
        "-n",
        "eeg",
        "python",
        path.join(root, "signal-engine/local_companion.py"),
      ],
  interval = 3000,
  startupTimeout = 10000,
  retryDelay = 30000,
  log = console,
  stdio = "inherit",
} = {}) {
  let child = null;
  let stopped = false;
  let checking = false;
  let retryAt = 0;
  let timer;
  let warned = false;
  let firstReady = false;

  async function health() {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(600) });
      // An occupied port must not trigger another process or kill its owner.
      if (!response.ok) return "occupied";
      return (await response.json()).app === "NeuroReach"
        ? "ready"
        : "occupied";
    } catch (error) {
      if (error instanceof SyntaxError) return "occupied";
      return "missing";
    }
  }
  function warn(message) {
    if (!warned && !stopped) log.warn(message);
    warned = true;
  }
  async function check() {
    if (stopped || checking) return;
    checking = true;
    try {
      const state = await health();
      if (stopped) return;
      if (state === "ready") {
        warned = false;
        firstReady = true;
        return;
      }
      if (state === "occupied") {
        warn(
          "NeuroReach companion port is occupied by another service. Staff access cannot connect; check port 8766.",
        );
        return;
      }
      if (child || Date.now() < retryAt) return;
      firstReady = false;
      log.info("Starting the NeuroReach companion for staff access and EEG…");
      const launched = spawn(command, args, {
        cwd: root,
        stdio,
        detached: process.platform !== "win32",
      });
      child = launched;
      const failed = () => {
        if (child !== launched) return;
        child = null;
        retryAt = Date.now() + (firstReady ? interval : retryDelay);
        warn(
          "NeuroReach companion stopped. It will retry automatically. Check the eeg Python environment, or set NEUROREACH_PYTHON to its Python executable. Independent games remain available.",
        );
      };
      launched.once("error", failed);
      launched.once("exit", failed);
      const deadline = Date.now() + startupTimeout;
      while (!stopped && child === launched && Date.now() < deadline) {
        if ((await health()) === "ready") {
          firstReady = true;
          warned = false;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!stopped && child === launched)
        warn(
          "The NeuroReach companion is still starting. Staff access will reconnect when it is ready.",
        );
    } finally {
      checking = false;
    }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    process.removeListener("exit", stop);
    const owned = child;
    child = null;
    if (!owned?.pid || owned.exitCode !== null) return;
    try {
      if (process.platform === "win32")
        spawn("taskkill", ["/PID", String(owned.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      else process.kill(-owned.pid, "SIGTERM");
    } catch {
      /* The owned process already exited. */
    }
  }
  process.once("exit", stop);
  const ready = check();
  timer = setInterval(() => void check(), interval);
  timer.unref();
  return { ready, stop };
}
