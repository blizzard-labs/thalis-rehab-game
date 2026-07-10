# Directional Wrist-Reach Star Catcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the fragile per-joint-angle capture with a directional wrist-position game so that the patient's motion, the avatar arm, the goal star, and the catch all agree — and place the stars up / to the affected side / below.

**Architecture:** Emit the affected wrist's 2D offset from the shoulder (normalized by torso length) on the `intent_score` frame. Patient-web drives the avatar wrist directly from that offset (2-bone IK), places each trial's goal star at a fixed screen direction (up / side / down), and captures when the net (live wrist) is within a radius of the star while EEG-engaged. Angles stay on the frame for clinician logging.

**Tech Stack:** Python (numpy) signal-engine; React + TS + Vitest patient-web; shared byte-identical parser.

## Global Constraints

- Signal-engine tests via `conda run -n eeg pytest signal-engine/tests/...` from repo root.
- patient-web: `cd patient-web && npm run test`, `npm run typecheck`.
- clinician-console parser is **byte-identical** to patient-web's `intentScoreMessage.ts` — edit both identically; new fields are nullable so existing frame literals stay valid.
- Camera-mirroring sign (`SIDE_SCREEN_SIGN`, `IMG_TO_SCREEN`) may need a one-line flip after a live visual check — keep these as named constants.
- Commit after each task. No `Co-Authored-By` trailer.

---

### Task 1: Emit wrist offset from signal-engine

**Files:**
- Modify: `signal-engine/vision/kinematics.py` (add `wrist_offset`)
- Modify: `signal-engine/vision/types.py` (`KinematicResult` fields)
- Modify: `signal-engine/vision/kinematic_engine.py` (populate + LKG bridge)
- Modify: `signal-engine/server/ws_server.py` (`_joints_payload`)
- Test: `signal-engine/tests/test_kinematics.py`

**Interfaces:**
- Produces: `wrist_offset(pose, side) -> (dx, dy)` normalized by `‖shoulder−hip‖`, image coords (x right, y down); frame `joints.wrist_dx`, `joints.wrist_dy`.

- [ ] **Step 1: Failing test** — append to `signal-engine/tests/test_kinematics.py`:

```python
def test_wrist_offset_normalized_direction():
    import numpy as np
    from vision import kinematics as kin
    # 33x4 landmark array (x,y,z,visibility); only the right-side joints matter.
    pose = np.zeros((33, 4), float)
    pose[:, 3] = 1.0
    pose[kin.RIGHT_SHOULDER, :3] = [0.0, 0.0, 0.0]
    pose[kin.RIGHT_HIP, :3] = [0.0, 0.5, 0.0]          # torso length 0.5
    pose[kin.RIGHT_WRIST, :3] = [0.25, -0.5, 0.0]      # 0.25 right, 0.5 up
    dx, dy = kin.wrist_offset(pose, "right")
    assert dx == 0.5   # 0.25 / 0.5 torso
    assert dy == -1.0  # -0.5 / 0.5 torso  (up is negative image-y)
```

- [ ] **Step 2: Run — expect fail**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematics.py::test_wrist_offset_normalized_direction -v`
Expected: FAIL — `AttributeError: module 'vision.kinematics' has no attribute 'wrist_offset'`

- [ ] **Step 3: Implement `wrist_offset`** — add to `kinematics.py` after `reach_extent`:

```python
def wrist_offset(pose: np.ndarray, side: str) -> tuple[float, float]:
    """Wrist position relative to the shoulder, normalized by torso length
    (‖shoulder−hip‖). Image coords: +x right, +y down. Reliable in the camera's
    frontal plane (no depth), so it distinguishes reach direction."""
    idx = side_indices(side)
    shoulder = pose[idx["shoulder"], :3]
    wrist = pose[idx["wrist"], :3]
    hip = pose[idx["hip"], :3]
    torso = float(np.linalg.norm(shoulder - hip))
    if torso < 1e-9:
        return 0.0, 0.0
    return float((wrist[0] - shoulder[0]) / torso), float((wrist[1] - shoulder[1]) / torso)
```

- [ ] **Step 4: Add fields to `KinematicResult`** — in `types.py`, after `elbow_deg`:

```python
    wrist_dx: float = 0.0
    wrist_dy: float = 0.0
```

- [ ] **Step 5: Populate in `kinematic_engine.py`** — extend the `angles` dict in `compute` (after `elbow_deg=...`):

```python
        angles = dict(
            shoulder_flexion_deg=kin.shoulder_flexion_angle(frame.pose, self.affected_side),
            shoulder_abduction_deg=kin.shoulder_abduction_angle(frame.pose, self.affected_side),
            elbow_deg=kin.elbow_extension_angle(frame.pose, self.affected_side),
        )
        wdx, wdy = kin.wrist_offset(frame.pose, self.affected_side)
        angles["wrist_dx"], angles["wrist_dy"] = wdx, wdy
```

And carry them through the LKG bridge in `_invalid`:

```python
            return KinematicResult(g.kinematic_score, 0.0, False, False, True, ts,
                                   g.shoulder_flexion_deg, g.shoulder_abduction_deg, g.elbow_deg,
                                   g.wrist_dx, g.wrist_dy)
```

- [ ] **Step 6: Emit in `ws_server.py`** — in `_joints_payload`, after `"elbow_deg": ...`:

```python
            "wrist_dx": float(k.wrist_dx),
            "wrist_dy": float(k.wrist_dy),
```

- [ ] **Step 7: Run signal-engine tests**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematics.py signal-engine/tests/test_kinematic_engine.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add signal-engine/vision/kinematics.py signal-engine/vision/types.py signal-engine/vision/kinematic_engine.py signal-engine/server/ws_server.py signal-engine/tests/test_kinematics.py
git commit -m "feat(vision): emit normalized wrist offset (dx,dy) on the kinematic frame"
```

---

### Task 2: Parser — add wristDx/wristDy (both apps, byte-identical)

**Files:**
- Modify: `patient-web/src/scoring/intentScoreMessage.ts`
- Modify: `clinician-console/src/scoring/intentScoreMessage.ts`
- Test: `patient-web/src/scoring/intentScoreMessage.test.ts` (if present; else skip test add)

**Interfaces:**
- Produces: `ScoreFrame["joints"]` gains `wristDx: number | null; wristDy: number | null;`.

- [ ] **Step 1: Edit the type** in BOTH files — inside the `joints` object type, after `elbowDeg`:

```ts
    wristDx: number | null;
    wristDy: number | null;
```

- [ ] **Step 2: Edit `parseJoints`** in BOTH files — after `elbowDeg: numOrNull(j.elbow_deg),`:

```ts
    wristDx: numOrNull(j.wrist_dx),
    wristDy: numOrNull(j.wrist_dy),
```

- [ ] **Step 3: Verify diff identical**

Run: `diff patient-web/src/scoring/intentScoreMessage.ts clinician-console/src/scoring/intentScoreMessage.ts`
Expected: no output (files byte-identical).

- [ ] **Step 4: Typecheck both** (fixtures constructing `joints` literals now need the two fields)

Run: `cd patient-web && npm run typecheck; cd ../clinician-console && npm run typecheck`
Expected: errors listing every test/source file that builds a `joints` literal without `wristDx/wristDy`.

- [ ] **Step 5: Patch every `joints:` literal** flagged by typecheck — add `wristDx: null, wristDy: null` (or real values) to each. Re-run Step 4 until both typecheck clean.

- [ ] **Step 6: Run both suites**

Run: `cd patient-web && npm run test; cd ../clinician-console && npm run test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add patient-web/src/scoring/intentScoreMessage.ts clinician-console/src/scoring/intentScoreMessage.ts patient-web/src clinician-console/src
git commit -m "feat: add wristDx/wristDy to the ScoreFrame joints contract (both apps)"
```

---

### Task 3: Two-bone IK for the avatar arm

**Files:**
- Create: `patient-web/src/reach/ikArm.ts`
- Test: `patient-web/src/reach/ikArm.test.ts`

**Interfaces:**
- Produces: `ikArm({ shoulder, target, upperLen, foreLen, bendSign }) -> { elbow, wrist }` — solves the elbow so the wrist reaches `target` (clamped to `upperLen+foreLen`).

- [ ] **Step 1: Failing test** — `ikArm.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ikArm } from "./ikArm";

describe("ikArm", () => {
  it("reaches straight down when the target is directly below at full length", () => {
    const { wrist } = ikArm({ shoulder: { x: 0, y: 0 }, target: { x: 0, y: 250 },
      upperLen: 130, foreLen: 120, bendSign: 1 });
    expect(wrist.x).toBeCloseTo(0, 3);
    expect(wrist.y).toBeCloseTo(250, 3);
  });

  it("clamps an out-of-reach target to arm length along its direction", () => {
    const { wrist } = ikArm({ shoulder: { x: 0, y: 0 }, target: { x: 0, y: 900 },
      upperLen: 130, foreLen: 120, bendSign: 1 });
    expect(wrist.y).toBeCloseTo(250, 0); // clamped to 130+120
  });

  it("bends the elbow off the shoulder→wrist line for a mid-range target", () => {
    const { elbow } = ikArm({ shoulder: { x: 0, y: 0 }, target: { x: 0, y: 150 },
      upperLen: 130, foreLen: 120, bendSign: 1 });
    expect(Math.abs(elbow.x)).toBeGreaterThan(1); // not collinear
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `cd patient-web && npx vitest run src/reach/ikArm.test.ts`
Expected: FAIL — cannot find module `./ikArm`.

- [ ] **Step 3: Implement** — `ikArm.ts`:

```ts
type Pt = { x: number; y: number };

/**
 * Two-bone inverse kinematics. Given a shoulder and a target wrist point, place
 * the elbow so the forearm tip reaches the target (clamped to upper+fore length).
 * `bendSign` (+1/−1) selects which side the elbow bows to.
 */
export function ikArm(opts: {
  shoulder: Pt; target: Pt; upperLen: number; foreLen: number; bendSign: number;
}): { elbow: Pt; wrist: Pt } {
  const { shoulder, target, upperLen: l1, foreLen: l2, bendSign } = opts;
  const dxr = target.x - shoulder.x, dyr = target.y - shoulder.y;
  const raw = Math.hypot(dxr, dyr);
  const min = Math.abs(l1 - l2) + 1e-3, max = l1 + l2 - 1e-3;
  const d = Math.max(min, Math.min(max, raw));
  const ux = raw < 1e-9 ? 0 : dxr / raw, uy = raw < 1e-9 ? 1 : dyr / raw;
  const wrist = { x: shoulder.x + ux * d, y: shoulder.y + uy * d };
  // Angle at the shoulder between the upper arm and the shoulder→wrist line.
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const a = Math.acos(cosA);
  const base = Math.atan2(uy, ux);
  const th = base + bendSign * a;
  const elbow = { x: shoulder.x + Math.cos(th) * l1, y: shoulder.y + Math.sin(th) * l1 };
  return { elbow, wrist };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd patient-web && npx vitest run src/reach/ikArm.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/reach/ikArm.ts patient-web/src/reach/ikArm.test.ts
git commit -m "feat(patient): two-bone IK solver for the avatar arm"
```

---

### Task 4: Directional RomTrialModel

**Files:**
- Modify: `patient-web/src/reach/RomTrialModel.ts`
- Test: `patient-web/src/reach/RomTrialModel.test.ts`

**Interfaces:**
- Consumes: `frame.joints.wristDx`, `frame.joints.wristDy`, `poseValid`.
- Produces: `current` gains `dir: "up" | "side" | "down"` and `goal: {x, y}` (in reach space); `reach` (0..1 proximity); capture when the wrist is within `CAP_R` of the goal AND engaged, held.
- Exports: `REACH_MAG`, `REACH_CAP_R` constants; `sideSign(affectedSide)`.

- [ ] **Step 1: Rewrite the test** — replace `RomTrialModel.test.ts` body with reach-space tests:

```ts
import { describe, it, expect } from "vitest";
import { RomTrialModel, REACH_MAG } from "./RomTrialModel";
import type { ScoreFrame } from "../scoring/intentScoreMessage";

const frame = (dx: number, dy: number): ScoreFrame => ({
  intentScore: 90, erdScore: null, classifierScore: null, kinematicScore: 60,
  compensationFlag: false, isArtifact: false, mode: "C", timestamp: 0,
  joints: { shoulderFlexionDeg: 0, shoulderAbductionDeg: 0, elbowDeg: 0,
    wristDx: dx, wristDy: dy, poseValid: true },
});

describe("RomTrialModel (directional)", () => {
  it("first trial is reach-up; reach saturates when the wrist is on the up goal", () => {
    const m = new RomTrialModel("right");
    expect(m.current.dir).toBe("up");
    m.update(frame(0, -REACH_MAG), true, 0.1); // straight up, full magnitude
    expect(m.reach).toBeGreaterThan(0.9);
  });

  it("does not saturate the up trial when the wrist goes sideways", () => {
    const m = new RomTrialModel("right");
    m.update(frame(REACH_MAG, 0), true, 0.1); // sideways, not up
    expect(m.reach).toBeLessThan(0.5);
  });

  it("collects the up star after holding on-goal while engaged, then advances to side", () => {
    const m = new RomTrialModel("right");
    for (let i = 0; i < 10; i++) m.update(frame(0, -REACH_MAG), true, 0.1);
    expect(m.collected).toBeGreaterThanOrEqual(1);
    expect(m.current.dir).toBe("side");
  });

  it("does not collect while EEG-disengaged even if on-goal", () => {
    const m = new RomTrialModel("right");
    for (let i = 0; i < 10; i++) m.update(frame(0, -REACH_MAG), false, 0.1);
    expect(m.collected).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `cd patient-web && npx vitest run src/reach/RomTrialModel.test.ts`
Expected: FAIL — constructor/`dir`/`REACH_MAG` mismatch.

- [ ] **Step 3: Rewrite `RomTrialModel.ts`**:

```ts
import type { ScoreFrame } from "../scoring/intentScoreMessage";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export type ReachDir = "up" | "side" | "down";
export type JointId = "shoulder_flexion" | "shoulder_abduction" | "elbow_extension";

/** Normalized reach magnitude (torso-lengths) treated as a "full" reach, and the
 *  capture radius around the goal. Tunable after a live visual check. */
export const REACH_MAG = 1.1;
export const REACH_CAP_R = 0.5;

export type Trial = {
  joint: JointId; dir: ReachDir; label: string; cue: string;
  goal: { x: number; y: number };
};

/** +1/−1 screen-x sign toward the affected side (affected-left reaches screen-left). */
export const sideSign = (affectedSide: string) => (affectedSide === "left" ? -1 : 1);

const CATALOGUE: { joint: JointId; dir: ReachDir; label: string; cue: string }[] = [
  { joint: "shoulder_flexion", dir: "up", label: "Reach up high",
    cue: "Lift your affected arm up — reach the net to the star above." },
  { joint: "shoulder_abduction", dir: "side", label: "Reach out wide",
    cue: "Lift your affected arm out to the side — reach the net to the star." },
  { joint: "elbow_extension", dir: "down", label: "Straighten your arm",
    cue: "Stretch your affected arm down straight — reach the net to the star." },
];

type TrialLog = { joint: JointId; dir: ReachDir; achieved: number; compensationFlag: boolean };

/**
 * Directional reach trial loop. Each trial has a goal position in reach space
 * (wrist offset from the shoulder, torso-normalized). The patient's measured
 * wrist offset drives everything; a star is collected when the wrist is within
 * REACH_CAP_R of the goal AND the EEG gate is engaged, held for HOLD_S.
 */
export class RomTrialModel {
  static readonly HOLD_S = 0.5;
  static readonly REST_S = 1.2;

  private _side: string;
  private _idx = 0;
  private _reach = 0;
  private _collected = 0;
  private _justCollected = false;
  private _holdTime = 0;
  private _restTime = 0;
  private _phase: "reaching" | "rest" = "reaching";
  private _lastTrial: TrialLog | null = null;

  constructor(affectedSide: string = "right") {
    this._side = affectedSide;
  }

  private goalFor(dir: ReachDir): { x: number; y: number } {
    switch (dir) {
      case "up": return { x: 0, y: -REACH_MAG };
      case "down": return { x: 0, y: REACH_MAG };
      case "side": return { x: sideSign(this._side) * REACH_MAG, y: 0 };
    }
  }

  private wrist(frame: ScoreFrame): { x: number; y: number } | null {
    const j = frame.joints;
    if (!j || !j.poseValid || j.wristDx === null || j.wristDy === null) return null;
    // reach space: +x toward affected side (screen), +y up.
    return { x: j.wristDx * sideSign(this._side), y: -j.wristDy };
  }

  get current(): Trial {
    const c = CATALOGUE[this._idx];
    return { ...c, goal: this.goalFor(c.dir) };
  }
  get reach(): number { return this._reach; }
  get collected(): number { return this._collected; }
  get justCollected(): boolean { return this._justCollected; }
  get phase() { return this._phase; }
  get lastTrial() { return this._lastTrial; }

  update(frame: ScoreFrame | null, engaged: boolean, dtSeconds: number): void {
    this._justCollected = false;
    const dt = Math.max(0, dtSeconds);

    if (this._phase === "rest") {
      this._reach = 0;
      this._restTime += dt;
      if (this._restTime >= RomTrialModel.REST_S) {
        this._idx = (this._idx + 1) % CATALOGUE.length;
        this._restTime = 0;
        this._phase = "reaching";
      }
      return;
    }

    const w = frame ? this.wrist(frame) : null;
    const g = this.current.goal;
    const dist = w === null ? Infinity : Math.hypot(w.x - g.x, w.y - g.y);
    this._reach = w === null ? 0 : clamp01(1 - dist / REACH_MAG);

    if (dist <= REACH_CAP_R && engaged) {
      this._holdTime += dt;
      if (this._holdTime >= RomTrialModel.HOLD_S) {
        this._collected += 1;
        this._justCollected = true;
        this._holdTime = 0;
        this._lastTrial = {
          joint: this.current.joint, dir: this.current.dir, achieved: this._reach,
          compensationFlag: Boolean(frame?.compensationFlag),
        };
        this._phase = "rest";
      }
    } else {
      this._holdTime = 0;
    }
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd patient-web && npx vitest run src/reach/RomTrialModel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/reach/RomTrialModel.ts patient-web/src/reach/RomTrialModel.test.ts
git commit -m "feat(patient): directional wrist-position RomTrialModel (up/side/down)"
```

---

### Task 5: StarCatchScene — directional avatar, stars, net

**Files:**
- Modify: `patient-web/src/scenes/StarCatchScene.tsx`
- Modify: `patient-web/src/scenes/StarCatchScene.test.tsx`
- Modify: `patient-web/src/App.tsx` (RomTrialModel now takes `affectedSide`, not `romTargets`)

**Interfaces:**
- Consumes: `RomTrialModel(affectedSide)`, `ikArm`, `model.current.goal/dir`, `frame.joints.wristDx/Dy`.
- Produces: goal star at the trial's screen direction; avatar wrist at the measured offset via `ikArm`; net at the wrist.

**Reach-space → SVG mapping (viewBox `0 0 600 660`, shoulder centered `(300,330)`):**
`SCALE = 200`; `screen = shoulder + (reachX * SCALE, -reachY * SCALE)` — but note `reachY` up is +, SVG y down, so `screenY = shoulder.y - reachY*SCALE`. Goal-up (0,+MAG) → above; goal-down (0,−MAG) → below; goal-side (±MAG,0) → left/right.

- [ ] **Step 1: Update tests** — replace the geometry/collection tests in `StarCatchScene.test.tsx`. New `frame` helper carries `wristDx/wristDy`; drive the up goal and assert collection + a fixed goal-star position:

```tsx
const frame = (
  intent: number,
  w: { dx: number; dy: number } | null = null,
): ScoreFrame => ({
  intentScore: intent, erdScore: null, classifierScore: null, kinematicScore: 60,
  compensationFlag: false, isArtifact: false, mode: "C", timestamp: 0,
  joints: w === null ? null : {
    shoulderFlexionDeg: 0, shoulderAbductionDeg: 0, elbowDeg: 0,
    wristDx: w.dx, wristDy: w.dy, poseValid: true,
  },
});
```

Keep the existing suite structure (rAF mock + `pump`). Replace the body of these tests:

- "shows the current target cue …": assert `rom-cue` text `/reach up high/i` and that `arm-upper`/`arm-fore` exist (unchanged).
- Collection test: push `frame(95, { dx: 0, dy: -1.1 })` (on the up goal, engaged), `pump(10, 100)`, expect `stats.trialsCompleted >= 1`.
- Below-target test: push `frame(95, { dx: 0, dy: 0 })` (at rest, far from goal), `pump(20, 100)`, expect `trialsCompleted === 0`.
- Keep the tracking-badge, net-present, detail-cue, and end-button tests. The "goal fixed" test: assert the `reach-goal` translate is **above** the shoulder for the up trial and does not move as `dy` changes within the trial — capture the translate `y` and confirm it stays `< 330` (above centered shoulder) and constant across two on-trial frames.

- [ ] **Step 2: Run — expect fail**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx`
Expected: FAIL — model/props/geometry changed.

- [ ] **Step 3: Rewrite the geometry block** in `StarCatchScene.tsx`. Replace the `fkArm`-based block (shoulder/elevation/fkArm/goal/netAngle) with:

```tsx
  const SCALE = 200;
  const shoulder: Pt = { x: 300, y: 330 };
  const bendSign = affectedSide === "left" ? -1 : 1;

  const jw = store.latest()?.joints;
  const tracking = jw?.poseValid === true;
  const side = affectedSide === "left" ? -1 : 1;
  // measured wrist in reach space (+x toward affected side, +y up)
  const rx = jw && jw.wristDx !== null ? jw.wristDx * side : 0;
  const ry = jw && jw.wristDy !== null ? -jw.wristDy : 0;
  const toScreen = (p: { x: number; y: number }): Pt =>
    ({ x: shoulder.x + p.x * SCALE, y: shoulder.y - p.y * SCALE });

  const wristPt = toScreen({ x: rx, y: ry });
  const { elbow, wrist } = ikArm({
    shoulder, target: wristPt, upperLen: 130, foreLen: 120, bendSign,
  });

  const goalPt = toScreen(model.current.goal);
  const netAngleDeg = (Math.atan2(-(wrist.x - elbow.x), wrist.y - elbow.y) * 180) / Math.PI;
```

Remove the now-unused `fkArm`, `joint`, `elevationDeg`, `elbowDeg`, `targetDeg`, `goalElevationDeg`, `goalElbowDeg`, `goal`, and the old `shoulder`/`mirror`/`j` lines. Update imports: drop `fkArm`, add `import { ikArm } from "../reach/ikArm";`. In the JSX, the `reach-goal` group uses `translate(${goalPt.x} ${goalPt.y})` and the arm/net/`aria-label` use `elbow`/`wrist` as before.

- [ ] **Step 4: Update `App.tsx`** — `RomTrialModel` no longer takes `romTargets`. Change its construction in `StarCatchScene` (`useRef(new RomTrialModel(affectedSide))`) and drop the `romTargets` prop from the `StarCatchScene` call in `App.tsx` (leave the `usePatientLink` `romTargets` state in place; it is simply no longer passed to the scene). Confirm `affectedSide` is passed to `StarCatchScene`.

- [ ] **Step 5: Run — expect pass**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx`
Expected: PASS

- [ ] **Step 6: Full suite + typecheck**

Run: `cd patient-web && npm run test && npm run typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add patient-web/src/scenes/StarCatchScene.tsx patient-web/src/scenes/StarCatchScene.test.tsx patient-web/src/App.tsx
git commit -m "feat(patient): directional avatar + up/side/down goal stars in Star Catcher"
```

---

## Final verification

- [ ] `cd patient-web && npm run test && npm run typecheck` — green.
- [ ] `conda run -n eeg pytest signal-engine/tests/` — green (or pre-existing skips only).
- [ ] `cd clinician-console && npm run test` — green.
- [ ] Live visual check: up star sits above the arm, side star toward the affected side, straighten star below; the net tracks the real hand; catching a star requires the net to overlap THAT star (no cross-triggering). If the side is mirrored wrong, flip `sideSign` / `side` sign (one line).
- [ ] Update `docs/todos.md`: directional-reach pivot; note fixed REACH_MAG (per-patient ROM calibration re-integration deferred).
