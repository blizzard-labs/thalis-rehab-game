# Star Catcher (Reach & Collect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reach & Collect" mini-game (embodied avatar arm reaches diagonally toward a star; endless collect + celebrate) to `patient-web/`, wired to the "Star Catcher" menu slot so selecting it routes there instead of Garden Grow.

**Architecture:** A pure, DOM-free `ReachModel` (mirrors `PlantGrowthModel`) converts the live `intentScore` into a smoothed reach fraction and runs the goal/staircase state machine. A `StarCatchScene` React component reuses Garden's exact WS plumbing (`createScoreClient` → `ScoreStore` → rAF tick), renders an affected-side-aware SVG arm/star scene, and feeds `SessionStats`. `App.tsx` routes the `stars` mode to the new scene; `GameModeSelect` enables the slot.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest + @testing-library/react (jsdom). No new dependencies.

## Global Constraints

- **No new dependencies.** SVG/CSS only (no PixiJS this round), matching `GardenScene`.
- **Wire format is unchanged** (`intentScoreMessage.ts`): reach is driven by `intentScore` only; no kinematic sub-score on the patient device.
- **Patient never sees angles/degrees** (wireframe P4): show direction + reach + a single fused "Reach power" number only.
- **Accessibility (spec §9.3/§12):** primary elements default to the patient's **intact** field (opposite the affected side); honor `prefers-reduced-motion`; no strobe/rapid flashing; WCAG-AA contrast; icon-first copy; purple brand palette (`--purple*`).
- **Run all commands from `patient-web/`.** Test: `npm run test`. Typecheck: `npm run build` runs `tsc` (or `npx tsc --noEmit`).
- **Commits:** no `Co-Authored-By` trailer (project preference).

---

### Task 1: ReachModel (pure reach + goal/staircase state machine)

**Files:**
- Create: `patient-web/src/reach/ReachModel.ts`
- Test: `patient-web/src/reach/ReachModel.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `class ReachModel`
  - `update(intentUnit: number, dtSeconds: number): void` — `intentUnit` is `intentScore/100` (0..1).
  - getters: `reach: number` (0..1), `goalFraction: number` (0..1), `collected: number`, `justCollected: boolean` (true only on the tick a collect fires).
  - static tunables: `REACH_SPEED`, `RECEDE_SPEED`, `HOLD_S`, `GOAL_START`, `GOAL_MIN`, `GOAL_MAX`, `STAIR_UP`, `STAIR_DOWN`, `SUCCESS_RUN`, `MISS_MARGIN`, `MISS_S`.

- [ ] **Step 1: Write the failing tests**

Create `patient-web/src/reach/ReachModel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ReachModel } from "./ReachModel";

// Drive the model for `seconds` at a fixed intentUnit using small dt steps.
function drive(m: ReachModel, intentUnit: number, seconds: number, dt = 0.05) {
  for (let t = 0; t < seconds; t += dt) m.update(intentUnit, dt);
}

describe("ReachModel", () => {
  it("extends reach toward the intent unit", () => {
    const m = new ReachModel();
    expect(m.reach).toBe(0);
    drive(m, 0.9, 2);
    expect(m.reach).toBeGreaterThan(0.5);
    expect(m.reach).toBeLessThanOrEqual(1);
  });

  it("recedes gently (non-punitive), never snapping to zero in one step", () => {
    const m = new ReachModel();
    drive(m, 1.0, 2); // reach ~1
    const high = m.reach;
    m.update(0, 0.1); // one low-score tick
    expect(m.reach).toBeLessThan(high);
    expect(m.reach).toBeGreaterThan(0); // gentle, not a reset
  });

  it("collects a star once reach holds at/above the goal, incrementing collected", () => {
    const m = new ReachModel();
    expect(m.collected).toBe(0);
    // hold max reach well past HOLD_S
    let sawJustCollected = false;
    for (let t = 0; t < 3; t += 0.05) {
      m.update(1.0, 0.05);
      if (m.justCollected) sawJustCollected = true;
    }
    expect(sawJustCollected).toBe(true);
    expect(m.collected).toBeGreaterThanOrEqual(1);
  });

  it("justCollected is a one-tick pulse, not sticky", () => {
    const m = new ReachModel();
    // reach the goal and collect
    for (let t = 0; t < (ReachModel.HOLD_S + 0.5); t += 0.05) m.update(1.0, 0.05);
    // the immediately-following update with no new collect clears the flag
    const before = m.collected;
    m.update(0, 0.05); // drop score so no new collect this tick
    expect(m.justCollected).toBe(false);
    expect(m.collected).toBe(before);
  });

  it("raises the goal after a run of successes but stays within the band", () => {
    const m = new ReachModel();
    const start = m.goalFraction;
    // sustain max reach long enough for several collects
    drive(m, 1.0, 8);
    expect(m.goalFraction).toBeGreaterThan(start);
    expect(m.goalFraction).toBeLessThanOrEqual(ReachModel.GOAL_MAX);
  });

  it("lowers the goal after a sustained miss but not below the floor", () => {
    const m = new ReachModel();
    // push the goal up first
    drive(m, 1.0, 8);
    const raised = m.goalFraction;
    // now sustain a score well below the goal for longer than MISS_S
    drive(m, 0.1, ReachModel.MISS_S + 2);
    expect(m.goalFraction).toBeLessThan(raised);
    expect(m.goalFraction).toBeGreaterThanOrEqual(ReachModel.GOAL_MIN);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd patient-web && npm run test -- src/reach/ReachModel.test.ts`
Expected: FAIL — `Cannot find module './ReachModel'`.

- [ ] **Step 3: Write the minimal implementation**

Create `patient-web/src/reach/ReachModel.ts`:

```ts
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Logical state of the Reach & Collect mini-game — pure, renderer-agnostic
 * (mirrors PlantGrowthModel). `reach` (0..1) eases toward the live intent unit:
 * quick to extend, gentle to recede (never a punitive reset, spec §9.1). A goal
 * sits at `goalFraction` along the reach axis; holding reach at/above it briefly
 * "collects" a star and nudges the difficulty staircase (spec §9.4).
 */
export class ReachModel {
  static readonly REACH_SPEED = 0.8;   // per second, extending
  static readonly RECEDE_SPEED = 0.3;  // per second, receding (gentle)
  static readonly HOLD_S = 0.6;        // dwell at/above goal to collect
  static readonly GOAL_START = 0.65;
  static readonly GOAL_MIN = 0.55;
  static readonly GOAL_MAX = 0.9;
  static readonly STAIR_UP = 0.08;     // raise goal per success run
  static readonly STAIR_DOWN = 0.05;   // lower goal per sustained miss
  static readonly SUCCESS_RUN = 2;     // consecutive collects before raising
  static readonly MISS_MARGIN = 0.2;   // "miss" = reach below goal-this
  static readonly MISS_S = 5.0;        // sustained-miss window before lowering

  private _reach = 0;
  private _goal = ReachModel.GOAL_START;
  private _collected = 0;
  private _justCollected = false;
  private _holdTime = 0;
  private _successRun = 0;
  private _missTime = 0;

  get reach(): number { return this._reach; }
  get goalFraction(): number { return this._goal; }
  get collected(): number { return this._collected; }
  get justCollected(): boolean { return this._justCollected; }

  update(intentUnit: number, dtSeconds: number): void {
    this._justCollected = false;
    const dt = Math.max(0, dtSeconds);
    const target = clamp01(intentUnit);

    // Asymmetric ease: quick to extend, gentle to recede.
    const speed = target > this._reach ? ReachModel.REACH_SPEED : ReachModel.RECEDE_SPEED;
    const step = speed * dt;
    const delta = target - this._reach;
    if (Math.abs(delta) <= step) this._reach = target;
    else this._reach += sign(delta) * step;
    this._reach = clamp01(this._reach);

    // Collect: reach held at/above the goal for HOLD_S.
    if (this._reach >= this._goal) {
      this._holdTime += dt;
      this._missTime = 0;
      if (this._holdTime >= ReachModel.HOLD_S) {
        this._collected += 1;
        this._justCollected = true;
        this._holdTime = 0;
        this._successRun += 1;
        if (this._successRun >= ReachModel.SUCCESS_RUN) {
          this._goal = Math.min(ReachModel.GOAL_MAX, this._goal + ReachModel.STAIR_UP);
          this._successRun = 0;
        }
      }
    } else {
      this._holdTime = 0;
      // Sustained miss: reach well short of the goal lowers it (never below floor).
      if (this._reach < this._goal - ReachModel.MISS_MARGIN) {
        this._missTime += dt;
        if (this._missTime >= ReachModel.MISS_S) {
          this._goal = Math.max(ReachModel.GOAL_MIN, this._goal - ReachModel.STAIR_DOWN);
          this._missTime = 0;
          this._successRun = 0;
        }
      } else {
        this._missTime = 0;
      }
    }
  }

  reset(): void {
    this._reach = 0;
    this._goal = ReachModel.GOAL_START;
    this._collected = 0;
    this._justCollected = false;
    this._holdTime = 0;
    this._successRun = 0;
    this._missTime = 0;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd patient-web && npm run test -- src/reach/ReachModel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/reach/ReachModel.ts patient-web/src/reach/ReachModel.test.ts
git commit -m "feat(patient-web): ReachModel pure reach + staircase state machine"
```

---

### Task 2: StarCatchScene (SVG scene + live loop + CSS)

**Files:**
- Create: `patient-web/src/scenes/StarCatchScene.tsx`
- Create: `patient-web/src/scenes/StarCatchScene.test.tsx`
- Modify: `patient-web/src/styles.css` (append Star Catcher rules)

**Interfaces:**
- Consumes: `ReachModel` (Task 1); `createScoreClient`, `WsLike`, `ConnectionState` from `../net/scoreClient`; `ScoreStore` from `../scoring/scoreStore`; `SessionStats` from `../session/SessionStats`; `CameraFeed` from `./CameraFeed`; `config` from `../config`.
- Produces: `export function StarCatchScene(props: { stats: SessionStats; engagementThreshold: number; affectedSide?: "left" | "right"; createSocket?: (url: string) => WsLike; onEnd: () => void })` — consumed by `App.tsx` (Task 3).

- [ ] **Step 1: Write the failing component test**

Create `patient-web/src/scenes/StarCatchScene.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { StarCatchScene } from "./StarCatchScene";
import { SessionStats } from "../session/SessionStats";
import type { WsLike } from "../net/scoreClient";

function fakeSocket(): WsLike & { open(): void; send(s: number): void } {
  const s: any = { onopen: null, onclose: null, onmessage: null, onerror: null, close: vi.fn() };
  s.open = () => s.onopen?.({});
  s.send = (v: number) =>
    s.onmessage?.({ data: JSON.stringify({ type: "intent_score", intent_score: v, mode: "band_power_only", timestamp: 0 }) });
  return s;
}

describe("StarCatchScene", () => {
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

  it("extends the reach and collects a star as scores stay high", () => {
    const stats = new SessionStats();
    const sock = fakeSocket();
    render(
      <StarCatchScene stats={stats} engagementThreshold={55} createSocket={() => sock} onEnd={() => {}} />,
    );
    act(() => sock.open());
    const before = Number(screen.getByTestId("reach-hand").getAttribute("data-reach"));

    act(() => sock.send(95));
    pump(40, 100); // ~4 s of high score → reach saturates and a star collects
    const after = Number(screen.getByTestId("reach-hand").getAttribute("data-reach"));

    expect(after).toBeGreaterThan(before);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-engaged", "true");
    expect(stats.trialsCompleted).toBeGreaterThanOrEqual(1);
  });

  it("ends the session on the End button", () => {
    const onEnd = vi.fn();
    const sock = fakeSocket();
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={55} createSocket={() => sock} onEnd={onEnd} />);
    screen.getByRole("button", { name: /end session/i }).click();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd patient-web && npm run test -- src/scenes/StarCatchScene.test.tsx`
Expected: FAIL — `Cannot find module './StarCatchScene'`.

- [ ] **Step 3: Write the scene implementation**

Create `patient-web/src/scenes/StarCatchScene.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { ReachModel } from "../reach/ReachModel";
import type { SessionStats } from "../session/SessionStats";
import { createScoreClient, type WsLike, type ConnectionState } from "../net/scoreClient";
import { CameraFeed } from "./CameraFeed";
import { ScoreStore } from "../scoring/scoreStore";
import { config } from "../config";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// SVG scene geometry (viewBox 0 0 480 600). The arm is anchored at the shoulder
// on the patient's AFFECTED side; the star goal sits in the opposite upper
// corner (intact visual field, spec §9.3). Everything derives from `reach`.
type Pt = { x: number; y: number };
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// Five-pointed star path centered at (0,0), outer radius r.
function starPath(r: number): string {
  const inner = r * 0.42;
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : inner;
    d += `${i === 0 ? "M" : "L"}${(Math.cos(rad) * rr).toFixed(2)} ${(Math.sin(rad) * rr).toFixed(2)} `;
  }
  return d + "Z";
}
const STAR = starPath(1); // unit star; scale per-use

export function StarCatchScene({
  stats,
  engagementThreshold,
  affectedSide = config.patient.affectedSide,
  createSocket,
  onEnd,
}: {
  stats: SessionStats;
  engagementThreshold: number;
  affectedSide?: "left" | "right";
  createSocket?: (url: string) => WsLike;
  onEnd: () => void;
}) {
  const [reach, setReach] = useState(0);
  const [goal, setGoal] = useState(ReachModel.GOAL_START);
  const [collected, setCollected] = useState(0);
  const [score, setScore] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [conn, setConn] = useState<ConnectionState>("connecting");

  const model = useRef(new ReachModel());
  const store = useRef(new ScoreStore());
  const lastTs = useRef<number | null>(null);
  const celebrateUntil = useRef(0);
  const createSocketRef = useRef(createSocket);
  createSocketRef.current = createSocket;

  useEffect(() => {
    const socketFactory =
      createSocketRef.current ?? ((url: string) => new WebSocket(url) as unknown as WsLike);
    const client = createScoreClient({
      url: config.wsUrl,
      createSocket: socketFactory,
      onFrame: (f) => { store.current.push(f); },
      onState: setConn,
    });
    client.connect();

    let raf = 0;
    const tick = (ts: number) => {
      const dt = lastTs.current === null ? 0 : (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      const latest = store.current.latest();
      const s = latest ? latest.intentScore : 0;
      model.current.update(s / 100, dt);
      const isEngaged = s >= engagementThreshold;
      stats.accumulate(dt, isEngaged);
      if (model.current.justCollected) {
        stats.incrementTrials();
        celebrateUntil.current = ts + 900; // ~0.9 s glow
      }
      setReach(model.current.reach);
      setGoal(model.current.goalFraction);
      setCollected(model.current.collected);
      setScore(s);
      setEngaged(isEngaged);
      setCelebrate(ts < celebrateUntil.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      client.stop();
    };
  }, [engagementThreshold, stats]);

  const reduced = prefersReducedMotion();
  const pct = Math.round(score);

  // Affected side → shoulder anchor; goal in the opposite upper corner.
  const shoulder: Pt = affectedSide === "left" ? { x: 96, y: 512 } : { x: 384, y: 512 };
  const goalEnd: Pt = affectedSide === "left" ? { x: 396, y: 96 } : { x: 84, y: 96 };
  const hand = lerp(shoulder, goalEnd, reach);
  const nextStar = lerp(shoulder, goalEnd, goal);

  return (
    <main className={`scene scene--stars${reduced ? " reduced-motion" : ""}`} data-testid="starcatch">
      <div className="stars-banner" data-engaged={engaged}>
        <span className="status-pill" data-testid="status-pill" data-engaged={engaged}>
          {engaged ? "Great reaching — keep going" : "Reach up toward the star"}
        </span>
        <span className="star-count" data-testid="star-count" aria-label={`${collected} stars caught`}>
          ⭐ {collected}
        </span>
      </div>

      <div className="stars-row">
        <div className="stars-sky" aria-hidden="true" />
        <div className="stars-ground" aria-hidden="true" />

        <div className="stars-camera">
          <CameraFeed recording />
        </div>

        <div className="stars-stage">
          <svg
            className={`stars-art${celebrate ? " stars-art--celebrate" : ""}`}
            data-testid="reach-scene"
            viewBox="0 0 480 600"
            role="img"
            aria-label={`Reach is ${Math.round(reach * 100)} percent toward the star`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* direction arrow along the reach axis */}
            <defs>
              <marker id="reach-arrow" markerWidth="10" markerHeight="10" refX="6" refY="3"
                      orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L6 3 L0 6 Z" fill="var(--purple-soft, #b9a3d6)" />
              </marker>
            </defs>
            <line
              x1={shoulder.x} y1={shoulder.y} x2={goalEnd.x} y2={goalEnd.y}
              stroke="var(--purple-soft, #b9a3d6)" strokeWidth="4" strokeDasharray="2 12"
              strokeLinecap="round" markerEnd="url(#reach-arrow)" opacity="0.6"
            />

            {/* goal star (big) */}
            <path
              data-testid="reach-goal"
              d={STAR} transform={`translate(${goalEnd.x} ${goalEnd.y}) scale(34)`}
              fill="var(--purple, #6a4c93)" stroke="#fff" strokeWidth="0.06"
            />

            {/* next-target star (dashed outline) at the current goal fraction */}
            <path
              d={STAR} transform={`translate(${nextStar.x} ${nextStar.y}) scale(18)`}
              fill="none" stroke="var(--purple, #6a4c93)" strokeWidth="0.14" strokeDasharray="0.3 0.25"
            />

            {/* the arm: shoulder → hand */}
            <line
              x1={shoulder.x} y1={shoulder.y} x2={hand.x} y2={hand.y}
              stroke="#c98b6b" strokeWidth="22" strokeLinecap="round"
            />
            <circle cx={shoulder.x} cy={shoulder.y} r="16" fill="#b06a4c" />

            {/* current-reach star at the hand (glowing) */}
            <path
              data-testid="reach-hand"
              data-reach={reach.toFixed(2)}
              d={STAR} transform={`translate(${hand.x} ${hand.y}) scale(22)`}
              fill="#f4c84a" stroke="#fff" strokeWidth="0.08"
            />
          </svg>
        </div>

        {/* fused Reach Power meter — single number, no EEG/kinematic split */}
        <div className="reach-meter">
          <span className="reach-meter__label">Reach power</span>
          <div
            className="reach-bar"
            data-testid="reach-bar"
            role="progressbar"
            aria-label="Reach power"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="reach-bar-fill" style={{ height: `${pct}%` }} />
          </div>
          <span className="reach-meter__value">{pct}</span>
        </div>
      </div>

      <div className="stars-footer">
        <button type="button" className="end-button" onClick={onEnd}>
          End session
        </button>
        <span className="conn-badge" data-state={conn}>{conn}</span>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Append CSS**

Append to `patient-web/src/styles.css` (reuses Garden's `.status-pill`, `.conn-badge`, `.end-button`, `.app-quit-btn`, and camera sidecar shape; only the Star-Catcher-specific layout is new):

```css
/* ---- Star Catcher (Reach & Collect) ---- */
.scene--stars {
  position: relative;
  overflow: hidden;
  min-height: 100vh;
  background: linear-gradient(180deg, #2a2140 0%, #4a3a6b 60%, #6a4c93 100%);
}
.stars-banner {
  position: relative;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
}
.stars-banner .star-count {
  font-size: 1.4rem;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 999px;
  padding: 6px 16px;
}
.stars-row {
  position: relative;
  min-height: calc(100vh - 160px);
}
.stars-sky { position: absolute; inset: 0; z-index: 0; }
.stars-ground {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 12%;
  z-index: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 100%);
}
.stars-stage {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stars-art { width: min(90vw, 70vh); height: auto; }
.stars-art--celebrate { filter: drop-shadow(0 0 18px #f4c84a); }
.scene--stars.reduced-motion .stars-art--celebrate { filter: none; }
.stars-camera {
  position: fixed;
  z-index: 3;
  left: clamp(20px, 5vw, 64px);
  top: 50%;
  transform: translateY(-50%);
}
.reach-meter {
  position: fixed;
  z-index: 2;
  right: clamp(20px, 5vw, 64px);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #fff;
}
.reach-meter__label { font-weight: 600; }
.reach-meter__value { font-size: 1.6rem; font-weight: 800; }
.reach-bar {
  width: 40px;
  height: 300px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}
.reach-bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #f4c84a 0%, #e0ad2e 100%);
}
.stars-footer {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd patient-web && npm run test -- src/scenes/StarCatchScene.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add patient-web/src/scenes/StarCatchScene.tsx patient-web/src/scenes/StarCatchScene.test.tsx patient-web/src/styles.css
git commit -m "feat(patient-web): StarCatchScene reach-and-collect SVG scene"
```

---

### Task 3: Wire Star Catcher slot + routing + docs + full verification

**Files:**
- Modify: `patient-web/src/scenes/GameModeSelect.tsx` (enable `stars`)
- Modify: `patient-web/src/scenes/GameModeSelect.test.tsx` (assert enabled)
- Modify: `patient-web/src/App.tsx` (route `stars` → StarCatchScene)
- Modify: `docs/todos.md` (changelog)

**Interfaces:**
- Consumes: `StarCatchScene` (Task 2); existing `GameModeSelect` `onConfirm(id: GameModeId)`.
- Produces: routing so `onConfirm("stars")` renders `StarCatchScene`; `onConfirm("garden")` still renders `GardenScene`.

- [ ] **Step 1: Update the GameModeSelect test to expect Star Catcher enabled**

In `patient-web/src/scenes/GameModeSelect.test.tsx`, find the assertion(s) that treat `mode-stars` as disabled/unavailable and change them to expect it enabled. Add this test (adjust import block if `fireEvent`/`screen` already imported):

```tsx
it("allows selecting Star Catcher and confirms with its id", () => {
  const onConfirm = vi.fn();
  render(<GameModeSelect onConfirm={onConfirm} />);
  const stars = screen.getByTestId("mode-stars");
  expect(stars).not.toBeDisabled();
  stars.click();
  screen.getByTestId("mode-ready").click();
  expect(onConfirm).toHaveBeenCalledWith("stars");
});
```

> Before writing, open `GameModeSelect.test.tsx` and remove/adjust any existing assertion that `mode-stars` is `disabled` or `data-available="false"`, so the suite is internally consistent.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd patient-web && npm run test -- src/scenes/GameModeSelect.test.tsx`
Expected: FAIL — `mode-stars` is still disabled, so `.not.toBeDisabled()` / the click+confirm fails.

- [ ] **Step 3: Enable the Star Catcher slot**

In `patient-web/src/scenes/GameModeSelect.tsx`, change the `stars` entry:

```tsx
  { id: "stars", title: "Star Catcher", icon: "⭐", available: true },
```

(Leave `river` as `available: false`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd patient-web && npm run test -- src/scenes/GameModeSelect.test.tsx`
Expected: PASS.

- [ ] **Step 5: Route the `stars` mode in App.tsx**

In `patient-web/src/App.tsx`:

1. Add the import:

```tsx
import { StarCatchScene } from "./scenes/StarCatchScene";
```

2. Extend the `View` union:

```tsx
type View = "welcome" | "calibration" | "modeselect" | "garden" | "stars" | "summary";
```

3. Replace the `modeselect` case so confirmation routes by id:

```tsx
      case "modeselect":
        // Garden Grow and Star Catcher are wired; GameModeSelect disables the rest.
        return <GameModeSelect onConfirm={(id) => setView(id === "stars" ? "stars" : "garden")} />;
```

4. Add the `stars` case after the `garden` case:

```tsx
      case "stars":
        return (
          <StarCatchScene
            stats={stats}
            engagementThreshold={config.engagementThreshold}
            affectedSide={config.patient.affectedSide}
            onEnd={() => setView("summary")}
          />
        );
```

- [ ] **Step 6: Typecheck and run the FULL suite**

Run: `cd patient-web && npx tsc --noEmit && npm run test`
Expected: 0 type errors; all tests pass (existing 43 + new ReachModel 6 + StarCatchScene 2 + GameModeSelect new = green).

- [ ] **Step 7: Update docs/todos.md**

Add a dated changelog entry under the V2-1 section of `docs/todos.md`:

```markdown
- **Star Catcher / Reach & Collect (2026-07-01)** — New patient-web mini-game
  (`reach/ReachModel.ts` + `scenes/StarCatchScene.tsx`): embodied avatar arm
  reaches diagonally toward a star driven by IntentScore; endless collect +
  celebrate with an adaptive difficulty staircase; affected-side-aware layout;
  fused "Reach power" meter (angles hidden from patient). Wired to the Star
  Catcher menu slot — selecting it routes to the new scene instead of Garden Grow.
  Spec: docs/superpowers/specs/2026-07-01-star-catcher-reach-collect-design.md.
```

- [ ] **Step 8: Commit**

```bash
git add patient-web/src/App.tsx patient-web/src/scenes/GameModeSelect.tsx patient-web/src/scenes/GameModeSelect.test.tsx docs/todos.md
git commit -m "feat(patient-web): wire Star Catcher menu slot to Reach & Collect scene"
```

- [ ] **Step 9: Keep the knowledge graph current**

Run: `graphify update .`
(Per CLAUDE.md — AST-only, no API cost. If `graphify` is unavailable, skip.)

---

## Self-Review

- **Spec coverage:** §5.1 ReachModel → Task 1. §5.2 StarCatchScene (net loop, geometry, markers, meter, celebrate, camera, footer, reduced-motion) → Task 2. §5.3 wiring (GameModeSelect enable + App route) → Task 3. §5.4 CSS → Task 2 Step 4. §6 tests → Tasks 1–3. Decisions (diagonal axis, endless respawn, star target) → Task 2 geometry + ReachModel. Out-of-scope items intentionally absent.
- **Type consistency:** `ReachModel` getters (`reach`, `goalFraction`, `collected`, `justCollected`) and statics (`GOAL_START`, `HOLD_S`, `GOAL_MAX`, `GOAL_MIN`, `MISS_S`) match across Tasks 1–2. Scene props signature identical where referenced in Tasks 2–3. `GameModeId` `"stars"` matches existing type in `GameModeSelect.tsx`.
- **Placeholders:** none — all steps carry full code/commands and expected output.
