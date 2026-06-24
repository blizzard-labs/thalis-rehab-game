import { describe, it, expect, afterEach } from "vitest";
import { SidecarSupervisor, type SidecarStatus } from "./sidecar";
import { createServer, type Server } from "node:net";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let listener: Server | null = null;
const supervisors: SidecarSupervisor[] = [];

afterEach(async () => {
  for (const s of supervisors.splice(0)) await s.stop();
  if (listener) { await new Promise((r) => listener!.close(() => r(null))); listener = null; }
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as any).port;
      srv.close(() => resolve(p));
    });
  });
}

// Writes a node script that opens a TCP server on PORT (env), simulating the sidecar.
function writeFakeSidecar(): string {
  const dir = mkdtempSync(join(tmpdir(), "sidecar-"));
  const file = join(dir, "fake.js");
  writeFileSync(file, `
    const net = require("net");
    const port = Number(process.env.PORT);
    const s = net.createServer(() => {});
    s.listen(port, "127.0.0.1", () => console.log("listening"));
    process.on("SIGTERM", () => process.exit(0));
  `);
  return file;
}

describe("SidecarSupervisor", () => {
  it("emits starting then ready once the port is open", async () => {
    const port = await freePort();
    const fake = writeFakeSidecar();
    const sup = new SidecarSupervisor({
      command: process.execPath, args: [fake], cwd: process.cwd(),
      readyPort: port, readyTimeoutMs: 5000, probeIntervalMs: 50,
    });
    supervisors.push(sup);
    const states: string[] = [];
    await new Promise<void>((resolve) => {
      sup.on("status", (s: SidecarStatus) => {
        states.push(s.state);
        if (s.state === "ready") resolve();
      });
      sup.start();
    });
    expect(states[0]).toBe("starting");
    expect(states).toContain("ready");
  });

  it("restarts up to maxRestarts then reports crashed", async () => {
    const port = await freePort();
    const dir = mkdtempSync(join(tmpdir(), "crash-"));
    const file = join(dir, "crash.js");
    writeFileSync(file, `process.exit(1);`);
    const sup = new SidecarSupervisor({
      command: process.execPath, args: [file], cwd: process.cwd(),
      readyPort: port, maxRestarts: 2, readyTimeoutMs: 500, probeIntervalMs: 50,
    });
    supervisors.push(sup);
    const crashed = await new Promise<SidecarStatus>((resolve) => {
      sup.on("status", (s) => { if (s.state === "crashed") resolve(s); });
      sup.start();
    });
    expect(crashed.restarts).toBe(2);
  });
});
