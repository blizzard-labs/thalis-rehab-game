import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { join } from "node:path";
import WebSocket from "ws";
import { parseIntentScoreMessage, type ScoreFrame } from "../src/scoring/intentScoreMessage";
import { parseEegQualityMessage, type EegQualityFrame } from "../src/scoring/eegQualityMessage";

const REPO_ROOT = join(__dirname, "..", "..");
const PORT = 8765;

function condaAvailable(): boolean {
  try {
    execSync("conda env list", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function waitPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = connect({ port, host: "127.0.0.1" });
      s.once("connect", () => {
        s.destroy();
        resolve();
      });
      s.once("error", () => {
        s.destroy();
        Date.now() > deadline ? reject(new Error("port timeout")) : setTimeout(tick, 300);
      });
    };
    tick();
  });
}

const hasConda = condaAvailable();
const d = hasConda ? describe : describe.skip;

let sidecar: ChildProcess;

// `conda run` forks the python server as a grandchild; kill the whole process
// group so no orphan keeps holding the port after the suite ends.
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

d("live sidecar (mock EEG)", () => {
  beforeAll(async () => {
    sidecar = spawn("conda", ["run", "-n", "eeg", "python", join("signal-engine", "run_ws_server.py")], {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    sidecar.stdout?.on("data", (b) => process.stdout.write(`[sidecar] ${b}`));
    sidecar.stderr?.on("data", (b) => process.stderr.write(`[sidecar] ${b}`));

    // Fail fast if our own sidecar dies during boot (e.g. port already held by a
    // stale server) — otherwise waitPort could silently connect to that orphan.
    const earlyExit = new Promise<never>((_, reject) => {
      sidecar.once("exit", (code) =>
        reject(new Error(`sidecar exited during boot (code ${code}) — is port ${PORT} already in use?`)),
      );
    });
    await Promise.race([waitPort(PORT, 30000), earlyExit]);
  }, 60000);

  afterAll(async () => {
    if (sidecar && sidecar.exitCode === null) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          killTree(sidecar, "SIGKILL");
          resolve();
        }, 5000);
        sidecar.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
        killTree(sidecar, "SIGTERM");
      });
    }
  });

  it("streams well-formed, non-flat intent scores from mock EEG", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.once("open", () => ws.send(JSON.stringify({cmd:"start_session"})));
    const frames: ScoreFrame[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        resolve();
      }, 15000);
      ws.on("message", (data) => {
        const r = parseIntentScoreMessage(data.toString());
        if (r.ok) frames.push(r.frame);
      });
      ws.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    ws.close();

    expect(frames.length).toBeGreaterThan(100); // ~20 Hz * 15 s
    for (const f of frames) {
      expect(f.mode).toBe("band_power_only");
      expect(f.classifierScore).toBeNull();
      expect(f.intentScore).toBeGreaterThanOrEqual(0);
      expect(f.intentScore).toBeLessThanOrEqual(100);
    }
    const scores = frames.map((f) => f.intentScore);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeGreaterThan(15); // virtual-MI bursts move the score
    expect(Math.max(...scores)).toBeGreaterThan(40); // a burst clears a real floor
  });

  it("broadcasts eeg_quality frames (C2 setup) on the same socket", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const quality: EegQualityFrame[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5000);
      ws.on("message", (data) => {
        const q = parseEegQualityMessage(data.toString());
        if (q.ok) quality.push(q.frame);
      });
      ws.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    ws.close();

    expect(quality.length).toBeGreaterThan(5); // ~5 Hz * 5 s
    const f = quality[quality.length - 1];
    expect(f.channels.length).toBe(8); // full Unicorn montage
    expect(f.channels.every((c) => ["good", "check", "poor"].includes(c.quality))).toBe(true);
    expect((f.trace.C3?.length ?? 0)).toBeGreaterThan(0); // MI trace present
  });
});
