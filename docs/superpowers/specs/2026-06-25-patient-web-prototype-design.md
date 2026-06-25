# Patient-Web Prototype — Design (V2-1, EEG-only Garden path)

**Date:** 2026-06-25
**Status:** approved (design phase)
**Scope:** First prototype of the React web patient client (`patient-web/`), per
specsv2 §9 / §15 phase **V2-1**. EEG-only Garden Grow loop, driven live by the
existing signal-engine mock EEG + virtual-MI stream and validated alongside the
existing clinician console.

Reference: [`docs/specsv2.md`](../../specsv2.md) (§4 stack, §9 game design, §13
testing, §15 roadmap) and the patient screens P1/P2/P3/P6 in
[`docs/wireframe.pdf`](../../wireframe.pdf).

---

## 1. Goal & non-goals

**Goal.** Stand up `patient-web/` — a zero-install React web game — that closes
the neurofeedback loop end-to-end on synthetic data: it subscribes to the
sidecar's existing 20 Hz `intent_score` WebSocket, drives a Garden Grow visual
through the ported `PlantGrowthModel`, and produces a warm patient-facing
summary. The prototype must be proven both in isolation (unit/component tests)
and **against the live mock-EEG sidecar shared with the existing clinician
console** (integration + cross-client parity).

**Non-goals (explicitly deferred).**
- PixiJS rendering (spec §4.1/§9.5 mandates it; this prototype uses React +
  SVG/CSS — see §6, migration deferred).
- LAN session-code pairing, HTTPS/WSS, QR (spec V2-0).
- WebRTC patient camera → aiortc (spec V2-2).
- P4 Reach & Collect, P5 compensation overlay (need kinematics, spec V2-2).
- Real marker/orchestrator-driven calibration (no marker channel reaches the
  browser yet — see §5.2).
- Persistence / profile service (Welcome name + affected side come from a seed
  config, mirroring the console's in-memory `PatientStore` choice).
- Deleting `game-client/` (spec §4.2) — left untouched this round.

---

## 2. Repository placement & conventions

New top-level `patient-web/`, structured and toolchained to match
`clinician-console/`:

- Vite + React 18 + TypeScript.
- Vitest + jsdom + Testing Library for unit/component tests; a separate
  `vitest.integration.config.ts` for the live-sidecar test (same split the
  console uses).
- **View-state router** (a `useState` flow machine in `App.tsx`), not
  react-router — consistent with the console's `App.tsx`. No new routing dep.
- Direct `ws://localhost:8765` connection (the transport the console already
  uses today); the LAN server is a later phase.

```
patient-web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── vitest.integration.config.ts
├── integration/
│   └── sidecar.live.test.ts        # boots real mock-EEG sidecar
└── src/
    ├── main.tsx                    # Vite entry → <App/>
    ├── App.tsx                     # Welcome→Calibration→Garden→Summary flow
    ├── config.ts                   # seed patient profile + WS url + thresholds
    ├── scoring/
    │   ├── intentScoreMessage.ts   # port of console parser (identical contract)
    │   ├── intentScoreMessage.test.ts
    │   ├── scoreStore.ts           # latest / recentAverage / streakAboveThreshold
    │   └── scoreStore.test.ts
    ├── net/
    │   ├── scoreClient.ts          # WS client + reconnect/backoff
    │   └── scoreClient.test.ts
    ├── garden/
    │   ├── PlantGrowthModel.ts     # verbatim C# port (pure logic)
    │   └── PlantGrowthModel.test.ts
    ├── session/
    │   ├── SessionStats.ts         # verbatim C# port (pure logic + copy)
    │   └── SessionStats.test.ts
    └── scenes/
        ├── WelcomeScene.tsx        + .test.tsx
        ├── CalibrationScene.tsx    + .test.tsx
        ├── GardenScene.tsx         + .test.tsx
        └── SummaryScene.tsx        + .test.tsx
```

---

## 3. Data flow

```
run_ws_server.py (mock EEG + virtual MI)
  → ws://localhost:8765  {"type":"intent_score","intent_score":…,"erd_score":…,
                          "classifier_score":null,"is_artifact":…,
                          "mode":"band_power_only","timestamp":…}  @ ~20 Hz
  → scoreClient (parse + reconnect/backoff)
  → scoreStore (latest, recent average, streak)
  → GardenScene rAF loop:
        plant.update(latest.intentScore / 100, dtSeconds)
        SessionStats.accumulate(dt, engaged = score ≥ engagementThreshold)
  → SVG flower height = plant.currentGrowth, bloom petals when plant.isBloom
  → vertical intent bar + plain-language status pill
  → End → SummaryScene reads SessionStats
```

The wire format is **unchanged** from the v1 WS server; `eeg_quality` frames
(console C2) are simply ignored by the patient client.

---

## 4. Pure-logic ports (the testable core)

### 4.1 `intentScoreMessage.ts`
Port of `clinician-console/src/scoring/intentScoreMessage.ts` **verbatim**,
minus nothing — same `ScoreFrame` type, same `parseIntentScoreMessage` returning
`{ok:true,frame}` / `{ok:false,error}`. `erd_score`/`classifier_score` → number
or null; non-`intent_score` types rejected. This guarantees the patient and
console parse byte-identical frames.

### 4.2 `scoreStore.ts`
TS port of the C# `IntentScoreBuffer`: fixed circular buffer (default 600 =
30 s @ 20 Hz). API: `push(frame)`, `latest()`, `recentAverage(n)`,
`streakAboveThreshold(threshold)` (count of most-recent consecutive frames whose
`intentScore ≥ threshold`), `size()`, `clear()`.

### 4.3 `PlantGrowthModel.ts`
**Verbatim port** of `archive/.../Garden/PlantGrowthModel.cs`:
- `GROW_SPEED = 0.8`, `WILT_SPEED = 0.3` (per second).
- `BLOOM_ON = 0.75`, `BLOOM_OFF = 0.60`, `BLOOM_DWELL_S = 3.0`.
- `update(intentScore01, dtSeconds)`: clamp target to [0,1]; step toward target
  at grow/wilt speed (asymmetric); snap when within one step; clamp; update
  bloom (accumulate above-time only while `currentGrowth > BLOOM_ON`, set bloom
  at dwell ≥ 3 s, clear bloom + reset dwell when `currentGrowth < BLOOM_OFF`).
- `currentGrowth`, `targetGrowth`, `isBloom` read-only getters; `reset()`.
- `Mathf.Clamp01`/`Mathf.Sign`/`Mathf.Max` → local TS helpers.

### 4.4 `SessionStats.ts`
TS port of `archive/.../UI/SessionStats.cs`. Prototype keeps it as an instance
(not a static singleton — TS modules don't need the static-bridge trick) holding
`totalActiveSeconds`, `bestStreakSeconds`, `trialsCompleted`, with:
- `accumulate(dtSeconds, engaged: boolean)` — adds active time + tracks the
  longest continuous engaged streak (engaged = score ≥ engagement threshold).
- `focusLine()` → "You focused for N minute(s)" (singular/plural).
- `streakLine()` → "Your best streak was N seconds".
- `praiseLine()` → "Great session!".
All copy is warm, non-comparative, no raw % / grade (spec §9.3).

---

## 5. Scenes

### 5.1 WelcomeScene (P1)
"Hi {firstName} — ready to play?" + sub-line + one large "Let's begin" button.
`firstName`/`affectedSide` from `config.ts` seed. Large type, high-contrast,
no flicker; primary action pinned to the intact visual field given affected
side. Button → Calibration.

### 5.2 CalibrationScene (P2) — cosmetic this round
A **client-timed** cue sequencer demonstrating the Graz paradigm: states
`fixation`(2.0 s) → `cue`(1.25 s) → `imagine`(4.0 s) → `rest`(randomized
2–3 s), labeled "Warm-up · trial N of 20", with "Imagine opening your
{affectedSide} hand" and an animated hand-open SVG during cue/imagine.
**It is NOT wired to the real `CalibrationOrchestrator` / LSL marker stream** —
no marker channel reaches the browser yet. It is a faithful UI of the paradigm
only. After a small number of demo trials (or a Skip control for dev) → Garden.
This limitation is called out in code comments and `docs/todos.md`.

### 5.3 GardenScene (P3) — the live loop
On mount: construct `scoreClient` → `ws://localhost:8765`, a `scoreStore`, a
`PlantGrowthModel`, and a `SessionStats`. A `requestAnimationFrame` loop computes
`dt`, reads `scoreStore.latest()`, calls `plant.update(score/100, dt)` and
`stats.accumulate(dt, score ≥ engagementThreshold)`, then renders:
- SVG flower whose stem/foliage height tracks `plant.currentGrowth`; bloom
  petals appear when `plant.isBloom`.
- A vertical Intent Score bar (0–100) on the right (wireframe P3).
- A plain-language, colorblind-safe status pill: ≥ engagement → "Good focus"
  (calm green), else "Keep imagining — it's growing!" (warm amber). Color is
  **paired with text** (colorblind-safe, spec §9.3).
- A small connection badge (connecting / live / reconnecting).
Respects `prefers-reduced-motion` (no easing/pulsing animation when set); no
strobe, no flashing (spec §12). Artifact frames need no special handling — the
engine forwards the held score on artifact, so the plant simply holds.
An "End session" control captures into SessionStats → Summary. rAF loop and the
socket are torn down on unmount.

### 5.4 SummaryScene (P6)
"Great work today!" + two big tiles (minutes played, best streak) from
SessionStats, a warm "playing at a higher level than last week" line (mock,
no real history yet), and a lighthouse story-progress placeholder. **No PHI, no
clinical metrics, no raw score** (spec §9.3, §11).

---

## 6. Rendering choice (React + SVG/CSS, not PixiJS)

specsv2 §4.1/§9.5 mandate PixiJS. This prototype deliberately uses React +
SVG/CSS because (a) the Garden visual is a single growing flower + a bar — within
easy reach of SVG, (b) it is fully unit/component-testable in jsdom with no
canvas/WebGL shim, and (c) it removes a heavy dependency from the first
iteration. The pure logic (`PlantGrowthModel`) is renderer-agnostic, so a later
PixiJS swap touches only the scene's draw code, not the model or its tests. This
divergence is recorded as a known follow-up.

---

## 7. Testing strategy

### 7.1 Unit (Vitest, jsdom)
- `intentScoreMessage.test.ts` — valid frame, malformed JSON, non-object,
  wrong `type`, missing/non-numeric `intent_score`, null `classifier_score`
  (ported from the console's tests).
- `PlantGrowthModel.test.ts` — ports the NUnit `TestPlantGrowthModel`: grows
  toward a high target; wilt is slower than grow (asymmetry); snaps within one
  step; clamps [0,1]; bloom only after ≥ 3 s dwell above 0.75; bloom held
  between 0.60 and 0.75 (hysteresis); bloom cleared below 0.60; `reset()`.
- `SessionStats.test.ts` — ports `TestSessionStats`: focus line singular vs
  plural; streak line; engaged-streak accumulation picks the longest run.
- `scoreStore.test.ts` — push/latest, recentAverage(n), streakAboveThreshold,
  wraparound at capacity, empty-buffer behavior.
- `scoreClient.test.ts` — routes valid frames to `onFrame`, ignores junk;
  reconnect with exponential backoff using an injected fake socket + fake
  scheduler; `stop()` suppresses reconnect (ported from the console).

### 7.2 Component (Testing Library)
- WelcomeScene — renders the seed first name; "Let's begin" fires the advance
  callback.
- CalibrationScene — advances through fixation→cue→imagine→rest on a fake timer;
  shows "trial N of 20" and the affected-side cue text.
- GardenScene — feeding a rising sequence of injected scores grows the flower
  (assert the SVG height / a `data-growth` attribute increases); status pill
  text + class switch at the engagement threshold; `prefers-reduced-motion`
  disables the animation class. (Socket is injected/mocked — no real network.)
- SummaryScene — renders minutes + streak from an injected SessionStats; no raw
  percentage text present.

### 7.3 Integration — live mock-EEG sidecar (headline)
`integration/sidecar.live.test.ts`, gated on `conda` availability and skipped
otherwise (exact pattern from `clinician-console/integration/sidecar.live.test.ts`,
including `waitPort` and the process-group `killTree` so port 8765 leaves no
orphan):
1. Spawn `conda run -n eeg python signal-engine/run_ws_server.py` (mock EEG +
   virtual MI).
2. Connect the patient `scoreClient` over node `ws`, collect ~15 s of frames,
   and feed each into a real `PlantGrowthModel` (fixed dt per frame).
3. Assert: ≥ 100 frames; `mode === "band_power_only"`; `classifierScore` null;
   all scores in [0,100]; score spread > 15 (virtual-MI moves it); peak > 40
   (a burst clears a real floor); **and the plant's `currentGrowth` rises above
   a low floor during the bursts** — the closed-loop proof that mock MI actually
   grows the garden.

### 7.4 Cross-client parity ("works with the existing console")
In the same integration file (or a sibling): attach **both** the patient parser
and the console's `parseIntentScoreMessage` to one sidecar socket and assert the
two produce an identical `intentScore` sequence — proving the shared 20 Hz
contract is intact and the patient client coexists with the console on the same
stream.

### 7.5 Build / verification gates
- `tsc` typecheck clean.
- `vite build` clean.
- All unit + component tests green; integration green when conda present.
- No orphan process on port 8765 after the integration suite (assert teardown).

---

## 8. Risks / open items

- **P2 is cosmetic** (§5.2) — must be reconciled when the LAN server bridges the
  LSL marker stream to the browser. Tracked in `docs/todos.md`.
- **PixiJS divergence** (§6) — follow-up migration before richer mini-games.
- **Engagement threshold** for status pill / active-time is a tunable constant in
  `config.ts`; the wireframe's "~70–80 % success band" is a difficulty-staircase
  concern (spec §9.4) not built this round.
- Direct `ws://localhost:8765` only; LAN/WSS/pairing deferred (spec V2-0).

---

*End of design.*
