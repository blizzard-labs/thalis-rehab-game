# Star Catcher — Clarity, Target Stars & Net (Design)

**Date:** 2026-07-10
**Scope:** Patient-web game scenes only. View-layer changes; no signal-engine or console changes.
**Files touched:** `patient-web/src/scenes/StarCatchScene.tsx`, `patient-web/src/scenes/GardenScene.tsx`, `patient-web/src/styles.css`, plus their `.test.tsx`. `patient-web/src/reach/RomTrialModel.ts` — string-literal edit only (the three `cue` values in `CATALOGUE`); its logic and API are untouched.
**Logic reused as-is (no behavior change):** `RomTrialModel` state machine, `patient-web/src/reach/armKinematics.ts` (`fkArm`).

## Problem

Four patient-facing issues in the shipped verified-ROM Star Catcher game:

1. Patients don't understand what to physically do with their affected arm when the banner says "Reach out wide" / "Straighten your arm" / "Reach high".
2. There is no persistent "movement verified" confirmation; patients have no bottom-right signal to mirror the bottom-left connection status.
3. Patients get only top-banner text cues — there is no on-screen **target** to reach toward. (A `reach-goal` star exists but is drawn at the live wrist, so it rides the hand instead of marking a goal.)
4. The virtual hand renders a **star**; it should hold a **net** to catch target stars.

## Changes

### 1. Clearer arm instructions (Star Catcher only)

Root cause: `RomTrialModel`'s `CATALOGUE` already carries both a short `label` and a detailed `cue`, but `StarCatchScene` renders only `label`.

- Banner renders **both**: `label` as the headline, `cue` as a subline (`data-testid="rom-cue-detail"`).
- Reword the three `cue` strings in `RomTrialModel.ts` to name the affected arm and reference the visible net→star action:
  - `shoulder_flexion`: "Lift your affected arm up in front of you — reach the net to the star."
  - `shoulder_abduction`: "Lift your affected arm out to the side — reach the net to the star."
  - `elbow_extension`: "Stretch your affected arm out straight — reach the net to the star."
- `label` strings unchanged.

This is the **one** allowed edit to `RomTrialModel.ts` (string literals in `CATALOGUE`); its logic/API is untouched.

### 2. "Tracking arm ✓" badge, bottom-right (BOTH games)

- New badge element mirroring `.conn-badge`, positioned `right: 24px; bottom: 28px` (`data-testid="tracking-badge"`).
- State from `store.latest()?.joints?.poseValid`:
  - `true` → **"Tracking arm ✓"** (`data-tracking="on"`)
  - `false` / no joints → **"Move into frame"** (`data-tracking="off"`)
- Added to both `StarCatchScene` and `GardenScene` footers. Steady (not momentary).

### 3. Fixed goal star per cue (Star Catcher only)

- Compute a **fixed goal wrist** with `fkArm` using the *target* angles for the current joint (not the live measured angles):
  - `shoulder_flexion` / `shoulder_abduction`: `shoulderElevationDeg = targetDeg`, `elbowDeg = 180`.
  - `elbow_extension`: `shoulderElevationDeg = 20` (matches the held elevation used for the live arm), `elbowDeg = targetDeg`.
  - Same `shoulder` anchor, `upperLen`, `foreLen`, `mirror` as the live arm so goal and hand share one coordinate frame.
- `reach-goal` star is drawn at this **fixed** goal wrist (still in space), not the live wrist.
- Star scales/glows with proximity: opacity and scale interpolate on `reach` (0→1). One star visible at a time.
- On catch (`justCollected`) the existing celebrate glow fires; rest phase then next cue recomputes a new fixed goal.
- No `RomTrialModel` change — the fixed goal is a pure render derivation from `current.targetDeg` + `current.joint`.

### 4. Net on the hand (Star Catcher only)

- Replace the `reach-hand` star with an SVG **net**: a circular hoop + crosshatch mesh + short handle, drawn at the live wrist (`data-testid="net"`).
- Net rides the live arm toward the fixed goal star; catch logic (`reach ≥ 1` AND engaged, held `HOLD_S`) is unchanged — visually the net overlaps the star at catch.
- Net orientation: fixed upright is acceptable for v1 (no forearm-angle rotation required).

## Non-goals / boundaries

- **Garden Scene** is EEG-focus only (no reach/arm/targets): it receives **only** change 2 (tracking badge). No net, no target stars, no cue changes.
- No changes to scoring, `RomTrialModel` logic/API, `fkArm`, LAN relay, or clinician console.
- Net rotation to match forearm angle: deferred (YAGNI).

## Testing

- `StarCatchScene.test.tsx`:
  - `rom-cue-detail` subline renders the current `cue`.
  - `reach-goal` position is **stable** across live-joint frames (does not move with the measured pose) and moves only when the cue advances.
  - `net` testid present; former `reach-hand` star assertions replaced.
  - `tracking-badge` reflects `poseValid` true/false.
- `GardenScene.test.tsx`:
  - `tracking-badge` present and reflects `poseValid`.
- Reuse existing `store`/frame test helpers; keep `ScoreFrame` fixtures with `joints` set.

## Acceptance

- Star Catcher banner shows a plain-language instruction naming the affected arm and the net→star action.
- A single fixed target star marks the reach goal for the active cue and is visibly reached by a net-carrying hand.
- Both games show a steady bottom-right tracking badge mirroring the bottom-left connection badge.
- All patient-web unit tests green; both packages typecheck clean.
