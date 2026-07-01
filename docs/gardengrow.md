# Garden Grow — Full Description

## Core mechanic

Patient's brain signal (IntentScore, 0–100) directly drives a growing plant in real time. The plant **grows when MI engagement is high, wilts slowly when it drops**. No points, no pass/fail — the plant is a continuous, living mirror of the patient's mental effort.

This is the spec's "embodied reward" principle: the feedback is visible, continuous, and never punitive.

---

## Plant growth logic (`PlantGrowthModel.ts`)

| Parameter | Value | Meaning |
|---|---|---|
| Grow speed | 0.8 / sec | Fast response to engagement — patient sees effect quickly |
| Wilt speed | 0.3 / sec | Slow, gentle — rest never feels like punishment |
| Bloom threshold (on) | 75% growth | Flower fully blooms after dwelling above this |
| Bloom threshold (off) | 60% growth | Won't un-bloom until clearly falling — prevents flicker |
| Bloom dwell | 3 s | Must sustain high engagement before bloom triggers |

The bloom hysteresis is deliberate — a momentary dip doesn't yank the bloom away. Patient gets a visible "reward moment" that persists.

---

## What the patient sees (illustrated garden, 2026-06-30 overhaul)

The earlier build was an abstract thin green stem + a floating purple circle in a
mostly-empty screen, with the status pill overlapping the connection badge and the
End-session button overlapping the flower head. It was replaced with a recognizable
**illustrated garden scene** sized for stroke-patient legibility.

**Layout — three flex rows, full screen, sky→warm gradient:**

```
┌──────────────────────────────────────────────┐
│            [  big status banner  ]           │  ← garden-banner (centered)
├──────────────────────────────────────────────┤
│   ☀                                  Focus   │
│  sky gradient                         ▓▓     │
│            🌸  petals open on bloom   ▓▓     │  ← garden-row:
│           /|\  leaves                 ▓▓     │     SVG garden + focus meter
│            |   green stem (=growth)   ▓▓     │
│   ~~~~~~~~ soil mound ~~~~~~~~~~        72    │
├──────────────────────────────────────────────┤
│ connecting        [ End session ]            │  ← garden-footer
└──────────────────────────────────────────────┘
```

**Environment (full-bleed CSS, fills the whole viewport):** the scene background is a
sky gradient (`#e9ecfb` → warm `#fbf3ec`); a `.garden-sun` radial glow sits top-right
and a full-width `.garden-ground` soil mound (brown gradient, arched top via
`border-radius`) anchors the bottom. Only the App-level top bar (Quit) sits above the
garden.

**The plant (`.garden-art`, plant-only SVG, `viewBox 120 20 240 520`, `xMidYMax meet`,
absolutely positioned centered and rooted into the soil):**
- **Stem** — rounded green line (`stroke-linecap: round`), `y2` driven by `growth` (full height ≈ 392 units at growth 1).
- **Leaves** — two leaf paths sprout at fixed fractions up the *current* stem (so they ride it upward), each scaling in over a small growth window (~0.22 and ~0.48).
- **Flower head** — group of 8 radial purple petals (`var(--purple)`) around a golden center, scaling from a bud (`~0.34`) to open; **bloom** snaps it to full size, saturates + glows the petals, and adds a gentle 3.4 s sway (sway disabled under `prefers-reduced-motion`).
- Stem, leaves and head are **all positioned from the same per-frame `growth` value with no CSS transform transition** — so on rapid IntentScore swings the leaves and flower track the stem in lockstep instead of easing behind it.
- Still carries the `flower` testid + `data-growth` / `flower--bloom` contract the unit tests assert.

**The Focus meter (`.focus-meter` + `.intent-bar`):**
- Tall vertical gauge beside the garden, labelled **"Focus"** above and the live `0–100` value below.
- Tan inset track, purple→deep-purple gradient fill rising from the bottom; shows raw IntentScore every rAF.
- ARIA `role="progressbar"` with `aria-valuenow`.

**Status banner (`.garden-banner` + `.status-pill`):**
- Large centered pill at the top (no longer overlaps the App-level Quit or the conn badge).
- Two states:
  - `"Keep imagining — it's growing"` → warm `--grow` background
  - `"Good focus — keep going"` → green `--good` background when score ≥ engagement threshold
- Colorblind-safe (text + color, not color alone).

**Footer:** End-session button centered; small muted connection badge (`connecting / open / closed`) tucked bottom-left — neither overlaps the garden.

---

## What the spec intended vs what's built

| Spec intent | Current state |
|---|---|
| PixiJS canvas rendering | **Deferred** — built with React + SVG/CSS instead |
| Flower/tree grows, wilts slowly, never resets | ✅ Implemented exactly |
| Bloom moment for sustained high engagement | ✅ 3s dwell + hysteresis |
| Continuous (not binary) feedback | ✅ |
| Status text with encouraging, non-punitive copy | ✅ "it's growing" not "you failed" |
| Colorblind-safe, WCAG-AA contrast | ✅ (no red/green sole signal) |
| `prefers-reduced-motion` honored | ✅ transitions disabled |
| No strobe / no flicker | ✅ hysteresis prevents rapid bloom toggle |
| Short trials, frequent rest (4s MI) | Game is **free-form continuous** — no fixed trial structure during garden play, patient imagines at will |
| Adaptive difficulty staircase | **Not yet built** — threshold is fixed prop |

---

## Gaps for real clinical use

1. **No trial structure during gameplay** — spec describes 4s MI windows with rest between; garden currently runs free-form. Cued trial structure is only in CalibrationScene.
2. **Adaptive difficulty** — spec §9.4 calls for staircase keeping ~70–80% success rate. Currently `engagementThreshold` is fixed prop.
3. **PixiJS** — spec wanted canvas-based rendering for richer visuals. Current CSS flower is functional but minimal.
4. **No avatar limb** — spec wanted on-screen avatar's affected limb mirroring the task (virtual hand opening). Garden is abstract (plant), which is valid per spec but richer embodiment is not there yet.
5. **Session length / rest blocks** — no built-in 8–10 min game block with mandatory rest, just "End session" button.
