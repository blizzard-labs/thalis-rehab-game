import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import WebSocket from "ws";
import { LanServer } from "../src/main/lan/lanServer";
import type { RelaySocket } from "../src/main/lan/scoreRelay";
import { loadOrCreateCert } from "../src/main/lan/cert";
import type { SessionInfo } from "../src/main/lan/pairing";

const REPO_ROOT = join(__dirname, "..", "..");
const SIDECAR_PORT = 8765;
const SESSION: SessionInfo = { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only", source: "sim" };

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
  try {
    process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* already gone */ }
  }
}

// A Node ws adapter matching the RelaySocket shape the relay expects.
function nodeRelaySocket(url: string): RelaySocket {
  const ws = new WebSocket(url);
  const s: RelaySocket = { onmessage: null, onclose: null, onopen: null, close: () => ws.close() };
  ws.on("open", () => s.onopen?.());
  ws.on("message", (d) => s.onmessage?.({ data: d.toString() }));
  ws.on("close", () => s.onclose?.());
  ws.on("error", () => {});
  return s;
}

const hasConda = condaAvailable();
const d = hasConda ? describe : describe.skip;

let sidecar: ChildProcess;
let server: LanServer;
let dir: string;

d("LAN spine (real mock-EEG sidecar → LanServer → paired WSS client)", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "nr-lan-live-"));
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "dist", "index.html"), "<!doctype html><title>patient</title>");

    sidecar = spawn("conda", ["run", "-n", "eeg", "python", join("signal-engine", "run_ws_server.py")], {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    sidecar.stderr?.on("data", (b) => process.stderr.write(`[sidecar] ${b}`));
    const earlyExit = new Promise<never>((_, reject) => {
      sidecar.once("exit", (code) =>
        reject(new Error(`sidecar exited during boot (code ${code}) — is port ${SIDECAR_PORT} in use?`)),
      );
    });
    await Promise.race([waitPort(SIDECAR_PORT, 30000), earlyExit]);

    server = new LanServer({
      host: "127.0.0.1",
      port: 0,
      patientDistDir: join(dir, "dist"),
      cert: loadOrCreateCert(dir),
      sidecarWsUrl: `ws://127.0.0.1:${SIDECAR_PORT}`,
      createSidecarSocket: nodeRelaySocket,
    });
    await server.start();
  }, 60000);

  afterAll(async () => {
    await server?.stop();
    if (sidecar && sidecar.exitCode === null) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => { killTree(sidecar, "SIGKILL"); resolve(); }, 5000);
        sidecar.once("exit", () => { clearTimeout(t); resolve(); });
        killTree(sidecar, "SIGTERM");
      });
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("pairs a WSS client and streams real intent_score frames, never eeg_quality", async () => {
    const { code } = server.startSession(SESSION);
    const port = (server as any).port as number;
    const ws = new WebSocket(`wss://127.0.0.1:${port}`, {
      rejectUnauthorized: false,
      origin: server.origin(),
    });
    const scores: number[] = [];
    let leakedQuality = false;
    let paired = false;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 12000);
      ws.on("open", () => ws.send(JSON.stringify({ type: "pair", code })));
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "paired") paired = true;
        else if (msg.type === "intent_score") scores.push(msg.intent_score);
        else if (msg.type === "eeg_quality") leakedQuality = true;
      });
      ws.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    ws.close();

    expect(paired).toBe(true);
    expect(scores.length).toBeGreaterThan(100); // ~20 Hz over ~12 s
    expect(leakedQuality).toBe(false); // eeg_quality must never reach the patient
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeGreaterThan(15); // virtual-MI bursts move the fanned-out score
  }, 30000);

  it("rejects a second claimant for the same code", async () => {
    const port = (server as any).port as number;
    // First claimant already bound from the prior test's session; mint fresh + claim.
    const { code } = server.startSession(SESSION);
    const first = new WebSocket(`wss://127.0.0.1:${port}`, { rejectUnauthorized: false, origin: server.origin() });
    await new Promise<void>((resolve) => {
      first.on("open", () => first.send(JSON.stringify({ type: "pair", code })));
      first.on("message", (d) => { if (JSON.parse(d.toString()).type === "paired") resolve(); });
    });

    const second = new WebSocket(`wss://127.0.0.1:${port}`, { rejectUnauthorized: false, origin: server.origin() });
    const reason = await new Promise<string>((resolve) => {
      second.on("open", () => second.send(JSON.stringify({ type: "pair", code })));
      second.on("message", (d) => {
        const m = JSON.parse(d.toString());
        if (m.type === "error") resolve(m.reason);
      });
    });
    first.close();
    second.close();
    expect(reason).toBe("session_taken");
  }, 30000);
});
