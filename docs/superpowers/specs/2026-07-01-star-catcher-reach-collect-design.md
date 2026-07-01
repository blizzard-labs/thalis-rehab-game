# Star Catcher (Reach & Collect) — Patient-Web Game Mode Design

**Date:** 2026-07-01
**Status:** Approved, pending implementation plan
**Scope:** `patient-web/` React client — new mini-game wired to the "Star Catcher" menu slot.

## 1. Summary

Implement the spec's **Reach & Collect** mechanic (specsv1 §9.2, wireframe P4) as a new
patient-web scene, and wire it to the **Star Catcher** slot in the post-calibration game-mode
picker. Selecting Star Catcher routes to this new scene instead of Garden Grow; Garden Grow
continues to route to `GardenScene`.

The spec lists "Reach & Collect" and "Star Catcher" as separate catalogue entries, but the user
has directed that the Reach & Collect mechanic ship under the Star Catcher menu slot, using a
**star** as the reach target (Reach & Collect already reaches toward "fruit/stars" per §9.2).

## 2. Reference material

- **specsv1.md §9.2** — Reach & Collect: "Avatar arm reaches toward fruit/stars positioned at
  clinically-relevant ROM targets; reach extends proportionally to combined EEG+kinematic score."
- **Wireframe P4** ("Reach & Collect — blended/active"):
  - Banner: "Reach up toward the apple!" + good-focus pill.
  - Avatar arm box that "mirrors patient's affected limb," anchored bottom-corner.
  - Big directional arrow; checkpoint stars: current reach = solid/glowing ★, next = dashed ★,
    goal = big target (apple in wireframe → star here).
  - Single fused **"REACH POWER"** bar; "keep going!".
  - DEV notes: angles/degrees are **hidden from the patient** (surfaced only on clinician C3/C4);
    reach axis (horizontal/vertical) is a clinician toggle in C5; trunk-lean/compensation
    guardrails are clinician-side (not in patient-web this round).
- **specsv2 §9.1/§9.3** — continuous (not binary) feedback; <250 ms latency; embodiment;
  hemianopia/neglect intact-field default layout; `prefers-reduced-motion`; no strobe.

## 3. Web constraint (drives a key decision)

The WS wire format (`intentScoreMessage.ts`, unchanged per specsv2 §9.5) carries only
`intent_score` plus `erd_score` / `classifier_score` / `is_artifact` / `mode`. There is **no
live kinematic (ROM) sub-score** on the patient device. Therefore the reach is driven entirely
by `intentScore`, exactly as `GardenScene` drives growth. The "fused" nature of the Reach Power
bar is honored visually (single number, no EEG/kinematic split shown), matching the P4 rule that
the split is clinician-only.

## 4. Decisions (from brainstorming)

- **Reach axis:** diagonal up-and-out. Avatar anchored bottom-corner on the affected side, star
  goal in the opposite upper corner. (Matches wireframe P4.)
- **Goal behavior:** endless respawn + celebrate. On reaching the goal: collect (glow + brief
  praise, reduced-motion safe), `trialsCompleted++`, adaptive staircase adjusts the next goal
  distance, a fresh star spawns. Continuous and non-punitive, mirroring Garden.
- **Target:** a star (Star Catcher slot).

## 5. Architecture

### 5.1 Pure model — `patient-web/src/reach/ReachModel.ts`

No DOM/network deps (mirrors `PlantGrowthModel` for testability).

State:
- `reach: number` (0..1) — current normalized reach along the axis.
- `goalFraction: number` — where the star sits along the axis (staircase-controlled).
- `collected: number` — goals collected this session.
- `justCollected: boolean` — one-tick flag the scene reads to fire the celebrate animation.

`update(intentUnit: number, dt: number)` where `intentUnit = intentScore/100`:
1. EMA-smooth `reach` toward `intentUnit` (time-constant chosen so visible response feels
   responsive but not jittery — consistent with the §9.1 EMA principle). Non-punitive: recede
   smoothly on low score, never snap to 0.
2. If `reach >= goalFraction` sustained for `holdSeconds` (~0.6 s), mark collected:
   `collected++`, set `justCollected` for this tick, run the staircase:
   - success: raise `goalFraction` slightly (cap ~0.9), tracking consecutive successes;
   - (a "miss" — reach falling well short over a long window — lowers it slightly, floor ~0.55).
   Reset the hold timer and clear `justCollected` on the following tick.

Getters expose `reach`, `goalFraction`, `collected`, `justCollected`. Staircase constants
documented inline; band ~0.55–0.9 per §9.4.

### 5.2 Scene — `patient-web/src/scenes/StarCatchScene.tsx`

Same shape/props as `GardenScene`: `{ stats, engagementThreshold, createSocket?, onEnd }`.

- Net plumbing identical to Garden: `createScoreClient({ url: config.wsUrl, createSocket, onFrame:
  store.push, onState: setConn })`; rAF `tick(ts)` computes `dt`, reads `store.latest().intentScore`,
  calls `reach.update(s/100, dt)`, `stats.accumulate(dt, s >= engagementThreshold)`, and on
  `justCollected` calls `stats.incrementTrials()`.
- **Geometry (SVG, affected-side aware):** `shoulder` anchor at the bottom corner of the affected
  side; `goal` at the opposite upper corner. `hand = shoulder + reach·(goal − shoulder)`. Arm
  drawn as a segment (upper arm + forearm or a stylized sleeve) ending at the hand. If
  `affectedSide === "right"`, mirror horizontally.
- **Markers:** solid glowing **star at the hand** (current reach); **dashed star** at the
  `goalFraction` point (next target); **big star** at the goal end; a **large arrow** along the
  axis showing reach direction. No numeric angles anywhere patient-visible.
- **Reach Power bar:** single fused meter (label "Reach power", value = `round(intentScore)`),
  analogous to Garden's focus-meter but themed for reach.
- **Collect celebration:** glow burst at the goal + brief "Nice!" pill; gated by
  `prefers-reduced-motion` (no strobe, no rapid flashing — §12/§9.3).
- Banner (good-focus pill + "Reach up toward the star!"), `CameraFeed recording` sidecar, footer
  (End session + `conn-badge`) — reuse Garden's structure and existing CSS classes where possible.
- Honor `prefers-reduced-motion` via a `reduced-motion` class like Garden.

### 5.3 Wiring

- **`GameModeSelect.tsx`:** set the `stars` entry `available: true`. `river` stays disabled.
- **`App.tsx`:** add `"stars"` to the `View` union. `GameModeSelect`'s `onConfirm(id)` routes:
  `id === "stars"` → `setView("stars")`, otherwise `setView("garden")`. Add a `case "stars"`
  rendering `<StarCatchScene stats={stats} engagementThreshold={config.engagementThreshold}
  onEnd={() => setView("summary")} />`. The existing persistent Quit button and `SummaryScene`
  are already generic and need no change.

### 5.4 CSS — `patient-web/src/styles.css`

Add `.scene--stars` and `.starcatch-*` classes (banner, stage, reach-meter, celebrate). Reuse
`.app-quit-btn`, `.conn-badge`, camera sidecar, and footer/banner patterns from Garden. Purple
brand palette (`--purple*`), WCAG-AA contrast, colorblind-safe, reduced-motion selectors.

## 6. Testing (TDD)

- **`ReachModel` unit tests** (Vitest, pure): reach follows `intentUnit` via EMA; recedes
  non-punitively on low score (never negative/zero-snap); collect fires when `reach` holds above
  `goalFraction`; `collected` increments; staircase raises `goalFraction` on repeated success and
  stays within the band.
- **`StarCatchScene` component test** (jsdom, mirrors `GardenScene.test.tsx`): renders scene +
  key `data-testid`s; an injected fake socket pushing rising `intent_score` frames advances the
  hand/reach and, on reaching the goal, increments trials; connection badge reflects state.
- Full suite (`npm run test`) and `tsc` typecheck must pass.

## 7. Out of scope (this round)

- Clinician reach-axis toggle / C5 protocol control (patient-web defaults to diagonal; axis is a
  documented constant, not yet clinician-driven here).
- Live kinematic ROM sub-score, trunk-lean/compensation guardrails, P5 coaching overlay
  (clinician-side / camera-analysis features, not in the patient WS frame this round).
- PixiJS rendering (Garden and this scene remain SVG/CSS for now, per current codebase).
- River Rowing and Lighthouse story mode.

## 8. Files

- **New:** `patient-web/src/reach/ReachModel.ts`, `patient-web/src/reach/ReachModel.test.ts`,
  `patient-web/src/scenes/StarCatchScene.tsx`, `patient-web/src/scenes/StarCatchScene.test.tsx`.
- **Edit:** `patient-web/src/scenes/GameModeSelect.tsx`, `patient-web/src/App.tsx`,
  `patient-web/src/styles.css`, `docs/todos.md` (changelog per CLAUDE.md).
