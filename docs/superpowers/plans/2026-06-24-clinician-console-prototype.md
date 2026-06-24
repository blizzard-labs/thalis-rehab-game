# Clinician Console Prototype (V2-0a C3 Live Monitor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop clinician console that auto-spawns the validated Python signal-engine sidecar (mock EEG) and renders a live IntentScore (wireframe screen C3), with headless tests proving the score rises during motor-imagery bursts.

**Architecture:** Electron main supervises the Python sidecar process (`conda run -n eeg python signal-engine/run_ws_server.py`) and hosts a React+Vite renderer. The renderer connects directly to the sidecar's `ws://localhost:8765` 20 Hz JSON stream, parses each frame, stores the latest + a rolling buffer, and renders the C3 Live Monitor. Pure logic (parser, store, supervisor) is decoupled from Electron/React for isolated unit testing; a Node integration test boots the real sidecar.

**Tech Stack:** Electron, TypeScript, React, Vite, Vitest, `ws` (node WebSocket for tests), Node `child_process`/`net`. Python sidecar unchanged (conda env `eeg`).

## Global Constraints

- All paths relative to repo root `/Users/krishna/Projects/thalis-rehab-game`.
- New code lives under `clinician-console/`. Do not modify `signal-engine/` internals.
- Sidecar command is exactly: `conda run -n eeg python signal-engine/run_ws_server.py`, run with `cwd` = repo root (conftest/sys.path rules require repo-root cwd).
- Wire frame (verbatim, do not change): `{"type":"intent_score","intent_score":<number 0..100>,"erd_score":<number|null>,"classifier_score":<number|null>,"is_artifact":<bool>,"mode":"band_power_only","timestamp":<number>}`.
- Sidecar readiness = TCP port 8765 accepts a connection (port-probe is source of truth; baseline calibration delays serving ~2–3 s).
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, renderer reaches the network only via the browser `WebSocket` to localhost.
- Commits: no `Co-Authored-By` trailer (user preference).
- TDD throughout: failing test → minimal impl → green → commit.

---

### Task 1: Scaffold `clinician-console/` package + toolchain

**Files:**
- Create: `clinician-console/package.json`
- Create: `clinician-console/tsconfig.json`
- Create: `clinician-console/vitest.config.ts`
- Create: `clinician-console/.gitignore`
- Create: `clinician-console/src/shared/sanity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` (Vitest, jsdom) and `npm install`ed toolchain that later tasks rely on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "neuroreach-clinician-console",
  "version": "0.0.1",
  "private": true,
  "description": "NeuroReach clinician console (Electron) — V2-0a live monitor prototype",
  "main": "dist-main/main.js",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "build:main": "tsc -p tsconfig.main.json",
    "build:renderer": "vite build",
    "dev:renderer": "vite",
    "dev": "node scripts/dev.mjs"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/ws": "^8.5.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^31.0.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0",
    "ws": "^8.18.0"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "integration"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
});
```

- [ ] **Step 4: Write `src/test-setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Write `.gitignore`**

```gitignore
node_modules/
dist/
dist-main/
*.log
```

- [ ] **Step 6: Write sanity test `src/shared/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install + run**

Run: `cd clinician-console && npm install && npm test`
Expected: install succeeds; 1 test passes.

- [ ] **Step 8: Commit**

```bash
git add clinician-console/package.json clinician-console/package-lock.json clinician-console/tsconfig.json clinician-console/vitest.config.ts clinician-console/.gitignore clinician-console/src/test-setup.ts clinician-console/src/shared/sanity.test.ts
git commit -m "chore: scaffold clinician-console electron+vite+vitest toolchain"
```

---

### Task 2: IntentScore message parser

**Files:**
- Create: `clinician-console/src/scoring/intentScoreMessage.ts`
- Test: `clinician-console/src/scoring/intentScoreMessage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ScoreFrame = { intentScore: number; erdScore: number | null; classifierScore: number | null; isArtifact: boolean; mode: string; timestamp: number }`
  - `type ParseResult = { ok: true; frame: ScoreFrame } | { ok: false; error: string }`
  - `function parseIntentScoreMessage(raw: string): ParseResult`

- [ ] **Step 1: Write failing tests `intentScoreMessage.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseIntentScoreMessage } from "./intentScoreMessage";

const valid = JSON.stringify({
  type: "intent_score",
  intent_score: 72.3,
  erd_score: 68.1,
  classifier_score: null,
  is_artifact: false,
  mode: "band_power_only",
  timestamp: 1719261000.5,
});

describe("parseIntentScoreMessage", () => {
  it("parses a valid frame", () => {
    const r = parseIntentScoreMessage(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.intentScore).toBeCloseTo(72.3);
      expect(r.frame.erdScore).toBeCloseTo(68.1);
      expect(r.frame.classifierScore).toBeNull();
      expect(r.frame.isArtifact).toBe(false);
      expect(r.frame.mode).toBe("band_power_only");
      expect(r.frame.timestamp).toBeCloseTo(1719261000.5);
    }
  });

  it("rejects malformed JSON", () => {
    const r = parseIntentScoreMessage("{not json");
    expect(r.ok).toBe(false);
  });

  it("rejects wrong type (e.g. server error frame)", () => {
    const r = parseIntentScoreMessage(JSON.stringify({ type: "error", message: "x" }));
    expect(r.ok).toBe(false);
  });

  it("rejects missing intent_score", () => {
    const r = parseIntentScoreMessage(JSON.stringify({ type: "intent_score", mode: "band_power_only" }));
    expect(r.ok).toBe(false);
  });

  it("passes through null erd_score and coerces is_artifact", () => {
    const raw = JSON.stringify({
      type: "intent_score",
      intent_score: 10,
      erd_score: null,
      classifier_score: 0.7,
      is_artifact: true,
      mode: "band_power_only",
      timestamp: 1,
    });
    const r = parseIntentScoreMessage(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.erdScore).toBeNull();
      expect(r.frame.classifierScore).toBeCloseTo(0.7);
      expect(r.frame.isArtifact).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd clinician-console && npx vitest run src/scoring/intentScoreMessage.test.ts`
Expected: FAIL — cannot find module `./intentScoreMessage`.

- [ ] **Step 3: Implement `intentScoreMessage.ts`**

```ts
export type ScoreFrame = {
  intentScore: number;
  erdScore: number | null;
  classifierScore: number | null;
  isArtifact: boolean;
  mode: string;
  timestamp: number;
};

export type ParseResult =
  | { ok: true; frame: ScoreFrame }
  | { ok: false; error: string };

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function parseIntentScoreMessage(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "malformed JSON" };
  }
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "not an object" };
  }
  const d = data as Record<string, unknown>;
  if (d.type !== "intent_score") {
    return { ok: false, error: `unexpected type: ${String(d.type)}` };
  }
  if (typeof d.intent_score !== "number" || !Number.isFinite(d.intent_score)) {
    return { ok: false, error: "missing or non-numeric intent_score" };
  }
  return {
    ok: true,
    frame: {
      intentScore: d.intent_score,
      erdScore: numOrNull(d.erd_score),
      classifierScore: numOrNull(d.classifier_score),
      isArtifact: Boolean(d.is_artifact),
      mode: typeof d.mode === "string" ? d.mode : "unknown",
      timestamp: typeof d.timestamp === "number" ? d.timestamp : 0,
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd clinician-console && npx vitest run src/scoring/intentScoreMessage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/scoring/intentScoreMessage.ts clinician-console/src/scoring/intentScoreMessage.test.ts
git commit -m "feat(console): IntentScore wire-frame parser"
```

---

### Task 3: Score store (latest + rolling buffer)

**Files:**
- Create: `clinician-console/src/scoring/scoreStore.ts`
- Test: `clinician-console/src/scoring/scoreStore.test.ts`

**Interfaces:**
- Consumes: `ScoreFrame` from Task 2.
- Produces:
  - `type StoreState = { latest: ScoreFrame | null; buffer: ScoreFrame[]; signalText: "Good" | "Artifact" | "—" }`
  - `class ScoreStore { push(frame: ScoreFrame): void; getState(): StoreState; subscribe(cb: (s: StoreState) => void): () => void }`
  - constructor `new ScoreStore(capacity = 100)`

- [ ] **Step 1: Write failing tests `scoreStore.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ScoreStore } from "./scoreStore";
import type { ScoreFrame } from "./intentScoreMessage";

function frame(intentScore: number, isArtifact = false): ScoreFrame {
  return { intentScore, erdScore: 50, classifierScore: null, isArtifact, mode: "band_power_only", timestamp: 0 };
}

describe("ScoreStore", () => {
  it("starts empty with placeholder signal", () => {
    const s = new ScoreStore();
    expect(s.getState().latest).toBeNull();
    expect(s.getState().signalText).toBe("—");
  });

  it("tracks the latest frame", () => {
    const s = new ScoreStore();
    s.push(frame(10));
    s.push(frame(80));
    expect(s.getState().latest?.intentScore).toBe(80);
  });

  it("caps the rolling buffer and evicts oldest", () => {
    const s = new ScoreStore(3);
    s.push(frame(1));
    s.push(frame(2));
    s.push(frame(3));
    s.push(frame(4));
    const b = s.getState().buffer;
    expect(b.map((f) => f.intentScore)).toEqual([2, 3, 4]);
  });

  it("flips signalText on artifact", () => {
    const s = new ScoreStore();
    s.push(frame(50, false));
    expect(s.getState().signalText).toBe("Good");
    s.push(frame(50, true));
    expect(s.getState().signalText).toBe("Artifact");
  });

  it("notifies subscribers and supports unsubscribe", () => {
    const s = new ScoreStore();
    const cb = vi.fn();
    const off = s.subscribe(cb);
    s.push(frame(5));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    s.push(frame(6));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd clinician-console && npx vitest run src/scoring/scoreStore.test.ts`
Expected: FAIL — cannot find module `./scoreStore`.

- [ ] **Step 3: Implement `scoreStore.ts`**

```ts
import type { ScoreFrame } from "./intentScoreMessage";

export type StoreState = {
  latest: ScoreFrame | null;
  buffer: ScoreFrame[];
  signalText: "Good" | "Artifact" | "—";
};

export class ScoreStore {
  private buffer: ScoreFrame[] = [];
  private subscribers = new Set<(s: StoreState) => void>();

  constructor(private capacity = 100) {}

  push(frame: ScoreFrame): void {
    this.buffer.push(frame);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    const state = this.getState();
    for (const cb of this.subscribers) cb(state);
  }

  getState(): StoreState {
    const latest = this.buffer.length ? this.buffer[this.buffer.length - 1] : null;
    let signalText: StoreState["signalText"] = "—";
    if (latest) signalText = latest.isArtifact ? "Artifact" : "Good";
    return { latest, buffer: [...this.buffer], signalText };
  }

  subscribe(cb: (s: StoreState) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd clinician-console && npx vitest run src/scoring/scoreStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/scoring/scoreStore.ts clinician-console/src/scoring/scoreStore.test.ts
git commit -m "feat(console): score store with rolling buffer + subscriptions"
```

---

### Task 4: WS score client (reconnect + backoff)

**Files:**
- Create: `clinician-console/src/net/scoreClient.ts`
- Test: `clinician-console/src/net/scoreClient.test.ts`

**Interfaces:**
- Consumes: `parseIntentScoreMessage`, `ScoreFrame` (Task 2).
- Produces:
  - `type ConnectionState = "connecting" | "open" | "reconnecting" | "closed"`
  - `type WsLike = { onopen: ((ev: any) => void) | null; onclose: ((ev: any) => void) | null; onmessage: ((ev: { data: any }) => void) | null; onerror: ((ev: any) => void) | null; close(): void }`
  - `type ScoreClientOptions = { url: string; createSocket: (url: string) => WsLike; onFrame: (f: ScoreFrame) => void; onState: (s: ConnectionState) => void; backoffBaseMs?: number; backoffMaxMs?: number; scheduler?: (fn: () => void, ms: number) => void }`
  - `function createScoreClient(opts: ScoreClientOptions): { connect: () => void; stop: () => void; droppedCount: () => number }`

> `createSocket` is injected so tests pass a fake; production passes a wrapper over the browser `WebSocket`. `scheduler` defaults to `setTimeout` but is injectable for deterministic backoff tests.

- [ ] **Step 1: Write failing tests `scoreClient.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { createScoreClient, type WsLike } from "./scoreClient";

function makeFakeSocket(): WsLike & { emitOpen: () => void; emitMessage: (d: string) => void; emitClose: () => void } {
  const s: any = { onopen: null, onclose: null, onmessage: null, onerror: null, close: vi.fn() };
  s.emitOpen = () => s.onopen?.({});
  s.emitMessage = (d: string) => s.onmessage?.({ data: d });
  s.emitClose = () => s.onclose?.({});
  return s;
}

const validFrame = JSON.stringify({
  type: "intent_score", intent_score: 42, erd_score: 10,
  classifier_score: null, is_artifact: false, mode: "band_power_only", timestamp: 1,
});

describe("createScoreClient", () => {
  it("reports open and forwards parsed frames", () => {
    const sock = makeFakeSocket();
    const onFrame = vi.fn();
    const onState = vi.fn();
    const c = createScoreClient({ url: "ws://x", createSocket: () => sock, onFrame, onState });
    c.connect();
    expect(onState).toHaveBeenCalledWith("connecting");
    sock.emitOpen();
    expect(onState).toHaveBeenCalledWith("open");
    sock.emitMessage(validFrame);
    expect(onFrame).toHaveBeenCalledWith(expect.objectContaining({ intentScore: 42 }));
  });

  it("counts malformed frames without crashing", () => {
    const sock = makeFakeSocket();
    const c = createScoreClient({ url: "ws://x", createSocket: () => sock, onFrame: vi.fn(), onState: vi.fn() });
    c.connect();
    sock.emitOpen();
    sock.emitMessage("{bad");
    expect(c.droppedCount()).toBe(1);
  });

  it("reconnects with backoff on close", () => {
    const sockets: ReturnType<typeof makeFakeSocket>[] = [];
    const create = () => { const s = makeFakeSocket(); sockets.push(s); return s; };
    const onState = vi.fn();
    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    const scheduler = (fn: () => void, ms: number) => { scheduled.push({ fn, ms }); };
    const c = createScoreClient({ url: "ws://x", createSocket: create, onFrame: vi.fn(), onState, scheduler, backoffBaseMs: 100 });
    c.connect();
    sockets[0].emitOpen();
    sockets[0].emitClose();
    expect(onState).toHaveBeenCalledWith("reconnecting");
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].ms).toBe(100);
    scheduled[0].fn(); // fire the reconnect
    expect(sockets).toHaveLength(2);
  });

  it("stop() prevents reconnect and closes socket", () => {
    const sock = makeFakeSocket();
    const onState = vi.fn();
    const scheduled: Array<() => void> = [];
    const c = createScoreClient({ url: "ws://x", createSocket: () => sock, onFrame: vi.fn(), onState, scheduler: (fn) => scheduled.push(fn) });
    c.connect();
    sock.emitOpen();
    c.stop();
    expect(sock.close).toHaveBeenCalled();
    sock.emitClose();
    expect(scheduled).toHaveLength(0);
    expect(onState).toHaveBeenLastCalledWith("closed");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd clinician-console && npx vitest run src/net/scoreClient.test.ts`
Expected: FAIL — cannot find module `./scoreClient`.

- [ ] **Step 3: Implement `scoreClient.ts`**

```ts
import { parseIntentScoreMessage, type ScoreFrame } from "../scoring/intentScoreMessage";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export type WsLike = {
  onopen: ((ev: any) => void) | null;
  onclose: ((ev: any) => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
  onerror: ((ev: any) => void) | null;
  close(): void;
};

export type ScoreClientOptions = {
  url: string;
  createSocket: (url: string) => WsLike;
  onFrame: (f: ScoreFrame) => void;
  onState: (s: ConnectionState) => void;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  scheduler?: (fn: () => void, ms: number) => void;
};

export function createScoreClient(opts: ScoreClientOptions) {
  const base = opts.backoffBaseMs ?? 500;
  const max = opts.backoffMaxMs ?? 5000;
  const schedule = opts.scheduler ?? ((fn, ms) => setTimeout(fn, ms));

  let socket: WsLike | null = null;
  let stopped = false;
  let attempt = 0;
  let dropped = 0;

  function open() {
    opts.onState(attempt === 0 ? "connecting" : "reconnecting");
    const s = opts.createSocket(opts.url);
    socket = s;
    s.onopen = () => {
      attempt = 0;
      opts.onState("open");
    };
    s.onmessage = (ev) => {
      const r = parseIntentScoreMessage(String(ev.data));
      if (r.ok) opts.onFrame(r.frame);
      else dropped += 1;
    };
    s.onerror = () => { /* close handler drives reconnect */ };
    s.onclose = () => {
      socket = null;
      if (stopped) return;
      opts.onState("reconnecting");
      const delay = Math.min(base * Math.pow(2, attempt), max);
      attempt += 1;
      schedule(open, delay);
    };
  }

  return {
    connect() {
      stopped = false;
      attempt = 0;
      open();
    },
    stop() {
      stopped = true;
      socket?.close();
      opts.onState("closed");
    },
    droppedCount() {
      return dropped;
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd clinician-console && npx vitest run src/net/scoreClient.test.ts`
Expected: PASS (4 tests).

> Note on the reconnect test: the first `connect()` calls `onState("connecting")` (attempt 0); after close, `onState("reconnecting")` fires and the first backoff uses `attempt=0` → `base*2^0 = base = 100`. Matches the assertion.

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/net/scoreClient.ts clinician-console/src/net/scoreClient.test.ts
git commit -m "feat(console): WS score client with injectable socket + backoff reconnect"
```

---

### Task 5: Sidecar supervisor (Electron main, process lifecycle)

**Files:**
- Create: `clinician-console/src/main/sidecar.ts`
- Test: `clinician-console/src/main/sidecar.test.ts`
- Create: `clinician-console/tsconfig.main.json`

**Interfaces:**
- Consumes: nothing (pure Node, no Electron import).
- Produces:
  - `type SidecarState = "starting" | "ready" | "crashed" | "stopped"`
  - `type SidecarStatus = { state: SidecarState; restarts: number; detail?: string }`
  - `type SidecarOptions = { command: string; args: string[]; cwd: string; readyPort: number; maxRestarts?: number; readyTimeoutMs?: number; probeIntervalMs?: number }`
  - `class SidecarSupervisor extends EventEmitter { constructor(opts: SidecarOptions); start(): void; stop(): Promise<void> }` — emits `"status"` with `SidecarStatus`.

> Readiness via TCP probe of `readyPort`. Tests inject a fake child command (a tiny node script written to a temp dir) so no conda dependency. `maxRestarts` exceeded → emit `crashed`.

- [ ] **Step 1: Write `tsconfig.main.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist-main",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": false
  },
  "include": ["src/main"]
}
```

- [ ] **Step 2: Write failing tests `sidecar.test.ts`**

```ts
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
    sup.on("status", (s: SidecarStatus) => states.push(s.state));
    sup.start();
    // also inject PORT into the child env via options? handled below
    await new Promise<void>((resolve) => {
      sup.on("status", (s: SidecarStatus) => { if (s.state === "ready") resolve(); });
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
```

> The first test needs the child to bind `readyPort`. Make `SidecarOptions` pass `readyPort` to the child via env `PORT` (the supervisor sets `env: { ...process.env, PORT: String(readyPort) }`). Document this in the impl so the real sidecar — which already binds 8765 — simply ignores `PORT`. The real entrypoint hardcodes 8765, matching the default `readyPort: 8765`.

- [ ] **Step 3: Run to verify fail**

Run: `cd clinician-console && npx vitest run src/main/sidecar.test.ts`
Expected: FAIL — cannot find module `./sidecar`.

- [ ] **Step 4: Implement `sidecar.ts`**

```ts
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
    const done = (ok: boolean) => { sock.destroy(); resolve(ok); };
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
      if (this.readyTimer) { clearInterval(this.readyTimer); this.readyTimer = null; }
      this.child = null;
      if (this.stopping) { this.emitStatus("stopped"); return; }
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
        if (this.readyTimer) { clearInterval(this.readyTimer); this.readyTimer = null; }
        this.emitStatus("ready");
      } else if (Date.now() > deadline) {
        if (this.readyTimer) { clearInterval(this.readyTimer); this.readyTimer = null; }
        this.child?.kill("SIGTERM");
      }
    }, this.probeIntervalMs);
  }

  stop(): Promise<void> {
    this.stopping = true;
    if (this.readyTimer) { clearInterval(this.readyTimer); this.readyTimer = null; }
    const child = this.child;
    if (!child) { this.emitStatus("stopped"); return Promise.resolve(); }
    return new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => { if (this.child) this.child.kill("SIGKILL"); }, 3000);
    });
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd clinician-console && npx vitest run src/main/sidecar.test.ts`
Expected: PASS (2 tests). (Allow a few seconds; spawns real node child processes.)

- [ ] **Step 6: Commit**

```bash
git add clinician-console/src/main/sidecar.ts clinician-console/src/main/sidecar.test.ts clinician-console/tsconfig.main.json
git commit -m "feat(console): sidecar supervisor with port-probe readiness + bounded restart"
```

---

### Task 6: Electron main + preload wiring

**Files:**
- Create: `clinician-console/src/main/main.ts`
- Create: `clinician-console/src/main/preload.ts`
- Create: `clinician-console/src/main/config.ts`

**Interfaces:**
- Consumes: `SidecarSupervisor`, `SidecarStatus` (Task 5).
- Produces:
  - `config.ts`: `export const SIDECAR_PORT = 8765; export const SIDECAR_WS_URL = "ws://localhost:8765"; export function sidecarOptions(repoRoot: string): SidecarOptions`
  - preload exposes `window.neuroreach = { onSidecarStatus(cb: (s: SidecarStatus) => void): void; sidecarWsUrl: string }`

> No unit test (Electron glue). Verified via Task 8 dev-run smoke. Keep logic-free: all testable logic already lives in Tasks 2–5.

- [ ] **Step 1: Write `config.ts`**

```ts
import { join } from "node:path";
import type { SidecarOptions } from "./sidecar";

export const SIDECAR_PORT = 8765;
export const SIDECAR_WS_URL = `ws://localhost:${SIDECAR_PORT}`;

export function sidecarOptions(repoRoot: string): SidecarOptions {
  return {
    command: "conda",
    args: ["run", "-n", "eeg", "python", join("signal-engine", "run_ws_server.py")],
    cwd: repoRoot,
    readyPort: SIDECAR_PORT,
    maxRestarts: 3,
    readyTimeoutMs: 30000,
    probeIntervalMs: 500,
  };
}
```

- [ ] **Step 2: Write `preload.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";
import { SIDECAR_WS_URL } from "./config";

contextBridge.exposeInMainWorld("neuroreach", {
  sidecarWsUrl: SIDECAR_WS_URL,
  onSidecarStatus: (cb: (s: unknown) => void) => {
    ipcRenderer.on("sidecar-status", (_e, status) => cb(status));
  },
});
```

- [ ] **Step 3: Write `main.ts`**

```ts
import { app, BrowserWindow, ipcMain } from "electron";
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
```

- [ ] **Step 4: Build main to verify it compiles**

Run: `cd clinician-console && npx tsc -p tsconfig.main.json`
Expected: emits `dist-main/main.js`, `preload.js`, `config.js`, `sidecar.js`; no type errors.

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/main/main.ts clinician-console/src/main/preload.ts clinician-console/src/main/config.ts
git commit -m "feat(console): electron main + preload wiring sidecar status to renderer"
```

---

### Task 7: C3 Live Monitor renderer (React + Vite)

**Files:**
- Create: `clinician-console/index.html`
- Create: `clinician-console/vite.config.ts`
- Create: `clinician-console/src/renderer/main.tsx`
- Create: `clinician-console/src/renderer/useScoreStore.ts`
- Create: `clinician-console/src/renderer/LiveMonitor.tsx`
- Create: `clinician-console/src/renderer/LiveMonitor.css`
- Test: `clinician-console/src/renderer/LiveMonitor.test.tsx`

**Interfaces:**
- Consumes: `ScoreStore` (Task 3), `ScoreFrame` (Task 2).
- Produces:
  - `useScoreStore(store: ScoreStore): StoreState` — React hook subscribing to a store.
  - `<LiveMonitor store={store} connectionState={...} sidecarState={...} />` component.

- [ ] **Step 1: Write failing test `LiveMonitor.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LiveMonitor } from "./LiveMonitor";
import { ScoreStore } from "../scoring/scoreStore";
import type { ScoreFrame } from "../scoring/intentScoreMessage";

function frame(intentScore: number, isArtifact = false): ScoreFrame {
  return { intentScore, erdScore: 61.2, classifierScore: null, isArtifact, mode: "band_power_only", timestamp: 0 };
}

describe("LiveMonitor", () => {
  it("renders the latest intent score", () => {
    const store = new ScoreStore();
    act(() => store.push(frame(64)));
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" />);
    expect(screen.getByTestId("intent-score").textContent).toContain("64");
  });

  it("shows the mode and classifier placeholder when null", () => {
    const store = new ScoreStore();
    act(() => store.push(frame(30)));
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" />);
    expect(screen.getByTestId("mode-tile").textContent).toContain("band_power_only");
    expect(screen.getByTestId("classifier-tile").textContent).toContain("—");
  });

  it("flags artifact in the signal tile", () => {
    const store = new ScoreStore();
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" />);
    act(() => store.push(frame(20, true)));
    expect(screen.getByTestId("signal-tile").textContent).toContain("Artifact");
  });

  it("shows connection state when not open", () => {
    const store = new ScoreStore();
    render(<LiveMonitor store={store} connectionState="reconnecting" sidecarState="starting" />);
    expect(screen.getByTestId("conn-badge").textContent?.toLowerCase()).toContain("reconnect");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd clinician-console && npx vitest run src/renderer/LiveMonitor.test.tsx`
Expected: FAIL — cannot find module `./LiveMonitor`.

- [ ] **Step 3: Write `useScoreStore.ts`**

```ts
import { useSyncExternalStore } from "react";
import type { ScoreStore, StoreState } from "../scoring/scoreStore";

export function useScoreStore(store: ScoreStore): StoreState {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
  );
}
```

- [ ] **Step 4: Write `LiveMonitor.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { ScoreStore } from "../scoring/scoreStore";
import type { ConnectionState } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import { useScoreStore } from "./useScoreStore";
import "./LiveMonitor.css";

type Props = {
  store: ScoreStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
};

function fmt(n: number | null, digits = 1): string {
  return n === null ? "—" : n.toFixed(digits);
}

export function LiveMonitor({ store, connectionState, sidecarState }: Props) {
  const state = useScoreStore(store);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const latest = state.latest;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="lm-root">
      <header className="lm-header">
        <div className="lm-patient">Margaret R. · #0421 · L-hemiparesis</div>
        <div className="lm-rec">● REC {mm}:{ss}</div>
        <div className="lm-conn" data-testid="conn-badge">
          {connectionState === "open" ? "● live" : `○ ${connectionState}`} · sidecar {sidecarState}
        </div>
      </header>

      <div className="lm-tiles">
        <div className="lm-tile" data-testid="signal-tile">
          <span className="lm-tile-label">SIGNAL</span>
          <span className="lm-tile-value">{state.signalText}</span>
        </div>
        <div className="lm-tile" data-testid="mode-tile">
          <span className="lm-tile-label">MODE</span>
          <span className="lm-tile-value">{latest ? latest.mode : "—"}</span>
        </div>
        <div className="lm-tile" data-testid="classifier-tile">
          <span className="lm-tile-label">CLASSIFIER CONF.</span>
          <span className="lm-tile-value">{latest ? fmt(latest.classifierScore, 2) : "—"}</span>
        </div>
        <div className="lm-tile">
          <span className="lm-tile-label">FATIGUE</span>
          <span className="lm-tile-value">Watch</span>
        </div>
      </div>

      <div className="lm-hero">
        <div className="lm-hero-label">INTENT SCORE</div>
        <div className="lm-hero-score" data-testid="intent-score">
          {latest ? Math.round(latest.intentScore) : "--"}
        </div>
        <div className="lm-hero-sub">ERD {latest ? fmt(latest.erdScore) : "—"}%</div>
        <Trace buffer={state.buffer.map((f) => f.intentScore)} />
      </div>

      <footer className="lm-controls">
        <button disabled>Switch mode</button>
        <button disabled>Pause / rest</button>
        <button disabled className="lm-end">End session</button>
        <span className="lm-note">controls disabled — no control channel in this prototype</span>
      </footer>
    </div>
  );
}

function Trace({ buffer }: { buffer: number[] }) {
  if (buffer.length < 2) return <div className="lm-trace" />;
  const w = 600, h = 80, n = buffer.length;
  const pts = buffer
    .map((v, i) => `${(i / (n - 1)) * w},${h - (Math.max(0, Math.min(100, v)) / 100) * h}`)
    .join(" ");
  return (
    <svg className="lm-trace" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#e89a52" strokeWidth="2" />
    </svg>
  );
}
```

- [ ] **Step 5: Write `LiveMonitor.css`**

```css
.lm-root { font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #e6edf6; background: #1b2433; min-height: 100vh; padding: 20px 28px; display: flex; flex-direction: column; gap: 18px; }
.lm-header { display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #aab6c6; }
.lm-rec { color: #e06a5a; font-weight: 600; }
.lm-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.lm-tile { background: #243047; border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.lm-tile-label { font-size: 11px; letter-spacing: 0.06em; color: #8595a8; }
.lm-tile-value { font-size: 20px; font-weight: 600; }
.lm-hero { background: #243047; border-radius: 14px; padding: 24px; text-align: center; }
.lm-hero-label { font-size: 12px; letter-spacing: 0.08em; color: #8595a8; }
.lm-hero-score { font-size: 96px; font-weight: 700; line-height: 1.05; color: #f1b06f; }
.lm-hero-sub { color: #aab6c6; margin-bottom: 12px; }
.lm-trace { width: 100%; height: 80px; }
.lm-controls { display: flex; gap: 12px; align-items: center; margin-top: auto; }
.lm-controls button { padding: 10px 18px; border-radius: 8px; border: 1px solid #3a4760; background: #2b3950; color: #e6edf6; opacity: 0.5; }
.lm-controls .lm-end { background: #7a3b34; border-color: #944b42; }
.lm-note { font-size: 12px; color: #6f7d92; }
```

- [ ] **Step 6: Run to verify pass**

Run: `cd clinician-console && npx vitest run src/renderer/LiveMonitor.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Write `main.tsx`, `index.html`, `vite.config.ts` (dev entry)**

`src/renderer/main.tsx`:
```tsx
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { LiveMonitor } from "./LiveMonitor";
import { ScoreStore } from "../scoring/scoreStore";
import { createScoreClient, type ConnectionState, type WsLike } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";

declare global {
  interface Window {
    neuroreach?: { sidecarWsUrl: string; onSidecarStatus: (cb: (s: { state: SidecarState }) => void) => void };
  }
}

const store = new ScoreStore();
const wsUrl = window.neuroreach?.sidecarWsUrl ?? "ws://localhost:8765";

function App() {
  const [conn, setConn] = useState<ConnectionState>("connecting");
  const [sidecar, setSidecar] = useState<SidecarState>("starting");

  useEffect(() => {
    window.neuroreach?.onSidecarStatus((s) => setSidecar(s.state));
    const client = createScoreClient({
      url: wsUrl,
      createSocket: (url) => new WebSocket(url) as unknown as WsLike,
      onFrame: (f) => store.push(f),
      onState: setConn,
    });
    client.connect();
    return () => client.stop();
  }, []);

  return <LiveMonitor store={store} connectionState={conn} sidecarState={sidecar} />;
}

createRoot(document.getElementById("root")!).render(<App />);
```

`index.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>NeuroReach Console</title></head>
  <body style="margin:0;background:#1b2433">
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist" },
  server: { port: 5273 },
});
```

- [ ] **Step 8: Verify renderer builds**

Run: `cd clinician-console && npx vite build`
Expected: emits `dist/index.html` + assets, no errors.

- [ ] **Step 9: Commit**

```bash
git add clinician-console/index.html clinician-console/vite.config.ts clinician-console/src/renderer/
git commit -m "feat(console): C3 live monitor renderer + WS-driven app shell"
```

---

### Task 8: Dev launcher + manual smoke

**Files:**
- Create: `clinician-console/scripts/dev.mjs`

**Interfaces:**
- Consumes: built main (`tsconfig.main.json`), Vite dev server, Electron binary.
- Produces: `npm run dev` → Vite dev server + Electron window pointed at it, sidecar auto-spawned.

- [ ] **Step 1: Write `scripts/dev.mjs`**

```js
import { spawn } from "node:child_process";
import { createServer } from "vite";
import electronPath from "electron";

const PORT = 5273;
const vite = await createServer({ server: { port: PORT } });
await vite.listen();
const url = `http://localhost:${PORT}`;
console.log(`[dev] vite on ${url}`);

// build the main process bundle once
await new Promise((resolve, reject) => {
  const tsc = spawn("npx", ["tsc", "-p", "tsconfig.main.json"], { stdio: "inherit", shell: true });
  tsc.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("tsc failed"))));
});

const electron = spawn(electronPath, ["dist-main/main.js"], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
electron.on("exit", async () => { await vite.close(); process.exit(0); });
```

- [ ] **Step 2: Manual smoke (requires conda env `eeg` + display)**

Run: `cd clinician-console && npm run dev`
Expected: an Electron window opens; within ~5 s the conn badge shows `● live`, sidecar `ready`; the INTENT SCORE number changes over time and visibly rises during MI bursts (every ~6 s). Close the window.

- [ ] **Step 3: Verify no orphan Python**

Run: `pgrep -f run_ws_server.py || echo "no orphan"`
Expected: `no orphan` after the window is closed.

- [ ] **Step 4: Commit**

```bash
git add clinician-console/scripts/dev.mjs
git commit -m "feat(console): dev launcher (vite + electron + auto sidecar)"
```

---

### Task 9: Live integration test against the real sidecar

**Files:**
- Create: `clinician-console/integration/sidecar.live.test.ts`
- Create: `clinician-console/vitest.integration.config.ts`

**Interfaces:**
- Consumes: the real `signal-engine/run_ws_server.py` via `conda run -n eeg`; `ws` npm package as the client; `parseIntentScoreMessage` (Task 2).
- Produces: `npm run test:integration` proving the live sidecar → WS path emits a rising score from mock EEG.

- [ ] **Step 1: Write `vitest.integration.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["integration/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
```

- [ ] **Step 2: Write `integration/sidecar.live.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { join } from "node:path";
import WebSocket from "ws";
import { parseIntentScoreMessage, type ScoreFrame } from "../src/scoring/intentScoreMessage";

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
      s.once("error", () => { s.destroy(); Date.now() > deadline ? reject(new Error("port timeout")) : setTimeout(tick, 300); });
    };
    tick();
  });
}

const hasConda = condaAvailable();
const d = hasConda ? describe : describe.skip;

let sidecar: ChildProcess;

d("live sidecar (mock EEG)", () => {
  beforeAll(async () => {
    sidecar = spawn("conda", ["run", "-n", "eeg", "python", join("signal-engine", "run_ws_server.py")], {
      cwd: REPO_ROOT, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"],
    });
    sidecar.stdout?.on("data", (b) => process.stdout.write(`[sidecar] ${b}`));
    sidecar.stderr?.on("data", (b) => process.stderr.write(`[sidecar] ${b}`));
    await waitPort(PORT, 30000);
  }, 60000);

  afterAll(async () => {
    if (sidecar && !sidecar.killed) {
      await new Promise<void>((resolve) => { sidecar.once("exit", () => resolve()); sidecar.kill("SIGTERM"); });
    }
  });

  it("streams well-formed, non-flat intent scores from mock EEG", async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const frames: ScoreFrame[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); resolve(); }, 15000);
      ws.on("message", (data) => {
        const r = parseIntentScoreMessage(data.toString());
        if (r.ok) frames.push(r.frame);
      });
      ws.on("error", (e) => { clearTimeout(timer); reject(e); });
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
});
```

- [ ] **Step 3: Run the integration test**

Run: `cd clinician-console && npm run test:integration`
Expected: PASS (boots sidecar, collects >100 frames over 15 s, asserts spread/floor). If `eeg` env is missing the suite SKIPS with no failure.

- [ ] **Step 4: Run the full unit suite to confirm nothing regressed**

Run: `cd clinician-console && npm test`
Expected: all unit suites PASS (Tasks 1–7).

- [ ] **Step 5: Verify no orphan after integration**

Run: `pgrep -f run_ws_server.py || echo "no orphan"`
Expected: `no orphan`.

- [ ] **Step 6: Commit**

```bash
git add clinician-console/integration/sidecar.live.test.ts clinician-console/vitest.integration.config.ts
git commit -m "test(console): live integration — mock EEG drives a rising intent score"
```

---

### Task 10: Update project docs

**Files:**
- Modify: `docs/todos.md`

**Interfaces:**
- Consumes: nothing.
- Produces: updated status reflecting the V2-0a prototype.

- [ ] **Step 1: Append a V2-0a status block to `docs/todos.md`**

Add under the v2 section (exact wording, adjust to match existing structure):

```markdown
### V2-0a — Clinician console prototype (C3 live monitor) — DONE

- Electron app `clinician-console/` spawns + supervises the Python sidecar
  (`conda run -n eeg python signal-engine/run_ws_server.py`, mock EEG).
- React+Vite renderer shows the live IntentScore (wireframe C3): status tiles,
  big score, ERD sub-score, rolling trace, connection/sidecar badges.
- Tests: Vitest units (parser, store, ws client, supervisor, monitor) + a Node
  integration test booting the real sidecar and asserting a non-flat score from
  virtual-MI bursts.

Gaps / next (V2-0b+): LAN HTTPS/WSS server + session-code pairing; control
channel (pause/rest/end wired to engine); PyInstaller-frozen sidecar; console
screens C1/C2/C4/C5; WebRTC patient camera; electron-builder installer.
```

- [ ] **Step 2: Commit**

```bash
git add docs/todos.md
git commit -m "docs: record V2-0a clinician console prototype status"
```

---

## Self-Review Notes

- **Spec coverage:** §2/§4 architecture → Tasks 5–7; §9.5 WSS score client + parser ported from C# → Tasks 2–4; §13 unit + live tests → Tasks 2–4,7,9; §15 V2-0 spike (sidecar + render live score) → Tasks 5–9. Deferred spec items (LAN server, pairing, WebRTC, freeze, installer) explicitly out of scope per design §2.
- **Placeholder scan:** all steps contain concrete code/commands; no TBDs.
- **Type consistency:** `ScoreFrame`, `StoreState`, `ConnectionState`, `WsLike`, `SidecarStatus`/`SidecarState`, `sidecarOptions` names match across Tasks 2–9.
- **Known acceptable trade-off:** the sidecar `start()` blocks and calibrates baseline (~2–3 s) before serving; both supervisor (port-probe, 30 s timeout) and integration test (`waitPort` 30 s) tolerate this.
```
