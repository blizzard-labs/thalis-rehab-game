# Patient-Web Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `patient-web/`, a zero-install React web Garden Grow game that closes the EEG neurofeedback loop live on the existing mock-EEG sidecar and is validated alongside the clinician console.

**Architecture:** Vite + React + TS app mirroring `clinician-console/` conventions. A WS client subscribes to the unchanged 20 Hz `intent_score` stream on `ws://localhost:8765`; a ported pure `PlantGrowthModel` converts score → flower growth; scenes flow Welcome → Calibration → Garden → Summary via a `useState` router. Pure logic (parser, store, model, stats, client) is fully unit-tested; the headline test boots the real sidecar and proves mock MI grows the plant.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Vitest 2 + jsdom + @testing-library/react, `ws` (node, integration only).

## Global Constraints

- Node v24; package manager npm. Match `clinician-console/package.json` dep versions exactly (React 18.3, Vite 5.4, Vitest 2.0, jsdom 24, @testing-library/react 16, ws 8.18, typescript 5.5).
- WS wire format is **unchanged**: `{"type":"intent_score","intent_score":num,"erd_score":num|null,"classifier_score":num|null,"is_artifact":bool,"mode":str,"timestamp":num}`. Do not modify the signal-engine.
- WS endpoint: `ws://localhost:8765`. No LAN/HTTPS/WSS/pairing this round.
- Patient channel carries **no PHI**, no raw % / letter grade in patient-facing copy (spec §9.3, §11).
- No PixiJS, no react-router, no WebRTC, no persistence. Do not touch `game-client/` or `signal-engine/`.
- Pure-logic constants are **verbatim** ports: grow 0.8/s, wilt 0.3/s, bloom-on 0.75, bloom-off 0.60, dwell 3.0 s.
- Run all commands from `patient-web/` unless noted. Conda env for the sidecar is `eeg`.
- TDD: failing test first, minimal impl, green, commit. No `Co-Authored-By` trailer in commits (user preference).

---

### Task 0: Scaffold `patient-web/`

**Files:**
- Create: `patient-web/package.json`, `patient-web/tsconfig.json`, `patient-web/vite.config.ts`, `patient-web/vitest.config.ts`, `patient-web/vitest.integration.config.ts`, `patient-web/index.html`, `patient-web/src/main.tsx`, `patient-web/src/App.tsx`, `patient-web/src/config.ts`, `patient-web/src/test-setup.ts`, `patient-web/src/shared/sanity.test.ts`

**Interfaces:**
- Produces: `config.ts` exports `const config: { wsUrl: string; patient: { firstName: string; affectedSide: "left" | "right" }; engagementThreshold: number }`. `App.tsx` exports default `App` React component (placeholder for now).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "neuroreach-patient-web",
  "version": "0.0.1",
  "private": true,
  "description": "NeuroReach patient web client — V2-1 Garden Grow prototype",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/ws": "^8.5.0",
    "@vitejs/plugin-react": "^4.3.0",
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

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "integration"]
}
```

- [ ] **Step 3: Create `vite.config.ts`, `vitest.config.ts`, `vitest.integration.config.ts`, `index.html`, `src/test-setup.ts`**

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

`vitest.integration.config.ts`:

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

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NeuroReach</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Create `src/config.ts`, `src/App.tsx`, `src/main.tsx`, `src/shared/sanity.test.ts`**

`src/config.ts`:

```ts
export type AffectedSide = "left" | "right";

export const config = {
  wsUrl: "ws://localhost:8765",
  patient: { firstName: "Margaret", affectedSide: "left" as AffectedSide },
  /** Intent score (0–100) at/above which the patient counts as "engaged". */
  engagementThreshold: 55,
};
```

`src/App.tsx`:

```tsx
export default function App() {
  return <div>NeuroReach</div>;
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/shared/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { config } from "../config";

describe("scaffold sanity", () => {
  it("exposes a ws url and a patient profile", () => {
    expect(config.wsUrl).toBe("ws://localhost:8765");
    expect(config.patient.firstName.length).toBeGreaterThan(0);
    expect(["left", "right"]).toContain(config.patient.affectedSide);
  });
});
```

- [ ] **Step 5: Install + verify**

Run: `cd patient-web && npm install && npm run test && npm run typecheck`
Expected: 1 test passes; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add patient-web/package.json patient-web/package-lock.json patient-web/tsconfig.json patient-web/vite.config.ts patient-web/vitest.config.ts patient-web/vitest.integration.config.ts patient-web/index.html patient-web/src
git commit -m "feat(patient-web): scaffold Vite+React+TS prototype with sanity test"
```

---

### Task 1: `intentScoreMessage.ts` — score frame parser

**Files:**
- Create: `patient-web/src/scoring/intentScoreMessage.ts`, `patient-web/src/scoring/intentScoreMessage.test.ts`

**Interfaces:**
- Produces: `type ScoreFrame = { intentScore: number; erdScore: number|null; classifierScore: number|null; isArtifact: boolean; mode: string; timestamp: number }`; `type ParseResult = {ok:true;frame:ScoreFrame} | {ok:false;error:string}`; `parseIntentScoreMessage(raw: string): ParseResult`.

- [ ] **Step 1: Write the failing test** (`intentScoreMessage.test.ts`)

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
  timestamp: 123.4,
});

describe("parseIntentScoreMessage", () => {
  it("parses a valid frame", () => {
    const r = parseIntentScoreMessage(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.intentScore).toBeCloseTo(72.3);
      expect(r.frame.classifierScore).toBeNull();
      expect(r.frame.mode).toBe("band_power_only");
      expect(r.frame.isArtifact).toBe(false);
    }
  });
  it("rejects malformed JSON", () => {
    expect(parseIntentScoreMessage("{nope").ok).toBe(false);
  });
  it("rejects the wrong message type", () => {
    expect(parseIntentScoreMessage(JSON.stringify({ type: "eeg_quality" })).ok).toBe(false);
  });
  it("rejects a missing/non-numeric intent_score", () => {
    expect(parseIntentScoreMessage(JSON.stringify({ type: "intent_score" })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- intentScoreMessage`
Expected: FAIL — cannot find module `./intentScoreMessage`.

- [ ] **Step 3: Write the implementation** (`intentScoreMessage.ts`)

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

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- intentScoreMessage`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/scoring/intentScoreMessage.ts patient-web/src/scoring/intentScoreMessage.test.ts
git commit -m "feat(patient-web): port intent_score frame parser (shared contract)"
```

---

### Task 2: `scoreStore.ts` — circular score buffer

**Files:**
- Create: `patient-web/src/scoring/scoreStore.ts`, `patient-web/src/scoring/scoreStore.test.ts`

**Interfaces:**
- Consumes: `ScoreFrame` from `./intentScoreMessage`.
- Produces: `class ScoreStore` with `constructor(capacity = 600)`, `push(f: ScoreFrame): void`, `latest(): ScoreFrame | null`, `recentAverage(n: number): number`, `streakAboveThreshold(threshold: number): number`, `size(): number`, `clear(): void`.

- [ ] **Step 1: Write the failing test** (`scoreStore.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { ScoreStore } from "./scoreStore";
import type { ScoreFrame } from "./intentScoreMessage";

const frame = (s: number): ScoreFrame => ({
  intentScore: s, erdScore: null, classifierScore: null,
  isArtifact: false, mode: "band_power_only", timestamp: 0,
});

describe("ScoreStore", () => {
  it("returns null when empty and tracks latest", () => {
    const st = new ScoreStore(4);
    expect(st.latest()).toBeNull();
    st.push(frame(10));
    st.push(frame(20));
    expect(st.latest()!.intentScore).toBe(20);
    expect(st.size()).toBe(2);
  });
  it("averages the most recent n", () => {
    const st = new ScoreStore(10);
    [10, 20, 30, 40].forEach((s) => st.push(frame(s)));
    expect(st.recentAverage(2)).toBe(35);
  });
  it("counts the trailing streak at/above threshold", () => {
    const st = new ScoreStore(10);
    [10, 80, 90, 95].forEach((s) => st.push(frame(s)));
    expect(st.streakAboveThreshold(70)).toBe(3);
    st.push(frame(10));
    expect(st.streakAboveThreshold(70)).toBe(0);
  });
  it("wraps at capacity without growing", () => {
    const st = new ScoreStore(3);
    [1, 2, 3, 4, 5].forEach((s) => st.push(frame(s)));
    expect(st.size()).toBe(3);
    expect(st.latest()!.intentScore).toBe(5);
    expect(st.recentAverage(3)).toBe(4); // (3+4+5)/3
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- scoreStore`
Expected: FAIL — cannot find module `./scoreStore`.

- [ ] **Step 3: Write the implementation** (`scoreStore.ts`)

```ts
import type { ScoreFrame } from "./intentScoreMessage";

/** Fixed circular buffer of score frames (default 600 = 30 s @ 20 Hz). */
export class ScoreStore {
  private buf: ScoreFrame[] = [];
  private head = 0; // index of the next write
  private count = 0;

  constructor(private capacity = 600) {}

  push(f: ScoreFrame): void {
    this.buf[this.head] = f;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.buf = [];
    this.head = 0;
    this.count = 0;
  }

  /** i=0 is most recent, i=1 next, … returns null past the filled range. */
  private at(i: number): ScoreFrame | null {
    if (i < 0 || i >= this.count) return null;
    const idx = (this.head - 1 - i + this.capacity * 2) % this.capacity;
    return this.buf[idx] ?? null;
  }

  latest(): ScoreFrame | null {
    return this.at(0);
  }

  recentAverage(n: number): number {
    const k = Math.min(n, this.count);
    if (k === 0) return 0;
    let sum = 0;
    for (let i = 0; i < k; i++) sum += this.at(i)!.intentScore;
    return sum / k;
  }

  streakAboveThreshold(threshold: number): number {
    let streak = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.at(i)!.intentScore >= threshold) streak++;
      else break;
    }
    return streak;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- scoreStore`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/scoring/scoreStore.ts patient-web/src/scoring/scoreStore.test.ts
git commit -m "feat(patient-web): score store (circular buffer, latest/avg/streak)"
```

---

### Task 3: `scoreClient.ts` — WS client with reconnect/backoff

**Files:**
- Create: `patient-web/src/net/scoreClient.ts`, `patient-web/src/net/scoreClient.test.ts`

**Interfaces:**
- Consumes: `parseIntentScoreMessage`, `ScoreFrame` from `../scoring/intentScoreMessage`.
- Produces: `type ConnectionState = "connecting"|"open"|"reconnecting"|"closed"`; `type WsLike = { onopen, onclose, onmessage, onerror, close() }`; `createScoreClient(opts): { connect(): void; stop(): void; droppedCount(): number }` where `opts = { url, createSocket(url)=>WsLike, onFrame(f:ScoreFrame), onState(s:ConnectionState), backoffBaseMs?, backoffMaxMs?, scheduler? }`.

- [ ] **Step 1: Write the failing test** (`scoreClient.test.ts`)

```ts
import { describe, it, expect, vi } from "vitest";
import { createScoreClient, type WsLike } from "./scoreClient";

function fakeSocket(): WsLike & { emitOpen(): void; emitMessage(d: string): void; emitClose(): void } {
  const s: any = { onopen: null, onclose: null, onmessage: null, onerror: null, close: vi.fn() };
  s.emitOpen = () => s.onopen?.({});
  s.emitMessage = (d: string) => s.onmessage?.({ data: d });
  s.emitClose = () => s.onclose?.({});
  return s;
}

const frame = (s: number) =>
  JSON.stringify({ type: "intent_score", intent_score: s, mode: "band_power_only", timestamp: 0 });

describe("createScoreClient", () => {
  it("delivers parsed frames and ignores junk", () => {
    const sock = fakeSocket();
    const frames: number[] = [];
    const states: string[] = [];
    const c = createScoreClient({
      url: "ws://x", createSocket: () => sock,
      onFrame: (f) => frames.push(f.intentScore),
      onState: (s) => states.push(s),
      scheduler: () => {},
    });
    c.connect();
    sock.emitOpen();
    sock.emitMessage(frame(42));
    sock.emitMessage("garbage");
    expect(frames).toEqual([42]);
    expect(states).toContain("open");
    expect(c.droppedCount()).toBe(1);
  });

  it("reconnects with backoff and stop() suppresses it", () => {
    let made = 0;
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const scheduled: Array<() => void> = [];
    const c = createScoreClient({
      url: "ws://x",
      createSocket: () => { made++; const s = fakeSocket(); sockets.push(s); return s; },
      onFrame: () => {},
      onState: () => {},
      scheduler: (fn) => { scheduled.push(fn); },
    });
    c.connect();
    expect(made).toBe(1);
    sockets[0].emitClose();           // drop → schedules a reconnect
    expect(scheduled.length).toBe(1);
    scheduled[0]();                    // run the scheduled reconnect
    expect(made).toBe(2);
    c.stop();
    sockets[1].emitClose();           // after stop, no new reconnect scheduled
    expect(scheduled.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- scoreClient`
Expected: FAIL — cannot find module `./scoreClient`.

- [ ] **Step 3: Write the implementation** (`scoreClient.ts`)

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
    s.onerror = () => {
      /* close handler drives reconnect */
    };
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

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- scoreClient`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/net/scoreClient.ts patient-web/src/net/scoreClient.test.ts
git commit -m "feat(patient-web): WS score client with reconnect/backoff"
```

---

### Task 4: `PlantGrowthModel.ts` — verbatim C# port

**Files:**
- Create: `patient-web/src/garden/PlantGrowthModel.ts`, `patient-web/src/garden/PlantGrowthModel.test.ts`
- Reference: `archive/frontend-v1/game-client/Assets/Scripts/Garden/PlantGrowthModel.cs`, `archive/frontend-v1/game-client/Assets/Tests/EditMode/TestPlantGrowthModel.cs`

**Interfaces:**
- Produces: `class PlantGrowthModel` with static consts `GROW_SPEED=0.8`, `WILT_SPEED=0.3`, `BLOOM_ON=0.75`, `BLOOM_OFF=0.60`, `BLOOM_DWELL_S=3.0`; getters `currentGrowth`, `targetGrowth`, `isBloom`; `update(intentScore01: number, dtSeconds: number): void`; `reset(): void`.

- [ ] **Step 1: Write the failing test** (`PlantGrowthModel.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { PlantGrowthModel } from "./PlantGrowthModel";

describe("PlantGrowthModel", () => {
  it("grows toward a high target, clamped to 1", () => {
    const p = new PlantGrowthModel();
    for (let i = 0; i < 100; i++) p.update(1, 0.05);
    expect(p.currentGrowth).toBe(1);
  });
  it("wilts more slowly than it grows (asymmetry)", () => {
    const grow = new PlantGrowthModel();
    grow.update(1, 0.1); // +0.08
    const wilt = new PlantGrowthModel();
    wilt.update(1, 1); // saturate toward 1 first
    const before = wilt.currentGrowth;
    wilt.update(0, 0.1); // -0.03
    expect(grow.currentGrowth).toBeCloseTo(0.08, 5);
    expect(before - wilt.currentGrowth).toBeCloseTo(0.03, 5);
  });
  it("blooms only after >=3s dwell above 0.75 and clears below 0.60", () => {
    const p = new PlantGrowthModel();
    for (let i = 0; i < 100; i++) p.update(1, 0.05); // pin near 1
    expect(p.isBloom).toBe(false);
    p.update(1, 3.0); // accumulate dwell
    expect(p.isBloom).toBe(true);
    p.update(0.65, 1); // between off and on → hysteresis holds bloom
    expect(p.isBloom).toBe(true);
    for (let i = 0; i < 50; i++) p.update(0, 0.1); // drive below 0.60
    expect(p.isBloom).toBe(false);
  });
  it("resets to seed state", () => {
    const p = new PlantGrowthModel();
    for (let i = 0; i < 100; i++) p.update(1, 0.05);
    p.reset();
    expect(p.currentGrowth).toBe(0);
    expect(p.isBloom).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- PlantGrowthModel`
Expected: FAIL — cannot find module `./PlantGrowthModel`.

- [ ] **Step 3: Write the implementation** (`PlantGrowthModel.ts`)

```ts
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Logical growth state of the garden plant — pure, renderer-agnostic.
 * Verbatim port of game-client PlantGrowthModel.cs (spec §9.1): growth is
 * quick, wilt is slow/gentle (never a punitive reset); bloom uses a dwell
 * timer + hysteresis so it does not flicker at the threshold.
 */
export class PlantGrowthModel {
  static readonly GROW_SPEED = 0.8; // per second
  static readonly WILT_SPEED = 0.3; // per second
  static readonly BLOOM_ON = 0.75;
  static readonly BLOOM_OFF = 0.6;
  static readonly BLOOM_DWELL_S = 3.0;

  private _current = 0;
  private _target = 0;
  private _bloom = false;
  private _aboveTime = 0;

  get currentGrowth(): number { return this._current; }
  get targetGrowth(): number { return this._target; }
  get isBloom(): boolean { return this._bloom; }

  update(intentScore01: number, dtSeconds: number): void {
    this._target = clamp01(intentScore01);
    const speed = this._target > this._current ? PlantGrowthModel.GROW_SPEED : PlantGrowthModel.WILT_SPEED;
    const step = speed * Math.max(0, dtSeconds);
    const delta = this._target - this._current;
    if (Math.abs(delta) <= step) this._current = this._target;
    else this._current += sign(delta) * step;
    this._current = clamp01(this._current);
    this.updateBloom(dtSeconds);
  }

  private updateBloom(dtSeconds: number): void {
    if (this._current > PlantGrowthModel.BLOOM_ON) {
      this._aboveTime += Math.max(0, dtSeconds);
      if (this._aboveTime >= PlantGrowthModel.BLOOM_DWELL_S) this._bloom = true;
    } else {
      this._aboveTime = 0;
    }
    if (this._current < PlantGrowthModel.BLOOM_OFF) {
      this._bloom = false;
      this._aboveTime = 0;
    }
  }

  reset(): void {
    this._current = 0;
    this._target = 0;
    this._bloom = false;
    this._aboveTime = 0;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- PlantGrowthModel`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/garden/PlantGrowthModel.ts patient-web/src/garden/PlantGrowthModel.test.ts
git commit -m "feat(patient-web): port PlantGrowthModel (grow/wilt/bloom hysteresis)"
```

---

### Task 5: `SessionStats.ts` — verbatim C# port

**Files:**
- Create: `patient-web/src/session/SessionStats.ts`, `patient-web/src/session/SessionStats.test.ts`
- Reference: `archive/frontend-v1/game-client/Assets/Scripts/UI/SessionStats.cs`

**Interfaces:**
- Produces: `class SessionStats` with getters `totalActiveSeconds`, `bestStreakSeconds`, `trialsCompleted`; `accumulate(dtSeconds: number, engaged: boolean): void`; `incrementTrials(): void`; `reset(): void`; `focusLine(): string`; `streakLine(): string`; `praiseLine(): string`.

- [ ] **Step 1: Write the failing test** (`SessionStats.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { SessionStats } from "./SessionStats";

describe("SessionStats", () => {
  it("accumulates active time and the longest engaged streak", () => {
    const s = new SessionStats();
    s.accumulate(2, true);   // streak 2
    s.accumulate(2, true);   // streak 4
    s.accumulate(1, false);  // break
    s.accumulate(3, true);   // streak 3
    expect(s.totalActiveSeconds).toBeCloseTo(8);
    expect(s.bestStreakSeconds).toBeCloseTo(4);
  });
  it("renders singular vs plural focus line", () => {
    const a = new SessionStats();
    a.accumulate(60, true);
    expect(a.focusLine()).toBe("You focused for 1 minute");
    const b = new SessionStats();
    b.accumulate(150, true);
    expect(b.focusLine()).toBe("You focused for 3 minutes"); // rounds 2.5→3
  });
  it("renders a streak line and warm praise, no raw percentage", () => {
    const s = new SessionStats();
    s.accumulate(7, true);
    expect(s.streakLine()).toBe("Your best streak was 7 seconds");
    expect(s.praiseLine()).toBe("Great session!");
    expect(s.streakLine()).not.toMatch(/%/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- SessionStats`
Expected: FAIL — cannot find module `./SessionStats`.

- [ ] **Step 3: Write the implementation** (`SessionStats.ts`)

```ts
/**
 * Positive, non-comparative session metrics (spec §9.3 — never a raw % or
 * grade). Port of game-client SessionStats.cs; an instance here instead of a
 * C# static singleton (TS modules don't need the static-bridge trick).
 */
export class SessionStats {
  private _active = 0;
  private _best = 0;
  private _current = 0;
  private _trials = 0;

  get totalActiveSeconds(): number { return this._active; }
  get bestStreakSeconds(): number { return this._best; }
  get trialsCompleted(): number { return this._trials; }

  accumulate(dtSeconds: number, engaged: boolean): void {
    const dt = Math.max(0, dtSeconds);
    if (engaged) {
      this._active += dt;
      this._current += dt;
      if (this._current > this._best) this._best = this._current;
    } else {
      this._current = 0;
    }
  }

  incrementTrials(): void { this._trials += 1; }

  reset(): void {
    this._active = 0;
    this._best = 0;
    this._current = 0;
    this._trials = 0;
  }

  focusLine(): string {
    const minutes = Math.max(0, Math.round(this._active / 60));
    return minutes === 1 ? "You focused for 1 minute" : `You focused for ${minutes} minutes`;
  }

  streakLine(): string {
    const seconds = Math.max(0, Math.round(this._best));
    return `Your best streak was ${seconds} seconds`;
  }

  praiseLine(): string { return "Great session!"; }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- SessionStats`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/session/SessionStats.ts patient-web/src/session/SessionStats.test.ts
git commit -m "feat(patient-web): port SessionStats (active time, streak, warm copy)"
```

---

### Task 6: WelcomeScene (P1)

**Files:**
- Create: `patient-web/src/scenes/WelcomeScene.tsx`, `patient-web/src/scenes/WelcomeScene.test.tsx`

**Interfaces:**
- Consumes: `config` from `../config`.
- Produces: `function WelcomeScene(props: { firstName: string; onBegin: () => void }): JSX.Element`.

- [ ] **Step 1: Write the failing test** (`WelcomeScene.test.tsx`)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeScene } from "./WelcomeScene";

describe("WelcomeScene", () => {
  it("greets the patient by name", () => {
    render(<WelcomeScene firstName="Margaret" onBegin={() => {}} />);
    expect(screen.getByText(/Hi Margaret/i)).toBeInTheDocument();
  });
  it("fires onBegin when the big button is pressed", async () => {
    const onBegin = vi.fn();
    render(<WelcomeScene firstName="Margaret" onBegin={onBegin} />);
    await userEvent.click(screen.getByRole("button", { name: /let's begin/i }));
    expect(onBegin).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- WelcomeScene`
Expected: FAIL — cannot find module `./WelcomeScene`.

- [ ] **Step 3: Write the implementation** (`WelcomeScene.tsx`)

```tsx
export function WelcomeScene({ firstName, onBegin }: { firstName: string; onBegin: () => void }) {
  return (
    <main className="scene scene--welcome" aria-labelledby="welcome-title">
      <div className="welcome-card">
        <div className="mascot" aria-hidden="true" />
        <h1 id="welcome-title" className="welcome-title">
          Hi {firstName} — ready to play?
        </h1>
        <p className="welcome-sub">
          We'll warm up with a quick game. Just relax and follow along. Your therapist is right here.
        </p>
        <button type="button" className="big-button" onClick={onBegin}>
          Let's begin
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- WelcomeScene`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/scenes/WelcomeScene.tsx patient-web/src/scenes/WelcomeScene.test.tsx
git commit -m "feat(patient-web): P1 WelcomeScene"
```

---

### Task 7: CalibrationScene (P2, cosmetic cue sequencer)

**Files:**
- Create: `patient-web/src/scenes/CalibrationScene.tsx`, `patient-web/src/scenes/CalibrationScene.test.tsx`

**Interfaces:**
- Produces: `function CalibrationScene(props: { affectedSide: "left"|"right"; totalTrials?: number; onComplete: () => void }): JSX.Element`. Internally cycles cue phases with durations: fixation 2000 ms, cue 1250 ms, imagine 4000 ms, rest 2000–3000 ms. Exposes the current phase via `data-phase` on the root and trial count text "Warm-up · trial N of M".

- [ ] **Step 1: Write the failing test** (`CalibrationScene.test.tsx`)

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CalibrationScene } from "./CalibrationScene";

describe("CalibrationScene", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the affected-side cue and trial counter, and advances phases", () => {
    render(<CalibrationScene affectedSide="left" totalTrials={20} onComplete={() => {}} />);
    const root = screen.getByTestId("calibration");
    expect(root).toHaveAttribute("data-phase", "fixation");
    expect(screen.getByText(/trial 1 of 20/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000)); // fixation → cue
    expect(root).toHaveAttribute("data-phase", "cue");
    expect(screen.getByText(/imagine opening your left hand/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1250)); // cue → imagine
    expect(root).toHaveAttribute("data-phase", "imagine");
  });

  it("calls onComplete after the configured trial count", () => {
    const onComplete = vi.fn();
    render(<CalibrationScene affectedSide="right" totalTrials={1} onComplete={onComplete} />);
    // one full trial: fixation+cue+imagine+rest (rest max 3000)
    act(() => vi.advanceTimersByTime(2000 + 1250 + 4000 + 3000));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- CalibrationScene`
Expected: FAIL — cannot find module `./CalibrationScene`.

- [ ] **Step 3: Write the implementation** (`CalibrationScene.tsx`)

```tsx
import { useEffect, useRef, useState } from "react";

type Phase = "fixation" | "cue" | "imagine" | "rest";
const DURATIONS: Record<Phase, () => number> = {
  fixation: () => 2000,
  cue: () => 1250,
  imagine: () => 4000,
  rest: () => 2000 + Math.random() * 1000, // 2–3 s
};
const ORDER: Phase[] = ["fixation", "cue", "imagine", "rest"];

/**
 * Cosmetic Graz cue sequencer (spec §6). NOT wired to the real
 * CalibrationOrchestrator / LSL marker stream — no marker channel reaches the
 * browser yet (see docs/superpowers/specs/2026-06-25-patient-web-prototype-design.md §5.2).
 * It demonstrates the paradigm only; real wiring lands with the LAN server.
 */
export function CalibrationScene({
  affectedSide,
  totalTrials = 20,
  onComplete,
}: {
  affectedSide: "left" | "right";
  totalTrials?: number;
  onComplete: () => void;
}) {
  const [trial, setTrial] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const done = useRef(false);
  const phase = ORDER[phaseIdx];

  useEffect(() => {
    if (done.current) return;
    const t = setTimeout(() => {
      if (phaseIdx < ORDER.length - 1) {
        setPhaseIdx(phaseIdx + 1);
      } else if (trial < totalTrials) {
        setTrial(trial + 1);
        setPhaseIdx(0);
      } else {
        done.current = true;
        onComplete();
      }
    }, DURATIONS[phase]());
    return () => clearTimeout(t);
  }, [phase, phaseIdx, trial, totalTrials, onComplete]);

  const showCue = phase === "cue" || phase === "imagine";
  return (
    <main className="scene scene--calibration" data-testid="calibration" data-phase={phase}>
      <div className="cal-header">Warm-up · trial {trial} of {totalTrials}</div>
      <div className={`hand-glyph hand-glyph--${phase}`} aria-hidden="true" />
      {showCue ? (
        <>
          <h1 className="cal-cue">Imagine opening your {affectedSide} hand</h1>
          <p className="cal-sub">feel the movement — don't actually move</p>
        </>
      ) : (
        <h1 className="cal-cue cal-cue--rest">{phase === "rest" ? "Rest" : "Get ready…"}</h1>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- CalibrationScene`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/scenes/CalibrationScene.tsx patient-web/src/scenes/CalibrationScene.test.tsx
git commit -m "feat(patient-web): P2 CalibrationScene (cosmetic cue sequencer)"
```

---

### Task 8: GardenScene (P3, the live loop)

**Files:**
- Create: `patient-web/src/scenes/GardenScene.tsx`, `patient-web/src/scenes/GardenScene.test.tsx`

**Interfaces:**
- Consumes: `PlantGrowthModel` (`../garden/PlantGrowthModel`), `SessionStats` (`../session/SessionStats`), `createScoreClient`/`WsLike`/`ConnectionState` (`../net/scoreClient`), `config`.
- Produces: `function GardenScene(props: { stats: SessionStats; engagementThreshold: number; createSocket?: (url: string) => WsLike; onEnd: () => void }): JSX.Element`. Renders an element `data-testid="flower"` carrying `data-growth` (0–1, two decimals), a status pill `data-testid="status-pill"` with `data-engaged` true/false, an intent bar `data-testid="intent-bar"` with `aria-valuenow`, and an "End session" button calling `onEnd`. When `createSocket` is omitted it uses the browser `WebSocket`.

- [ ] **Step 1: Write the failing test** (`GardenScene.test.tsx`)

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { GardenScene } from "./GardenScene";
import { SessionStats } from "../session/SessionStats";
import type { WsLike } from "../net/scoreClient";

// A controllable fake socket + rAF/time control so we can drive the loop.
function fakeSocket(): WsLike & { open(): void; send(s: number): void } {
  const s: any = { onopen: null, onclose: null, onmessage: null, onerror: null, close: vi.fn() };
  s.open = () => s.onopen?.({});
  s.send = (v: number) =>
    s.onmessage?.({ data: JSON.stringify({ type: "intent_score", intent_score: v, mode: "band_power_only", timestamp: 0 }) });
  return s;
}

describe("GardenScene", () => {
  let raf: Array<FrameRequestCallback>;
  beforeEach(() => {
    raf = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { raf.push(cb); return raf.length; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  function pump(times: number, ms: number) {
    for (let i = 0; i < times; i++) {
      const cbs = raf;
      raf = [];
      act(() => cbs.forEach((cb) => cb(performance.now() + i * ms)));
    }
  }

  it("grows the flower as scores rise and flips the status pill at threshold", () => {
    const sock = fakeSocket();
    render(
      <GardenScene
        stats={new SessionStats()}
        engagementThreshold={55}
        createSocket={() => sock}
        onEnd={() => {}}
      />,
    );
    act(() => sock.open());
    const flower = screen.getByTestId("flower");
    const before = Number(flower.getAttribute("data-growth"));

    act(() => sock.send(90));
    pump(30, 0.1); // ~3 s of frames at high score
    const after = Number(screen.getByTestId("flower").getAttribute("data-growth"));
    expect(after).toBeGreaterThan(before);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-engaged", "true");

    act(() => sock.send(10));
    pump(5, 0.1);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-engaged", "false");
  });

  it("ends the session on the End button", async () => {
    const onEnd = vi.fn();
    const sock = fakeSocket();
    render(<GardenScene stats={new SessionStats()} engagementThreshold={55} createSocket={() => sock} onEnd={onEnd} />);
    screen.getByRole("button", { name: /end session/i }).click();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- GardenScene`
Expected: FAIL — cannot find module `./GardenScene`.

- [ ] **Step 3: Write the implementation** (`GardenScene.tsx`)

```tsx
import { useEffect, useRef, useState } from "react";
import { PlantGrowthModel } from "../garden/PlantGrowthModel";
import type { SessionStats } from "../session/SessionStats";
import { createScoreClient, type WsLike, type ConnectionState } from "../net/scoreClient";
import { config } from "../config";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function GardenScene({
  stats,
  engagementThreshold,
  createSocket,
  onEnd,
}: {
  stats: SessionStats;
  engagementThreshold: number;
  createSocket?: (url: string) => WsLike;
  onEnd: () => void;
}) {
  const [growth, setGrowth] = useState(0);
  const [bloom, setBloom] = useState(false);
  const [score, setScore] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [conn, setConn] = useState<ConnectionState>("connecting");

  const plant = useRef(new PlantGrowthModel());
  const latestScore = useRef(0);
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    const socketFactory =
      createSocket ?? ((url: string) => new WebSocket(url) as unknown as WsLike);
    const client = createScoreClient({
      url: config.wsUrl,
      createSocket: socketFactory,
      onFrame: (f) => { latestScore.current = f.intentScore; },
      onState: setConn,
    });
    client.connect();

    let raf = 0;
    const tick = (ts: number) => {
      const dt = lastTs.current === null ? 0 : (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      const s = latestScore.current;
      plant.current.update(s / 100, dt);
      const isEngaged = s >= engagementThreshold;
      stats.accumulate(dt, isEngaged);
      setGrowth(plant.current.currentGrowth);
      setBloom(plant.current.isBloom);
      setScore(s);
      setEngaged(isEngaged);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      client.stop();
    };
  }, [createSocket, engagementThreshold, stats]);

  const reduced = prefersReducedMotion();
  const stemHeight = Math.round(growth * 100);
  return (
    <main className={`scene scene--garden${reduced ? " reduced-motion" : ""}`}>
      <div className="garden-topbar">
        <span
          className="status-pill"
          data-testid="status-pill"
          data-engaged={engaged}
        >
          {engaged ? "Good focus" : "Keep imagining — it's growing!"}
        </span>
        <span className="conn-badge" data-state={conn}>{conn}</span>
      </div>

      <div className="garden-stage">
        <div
          className={`flower${bloom ? " flower--bloom" : ""}`}
          data-testid="flower"
          data-growth={growth.toFixed(2)}
          style={{ height: `${stemHeight}%` }}
        >
          <div className="flower-head" aria-hidden="true" />
        </div>
        <div
          className="intent-bar"
          data-testid="intent-bar"
          role="progressbar"
          aria-label="Intent score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(score)}
        >
          <div className="intent-bar-fill" style={{ height: `${Math.round(score)}%` }} />
        </div>
      </div>

      <button type="button" className="end-button" onClick={onEnd}>
        End session
      </button>
    </main>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- GardenScene`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/scenes/GardenScene.tsx patient-web/src/scenes/GardenScene.test.tsx
git commit -m "feat(patient-web): P3 GardenScene (live score → plant growth loop)"
```

---

### Task 9: SummaryScene (P6)

**Files:**
- Create: `patient-web/src/scenes/SummaryScene.tsx`, `patient-web/src/scenes/SummaryScene.test.tsx`

**Interfaces:**
- Consumes: `SessionStats` (`../session/SessionStats`).
- Produces: `function SummaryScene(props: { stats: SessionStats; onRestart?: () => void }): JSX.Element`. Shows minutes played (rounded), best streak seconds, warm "higher level than last week" line, lighthouse placeholder. Contains no "%" text.

- [ ] **Step 1: Write the failing test** (`SummaryScene.test.tsx`)

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryScene } from "./SummaryScene";
import { SessionStats } from "../session/SessionStats";

describe("SummaryScene", () => {
  it("shows minutes and streak with no raw percentage", () => {
    const stats = new SessionStats();
    for (let i = 0; i < 18 * 60; i++) stats.accumulate(1, true); // 18 active min, 1080 s streak
    render(<SummaryScene stats={stats} />);
    expect(screen.getByText(/great work today/i)).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument(); // minutes tile
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- SummaryScene`
Expected: FAIL — cannot find module `./SummaryScene`.

- [ ] **Step 3: Write the implementation** (`SummaryScene.tsx`)

```tsx
import type { SessionStats } from "../session/SessionStats";

export function SummaryScene({ stats, onRestart }: { stats: SessionStats; onRestart?: () => void }) {
  const minutes = Math.max(0, Math.round(stats.totalActiveSeconds / 60));
  const streak = Math.max(0, Math.round(stats.bestStreakSeconds));
  return (
    <main className="scene scene--summary">
      <div className="summary-badge" aria-hidden="true" />
      <h1 className="summary-title">Great work today!</h1>
      <div className="summary-tiles">
        <div className="summary-tile">
          <div className="summary-num">{minutes}</div>
          <div className="summary-label">minutes played</div>
        </div>
        <div className="summary-tile">
          <div className="summary-num">{streak}</div>
          <div className="summary-label">best streak (s)</div>
        </div>
      </div>
      <p className="summary-line">This week you're playing at a higher level than last week ✓</p>
      <div className="summary-story">Lighthouse story progress — 1 more piece required</div>
      {onRestart && (
        <button type="button" className="big-button" onClick={onRestart}>
          Play again
        </button>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- SummaryScene`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/scenes/SummaryScene.tsx patient-web/src/scenes/SummaryScene.test.tsx
git commit -m "feat(patient-web): P6 SummaryScene (warm, non-clinical recap)"
```

---

### Task 10: App flow router + styles

**Files:**
- Modify: `patient-web/src/App.tsx`
- Create: `patient-web/src/App.test.tsx`, `patient-web/src/styles.css`
- Modify: `patient-web/src/main.tsx` (import `./styles.css`)

**Interfaces:**
- Consumes: all four scenes, `SessionStats`, `config`.
- Produces: `App` default export driving the flow `welcome → calibration → garden → summary` with a shared `SessionStats` instance.

- [ ] **Step 1: Write the failing test** (`App.test.tsx`)

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

// Garden opens a real WebSocket; stub it so the flow test stays offline.
beforeEach(() => {
  vi.stubGlobal("WebSocket", class {
    onopen: any = null; onclose: any = null; onmessage: any = null; onerror: any = null;
    close() {}
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("App flow", () => {
  it("advances Welcome → Calibration → Garden → Summary", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App />);
    expect(screen.getByText(/ready to play/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /let's begin/i }));
    expect(screen.getByTestId("calibration")).toBeInTheDocument();

    // App uses a short demo trial count; fast-forward through it.
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByTestId("flower")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /end session/i }));
    expect(screen.getByText(/great work today/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- App`
Expected: FAIL — App renders the placeholder, no `calibration` testid.

- [ ] **Step 3: Write the implementation** (`App.tsx`)

```tsx
import { useMemo, useState } from "react";
import { WelcomeScene } from "./scenes/WelcomeScene";
import { CalibrationScene } from "./scenes/CalibrationScene";
import { GardenScene } from "./scenes/GardenScene";
import { SummaryScene } from "./scenes/SummaryScene";
import { SessionStats } from "./session/SessionStats";
import { config } from "./config";

type View = "welcome" | "calibration" | "garden" | "summary";

export default function App() {
  const [view, setView] = useState<View>("welcome");
  const stats = useMemo(() => new SessionStats(), []);

  switch (view) {
    case "welcome":
      return <WelcomeScene firstName={config.patient.firstName} onBegin={() => setView("calibration")} />;
    case "calibration":
      return (
        <CalibrationScene
          affectedSide={config.patient.affectedSide}
          totalTrials={2 /* short demo block this round */}
          onComplete={() => setView("garden")}
        />
      );
    case "garden":
      return (
        <GardenScene
          stats={stats}
          engagementThreshold={config.engagementThreshold}
          onEnd={() => setView("summary")}
        />
      );
    case "summary":
      return <SummaryScene stats={stats} onRestart={() => { stats.reset(); setView("welcome"); }} />;
  }
}
```

- [ ] **Step 4: Create `src/styles.css` and import it**

Add minimal warm styling (colorblind-safe pill colors, large targets, reduced-motion guard). `src/styles.css`:

```css
:root {
  --warm-bg: #fdf6ec; --warm-accent: #e89a52; --ink: #33425a;
  --good: #2e7d54; --grow: #b5651f;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: var(--ink); }
.scene { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 16px; padding: 24px; background: var(--warm-bg); }
.welcome-title, .cal-cue, .summary-title { font-size: clamp(28px, 5vw, 44px); text-align: center; }
.big-button { font-size: 24px; padding: 18px 36px; border: 0; border-radius: 14px;
  background: var(--warm-accent); color: #fff; cursor: pointer; }
.big-button:hover { filter: brightness(1.05); }
.status-pill { padding: 8px 16px; border-radius: 999px; font-weight: 600; color: #fff;
  background: var(--grow); }
.status-pill[data-engaged="true"] { background: var(--good); }
.garden-stage { display: flex; align-items: flex-end; gap: 32px; height: 60vh; }
.flower { width: 60px; background: #6aa84f; border-radius: 8px 8px 0 0;
  transition: height 120ms linear; position: relative; }
.flower-head { position: absolute; top: -28px; left: -14px; width: 88px; height: 88px;
  border-radius: 50%; background: var(--warm-accent); opacity: 0.5; transition: opacity 200ms; }
.flower--bloom .flower-head { opacity: 1; }
.intent-bar { width: 28px; height: 100%; background: #e6d6c0; border-radius: 14px;
  display: flex; align-items: flex-end; overflow: hidden; }
.intent-bar-fill { width: 100%; background: var(--warm-accent); transition: height 120ms linear; }
.conn-badge { font-size: 12px; opacity: 0.6; }
.summary-tiles { display: flex; gap: 32px; }
.summary-num { font-size: 48px; font-weight: 700; color: var(--warm-accent); text-align: center; }
.reduced-motion .flower, .reduced-motion .intent-bar-fill, .reduced-motion .flower-head {
  transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  .flower, .intent-bar-fill, .flower-head { transition: none !important; }
}
```

In `src/main.tsx` add `import "./styles.css";` after the React imports.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -- App && npm run test`
Expected: App flow passes; full unit suite green.

- [ ] **Step 6: Commit**

```bash
git add patient-web/src/App.tsx patient-web/src/App.test.tsx patient-web/src/styles.css patient-web/src/main.tsx
git commit -m "feat(patient-web): scene flow router + warm styles"
```

---

### Task 11: Live integration — mock-EEG sidecar + cross-client parity

**Files:**
- Create: `patient-web/integration/sidecar.live.test.ts`
- Reference: `clinician-console/integration/sidecar.live.test.ts` (copy `waitPort`, `condaAvailable`, `killTree`, spawn/teardown verbatim).

**Interfaces:**
- Consumes: `parseIntentScoreMessage` (`../src/scoring/intentScoreMessage`), `PlantGrowthModel` (`../src/garden/PlantGrowthModel`), and the console's parser at `../../clinician-console/src/scoring/intentScoreMessage` for the parity check.

- [ ] **Step 1: Write the integration test** (`integration/sidecar.live.test.ts`)

```ts
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
```

- [ ] **Step 2: Run the integration test**

Run: `cd patient-web && npm run test:integration`
Expected: both tests PASS when conda + the `eeg` env are present (skipped otherwise). The sidecar logs stream with `[sidecar]` prefix.

- [ ] **Step 3: Verify no orphan holds the port**

Run: `lsof -i :8765 || echo "port free"`
Expected: `port free` (teardown killed the process group).

- [ ] **Step 4: Commit**

```bash
git add patient-web/integration/sidecar.live.test.ts
git commit -m "test(patient-web): live mock-EEG integration + console parity"
```

---

### Task 12: Verification gates + docs

**Files:**
- Modify: `docs/todos.md` (add a V2-1 status block), `CLAUDE.md` (add `patient-web/` to architecture + commands)

- [ ] **Step 1: Full typecheck + build + unit suite**

Run: `cd patient-web && npm run typecheck && npm run build && npm run test`
Expected: typecheck clean; `vite build` emits `dist/` with no errors; all unit/component tests green.

- [ ] **Step 2: Full integration run (one more time, clean)**

Run: `cd patient-web && npm run test:integration && (lsof -i :8765 || echo "port free")`
Expected: integration green; `port free`.

- [ ] **Step 3: Update `docs/todos.md`**

Add a block under the V2-0b note recording: `patient-web/` scaffolded; P1/P2/P3/P6 scenes; ported `PlantGrowthModel`/`SessionStats`/parser/`scoreStore`/`scoreClient` (Vitest); live mock-EEG integration + console-parity tests; **gaps**: P2 cosmetic (no marker bridge), PixiJS deferred, LAN/WSS/pairing + WebRTC camera + P4/P5 + persistence still open; `game-client/` not yet deleted.

- [ ] **Step 4: Update `CLAUDE.md`**

Add `patient-web/` to the subsystem list and a Commands entry:

```bash
# Patient web client (Vite + React + TS)
cd patient-web && npm install
npm run dev              # serve the patient game at localhost:5173
npm run test             # unit + component (Vitest + jsdom)
npm run test:integration # boots the real mock-EEG sidecar, drives the plant
```

- [ ] **Step 5: Commit**

```bash
git add docs/todos.md CLAUDE.md
git commit -m "docs: record V2-1 patient-web prototype status + commands"
```

---

## Self-Review notes

- **Spec coverage:** §2 repo placement → Task 0; §4.1 parser → Task 1; §4.2 store → Task 2; §4.3 model → Task 4; §4.4 stats → Task 5; client → Task 3; §5.1–5.4 scenes → Tasks 6–9; flow → Task 10; §6 render-choice honored (SVG/CSS) in Tasks 8/10; §7.1 unit, §7.2 component covered per scene; §7.3 integration + §7.4 parity → Task 11; §7.5 gates → Task 12. P2-cosmetic limitation documented in code (Task 7) and todos (Task 12).
- **Types consistent:** `ScoreFrame` shape identical across Tasks 1/2/3/11; `PlantGrowthModel` getters (`currentGrowth`/`isBloom`) used identically in Tasks 4/8/11; `SessionStats.accumulate(dt, engaged)` used in Tasks 5/8; `createScoreClient` option names match between Tasks 3 and 8.
- **No placeholders:** every code step carries full source; no TODO/TBD left in plan tasks (the only "cosmetic"/"deferred" notes are intentional scope statements, mirrored from the approved spec).
