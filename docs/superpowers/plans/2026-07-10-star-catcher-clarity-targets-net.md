# Star Catcher Clarity, Target Stars & Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Star Catcher instructions self-explanatory, add a fixed target star reached by a net-carrying hand, and add a bottom-right "Tracking arm" badge to both games.

**Architecture:** Pure view-layer changes in the two React game scenes plus one CSS block. The `RomTrialModel` state machine and `fkArm` kinematics are reused unchanged (one string-literal edit to `RomTrialModel`'s cue copy is the sole exception). The fixed goal star is a render-only derivation of the current cue's target angle through the same `fkArm` rig that draws the live arm, so goal and hand share one coordinate frame.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest + @testing-library/react (jsdom), SVG.

## Global Constraints

- Run all patient-web commands from `patient-web/`: `cd patient-web && npm run test`, `npm run typecheck`.
- Garden Scene is EEG-focus only: it receives **only** the tracking badge (Task 2). No net, target stars, or cue changes.
- `RomTrialModel` logic and public API are untouched — only the three `cue` string literals in `CATALOGUE` may change.
- The `intent_score`/`ScoreFrame` contract is byte-identical across patient-web and clinician-console — do **not** touch the parser or frame shape.
- Test frame helper shape (already in `StarCatchScene.test.tsx`): `frame(intent, { flex?, abd?, elbow? } | null)` builds a `ScoreFrame` with `joints.poseValid = true` when joints given.
- Commit after each task. No `Co-Authored-By` trailer.

---

### Task 1: Clearer arm instructions

**Files:**
- Modify: `patient-web/src/reach/RomTrialModel.ts` (the three `cue` strings in `CATALOGUE`, lines 8-12)
- Modify: `patient-web/src/scenes/StarCatchScene.tsx` (banner)
- Test: `patient-web/src/scenes/StarCatchScene.test.tsx`

**Interfaces:**
- Consumes: `model.current.current.label` (short headline), `model.current.current.cue` (detailed instruction) — both already on `RomTarget`.
- Produces: a `rom-cue-detail` element in the banner rendering the current cue's detail string.

- [ ] **Step 1: Write the failing test**

Add inside `describe("StarCatchScene", ...)` in `StarCatchScene.test.tsx`:

```tsx
it("shows a plain-language detail instruction naming the affected arm", () => {
  const store = new ScoreStore();
  store.push(frame(80, { flex: 30 })); // idx 0 = shoulder flexion
  render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                         store={store} conn="open" onEnd={() => {}} />);
  expect(screen.getByTestId("rom-cue-detail")).toHaveTextContent(/affected arm up in front of you/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx -t "plain-language detail"`
Expected: FAIL — `Unable to find an element by: [data-testid="rom-cue-detail"]`

- [ ] **Step 3: Reword the cue strings**

In `RomTrialModel.ts`, replace the `CATALOGUE` block (lines 8-12) with:

```ts
const CATALOGUE: { joint: JointId; label: string; cue: string }[] = [
  { joint: "shoulder_flexion", label: "Reach up high", cue: "Lift your affected arm up in front of you — reach the net to the star." },
  { joint: "shoulder_abduction", label: "Reach out wide", cue: "Lift your affected arm out to the side — reach the net to the star." },
  { joint: "elbow_extension", label: "Straighten your arm", cue: "Stretch your affected arm out straight — reach the net to the star." },
];
```

- [ ] **Step 4: Render the detail subline**

In `StarCatchScene.tsx`, add a `cueDetail` state alongside `cue` (after line 57):

```tsx
  const [cueDetail, setCueDetail] = useState(model.current.current.cue);
```

Inside the rAF `tick` (after the existing `setCue(...)` on line 80), add:

```tsx
      setCueDetail(model.current.current.cue);
```

In the banner, replace the single `rom-cue` span (lines 116) with headline + detail:

```tsx
        <span className="rom-cue" data-testid="rom-cue" data-phase={phase}>{cue}</span>
        <span className="rom-cue-detail" data-testid="rom-cue-detail">{cueDetail}</span>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx`
Expected: PASS (all StarCatchScene tests, including the new one)

- [ ] **Step 6: Style the subline**

In `patient-web/src/styles.css`, in the `.stars-banner` block (near line 238), add a rule:

```css
.rom-cue-detail { display: block; font-size: clamp(15px, 2vw, 22px); font-weight: 500; opacity: 0.9; margin-top: 4px; }
```

- [ ] **Step 7: Commit**

```bash
git add patient-web/src/reach/RomTrialModel.ts patient-web/src/scenes/StarCatchScene.tsx patient-web/src/scenes/StarCatchScene.test.tsx patient-web/src/styles.css
git commit -m "feat(patient): show plain-language affected-arm instruction in Star Catcher"
```

---

### Task 2: "Tracking arm" badge (both games)

**Files:**
- Modify: `patient-web/src/scenes/StarCatchScene.tsx` (footer)
- Modify: `patient-web/src/scenes/GardenScene.tsx` (footer)
- Modify: `patient-web/src/styles.css`
- Test: `patient-web/src/scenes/StarCatchScene.test.tsx`, `patient-web/src/scenes/GardenScene.test.tsx`

**Interfaces:**
- Consumes: `store.latest()?.joints?.poseValid` (boolean).
- Produces: a `tracking-badge` element with `data-tracking="on"|"off"` in both scene footers.

- [ ] **Step 1: Write the failing tests**

In `StarCatchScene.test.tsx`:

```tsx
it("shows the tracking badge on when pose is valid", () => {
  const store = new ScoreStore();
  store.push(frame(80, { flex: 30 })); // frame() sets poseValid: true
  render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                         store={store} conn="open" onEnd={() => {}} />);
  expect(screen.getByTestId("tracking-badge")).toHaveAttribute("data-tracking", "on");
});

it("shows the tracking badge off when pose is invalid", () => {
  const store = new ScoreStore();
  store.push(frame(80, null)); // joints null → not tracking
  render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                         store={store} conn="open" onEnd={() => {}} />);
  expect(screen.getByTestId("tracking-badge")).toHaveAttribute("data-tracking", "off");
});
```

In `GardenScene.test.tsx` (its `frame(v)` helper sets `joints: null`, so default is off):

```tsx
it("shows a tracking badge reflecting pose validity", () => {
  const store = new ScoreStore();
  store.push(frame(80)); // joints null → off
  render(<GardenScene stats={new SessionStats()} engagementThreshold={55}
                      store={store} conn="open" onEnd={() => {}} />);
  const badge = screen.getByTestId("tracking-badge");
  expect(badge).toHaveAttribute("data-tracking", "off");
  act(() => store.push({ intentScore: 80, erdScore: null, classifierScore: null,
    kinematicScore: 60, compensationFlag: false, isArtifact: false, mode: "C", timestamp: 0,
    joints: { shoulderFlexionDeg: 10, shoulderAbductionDeg: 0, elbowDeg: 170, poseValid: true } }));
  pump(1, 100);
  expect(screen.getByTestId("tracking-badge")).toHaveAttribute("data-tracking", "on");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx src/scenes/GardenScene.test.tsx -t "tracking"`
Expected: FAIL — `Unable to find an element by: [data-testid="tracking-badge"]`

- [ ] **Step 3: Add the badge to StarCatchScene**

In `StarCatchScene.tsx`, derive tracking in the render body (near line 100 where `store.latest()?.joints` is already read):

```tsx
  const tracking = store.latest()?.joints?.poseValid === true;
```

In the `stars-footer` (replace lines 193-198):

```tsx
      <div className="stars-footer">
        <button type="button" className="end-button" onClick={onEnd}>
          End session
        </button>
        <span className="conn-badge" data-state={conn}>{conn}</span>
        <span className="tracking-badge" data-testid="tracking-badge" data-tracking={tracking ? "on" : "off"}>
          {tracking ? "Tracking arm ✓" : "Move into frame"}
        </span>
      </div>
```

- [ ] **Step 4: Add the badge to GardenScene**

In `GardenScene.tsx`, derive tracking in the render body (after `const reduced = ...` on line 69):

```tsx
  const tracking = store.latest()?.joints?.poseValid === true;
```

In the `garden-footer` (replace lines 199-204):

```tsx
      <div className="garden-footer">
        <button type="button" className="end-button" onClick={onEnd}>
          End session
        </button>
        <span className="conn-badge" data-state={conn}>{conn}</span>
        <span className="tracking-badge" data-testid="tracking-badge" data-tracking={tracking ? "on" : "off"}>
          {tracking ? "Tracking arm ✓" : "Move into frame"}
        </span>
      </div>
```

- [ ] **Step 5: Style the badge**

In `patient-web/src/styles.css`, next to the `.conn-badge` rule (line 95), add:

```css
.tracking-badge { position: absolute; right: 24px; bottom: 28px; font-size: 12px;
  padding: 4px 12px; border-radius: 999px; font-weight: 600; z-index: 5; }
.tracking-badge[data-tracking="on"] { background: var(--good); color: #fff; }
.tracking-badge[data-tracking="off"] { background: #d9c48a; color: #4a3a10; }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx src/scenes/GardenScene.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add patient-web/src/scenes/StarCatchScene.tsx patient-web/src/scenes/GardenScene.tsx patient-web/src/scenes/StarCatchScene.test.tsx patient-web/src/scenes/GardenScene.test.tsx patient-web/src/styles.css
git commit -m "feat(patient): bottom-right tracking-arm badge on both games"
```

---

### Task 3: Fixed goal star per cue (Star Catcher)

**Files:**
- Modify: `patient-web/src/scenes/StarCatchScene.tsx`
- Test: `patient-web/src/scenes/StarCatchScene.test.tsx`

**Interfaces:**
- Consumes: `model.current.current.targetDeg`, `model.current.current.joint`, `fkArm({ shoulder, shoulderElevationDeg, elbowDeg, upperLen, foreLen, mirror }) → { elbow, wrist }`.
- Produces: a `reach-goal` group whose `transform` translate is fixed for a given cue (independent of the live measured pose).

- [ ] **Step 1: Write the failing test**

Add to `StarCatchScene.test.tsx`. Extracts the `translate(x y)` from the goal group's transform and asserts it is stable when only the measured angle changes within the same cue:

```tsx
it("keeps the goal star fixed in space as the measured angle changes within a cue", () => {
  const store = new ScoreStore();
  store.push(frame(50, { flex: 20 })); // flexion cue, measured 20 (< 60 target)
  render(<StarCatchScene stats={new SessionStats()} engagementThreshold={95}
                         store={store} conn="open" onEnd={() => {}} />);
  const translateOf = () =>
    /translate\(([\-\d.]+) ([\-\d.]+)\)/.exec(
      screen.getByTestId("reach-goal").getAttribute("transform") ?? "",
    );
  const before = translateOf();
  act(() => store.push(frame(50, { flex: 45 }))); // same cue, different measured angle
  pump(2, 100);
  const after = translateOf();
  expect(after?.[1]).toBe(before?.[1]);
  expect(after?.[2]).toBe(before?.[2]);
});
```

Note: `engagementThreshold={95}` keeps the reach below the collection gate so the cue does not advance mid-test.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx -t "keeps the goal star fixed"`
Expected: FAIL — current `reach-goal` is a `<path>` translated to the live `wrist`, so its translate moves with the measured angle (or the regex finds no group transform).

- [ ] **Step 3: Compute the fixed goal pose and render the goal group**

In `StarCatchScene.tsx`, after the live `fkArm` call (lines 107-110), add the fixed goal pose:

```tsx
  const targetDeg = model.current.current.targetDeg;
  const goalElevationDeg = joint === "elbow_extension" ? 20 : targetDeg;
  const goalElbowDeg = joint === "elbow_extension" ? targetDeg : 180;
  const goal = fkArm({
    shoulder, shoulderElevationDeg: goalElevationDeg, elbowDeg: goalElbowDeg,
    upperLen: 150, foreLen: 140, mirror,
  });
```

Replace the existing `reach-goal` path (lines 142-149) with a group translated to the **fixed** goal wrist, the star scaled/glowing by proximity:

```tsx
            {/* fixed goal star for the current cue — stays put; the net reaches to it */}
            <g data-testid="reach-goal" transform={`translate(${goal.wrist.x} ${goal.wrist.y})`}>
              <path
                d={STAR}
                transform={`scale(${28 + reach * 10})`}
                fill="var(--purple, #6a4c93)" stroke="#fff" strokeWidth="0.06"
                opacity={0.4 + reach * 0.5}
              />
            </g>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx`
Expected: PASS (all StarCatchScene tests)

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/scenes/StarCatchScene.tsx patient-web/src/scenes/StarCatchScene.test.tsx
git commit -m "feat(patient): fixed goal star at the reach target per cue"
```

---

### Task 4: Net on the hand (Star Catcher)

**Files:**
- Modify: `patient-web/src/scenes/StarCatchScene.tsx`
- Test: `patient-web/src/scenes/StarCatchScene.test.tsx`

**Interfaces:**
- Consumes: live `wrist` from `fkArm`, `reach` value.
- Produces: a `net` group at the live wrist carrying `data-reach`; the old `reach-hand` star is removed.

- [ ] **Step 1: Update the existing collection test to read the net**

In `StarCatchScene.test.tsx`, the collection test currently reads `reach-hand`'s `data-reach` (line 56). Change that line to read the net:

```tsx
    expect(Number(screen.getByTestId("net").getAttribute("data-reach"))).toBeGreaterThan(0.9);
```

Add a test asserting the star hand is gone and the net is present:

```tsx
it("draws a net on the hand instead of a star", () => {
  const store = new ScoreStore();
  store.push(frame(80, { flex: 30 }));
  render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                         store={store} conn="open" onEnd={() => {}} />);
  expect(screen.getByTestId("net")).toBeInTheDocument();
  expect(screen.queryByTestId("reach-hand")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx -t "net"`
Expected: FAIL — `Unable to find an element by: [data-testid="net"]`

- [ ] **Step 3: Replace the hand star with a net**

In `StarCatchScene.tsx`, replace the `reach-hand` path (lines 165-171) with a net group at the live wrist:

```tsx
            {/* net on the hand — carried toward the fixed goal star */}
            <g data-testid="net" data-reach={reach.toFixed(2)} transform={`translate(${wrist.x} ${wrist.y})`}>
              <line x1="0" y1="0" x2="0" y2="30" stroke="#8a5a2b" strokeWidth="6" strokeLinecap="round" />
              <circle cx="0" cy="-14" r="22" fill="rgba(255,255,255,0.18)" stroke="#c9a24a" strokeWidth="5" />
              <path
                d="M-20 -14 L20 -14 M-14 -30 L-14 2 M0 -34 L0 4 M14 -30 L14 2 M-18 -24 L18 -24 M-18 -4 L18 -4"
                stroke="#c9a24a" strokeWidth="1.5" fill="none" opacity="0.7"
              />
            </g>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx`
Expected: PASS (all StarCatchScene tests)

- [ ] **Step 5: Full suite + typecheck**

Run: `cd patient-web && npm run test && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add patient-web/src/scenes/StarCatchScene.tsx patient-web/src/scenes/StarCatchScene.test.tsx
git commit -m "feat(patient): render a net on the hand to catch target stars"
```

---

## Final verification

- [ ] `cd patient-web && npm run test` — full suite green.
- [ ] `cd patient-web && npm run typecheck` — clean.
- [ ] `cd patient-web && npm run dev`, open Star Catcher: banner reads a plain-language affected-arm instruction; a fixed star marks the goal; a net rides the hand to it; bottom-right shows "Tracking arm ✓"/"Move into frame". Open Garden: bottom-right tracking badge present, no net/target changes.
- [ ] Update `docs/todos.md` — mark this Star Catcher UX pass done; note net-forearm-rotation deferred.
