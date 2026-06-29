# Warm-up Hand Visualization — Design

**Date:** 2026-06-29
**Status:** Approved (design phase)
**Area:** `patient-web/` — `CalibrationScene` (warm-up)

## Problem

The patient-web warm-up (`CalibrationScene`, a cosmetic Graz motor-imagery cue
sequencer: `fixation → cue → imagine → rest`) currently shows only text plus an
empty `.hand-glyph` div. There is no visual demonstration of the movement the
patient is asked to imagine.

The archive app `archive/eeg-motor-imagery-collector` renders a 3D capsule-based
Shadow Robot Hand (`ShadowHand3D.jsx`) that animates between open and closed
postures in its Continuous Motion mode, driven by a normalized joint-angle pose
library (`handPoses.js`) and minimum-jerk interpolation (`interpolation.js`).

We will port that 3D hand into the warm-up: render a **left and a right hand**
side by side, with the **cue text above**, animate the **affected side**
(neutral→open on the `cue` phase, then an open↔close loop during `imagine`),
and dim the non-active hand.

## Decisions (from brainstorming)

- **Render approach:** Port the archive 3D Shadow Hand. Add `three`,
  `@react-three/fiber`, `@react-three/drei` to patient-web (first WebGL in this
  app, ~600KB added). Chosen for fidelity to the referenced archive viz.
- **Hands shown:** Both — left + right side by side; the affected side animates,
  the other is dimmed/static.
- **Motion:** `cue` phase = neutral→open once (minimum-jerk). `imagine` phase =
  open↔close loop (~1 s per half). `fixation`/`rest` = neutral.

## Architecture

New directory `patient-web/src/warmup/`:

| File | Purpose | Deps |
|------|---------|------|
| `handPoses.ts` | Typed pose library, **3 poses only**: `neutral`, `open`, `closedGrasp`. | none |
| `interpolation.ts` | Typed port of `lerp`, `minimumJerk`, `interpolateJoints`, `interpolatePoses`. | none |
| `useWarmupPose.ts` | Pure RAF hook `(phase) → JointAngles`. Maps phase to motion. | React |
| `ShadowHand3D.tsx` | Typed port of the capsule hand. Props add `side` + `dimmed`. | three, R3F, drei |
| `WarmupHands.tsx` | Lays out both hands; feeds active hand from `useWarmupPose`, dims the other. | R3F |

`CalibrationScene.tsx` is modified to drop `.hand-glyph` and mount
`<WarmupHands phase={phase} activeSide={affectedSide} />` with the cue text
rendered above it.

### Data types

```ts
type FingerJoints = { mcp: number; pip: number; dip: number };       // index/pinky
type ThumbJoints  = { cmc: number; mcp: number; ip: number };
type JointAngles  = { thumb: ThumbJoints; index: FingerJoints; pinky: FingerJoints };
type PoseName     = "neutral" | "open" | "closedGrasp";
type Side         = "left" | "right";
```

Joint angles are normalized `[0,1]` (0 = extended, 1 = flexed), matching the
archive convention.

### Pose subset (`handPoses.ts`)

Port only the three poses needed for open/close motion (values copied verbatim
from the archive `HAND_POSES`):

- `neutral` — relaxed slight curl (rest / non-cue phases).
- `open` — all fingers fully extended (cue target).
- `closedGrasp` — all fingers flexed (loop's closed extreme).

The other 9 archive poses (pinches, hooks, spans) are **out of scope** — YAGNI.

## Motion logic (`useWarmupPose`)

Pure hook, no WebGL. Drives a `requestAnimationFrame` loop and returns the
current interpolated `JointAngles`. Behavior per phase:

| Phase | Motion |
|-------|--------|
| `fixation` | hold `neutral` |
| `cue` | interpolate `neutral → open` once over the phase (minimum-jerk), then hold `open` |
| `imagine` | loop `open ↔ closedGrasp`, ~1 s per half, minimum-jerk easing |
| `rest` | hold `neutral` |

The hook resets its internal clock when `phase` changes. It does not own phase
timing — `CalibrationScene` remains the single source of phase truth (its
existing `setTimeout` sequencer is unchanged).

The phase→motion mapping and the interpolation are unit-testable without WebGL.

## ShadowHand3D port

Typed 1:1 port of `archive/.../ShadowHand3D.jsx` (capsule `Segment`s,
`StandardFinger`, `LittleFinger`, `Thumb`, `Palm`, joint-limit mapping, finger
state coloring). Two new props:

- `side: "left" | "right"` — `right` renders as the archive does. `left` wraps
  the root model group in `<group scale={[-1, 1, 1]}>` to mirror across the
  sagittal plane. Negative scale flips triangle winding, so segment materials
  set `side={THREE.DoubleSide}` to keep lighting/shading correct.
- `dimmed: boolean` — when true, force the ghost/desaturated palette
  (`FINGER_STATE_COLORS_GHOST`) and overall opacity ~0.4 so the non-active hand
  recedes.

Camera is **locked** — `OrbitControls` is removed (patients should not need to
manipulate the view). A fixed flattering camera position/target is hard-coded
(reuse the archive's `camera={{ position:[0,1.5,3], fov:50 }}`, target
`[0,0.7,0]`).

## WarmupHands layout

```
        ┌──────────────────────────────┐
        │  Imagine opening your left… │   ← cue text (from CalibrationScene, above)
        ├───────────────┬──────────────┤
        │   LEFT hand   │  RIGHT hand   │
        │  (active or   │  (active or   │
        │    dimmed)    │    dimmed)    │
        └───────────────┴──────────────┘
```

- Flex row, two equal columns, each holding one `ShadowHand3D` in its own
  `<Canvas>` (so the left/right mirror is isolated per canvas).
- `activeSide` hand: `dimmed={false}`, `jointAngles` from `useWarmupPose(phase)`.
- Other hand: `dimmed={true}`, `jointAngles = neutral` (static).

## CalibrationScene changes

- Remove the `.hand-glyph` div.
- Render order top→bottom: `cal-header` → cue block (`cal-cue` / `cal-sub`) →
  `<WarmupHands phase={phase} activeSide={affectedSide} />`.
- Cue text stays above the hands in all phases (during `fixation`/`rest` the
  existing "Get ready…" / "Rest" copy shows above static neutral hands).
- No change to the phase sequencer, durations, or `onComplete` contract.

## Testing

- **WebGL in jsdom:** none available. Add a mock for `@react-three/fiber`
  (`Canvas` → passthrough `<div>`) and `@react-three/drei` in `test-setup.ts`
  (or a per-test `vi.mock`) so `CalibrationScene.test.tsx` keeps asserting
  phase/cue DOM without a WebGL context.
- **`interpolation.ts`:** unit tests for `lerp`, `minimumJerk` endpoints/midpoint,
  `interpolatePoses` shape + bounds.
- **`useWarmupPose.ts`:** test phase→pose mapping (neutral at rest, open at end
  of cue, oscillation during imagine) using fake timers / RAF stub.
- **`CalibrationScene.test.tsx`:** existing phase/trial/`onComplete` assertions
  stay green with the Canvas mocked.
- Run `npm run typecheck` and `npm run test` — both must pass.

## Out of scope

- Real LSL marker wiring (warm-up stays cosmetic per the existing note in
  `CalibrationScene.tsx`).
- `OrbitControls` / interactive camera.
- Camera capture / MediaPipe hand tracking from the archive.
- Pose library beyond the 3 open/close poses.
- Any change to `GardenScene`, scoring, or the WS pipeline.

## Risks

- **Mirror shading:** negative-scale winding flip — mitigated with
  `DoubleSide`. Verify visually that the left hand isn't lit inside-out.
- **Bundle size:** three + R3F + drei is the first heavy dep here. Acceptable
  for the clinic-LAN prototype; revisit if load time regresses.
- **Two `<Canvas>` contexts:** two WebGL contexts on one page. Low risk on
  modern browsers; fall back to a single canvas with both hands if context
  limits bite.
