import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { join } from "node:path";
import WebSocket from "ws";
import { parseIntentScoreMessage } from "../src/scoring/intentScoreMessage";
import { PlantGrowthModel } from "../src/garden/PlantGrowthModel";
import { parseIntentScoreMessage as parseConsole } from "../../clinician-console/src/scoring/intentScoreMessage";

const REPO_ROOT = join(__dirname, "..", "..");
const PORT = 8765;

function condaAvailable(): boolean {
  try { execSync("conda env list", { stdio: "ignore" }); return true; } catch { return false; }
}

function waitPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = connect({ port, host: "127.0.0.1" });
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => {
        s.destroy();
        Date.now() > deadline ? reject(new Error("port timeout")) : setTimeout(tick, 300);
      });
    };
    tick();
  });
}

function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try { process.kill(-child.pid, signal); }
  catch { try { child.kill(signal); } catch { /* gone */ } }
}

const d = condaAvailable() ? describe : describe.skip;
let sidecar: ChildProcess;

d("patient-web live sidecar (mock EEG)", () => {
  beforeAll(async () => {
    sidecar = spawn("conda", ["run", "-n", "eeg", "python", join("signal-engine", "run_ws_server.py")], {
      cwd: REPO_ROOT, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"], detached: true,
    });
    sidecar.stdout?.on("data", (b) => process.stdout.write(`[sidecar] ${b}`));
    sidecar.stderr?.on("data", (b) => process.stderr.write(`[sidecar] ${b}`));
    const earlyExit = new Promise<never>((_, reject) => {
      sidecar.once("exit", (code) =>
        reject(new Error(`sidecar exited during boot (code ${code}) — is port ${PORT} in use?`)));
    });
    await Promise.race([waitPort(PORT, 30000), earlyExit]);
  }, 60000);

  afterAll(async () => {
    if (sidecar && sidecar.exitCode === null) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => { killTree(sidecar, "SIGKILL"); resolve(); }, 5000);
        sidecar.once("exit", () => { clearTimeout(t); resolve(); });
        killTree(sidecar, "SIGTERM");
      });
    }
  });

  it("mock MI grows the garden over ~15 s of live frames", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.once("open", () => ws.send(JSON.stringify({cmd:"start_session"})));
    const scores: number[] = [];
    const plant = new PlantGrowthModel();
    let maxGrowth = 0;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); resolve(); }, 15000);
      ws.on("message", (data) => {
        const r = parseIntentScoreMessage(data.toString());
        if (!r.ok) return;
        scores.push(r.frame.intentScore);
        plant.update(r.frame.intentScore / 100, 0.05); // 20 Hz → dt 50 ms
        if (plant.currentGrowth > maxGrowth) maxGrowth = plant.currentGrowth;
      });
      ws.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    ws.close();

    expect(scores.length).toBeGreaterThan(100);
    for (const s of scores) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(100); }
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeGreaterThan(15);          // virtual MI moves the score
    expect(Math.max(...scores)).toBeGreaterThan(40); // a burst clears a real floor
    expect(maxGrowth).toBeGreaterThan(0.3);      // closed loop: the plant actually grew
  }, 30000);

  it("patient and console parsers agree frame-for-frame (shared contract)", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.once("open", () => ws.send(JSON.stringify({cmd:"start_session"})));
    const mine: number[] = [];
    const theirs: number[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); resolve(); }, 4000);
      ws.on("message", (data) => {
        const raw = data.toString();
        const a = parseIntentScoreMessage(raw);
        const b = parseConsole(raw);
        if (a.ok) mine.push(a.frame.intentScore);
        if (b.ok) theirs.push(b.frame.intentScore);
      });
      ws.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    ws.close();
    expect(mine.length).toBeGreaterThan(20);
    expect(mine).toEqual(theirs); // identical interpretation of every frame
  }, 30000);
});
