# Reach & Collect ("Star Catcher") — Full Description

## Core mechanic

Spec (`specsv1.md` §9.2): *"Avatar arm reaches toward fruit/stars positioned at
clinically-relevant ROM targets; reach extends proportionally to combined
EEG+kinematic score. Best for Blended/Active modes, ROM-specific therapy
goals."*

What's built (`StarCatchScene.tsx` + `ReachModel.ts`, merged 2026-07-01): a
single-axis reach. One arm, one line from shoulder to one fixed goal star in
the corner opposite the affected side (intact visual field, spec §9.3). Reach
distance along that one axis is driven entirely by `intent_score` from the WS
stream — no camera, no kinematic score, no joint angles, no direction choice.
Holding reach at/above a goal fraction for 0.6 s "collects" the star; an
up/down staircase on the goal fraction implements spec §9.4 adaptive
difficulty.

This is a faithful, working **Phase 1** (EEG-only, single-direction) slice of
the spec's Reach & Collect concept — not yet the ROM-targeted version the spec
describes for Blended/Active modes. That gap is the subject of this document.

---

## Reach model logic (`ReachModel.ts`)

| Parameter | Value | Meaning |
|---|---|---|
| Reach speed | 0.8 / sec | extending — quick, so effort is visible fast |
| Recede speed | 0.3 / sec | receding — slow, gentle, never a punitive snap-back |
| Hold to collect | 0.6 s | dwell at/above goal before a star counts |
| Goal start / min / max | 0.65 / 0.55 / 0.9 | staircase bounds on the goal fraction |
| Staircase up | +0.08 after 2 consecutive collects | |
| Staircase down | −0.05 after 5 s sustained miss (reach < goal − 0.2) | |

Same shape as `PlantGrowthModel` (Garden Grow): asymmetric ease, no hard
resets, hysteresis against flicker. `reach` and `goal` are both unitless
`0..1` fractions along **one** axis — there is currently no notion of angle,
joint, or direction anywhere in the model.

---

## What the patient sees (current build)

```
┌──────────────────────────────────────────────┐
│   [ Great reaching — keep going ]   ⭐ 3      │  ← stars-banner
├──────────────────────────────────────────────┤
│  night sky                          Reach     │
│                    ★ goal (fixed corner)  ▓▓  │
│                   ⭐ next-target (dashed)  ▓▓  │  ← stars-row:
│         ⭐ hand-star, glows on reach       72  │     SVG scene + power meter
│        /                                      │
│       o  shoulder (affected side)             │
│  ground                                       │
├──────────────────────────────────────────────┤
│                    [ End session ]   connecting│  ← stars-footer
└──────────────────────────────────────────────┘
```

- Shoulder anchored bottom-left or bottom-right per `affectedSide` config; goal
  always in the **opposite** upper corner (fixed, one direction, whole
  session).
- Arm is a **single line segment** shoulder→hand — no elbow. `reach` (0–1)
  linearly interpolates the hand position along the shoulder→goal vector.
  There is no forward-kinematics model, so an elbow-specific target is not
  representable in the current geometry at all.
- "Reach power" meter is the raw fused score (currently == raw `intent_score`,
  no separate EEG/kinematic sub-bars, unlike the spec's stated intent to
  expose both channels — see Garden Grow's Focus meter for the same
  single-channel simplification).

---

## Spec intent vs. what's built

| Spec intent (§9.2, §7, §8) | Current state |
|---|---|
| Reach driven by **combined EEG + kinematic score** | ❌ EEG-only (`intent_score`); no vision pipeline wired to patient-web at all |
| Targets at **clinically-relevant ROM positions** (shoulder flexion/abduction, elbow extension, etc.) | ❌ One fixed target, one fixed direction, no joint semantics |
| Best for **Blended/Active modes** (§8.3/8.4) where kinematic score carries real weight | ❌ Only Mode A (EEG-only) is representable today — Blended/Active have no kinematic input to blend |
| Trunk-lean compensation detection reduces kinematic credit (§7.2) | ❌ Not implemented — no pose tracking exists in `patient-web` or `signal-engine` yet |
| Continuous, non-punitive feedback | ✅ asymmetric ease, hysteresis, no resets |
| Adaptive difficulty staircase (§9.4) | ✅ implemented on goal fraction |
| Embodied avatar limb reaching (§9.1) | ⚠️ Partial — arm+hand exist but no elbow, no forearm rotation, no grasp animation |
| Accessibility (intact visual field, large high-contrast target, WCAG-AA) | ✅ |

---

## ROM targets — design options

This is the actual gap to close. "ROM target" in the spec means: the game
asks the patient to move (or imagine moving) a **specific joint** through a
**specific range**, not just "extend some generic reach amount." Two things
are conflated in the current build that need to be pulled apart:

1. **Magnitude** — how far along the reach axis the avatar extends. Today
   this is 100% driven by `intent_score`.
2. **Direction/target-joint** — which physical movement the target
   represents (forward reach = shoulder flexion, reach-to-the-side = shoulder
   abduction, straightening the arm = elbow extension, opening the hand =
   wrist/finger extension). Today there is exactly one target, so this
   dimension doesn't exist.

Genuine ROM targeting needs both dimensions live, and — per spec §8 — the
*direction/joint* dimension is inherently a **kinematic** (camera-verified)
concept, since EEG alone cannot tell you which joint the patient is moving.
That means full ROM targeting is gated on the vision pipeline (`specsv1.md`
§7, Phase 2 of the roadmap, §15) which does not exist yet in this repo
(`signal-engine/vision/` is unbuilt; no `Pose` LSL stream, no
`kinematic_score`, no `Trial.kinematic_score` field wired to WS). Recommend
building this in two phases so ROM-specific *cueing* ships well before
ROM-specific *verification* requires the camera pipeline.

### Phase B — cued-direction targets (EEG-only, buildable now)

Direction becomes a **presented cue**, not a **detected** quantity. The
system still can't verify the patient actually moved their shoulder through
flexion vs. abduction — but it can *ask* for a specific reach direction each
trial and still score magnitude via `intent_score`/combined score exactly as
today. This is honest within Mode A/B limits (no false kinematic claim) and
delivers real clinical value: it varies which movement plane the patient
mentally rehearses trial-to-trial, matching how a therapist would cue varied
reach directions even in a pure MI protocol.

Changes needed:
- `ReachModel` (or a wrapper) takes a **target vector** — `{ directionDeg,
  maxDistanceFraction }` — instead of assuming a fixed corner. `reach` still
  eases 0→1 as today; the *rendered* endpoint is
  `shoulder + direction * reach * maxDistanceFraction`.
- A **target catalogue**, clinician/protocol-configurable (Section 10.3
  protocol editor), cycling per trial or per N collects:

  | Target | Direction (from shoulder) | Trains | Notes |
  |---|---|---|---|
  | Forward reach | ~60–80° up, toward midline | shoulder flexion | current default, keep as target[0] |
  | High reach | ~90–110° up | shoulder flexion (larger excursion) | |
  | Lateral reach | ~10–30° up, away from midline | shoulder abduction | tests reach *away* from body |
  | Cross-body reach | ~45° up, across midline | horizontal adduction + trunk stability | pairs naturally with a future trunk-lean penalty |

- `StarCatchScene` renders the dashed target-arc as a rotating/relocating
  element instead of a fixed corner star; on-screen cue text names the
  movement in plain language ("reach up and to the side") per §9.3
  aphasia-friendly copy rules (icon/short text, no jargon).
- Session/trial logging gains `target_direction_deg` alongside existing
  `collected` count, so which directions were practiced is itself a
  clinician-visible metric (extends `Trial` in the §11.1 data model even
  before `kinematic_score` exists).
- No signal-engine changes required — this phase is patient-web + protocol
  config only.

### Phase C — verified ROM targets (needs the vision pipeline)

Once `signal-engine/vision/` exists (MediaPipe Pose per spec §7.2) and a
`kinematic_score` is fused into `IntentScore` per §8, direction stops being a
cue and becomes ground truth:

- Vision worker computes joint angles (shoulder flexion/abduction, elbow
  flexion) from pose landmarks each frame, per §7.2.
- Each target in the catalogue gets a **target angle in degrees** (not just a
  screen direction), calibrated against the patient's own rest pose (§7.2
  5-second calibration) so it's robust to seating/camera differences.
- `reach` magnitude for a given trial becomes the fused
  `w_eeg·EEG_Score + w_kin·Kinematic_Score` (§8.1) where `Kinematic_Score` for
  that trial is `min(1, achieved_angle / target_angle)` — i.e. the avatar
  only extends as far as the patient's real joint has actually traveled,
  blended with EEG engagement per the session's mode weights (§8.2–8.4).
- **Elbow becomes a first-class joint in the SVG rig.** The current
  single-segment shoulder→hand line cannot represent elbow extension at all.
  Needs a two-bone arm (upper-arm segment + forearm segment) driven by
  forward kinematics from `(shoulderAngle, elbowAngle)`, so an elbow-specific
  target actually changes the rendered arm shape (straightening) rather than
  just sliding a dot further along a fixed line.
- **Trunk-lean penalty** (§7.2, §8.1 `Penalty_Compensation`) subtracts from
  the trial's kinematic credit when trunk displacement exceeds threshold, and
  triggers the on-screen "keep your trunk still, reach with your arm" cue —
  most relevant for the cross-body target above.
- WS frame schema grows a `kinematic_score` field alongside the existing
  `intent_score`/`erd_score`/`classifier_score` (`server/ws_server.py`,
  `NeuroReachClient`-equivalent parser in `patient-web`) — this is a shared
  parser contract with the clinician console (`v2-0b`), same invariant
  already tracked for `eeg_quality`.
- `Trial` gains `target_angle_deg`, `achieved_angle_deg`, `compensation_flag`
  (already in the §11.1 schema — just unpopulated today) for the clinician
  trend charts (ROM over weeks, §10.3).

### Grasp / wrist-extension target (either phase)

A distinct micro-target: on reaching the goal, the star could "open" (a
grasp animation) gated on wrist/finger extension once hand landmarks
(`mediapipe.Hands`, §7.2) are available — deferred to Phase C, but worth
flagging now since it's a different joint family (fine motor, not
shoulder/elbow) and would want its own catalogue entry and its own
`HOLD_S`-style dwell tuned separately (finer motor targets typically dwell
shorter/faster than gross-motor reach).

### Recommended sequencing

1. Ship Phase B (cued-direction targets) next — no backend/vision
   dependency, directly reuses the existing `ReachModel`/`StarCatchScene`
   shape, and gives clinicians a genuinely varied ROM-cueing protocol today.
2. Track Phase C as blocked on the vision pipeline milestone (`specsv1.md`
   Roadmap Phase 2, §15) — don't attempt to fake kinematic scoring with
   camera-less heuristics; that would misrepresent what the game is
   measuring, which the spec explicitly warns against (§12, no claims
   without real signal backing them).

---

## Gaps for real clinical use

1. **Single fixed target/direction** — no ROM variety at all today; see
   Phase B above.
2. **No kinematic score / no vision pipeline** — `Kinematic_Score` in the
   fusion formula (§8.1) is entirely unbuilt across the whole repo, not just
   patient-web; this blocks true Blended/Active modes for *every* mini-game,
   not just this one.
3. **No elbow joint** — arm rig is one line segment; can't represent elbow
   extension targets even once kinematic data exists, needs a rig change
   first.
4. **No trunk-lean / compensation detection** — §7.2's core anti-cheat and
   coaching mechanism for attempted-movement trials is absent.
5. **No trial/session structure** — same gap as Garden Grow; free-form
   continuous play, no fixed 4 s MI windows, no per-trial target selection
   flow yet (needed for Phase B's per-trial direction cycling).
6. **Reach power meter shows one fused number** — spec implies separate
   EEG/kinematic visibility might help the patient understand *why* they're
   or aren't advancing once both channels exist; currently moot since only
   one channel exists.
