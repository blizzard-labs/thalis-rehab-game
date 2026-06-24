import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";

export type SidecarState = "starting" | "ready" | "crashed" | "stopped";
export type SidecarStatus = { state: SidecarState; restarts: number; detail?: string };

export type SidecarOptions = {
  command: string;
  args: string[];
  cwd: string;
  readyPort: number;
  maxRestarts?: number;
  readyTimeoutMs?: number;
  probeIntervalMs?: number;
};

function probePort(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

export class SidecarSupervisor extends EventEmitter {
  private child: ChildProcess | null = null;
  private restarts = 0;
  private stopping = false;
  private readyTimer: NodeJS.Timeout | null = null;
  private readonly maxRestarts: number;
  private readonly readyTimeoutMs: number;
  private readonly probeIntervalMs: number;

  constructor(private opts: SidecarOptions) {
    super();
    this.maxRestarts = opts.maxRestarts ?? 3;
    this.readyTimeoutMs = opts.readyTimeoutMs ?? 20000;
    this.probeIntervalMs = opts.probeIntervalMs ?? 250;
  }

  private emitStatus(state: SidecarState, detail?: string) {
    this.emit("status", { state, restarts: this.restarts, detail } as SidecarStatus);
  }

  start(): void {
    this.stopping = false;
    this.spawnOnce();
  }

  private spawnOnce(): void {
    this.emitStatus("starting");
    const child = spawn(this.opts.command, this.opts.args, {
      cwd: this.opts.cwd,
      env: { ...process.env, PORT: String(this.opts.readyPort) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout?.on("data", (b) => process.stdout.write(`[sidecar] ${b}`));
    child.stderr?.on("data", (b) => process.stderr.write(`[sidecar] ${b}`));

    child.on("exit", (code) => {
      if (this.readyTimer) {
        clearInterval(this.readyTimer);
        this.readyTimer = null;
      }
      this.child = null;
      if (this.stopping) {
        this.emitStatus("stopped");
        return;
      }
      if (this.restarts >= this.maxRestarts) {
        this.emitStatus("crashed", `exited code ${code} after ${this.restarts} restarts`);
        return;
      }
      this.restarts += 1;
      this.spawnOnce();
    });

    this.waitForReady();
  }

  private waitForReady(): void {
    const deadline = Date.now() + this.readyTimeoutMs;
    this.readyTimer = setInterval(async () => {
      if (this.stopping || !this.child) return;
      if (await probePort(this.opts.readyPort, this.probeIntervalMs)) {
        if (this.readyTimer) {
          clearInterval(this.readyTimer);
          this.readyTimer = null;
        }
        this.emitStatus("ready");
      } else if (Date.now() > deadline) {
        if (this.readyTimer) {
          clearInterval(this.readyTimer);
          this.readyTimer = null;
        }
        this.child?.kill("SIGTERM");
      }
    }, this.probeIntervalMs);
  }

  stop(): Promise<void> {
    this.stopping = true;
    if (this.readyTimer) {
      clearInterval(this.readyTimer);
      this.readyTimer = null;
    }
    const child = this.child;
    if (!child) {
      this.emitStatus("stopped");
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => {
        if (this.child) this.child.kill("SIGKILL");
      }, 3000);
    });
  }
}
