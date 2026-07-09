# Checkpoint Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three cross-app checkpoint gates that block a button in one app until the paired counterpart acts, each with a "waiting for …" spinner.

**Architecture:** A new checkpoint message type rides the existing paired LAN socket. `LanServer` (Electron main) is the session-scoped state authority, bridged to the console renderer over IPC and to the patient over the LAN socket. Gates fall back to local-only behavior when unpaired.

**Tech Stack:** TypeScript, React 18, Vitest + jsdom (both packages), Electron IPC, `ws`.

## Global Constraints

- The checkpoint contract module must be **byte-identical** across `patient-web` and `clinician-console` (same rule as `intentScoreMessage` / `signaling`).
- Run patient-web Vitest from **inside `patient-web/`** (repo-root runs miss the jsdom config → "document is not defined").
- Cross-app gating is **active only when paired** (patient has a `code`; console bridge is present). Unpaired/dev falls back to local-action-only, no remote spinner.
- No new dependencies. No changes to score/quality/vision frames.
- Spinner animation must honor `prefers-reduced-motion`.
- Commits: no `Co-Authored-By` trailer.

---

### Task 1: Checkpoint contract (both packages)

**Files:**
- Create: `patient-web/src/net/checkpoint.ts`
- Create: `clinician-console/src/main/lan/checkpoint.ts` (byte-identical body)
- Test: `patient-web/src/net/checkpoint.test.ts`
- Test: `clinician-console/src/main/lan/checkpoint.test.ts`

**Interfaces:**
- Produces: `PatientCheckpoint = "session-begin" | "calibration-complete"`, `ClinicianCheckpoint = "go-live"`, `CheckpointMessage` union, `isPatientCheckpoint(msg)`, `isClinicianCheckpoint(msg)`.

- [ ] **Step 1: Write the failing test** (`patient-web/src/net/checkpoint.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { isPatientCheckpoint, isClinicianCheckpoint } from "./checkpoint";

describe("checkpoint contract", () => {
  it("recognizes patient checkpoints", () => {
    expect(isPatientCheckpoint({ type: "patient-checkpoint", checkpoint: "session-begin" })).toBe(true);
    expect(isPatientCheckpoint({ type: "patient-checkpoint", checkpoint: "calibration-complete" })).toBe(true);
  });
  it("recognizes clinician checkpoints", () => {
    expect(isClinicianCheckpoint({ type: "clinician-checkpoint", checkpoint: "go-live" })).toBe(true);
  });
  it("rejects other/unknown messages", () => {
    expect(isPatientCheckpoint({ type: "intent_score" })).toBe(false);
    expect(isClinicianCheckpoint({ type: "webrtc-offer" })).toBe(false);
    expect(isPatientCheckpoint({ type: "patient-checkpoint", checkpoint: "nope" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd patient-web && npx vitest run src/net/checkpoint.test.ts`
Expected: FAIL — cannot find module `./checkpoint`.

- [ ] **Step 3: Write the module** (`patient-web/src/net/checkpoint.ts`)

```ts
export type PatientCheckpoint = "session-begin" | "calibration-complete";
export type ClinicianCheckpoint = "go-live";

export type CheckpointMessage =
  | { type: "patient-checkpoint"; checkpoint: PatientCheckpoint }
  | { type: "clinician-checkpoint"; checkpoint: ClinicianCheckpoint };

const PATIENT_CHECKPOINTS = new Set<string>(["session-begin", "calibration-complete"]);
const CLINICIAN_CHECKPOINTS = new Set<string>(["go-live"]);

export function isPatientCheckpoint(
  msg: { type?: string; checkpoint?: string },
): msg is { type: "patient-checkpoint"; checkpoint: PatientCheckpoint } {
  return !!msg && msg.type === "patient-checkpoint" && PATIENT_CHECKPOINTS.has(msg.checkpoint ?? "");
}

export function isClinicianCheckpoint(
  msg: { type?: string; checkpoint?: string },
): msg is { type: "clinician-checkpoint"; checkpoint: ClinicianCheckpoint } {
  return !!msg && msg.type === "clinician-checkpoint" && CLINICIAN_CHECKPOINTS.has(msg.checkpoint ?? "");
}
```

- [ ] **Step 4: Copy byte-identical into console** (`clinician-console/src/main/lan/checkpoint.ts`) — same content as Step 3.

- [ ] **Step 5: Copy the test into console** (`clinician-console/src/main/lan/checkpoint.test.ts`) — same body as Step 1 but import path stays `./checkpoint`.

- [ ] **Step 6: Run both tests to verify they pass**

Run: `cd patient-web && npx vitest run src/net/checkpoint.test.ts`
Run: `cd clinician-console && npx vitest run src/main/lan/checkpoint.test.ts`
Expected: PASS (3 tests each).

- [ ] **Step 7: Commit**

```bash
git add patient-web/src/net/checkpoint.ts patient-web/src/net/checkpoint.test.ts \
  clinician-console/src/main/lan/checkpoint.ts clinician-console/src/main/lan/checkpoint.test.ts
git commit -m "feat: add cross-app checkpoint message contract"
```

---

### Task 2: LanServer checkpoint state + routing

**Files:**
- Modify: `clinician-console/src/main/lan/lanServer.ts`
- Test: `clinician-console/src/main/lan/lanServer.test.ts`

**Interfaces:**
- Consumes: `isPatientCheckpoint`, `ClinicianCheckpoint` from `./checkpoint` (Task 1).
- Produces: `LanServer` emits `"patient-checkpoint"` with a `PatientCheckpoint` string; new methods `sendClinicianCheckpoint(checkpoint: ClinicianCheckpoint): void` and `checkpointState(): { patientBegan: boolean; patientCalibrated: boolean; clinicianLive: boolean }`.

- [ ] **Step 1: Write the failing test** — append to `clinician-console/src/main/lan/lanServer.test.ts`. Match the file's existing harness for constructing a `LanServer` and a fake patient socket (mirror the nearest existing test that pairs a socket). The three behaviors:

```ts
it("records a patient checkpoint and emits it", () => {
  // pair a fake patient socket via the existing helper, then:
  const seen: string[] = [];
  server.on("patient-checkpoint", (c: string) => seen.push(c));
  patientSocket.emit("message", JSON.stringify({ type: "patient-checkpoint", checkpoint: "session-begin" }));
  expect(seen).toEqual(["session-begin"]);
  expect(server.checkpointState().patientBegan).toBe(true);
});

it("forwards a clinician go-live to the patient and remembers it", () => {
  const sent: string[] = [];
  patientSocket.send = (raw: string) => sent.push(raw);
  server.sendClinicianCheckpoint("go-live");
  expect(server.checkpointState().clinicianLive).toBe(true);
  expect(sent.some((r) => r.includes("clinician-checkpoint") && r.includes("go-live"))).toBe(true);
});

it("replays clinician go-live to a socket that pairs after the fact", () => {
  server.sendClinicianCheckpoint("go-live"); // before pairing
  const sent: string[] = [];
  const late = makeFakeSocket((raw) => sent.push(raw)); // pair this socket via existing helper
  // ...pair `late` with a valid code...
  expect(sent.some((r) => r.includes("clinician-checkpoint") && r.includes("go-live"))).toBe(true);
});

it("resets checkpoint flags on endSession", () => {
  server.sendClinicianCheckpoint("go-live");
  server.endSession();
  expect(server.checkpointState()).toEqual({ patientBegan: false, patientCalibrated: false, clinicianLive: false });
});
```

Note: reuse the file's existing socket/pairing helpers rather than inventing new ones — read the top of `lanServer.test.ts` first and copy its patterns exactly.

- [ ] **Step 2: Run to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lan/lanServer.test.ts`
Expected: FAIL — `checkpointState`/`sendClinicianCheckpoint` not a function.

- [ ] **Step 3: Add the import** — in `lanServer.ts` alongside the existing `import { isSignalingMessage } from "./signaling";`:

```ts
import { isPatientCheckpoint, type ClinicianCheckpoint } from "./checkpoint";
```

- [ ] **Step 4: Add the state field** — after the `private port = 0;` field (around line 40):

```ts
  private checkpoints = { patientBegan: false, patientCalibrated: false, clinicianLive: false };
```

- [ ] **Step 5: Handle the inbound patient checkpoint** — in `onConnection`, inside the `ws.on("message", …)` handler, immediately after the `isSignalingMessage(msg)` block (right before the `game-event` comment):

```ts
      if (isPatientCheckpoint(msg)) {
        if (msg.checkpoint === "session-begin") this.checkpoints.patientBegan = true;
        else this.checkpoints.patientCalibrated = true;
        this.emit("patient-checkpoint", msg.checkpoint);
        return;
      }
```

- [ ] **Step 6: Replay clinician go-live on pair** — in `handlePair`, after `ws.send(JSON.stringify({ type: "paired", session: this.pairing.session() }));`:

```ts
    if (this.checkpoints.clinicianLive) {
      ws.send(JSON.stringify({ type: "clinician-checkpoint", checkpoint: "go-live" }));
    }
```

- [ ] **Step 7: Add the public methods** — after `endSession()` (or any public method); and reset flags in `startSession` and `endSession`:

```ts
  sendClinicianCheckpoint(checkpoint: ClinicianCheckpoint): void {
    if (checkpoint === "go-live") this.checkpoints.clinicianLive = true;
    const raw = JSON.stringify({ type: "clinician-checkpoint", checkpoint });
    if (this.patientSocket?.readyState === WebSocket.OPEN) this.patientSocket.send(raw);
  }

  checkpointState(): { patientBegan: boolean; patientCalibrated: boolean; clinicianLive: boolean } {
    return { ...this.checkpoints };
  }

  private resetCheckpoints(): void {
    this.checkpoints = { patientBegan: false, patientCalibrated: false, clinicianLive: false };
  }
```

In `startSession(...)`, add `this.resetCheckpoints();` as the first line. In `endSession()`, add `this.resetCheckpoints();` as the first line.

- [ ] **Step 8: Run to verify it passes**

Run: `cd clinician-console && npx vitest run src/main/lan/lanServer.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 9: Commit**

```bash
git add clinician-console/src/main/lan/lanServer.ts clinician-console/src/main/lan/lanServer.test.ts
git commit -m "feat(lan): checkpoint state authority + routing in LanServer"
```

---

### Task 3: main IPC wiring + preload bridge

**Files:**
- Modify: `clinician-console/src/main/main.ts:65-98` (`startLan`)
- Modify: `clinician-console/src/main/preload.ts`

**Interfaces:**
- Consumes: `LanServer` events/methods from Task 2.
- Produces: `window.neuroreach.onPatientCheckpoint(cb)`, `.sendClinicianCheckpoint(checkpoint)`, `.getCheckpointState()`.

_(No unit test — this is Electron glue verified via typecheck + downstream tests. Keep the diff mechanical.)_

- [ ] **Step 1: Forward the LanServer event** — in `startLan`, next to the existing `lan.on("patient-connected", …)`:

```ts
  lan.on("patient-checkpoint", (checkpoint: string) => win?.webContents.send("patient-checkpoint", checkpoint));
```

- [ ] **Step 2: Add the IPC handlers** — inside `startLan`, alongside the other `ipcMain.handle` calls:

```ts
  ipcMain.handle("session:clinician-checkpoint", (_e, checkpoint: "go-live") =>
    lan!.sendClinicianCheckpoint(checkpoint),
  );
  ipcMain.handle("session:checkpoint-state", () => lan!.checkpointState());
```

- [ ] **Step 3: Expose on the preload bridge** — in `preload.ts`, add to the `exposeInMainWorld("neuroreach", { … })` object:

```ts
  onPatientCheckpoint: (cb: (checkpoint: string) => void) =>
    ipcRenderer.on("patient-checkpoint", (_e, checkpoint) => cb(checkpoint)),
  sendClinicianCheckpoint: (checkpoint: unknown) =>
    ipcRenderer.invoke("session:clinician-checkpoint", checkpoint),
  getCheckpointState: () => ipcRenderer.invoke("session:checkpoint-state"),
```

- [ ] **Step 4: Typecheck**

Run: `cd clinician-console && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/main/main.ts clinician-console/src/main/preload.ts
git commit -m "feat(main): bridge checkpoint state over IPC"
```

---

### Task 4: console `useCheckpoints` hook

**Files:**
- Create: `clinician-console/src/renderer/useCheckpoints.ts`
- Test: `clinician-console/src/renderer/useCheckpoints.test.ts`

**Interfaces:**
- Consumes: `window.neuroreach` from Task 3.
- Produces: `useCheckpoints()` → `{ active: boolean; patientBegan: boolean; patientCalibrated: boolean; sendGoLive: () => void }`. `active` is `false` when the bridge is absent (plain Vite / jsdom) so gates fall back to ungated.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCheckpoints } from "./useCheckpoints";

function installBridge() {
  let cb: ((c: string) => void) | null = null;
  const bridge = {
    getCheckpointState: vi.fn().mockResolvedValue({ patientBegan: true, patientCalibrated: false, clinicianLive: false }),
    onPatientCheckpoint: vi.fn((fn: (c: string) => void) => { cb = fn; }),
    sendClinicianCheckpoint: vi.fn().mockResolvedValue(undefined),
  };
  (window as any).neuroreach = bridge;
  return { bridge, fire: (c: string) => cb?.(c) };
}

beforeEach(() => { delete (window as any).neuroreach; });

describe("useCheckpoints", () => {
  it("is inactive with no bridge", () => {
    const { result } = renderHook(() => useCheckpoints());
    expect(result.current.active).toBe(false);
    expect(result.current.patientBegan).toBe(false);
  });

  it("hydrates from the snapshot and reacts to live checkpoints", async () => {
    const { fire } = installBridge();
    const { result } = renderHook(() => useCheckpoints());
    expect(result.current.active).toBe(true);
    await waitFor(() => expect(result.current.patientBegan).toBe(true));
    expect(result.current.patientCalibrated).toBe(false);
    act(() => fire("calibration-complete"));
    expect(result.current.patientCalibrated).toBe(true);
  });

  it("sends go-live through the bridge", () => {
    const { bridge } = installBridge();
    const { result } = renderHook(() => useCheckpoints());
    act(() => result.current.sendGoLive());
    expect(bridge.sendClinicianCheckpoint).toHaveBeenCalledWith("go-live");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd clinician-console && npx vitest run src/renderer/useCheckpoints.test.ts`
Expected: FAIL — cannot find module `./useCheckpoints`.

- [ ] **Step 3: Write the hook**

```ts
import { useCallback, useEffect, useState } from "react";

type CheckpointBridge = {
  onPatientCheckpoint(cb: (checkpoint: string) => void): void;
  sendClinicianCheckpoint(checkpoint: string): Promise<void>;
  getCheckpointState(): Promise<{ patientBegan: boolean; patientCalibrated: boolean; clinicianLive: boolean }>;
};

function bridge(): CheckpointBridge | null {
  const nr = (window as unknown as { neuroreach?: CheckpointBridge }).neuroreach;
  return nr && typeof nr.getCheckpointState === "function" ? nr : null;
}

export function useCheckpoints() {
  const [patientBegan, setBegan] = useState(false);
  const [patientCalibrated, setCalibrated] = useState(false);
  const nr = bridge();

  useEffect(() => {
    if (!nr) return;
    void nr.getCheckpointState().then((s) => {
      setBegan(s.patientBegan);
      setCalibrated(s.patientCalibrated);
    });
    nr.onPatientCheckpoint((c) => {
      if (c === "session-begin") setBegan(true);
      if (c === "calibration-complete") setCalibrated(true);
    });
  }, [nr]);

  const sendGoLive = useCallback(() => {
    void nr?.sendClinicianCheckpoint("go-live");
  }, [nr]);

  return { active: nr !== null, patientBegan, patientCalibrated, sendGoLive };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd clinician-console && npx vitest run src/renderer/useCheckpoints.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/renderer/useCheckpoints.ts clinician-console/src/renderer/useCheckpoints.test.ts
git commit -m "feat(console): useCheckpoints renderer hook"
```

---

### Task 5: console Spinner + PairDeviceStep gate

**Files:**
- Create: `clinician-console/src/renderer/WaitingSpinner.tsx`
- Modify: `clinician-console/src/renderer/console.css`
- Modify: `clinician-console/src/renderer/PairDeviceStep.tsx`
- Modify: `clinician-console/src/renderer/SessionFlow.tsx`
- Test: `clinician-console/src/renderer/PairDeviceStep.test.tsx`

**Interfaces:**
- Consumes: `useCheckpoints` (Task 4).
- Produces: `WaitingSpinner({ label })` renders `data-testid="waiting-spinner"`. `PairDeviceStep` gains prop `waitingForPatient: boolean`.

- [ ] **Step 1: Write the failing test** — append to `PairDeviceStep.test.tsx`. Update `renderStep` to include `waitingForPatient: false` in its default props, then add:

```ts
it("disables Continue and shows the spinner while waiting for the patient", () => {
  renderStep({ code: "ABC234", url: "https://x/?c=ABC234", waitingForPatient: true });
  expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  expect(screen.getByTestId("waiting-spinner")).toHaveTextContent(/waiting for patient/i);
});

it("enables Continue and hides the spinner once the patient has begun", () => {
  renderStep({ code: "ABC234", url: "https://x/?c=ABC234", waitingForPatient: false });
  expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
  expect(screen.queryByTestId("waiting-spinner")).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd clinician-console && npx vitest run src/renderer/PairDeviceStep.test.tsx`
Expected: FAIL — Continue not disabled / spinner not found.

- [ ] **Step 3: Write the spinner** (`WaitingSpinner.tsx`)

```tsx
export function WaitingSpinner({ label }: { label: string }) {
  return (
    <div className="waiting" role="status" data-testid="waiting-spinner">
      <span className="waiting__spin" aria-hidden="true" />
      <span className="waiting__label">{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Add spinner CSS** — append to `console.css`:

```css
.waiting { display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 8px; font-size: 13px; color: var(--muted, #8aa0bd); }
.waiting__spin { width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid currentColor; border-top-color: transparent;
  animation: waiting-spin 0.8s linear infinite; }
@keyframes waiting-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .waiting__spin { animation: none; } }
```

- [ ] **Step 5: Wire PairDeviceStep** — add `waitingForPatient: boolean;` to its `Props`; import `WaitingSpinner`; replace the Continue button block (lines ~68-72) with:

```tsx
      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Signal check</button>
        <span className="spacer" style={{ flex: 1 }} />
        <div className="gate-col">
          <button className="btn btn-primary" onClick={onNext} disabled={waitingForPatient}>Continue ▶</button>
          {waitingForPatient && <WaitingSpinner label="Waiting for patient…" />}
        </div>
      </div>
```

Add to `console.css`: `.gate-col { display: flex; flex-direction: column; align-items: stretch; }`

- [ ] **Step 6: Wire SessionFlow** — add `import { useCheckpoints } from "./useCheckpoints";`, then inside `SessionFlow` after `const s = useSession();`:

```tsx
  const cp = useCheckpoints();
```

In the `step === "pair"` block, add the prop to `<PairDeviceStep …>`:

```tsx
          waitingForPatient={cp.active && !cp.patientBegan}
```

- [ ] **Step 7: Run to verify it passes**

Run: `cd clinician-console && npx vitest run src/renderer/PairDeviceStep.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add clinician-console/src/renderer/WaitingSpinner.tsx clinician-console/src/renderer/console.css \
  clinician-console/src/renderer/PairDeviceStep.tsx clinician-console/src/renderer/PairDeviceStep.test.tsx \
  clinician-console/src/renderer/SessionFlow.tsx
git commit -m "feat(console): gate Pair Continue on patient session-begin"
```

---

### Task 6: console CalibrateStep gate + go-live

**Files:**
- Modify: `clinician-console/src/renderer/CalibrateStep.tsx`
- Modify: `clinician-console/src/renderer/SessionFlow.tsx`
- Test: `clinician-console/src/renderer/CalibrateStep.test.tsx`

**Interfaces:**
- Consumes: `useCheckpoints` (via SessionFlow), `WaitingSpinner` (Task 5).
- Produces: `CalibrateStep` gains props `waitingForPatient: boolean` and `onGoLive: () => void`.

- [ ] **Step 1: Write the failing test** — append to `CalibrateStep.test.tsx`. Add `waitingForPatient: false` and `onGoLive: vi.fn()` to the test's default props helper, then:

```ts
it("disables 'Continue to live' and shows the spinner while waiting for calibration", () => {
  renderStep({ waitingForPatient: true });
  expect(screen.getByRole("button", { name: /continue to live/i })).toBeDisabled();
  expect(screen.getByTestId("waiting-spinner")).toHaveTextContent(/waiting for patient/i);
});

it("fires go-live from both Continue to live and Skip", () => {
  const onGoLive = vi.fn();
  const onNext = vi.fn();
  renderStep({ waitingForPatient: false, onGoLive, onNext });
  fireEvent.click(screen.getByRole("button", { name: /continue to live/i }));
  fireEvent.click(screen.getByRole("button", { name: /^skip$/i }));
  expect(onGoLive).toHaveBeenCalledTimes(2);
  expect(onNext).toHaveBeenCalledTimes(2);
});

it("keeps Skip enabled even while waiting", () => {
  renderStep({ waitingForPatient: true });
  expect(screen.getByRole("button", { name: /^skip$/i })).not.toBeDisabled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd clinician-console && npx vitest run src/renderer/CalibrateStep.test.tsx`
Expected: FAIL — props not honored / spinner absent.

- [ ] **Step 3: Wire CalibrateStep** — add `waitingForPatient: boolean;` and `onGoLive: () => void;` to `Props`; destructure them; import `WaitingSpinner`. Define a handler and replace the footer buttons (lines ~87-92):

```tsx
  const goLive = () => { onGoLive(); onNext(); };
```

```tsx
      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Pair device</button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={goLive}>Skip</button>
        <div className="gate-col">
          <button className="btn btn-primary" onClick={goLive} disabled={waitingForPatient}>Continue to live ▶</button>
          {waitingForPatient && <WaitingSpinner label="Waiting for patient…" />}
        </div>
      </div>
```

- [ ] **Step 4: Wire SessionFlow** — in the `step === "calibrate"` block add:

```tsx
          waitingForPatient={cp.active && !cp.patientCalibrated}
          onGoLive={cp.sendGoLive}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd clinician-console && npx vitest run src/renderer/CalibrateStep.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full console suite + typecheck**

Run: `cd clinician-console && npm run test && npx tsc --noEmit`
Expected: all green, no type errors.

- [ ] **Step 7: Commit**

```bash
git add clinician-console/src/renderer/CalibrateStep.tsx clinician-console/src/renderer/CalibrateStep.test.tsx \
  clinician-console/src/renderer/SessionFlow.tsx
git commit -m "feat(console): gate Continue-to-live on calibration; Skip fires go-live"
```

---

### Task 7: patient-web link — notify + clinicianLive

**Files:**
- Modify: `patient-web/src/net/lanClient.ts`
- Modify: `patient-web/src/net/usePatientLink.ts`
- Test: `patient-web/src/net/lanClient.test.ts`
- Test: `patient-web/src/net/usePatientLink.test.tsx`

**Interfaces:**
- Consumes: `isClinicianCheckpoint`, `PatientCheckpoint` from `./checkpoint` (Task 1).
- Produces: `LanClientOptions.onCheckpoint?(msg: CheckpointMessage)`; `PatientLink` gains `notify(checkpoint: PatientCheckpoint): void` and `clinicianLive: boolean`.

- [ ] **Step 1: Write the failing lanClient test** — append to `lanClient.test.ts` (reuse its existing fake-socket harness):

```ts
it("routes a clinician-checkpoint frame to onCheckpoint", () => {
  const onCheckpoint = vi.fn();
  // build client with onCheckpoint, open + pair via existing harness, then:
  socket.onmessage?.({ data: JSON.stringify({ type: "clinician-checkpoint", checkpoint: "go-live" }) });
  expect(onCheckpoint).toHaveBeenCalledWith({ type: "clinician-checkpoint", checkpoint: "go-live" });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd patient-web && npx vitest run src/net/lanClient.test.ts`
Expected: FAIL — `onCheckpoint` never called.

- [ ] **Step 3: Wire lanClient** — in `lanClient.ts`:

Add import: `import { isClinicianCheckpoint, type CheckpointMessage } from "./checkpoint";`
Add to `LanClientOptions`: `onCheckpoint?: (msg: CheckpointMessage) => void;`
In `s.onmessage`, add a branch after the `isSignalingMessage` branch:

```ts
      else if (isClinicianCheckpoint(msg)) opts.onCheckpoint?.(msg);
```

- [ ] **Step 4: Run to verify lanClient passes**

Run: `cd patient-web && npx vitest run src/net/lanClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing usePatientLink test** — append to `usePatientLink.test.tsx` (reuse its existing fake-socket + `renderHook` harness):

```ts
it("exposes clinicianLive=false until a go-live arrives, then flips it true", async () => {
  // render the hook with a code + fake socket, drive pairing via existing harness
  expect(result.current.clinicianLive).toBe(false);
  act(() => socket.onmessage?.({ data: JSON.stringify({ type: "clinician-checkpoint", checkpoint: "go-live" }) }));
  expect(result.current.clinicianLive).toBe(true);
});

it("notify() sends a patient-checkpoint frame over the socket", async () => {
  // render + pair
  act(() => result.current.notify("session-begin"));
  expect(sent.some((r) => r.includes("patient-checkpoint") && r.includes("session-begin"))).toBe(true);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd patient-web && npx vitest run src/net/usePatientLink.test.tsx`
Expected: FAIL — `clinicianLive`/`notify` undefined.

- [ ] **Step 7: Wire usePatientLink** — in `usePatientLink.ts`:

Add imports: `import { type PatientCheckpoint } from "./checkpoint";`
Add to the `PatientLink` type: `notify: (checkpoint: PatientCheckpoint) => void;` and `clinicianLive: boolean;`
Add state near the others: `const [clinicianLive, setClinicianLive] = useState(false);`
In the `createLanClient({ … })` options, add:

```ts
        onCheckpoint: (m) => {
          if (m.type === "clinician-checkpoint" && m.checkpoint === "go-live") setClinicianLive(true);
        },
```

Add a stable callback next to `sendSignaling`:

```ts
  const notify = useCallback(
    (checkpoint: PatientCheckpoint) =>
      clientRef.current?.send(JSON.stringify({ type: "patient-checkpoint", checkpoint })),
    [],
  );
```

Add `notify` and `clinicianLive` to the returned object.

- [ ] **Step 8: Run to verify it passes**

Run: `cd patient-web && npx vitest run src/net/usePatientLink.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add patient-web/src/net/lanClient.ts patient-web/src/net/lanClient.test.ts \
  patient-web/src/net/usePatientLink.ts patient-web/src/net/usePatientLink.test.tsx
git commit -m "feat(patient): notify checkpoints + track clinician go-live"
```

---

### Task 8: patient-web GameModeSelect gate + Spinner + App wiring

**Files:**
- Create: `patient-web/src/scenes/WaitingSpinner.tsx`
- Modify: `patient-web/src/styles.css`
- Modify: `patient-web/src/scenes/GameModeSelect.tsx`
- Modify: `patient-web/src/App.tsx`
- Test: `patient-web/src/scenes/GameModeSelect.test.tsx`
- Test: `patient-web/src/App.test.tsx`

**Interfaces:**
- Consumes: `PatientLink.notify` / `.clinicianLive` (Task 7).
- Produces: `GameModeSelect` gains prop `clinicianReady: boolean` (default `true` so existing callers/tests stay valid).

- [ ] **Step 1: Write the failing GameModeSelect test** — append to `GameModeSelect.test.tsx`:

```ts
it("stays disabled after selecting a mode until the clinician is ready", () => {
  render(<GameModeSelect onConfirm={() => {}} clinicianReady={false} />);
  fireEvent.click(screen.getByTestId("mode-garden"));
  const ready = screen.getByTestId("mode-ready");
  expect(ready).toBeDisabled();
  expect(screen.getByTestId("waiting-spinner")).toHaveTextContent(/waiting for clinician/i);
});

it("enables 'I'm ready' when a mode is selected and the clinician is ready", () => {
  render(<GameModeSelect onConfirm={() => {}} clinicianReady={true} />);
  fireEvent.click(screen.getByTestId("mode-garden"));
  expect(screen.getByTestId("mode-ready")).not.toBeDisabled();
  expect(screen.queryByTestId("waiting-spinner")).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd patient-web && npx vitest run src/scenes/GameModeSelect.test.tsx`
Expected: FAIL — button not disabled / spinner absent.

- [ ] **Step 3: Write the patient spinner** (`patient-web/src/scenes/WaitingSpinner.tsx`) — same body as Task 5 Step 3.

- [ ] **Step 4: Add spinner CSS** — append to `styles.css` (same keyframes/rules as Task 5 Step 4, class names identical):

```css
.waiting { display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 8px; font-size: 14px; color: #6b7a90; }
.waiting__spin { width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid currentColor; border-top-color: transparent;
  animation: waiting-spin 0.8s linear infinite; }
@keyframes waiting-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .waiting__spin { animation: none; } }
```

- [ ] **Step 5: Wire GameModeSelect** — change the signature and gate:

```tsx
export function GameModeSelect(
  { onConfirm, clinicianReady = true }: { onConfirm: (id: GameModeId) => void; clinicianReady?: boolean },
) {
```

Import `WaitingSpinner`. Change the ready button's `disabled` and add the spinner right after it:

```tsx
        <button
          type="button"
          className="cal-ready-btn modeselect-ready"
          data-testid="mode-ready"
          disabled={!selected || !clinicianReady}
          onClick={() => selected && clinicianReady && onConfirm(selected)}
        >
          I’m ready
        </button>
        {selected && !clinicianReady && <WaitingSpinner label="Waiting for clinician…" />}
```

- [ ] **Step 6: Wire App.tsx** — three edits:

WelcomeScene onBegin (line ~50):

```tsx
        return <WelcomeScene firstName={firstName} onBegin={() => { setView("calibration"); if (code) link.notify("session-begin"); }} />;
```

CalibrationScene onComplete (line ~57):

```tsx
            onComplete={() => { setView("modeselect"); if (code) link.notify("calibration-complete"); }}
```

GameModeSelect (line ~62):

```tsx
        return <GameModeSelect clinicianReady={code ? link.clinicianLive : true} onConfirm={(id) => setView(id === "stars" ? "stars" : "garden")} />;
```

- [ ] **Step 7: Write the failing App test** — append to `App.test.tsx`. This asserts the paired flow fires `notify`. Reuse the file's existing pairing/socket harness (the one that drives `?c=` mode); if the harness exposes captured sends, assert:

```ts
it("notifies session-begin when the paired patient presses Let's begin", async () => {
  // render App in paired (?c=) mode via the existing harness; advance to Welcome
  fireEvent.click(screen.getByRole("button", { name: /begin/i }));
  await waitFor(() => expect(sent.some((r) => r.includes("patient-checkpoint") && r.includes("session-begin"))).toBe(true));
});
```

If `App.test.tsx` has no send-capturing harness, keep this assertion at the `GameModeSelect`/`usePatientLink` layer (already covered by Tasks 7-8) and instead add a lighter App test that only asserts the mode-select ready button is disabled in paired mode before go-live. Do not invent new global mocks.

- [ ] **Step 8: Run to verify it fails, then implement is already done (Step 6) → run to pass**

Run: `cd patient-web && npx vitest run src/scenes/GameModeSelect.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 9: Full patient suite + typecheck + build**

Run: `cd patient-web && npm run test && npx tsc --noEmit && npm run build`
Expected: all green, no type errors, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add patient-web/src/scenes/WaitingSpinner.tsx patient-web/src/styles.css \
  patient-web/src/scenes/GameModeSelect.tsx patient-web/src/scenes/GameModeSelect.test.tsx \
  patient-web/src/App.tsx patient-web/src/App.test.tsx
git commit -m "feat(patient): gate I'm-ready on clinician go-live + waiting spinner"
```

---

### Task 9: Final verification + docs

**Files:**
- Modify: `docs/todos.md`

- [ ] **Step 1: Both full suites green**

Run: `cd clinician-console && npm run test`
Run: `cd patient-web && npm run test`
Expected: all pass.

- [ ] **Step 2: Both typecheck + patient build**

Run: `cd clinician-console && npx tsc --noEmit`
Run: `cd patient-web && npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Manual smoke (real Electron + patient over LAN)** — `cd clinician-console && npm run dev`; pair a patient tab. Verify: (a) console Pair Continue is disabled with spinner until patient clicks "Let's begin"; (b) console Continue-to-live disabled with spinner until patient reaches mode-select; (c) after selecting a mode, patient "I'm ready" stays disabled with spinner until the clinician clicks Continue-to-live; (d) a patient tab opened with no `?c=` code is never gated. Note anything CSS-only that jsdom could not cover.

- [ ] **Step 4: Update `docs/todos.md`** — add a completed line for checkpoint gating under the status board and a short narrative paragraph (mirror the existing V2-2c entries' style).

- [ ] **Step 5: Commit**

```bash
git add docs/todos.md
git commit -m "docs: record checkpoint gating in todos"
```

---

## Self-Review

**Spec coverage:**
- Req 1 (Pair Continue gate) → Task 5. ✓
- Req 2 (Continue-to-live gate) → Task 6. ✓
- Req 3 (I'm-ready gate on selection + clinician) → Task 8. ✓
- Req 4 (spinner "waiting for …" under gated button) → Tasks 5, 6, 8 (`WaitingSpinner`). ✓
- Decision: no-code bypass → Task 8 Step 6 (`code ? link.clinicianLive : true`) + Task 4 `active` flag. ✓
- Decision: Skip fires go-live, stays ungated → Task 6. ✓
- Contract byte-identical → Task 1. ✓
- State authority / replay / reset → Task 2. ✓

**Type consistency:** `patientBegan` / `patientCalibrated` / `clinicianLive` consistent across Tasks 2, 4, 5, 6. `notify` / `clinicianLive` / `onCheckpoint` consistent across Tasks 7-8. `waitingForPatient` prop consistent across Tasks 5-6. `clinicianReady` prop (Task 8). `WaitingSpinner({ label })` + `data-testid="waiting-spinner"` + class names identical in both packages (Tasks 5, 8).

**Placeholder scan:** Test harness reuse notes (Tasks 2, 7, 8) point at existing patterns to copy rather than leaving code blank — acceptable because the exact fake-socket helpers already exist in those files and must be matched, not reinvented.
