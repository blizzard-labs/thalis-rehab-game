# Clinician Console Session-Workflow Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing tabbed-first session entry with a guided stepper (Signal check → Pair device → Calibrate → Live), surface the Sim/Live toggle and LAN pairing as first-class steps, and wire the Live Monitor controls to the session-gated control channel.

**Architecture:** A new `session` router view drives a step machine. `SessionFlow` owns session state via a new `useSession` hook (which wraps the decoupled `session:*` IPC); the four step components are presentational, prop-driven, and independently testable. The simulator arms only when the Live step mounts — pairing merely opens the door.

**Tech Stack:** Electron + React 18 + TypeScript + Vitest + @testing-library/react (jsdom), `qrcode`.

## Global Constraints

- No change to the `intent_score` or `eeg_quality` JSON wire contracts, nor the shared `intentScoreMessage` parser (byte-identical across console/patient).
- `eeg_quality` frames stay clinician-side only (existing `lan.live.test.ts` guard must keep passing).
- Sim arms **on entering Live**, never at pairing — signal check + pairing run on flat rest.
- Pairing is **always visible, never hard-gated** — every step can advance.
- Switch mode is **capability-gated** — enabled only when a classifier is loaded (`classifier_score != null`); an invalid `csp_lda_blend` is never sent.
- Calibrate is an **honest placeholder** — no faked data.
- Run all console commands from `clinician-console/`. Verify: `npm run test`, `npm run build:main`, `npm run build:renderer` all clean before a task is done.
- Commits: no `Co-Authored-By` trailer.
- Update `docs/todos.md` after the work (project rule) — folded into Task 8.

---

### Task 1: Decouple the session IPC (`session:open` / `begin` / `end` / `set-mode`)

**Files:**
- Modify: `clinician-console/src/main/sessionControl.ts`
- Test: `clinician-console/src/main/sessionControl.test.ts`
- Modify: `clinician-console/src/main/main.ts` (`startLan` IPC handlers)
- Modify: `clinician-console/src/main/preload.ts`

**Interfaces:**
- Consumes: `sessionControlCommand(source, action)` (exists), `sendControl` (exists in `main.ts`).
- Produces: `setModeCommand(mode: "band_power_only" | "csp_lda_blend") -> string`; IPC channels `session:open` (mint code, no arm), `session:begin` (arm sim, sim only), `session:end` (disarm + end pairing), `session:set-mode`; preload `window.neuroreach.{open,begin,end,setMode}`.

- [ ] **Step 1: Write the failing test for `setModeCommand`**

Add to `clinician-console/src/main/sessionControl.test.ts`:

```typescript
import { sessionControlCommand, setModeCommand } from "./sessionControl";

describe("setModeCommand", () => {
  it("builds a set_mode command frame", () => {
    expect(setModeCommand("csp_lda_blend")).toBe(
      JSON.stringify({ cmd: "set_mode", mode: "csp_lda_blend" }),
    );
    expect(setModeCommand("band_power_only")).toBe(
      JSON.stringify({ cmd: "set_mode", mode: "band_power_only" }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- sessionControl`
Expected: FAIL — `setModeCommand` is not exported.

- [ ] **Step 3: Add `setModeCommand`**

Append to `clinician-console/src/main/sessionControl.ts`:

```typescript
export function setModeCommand(mode: "band_power_only" | "csp_lda_blend"): string {
  return JSON.stringify({ cmd: "set_mode", mode });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- sessionControl`
Expected: PASS.

- [ ] **Step 5: Rewrite the IPC handlers in `main.ts`**

In `clinician-console/src/main/main.ts`, replace the import and the two `ipcMain.handle` calls in `startLan()`:

```typescript
import { sessionControlCommand, setModeCommand } from "./sessionControl";
```

```typescript
  lan.start();
  openControlSocket();

  // Decoupled session lifecycle: open() mints the pairing code only; begin()
  // arms the dev simulator (sim source only); end() disarms + closes pairing.
  ipcMain.handle("session:open", (_e, session: SessionInfo) => lan!.startSession(session));
  ipcMain.handle("session:begin", (_e, source: SessionInfo["source"]) => {
    const cmd = sessionControlCommand(source, "start");
    if (cmd) sendControl(cmd);
  });
  ipcMain.handle("session:end", () => {
    sendControl(sessionControlCommand("sim", "end")!); // end always disarms
    return lan!.endSession();
  });
  ipcMain.handle("session:set-mode", (_e, mode: "band_power_only" | "csp_lda_blend") => {
    sendControl(setModeCommand(mode));
  });
```

Remove the previous `ipcMain.handle("start-session", ...)` and `ipcMain.handle("end-session", ...)` lines.

- [ ] **Step 6: Update the preload bridge**

In `clinician-console/src/main/preload.ts`, replace `startSession`/`endSession` with the four session actions (keep the sidecar + patient-connection members):

```typescript
contextBridge.exposeInMainWorld("neuroreach", {
  sidecarWsUrl: SIDECAR_WS_URL,
  onSidecarStatus: (cb: (s: unknown) => void) => {
    ipcRenderer.on("sidecar-status", (_e, status) => cb(status));
  },
  open: (session: unknown) => ipcRenderer.invoke("session:open", session),
  begin: (source: unknown) => ipcRenderer.invoke("session:begin", source),
  end: () => ipcRenderer.invoke("session:end"),
  setMode: (mode: unknown) => ipcRenderer.invoke("session:set-mode", mode),
  onPatientConnected: (cb: () => void) => ipcRenderer.on("patient-connected", () => cb()),
  onPatientDisconnected: (cb: () => void) => ipcRenderer.on("patient-disconnected", () => cb()),
});
```

- [ ] **Step 7: Typecheck the main process**

Run: `npm run build:main`
Expected: clean (no TS errors).

- [ ] **Step 8: Commit**

```bash
git add src/main/sessionControl.ts src/main/sessionControl.test.ts src/main/main.ts src/main/preload.ts
git commit -m "feat(console): decouple session IPC into open/begin/end/set-mode"
```

---

### Task 2: `useSession` hook

**Files:**
- Create: `clinician-console/src/renderer/useSession.ts`
- Test: `clinician-console/src/renderer/useSession.test.ts`

**Interfaces:**
- Consumes: `window.neuroreach.{open,begin,end,setMode,onPatientConnected,onPatientDisconnected}` (Task 1), `SessionInfo` from `../main/lan/pairing`.
- Produces:

```ts
type UseSession = {
  source: "sim" | "live";
  setSource(s: "sim" | "live"): void;
  code: string | null;
  url: string | null;
  connected: boolean;
  bridgeReady: boolean;
  open(base: Omit<SessionInfo, "source">): Promise<void>;
  begin(): Promise<void>;
  end(): Promise<void>;
  setMode(mode: "band_power_only" | "csp_lda_blend"): Promise<void>;
};
```

- [ ] **Step 1: Write the failing test**

```tsx
// clinician-console/src/renderer/useSession.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";

const BASE = { patientFirstName: "Ana", affectedSide: "left" as const, mode: "garden" };

function installBridge() {
  const bridge = {
    open: vi.fn().mockResolvedValue({ code: "ABC234", url: "https://x/?c=ABC234" }),
    begin: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    setMode: vi.fn().mockResolvedValue(undefined),
    onPatientConnected: vi.fn(),
    onPatientDisconnected: vi.fn(),
  };
  (window as any).neuroreach = bridge;
  return bridge;
}

describe("useSession", () => {
  afterEach(() => {
    delete (window as any).neuroreach;
  });

  it("reports bridgeReady=false when no bridge is present", () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.bridgeReady).toBe(false);
  });

  it("open() mints a code without arming; begin() arms with the chosen source", async () => {
    const bridge = installBridge();
    const { result } = renderHook(() => useSession());
    expect(result.current.bridgeReady).toBe(true);

    act(() => result.current.setSource("live"));
    await act(async () => { await result.current.open(BASE); });
    expect(bridge.open).toHaveBeenCalledWith({ ...BASE, source: "live" });
    expect(bridge.begin).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.code).toBe("ABC234"));
    expect(result.current.url).toBe("https://x/?c=ABC234");

    await act(async () => { await result.current.begin(); });
    expect(bridge.begin).toHaveBeenCalledWith("live");
  });

  it("flips connected when the patient-connected callback fires", async () => {
    const bridge = installBridge();
    let fire: () => void = () => {};
    bridge.onPatientConnected.mockImplementation((cb: () => void) => { fire = cb; });
    const { result } = renderHook(() => useSession());
    act(() => fire());
    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  it("end() calls the bridge and setMode() forwards the mode", async () => {
    const bridge = installBridge();
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.end(); });
    expect(bridge.end).toHaveBeenCalled();
    await act(async () => { await result.current.setMode("csp_lda_blend"); });
    expect(bridge.setMode).toHaveBeenCalledWith("csp_lda_blend");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- useSession`
Expected: FAIL — `Cannot find module './useSession'`.

- [ ] **Step 3: Implement the hook**

```tsx
// clinician-console/src/renderer/useSession.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionInfo } from "../main/lan/pairing";

type NeuroreachBridge = {
  open(s: SessionInfo): Promise<{ code: string; url: string }>;
  begin(source: SessionInfo["source"]): Promise<void>;
  end(): Promise<void>;
  setMode(mode: "band_power_only" | "csp_lda_blend"): Promise<void>;
  onPatientConnected(cb: () => void): void;
  onPatientDisconnected(cb: () => void): void;
};

function bridge(): NeuroreachBridge | null {
  const nr = (window as unknown as { neuroreach?: NeuroreachBridge }).neuroreach;
  return nr && typeof nr.open === "function" ? nr : null;
}

export function useSession() {
  const [source, setSource] = useState<"sim" | "live">("sim");
  const [code, setCode] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const nr = bridge();
  const bridgeReady = nr !== null;

  useEffect(() => {
    if (!nr) return;
    nr.onPatientConnected(() => setConnected(true));
    nr.onPatientDisconnected(() => setConnected(false));
  }, [nr]);

  const open = useCallback(async (base: Omit<SessionInfo, "source">) => {
    if (!nr) return;
    const r = await nr.open({ ...base, source: sourceRef.current });
    setCode(r.code);
    setUrl(r.url);
  }, [nr]);

  const begin = useCallback(async () => {
    if (!nr) return;
    await nr.begin(sourceRef.current);
  }, [nr]);

  const end = useCallback(async () => {
    if (!nr) return;
    await nr.end();
    setCode(null);
    setUrl(null);
    setConnected(false);
  }, [nr]);

  const setMode = useCallback(async (mode: "band_power_only" | "csp_lda_blend") => {
    if (!nr) return;
    await nr.setMode(mode);
  }, [nr]);

  return { source, setSource, code, url, connected, bridgeReady, open, begin, end, setMode };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- useSession`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/useSession.ts src/renderer/useSession.test.ts
git commit -m "feat(console): useSession hook owning source/pairing/lifecycle over the decoupled IPC"
```

---

### Task 3: `SignalCheckStep` (refactor of `Setup.tsx`)

**Files:**
- Create: `clinician-console/src/renderer/SignalCheckStep.tsx` (content moved from `Setup.tsx`)
- Delete: `clinician-console/src/renderer/Setup.tsx`
- Create: `clinician-console/src/renderer/SignalCheckStep.test.tsx` (migrated from `Setup.test.tsx`)
- Delete: `clinician-console/src/renderer/Setup.test.tsx`

**Interfaces:**
- Consumes: `EegQualityStore`, `Patient`, `useEegQualityStore` (all exist).
- Produces: `SignalCheckStep` props `{ qualityStore, patient, source, onSourceChange, onNext, onBack }` where `source: "sim" | "live"`, `onSourceChange(s): void`, `onNext(): void`, `onBack(): void`.

- [ ] **Step 1: Write the failing test**

```tsx
// clinician-console/src/renderer/SignalCheckStep.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SignalCheckStep } from "./SignalCheckStep";
import { EegQualityStore } from "../scoring/eegQualityStore";
import { PatientStore } from "../data/store";

function storeWith(channels: { label: string; quality: "good" | "check" | "poor"; p2p: number }[]) {
  const s = new EegQualityStore();
  s.push({ fs: 250, channels, trace: { C3: [1, 2, 1, 3], Cz: [0, 1], C4: [2, 1] }, timestamp: 1 });
  return s;
}
const margaret = new PatientStore().get("#0421")!;

function renderStep(over: Partial<Parameters<typeof SignalCheckStep>[0]> = {}) {
  const props = {
    qualityStore: storeWith([{ label: "C3", quality: "good" as const, p2p: 10 }]),
    patient: margaret,
    source: "sim" as const,
    onSourceChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  return { props, ...render(<SignalCheckStep {...props} />) };
}

describe("SignalCheckStep", () => {
  it("renders an electrode per channel with its quality class", () => {
    const { container } = renderStep({
      qualityStore: storeWith([
        { label: "Cz", quality: "poor", p2p: 200 },
        { label: "C3", quality: "good", p2p: 10 },
      ]),
    });
    expect(container.querySelector(".electrode.poor")?.textContent).toBe("Cz");
    expect(container.querySelector(".electrode.good")?.textContent).toBe("C3");
  });

  it("defaults the source toggle to Simulated and reports changes", () => {
    const { props } = renderStep();
    expect((screen.getByRole("radio", { name: /simulated/i }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /live headset/i }));
    expect(props.onSourceChange).toHaveBeenCalledWith("live");
  });

  it("advances on Next", () => {
    const { props } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(props.onNext).toHaveBeenCalled();
  });

  it("waits for signal when no quality frame has arrived", () => {
    renderStep({ qualityStore: new EegQualityStore() });
    expect(screen.getAllByText(/waiting for headset/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- SignalCheckStep`
Expected: FAIL — `Cannot find module './SignalCheckStep'`.

- [ ] **Step 3: Create `SignalCheckStep.tsx` from `Setup.tsx`**

Copy the full body of `Setup.tsx` into `SignalCheckStep.tsx` with these changes: rename the component to `SignalCheckStep`; change the `Props` type; add the source toggle + a side/mode line; replace the footer button. Keep `POSITIONS`, the electrode map, `TraceStack`, `MiniTrace` verbatim.

```tsx
// clinician-console/src/renderer/SignalCheckStep.tsx
import type { EegQualityStore } from "../scoring/eegQualityStore";
import type { Patient } from "../data/types";
import { useEegQualityStore } from "./useEegQualityStore";

type Props = {
  qualityStore: EegQualityStore;
  patient: Patient;
  source: "sim" | "live";
  onSourceChange: (s: "sim" | "live") => void;
  onNext: () => void;
  onBack: () => void;
};

const POSITIONS: Record<string, { x: number; y: number }> = {
  Fz: { x: 0.5, y: 0.18 }, C3: { x: 0.28, y: 0.42 }, Cz: { x: 0.5, y: 0.42 },
  C4: { x: 0.72, y: 0.42 }, Pz: { x: 0.5, y: 0.66 }, PO7: { x: 0.33, y: 0.8 },
  Oz: { x: 0.5, y: 0.88 }, PO8: { x: 0.67, y: 0.8 },
};

// Step 1 — Signal check (C2). Electrode contact + live MI trace + the EEG source
// toggle (simulated dev stream vs live headset). Runs on flat rest (sim idle).
export function SignalCheckStep({ qualityStore, patient, source, onSourceChange, onNext, onBack }: Props) {
  const { latest } = useEegQualityStore(qualityStore);
  const channels = latest?.channels ?? [];
  const problems = channels.filter((c) => c.quality !== "good");

  return (
    <div className="content">
      <div className="ws-bio">{patient.name} · Signal check</div>

      <fieldset className="source-toggle" aria-label="EEG source">
        <label>
          <input type="radio" name="eeg-source" checked={source === "sim"} onChange={() => onSourceChange("sim")} />
          Simulated EEG (dev)
        </label>
        <label>
          <input type="radio" name="eeg-source" checked={source === "live"} onChange={() => onSourceChange("live")} />
          Live headset
        </label>
      </fieldset>
      <div className="ws-sub">Affected side: {patient.affectedSide} · mode {patient.mode}</div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Electrode contact</div>
          {latest ? (
            <>
              <div className="electrode-map" role="group" aria-label="electrode contact map">
                <div style={{ position: "absolute", inset: 8, border: "2px solid #3a4760", borderRadius: "50%" }} />
                {channels.map((c) => {
                  const pos = POSITIONS[c.label] ?? { x: 0.5, y: 0.5 };
                  return (
                    <div key={c.label} className={`electrode ${c.quality}`}
                      style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                      title={`${c.label}: ${c.quality} (${c.p2p.toFixed(0)} µVpp)`}>
                      {c.label}
                    </div>
                  );
                })}
              </div>
              <div className="legend">
                <span><span className="dot" style={{ background: "var(--good)" }} /> Good</span>
                <span><span className="dot" style={{ background: "var(--check)" }} /> Check</span>
                <span><span className="dot" style={{ background: "var(--poor)" }} /> Poor</span>
              </div>
            </>
          ) : (
            <div className="placeholder">Waiting for headset signal…</div>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">Live trace — C3 / Cz / C4</div>
          {latest ? <TraceStack trace={latest.trace} /> : <div className="placeholder">Waiting for headset signal…</div>}
        </div>
      </div>

      {problems.length > 0 && (
        <div className="alert">
          ⚠ Check {problems.map((c) => c.label).join(", ")} contact — add gel or re-seat.
        </div>
      )}

      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Cancel</button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onNext}>Next: Pair device ▶</button>
      </div>
    </div>
  );
}

function TraceStack({ trace }: { trace: Record<string, number[]> }) {
  const labels = ["C3", "Cz", "C4"].filter((l) => (trace[l]?.length ?? 0) > 1);
  if (labels.length === 0) return <div className="placeholder">no trace yet</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {labels.map((l) => (
        <div key={l}>
          <div className="ws-sub" style={{ marginBottom: 2 }}>{l}</div>
          <MiniTrace values={trace[l]} />
        </div>
      ))}
    </div>
  );
}

function MiniTrace({ values }: { values: number[] }) {
  const w = 480, h = 48;
  const max = Math.max(1e-6, ...values.map((v) => Math.abs(v)));
  const n = values.length;
  const pts = values.map((v, i) => `${(i / (n - 1)) * w},${h / 2 - (v / max) * (h / 2 - 4)}`).join(" ");
  return (
    <svg className="lm-trace" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
      <polyline points={pts} fill="none" stroke="#7fb2e0" strokeWidth="1.5" />
    </svg>
  );
}
```

Then delete the old files:

```bash
git rm src/renderer/Setup.tsx src/renderer/Setup.test.tsx
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- SignalCheckStep`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/SignalCheckStep.tsx src/renderer/SignalCheckStep.test.tsx
git commit -m "feat(console): SignalCheckStep (Setup + source toggle) as session step 1"
```

---

### Task 4: `PairDeviceStep` (refactor of `PairingPanel.tsx`)

**Files:**
- Create: `clinician-console/src/renderer/PairDeviceStep.tsx` (from `PairingPanel.tsx`)
- Delete: `clinician-console/src/renderer/PairingPanel.tsx`, `clinician-console/src/renderer/PairingPanel.test.tsx`
- Create: `clinician-console/src/renderer/PairDeviceStep.test.tsx`

**Interfaces:**
- Consumes: `qrcode` (`QRCode.toDataURL`).
- Produces: `PairDeviceStep` props `{ code, url, connected, bridgeReady, onOpen, onNext, onBack }` where `onOpen(): Promise<void>` mints the code, `onNext()`/`onBack()` navigate.

- [ ] **Step 1: Write the failing test**

```tsx
// clinician-console/src/renderer/PairDeviceStep.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PairDeviceStep } from "./PairDeviceStep";

function renderStep(over: Partial<Parameters<typeof PairDeviceStep>[0]> = {}) {
  const props = {
    code: null as string | null,
    url: null as string | null,
    connected: false,
    bridgeReady: true,
    onOpen: vi.fn().mockResolvedValue(undefined),
    onNext: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  return { props, ...render(<PairDeviceStep {...props} />) };
}

describe("PairDeviceStep", () => {
  it("calls onOpen when Start Session is clicked", () => {
    const { props } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: /start session/i }));
    expect(props.onOpen).toHaveBeenCalled();
  });

  it("shows the code and a QR once a code exists", async () => {
    renderStep({ code: "ABC234", url: "https://x/?c=ABC234" });
    expect(screen.getByText("ABC234")).toBeTruthy();
    await waitFor(() => expect(screen.getByAltText(/pairing qr/i)).toBeTruthy());
  });

  it("reflects patient-connected status", () => {
    renderStep({ code: "ABC234", url: "https://x/?c=ABC234", connected: true });
    expect(screen.getByText(/patient connected/i)).toBeTruthy();
  });

  it("can continue without a paired patient (not hard-gated)", () => {
    const { props } = renderStep({ code: "ABC234", url: "https://x/?c=ABC234", connected: false });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(props.onNext).toHaveBeenCalled();
  });

  it("shows a desktop-app notice when the bridge is absent", () => {
    renderStep({ bridgeReady: false });
    expect(screen.getByText(/desktop app/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- PairDeviceStep`
Expected: FAIL — `Cannot find module './PairDeviceStep'`.

- [ ] **Step 3: Implement `PairDeviceStep.tsx`**

```tsx
// clinician-console/src/renderer/PairDeviceStep.tsx
import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  code: string | null;
  url: string | null;
  connected: boolean;
  bridgeReady: boolean;
  onOpen: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
};

// Step 2 — Pair the patient device. Start Session mints the LAN code + QR; the
// patient scans it (or, in dev, auto-connects on localhost). Never hard-gated:
// Continue advances whether or not a patient has paired yet.
export function PairDeviceStep({ code, url, connected, bridgeReady, onOpen, onNext, onBack }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (url) QRCode.toDataURL(url).then(setQr);
    else setQr(null);
  }, [url]);

  return (
    <div className="content">
      <div className="panel-title">Pair patient device</div>
      {!bridgeReady && (
        <div className="alert">Session control needs the desktop app (run <code>npm run dev</code> in clinician-console).</div>
      )}

      {!code ? (
        <button className="btn btn-primary" disabled={!bridgeReady} onClick={onOpen}>Start Session</button>
      ) : (
        <div className="pairing-active">
          {qr && <img className="pairing-qr" src={qr} alt="Session pairing QR code" width={180} height={180} />}
          <div className="pairing-detail">
            <p className="pairing-code">{code}</p>
            {connected
              ? <p className="pairing-status pairing-status--ok">✓ Patient connected</p>
              : <p className="pairing-status">Waiting for patient to scan…</p>}
            <p className="ws-sub">Dev: a patient tab on this machine auto-connects over localhost.</p>
          </div>
        </div>
      )}

      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Signal check</button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onNext}>Continue ▶</button>
      </div>
    </div>
  );
}
```

Delete the old panel + its test:

```bash
git rm src/renderer/PairingPanel.tsx src/renderer/PairingPanel.test.tsx
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- PairDeviceStep`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/PairDeviceStep.tsx src/renderer/PairDeviceStep.test.tsx
git commit -m "feat(console): PairDeviceStep (pairing + connection status, not hard-gated)"
```

---

### Task 5: `CalibrateStep` (honest placeholder)

**Files:**
- Create: `clinician-console/src/renderer/CalibrateStep.tsx`
- Test: `clinician-console/src/renderer/CalibrateStep.test.tsx`

**Interfaces:**
- Produces: `CalibrateStep` props `{ onNext, onBack }`; both a **Skip** and a **Continue** button call `onNext`.

- [ ] **Step 1: Write the failing test**

```tsx
// clinician-console/src/renderer/CalibrateStep.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalibrateStep } from "./CalibrateStep";

describe("CalibrateStep", () => {
  it("advances on Skip", () => {
    const onNext = vi.fn();
    render(<CalibrateStep onNext={onNext} onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it("advances on Continue and labels itself as abbreviated", () => {
    const onNext = vi.fn();
    render(<CalibrateStep onNext={onNext} onBack={() => {}} />);
    expect(screen.getByText(/abbreviated/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onNext).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- CalibrateStep`
Expected: FAIL — `Cannot find module './CalibrateStep'`.

- [ ] **Step 3: Implement `CalibrateStep.tsx`**

```tsx
// clinician-console/src/renderer/CalibrateStep.tsx
type Props = { onNext: () => void; onBack: () => void };

// Step 3 — Calibration. A real marker-driven Graz block needs the LSL-marker →
// browser bridge (not built), so this is an honest, skippable placeholder.
export function CalibrateStep({ onNext, onBack }: Props) {
  return (
    <div className="content">
      <div className="panel-title">Calibration</div>
      <div className="panel">
        <div className="placeholder">
          Calibration is <strong>abbreviated</strong> for now — the full Graz cue block lands with the
          LSL-marker → patient bridge (roadmap). You can skip straight to the live session.
        </div>
      </div>
      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Pair device</button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={onNext}>Skip</button>
        <button className="btn btn-primary" onClick={onNext}>Continue to live ▶</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- CalibrateStep`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/CalibrateStep.tsx src/renderer/CalibrateStep.test.tsx
git commit -m "feat(console): CalibrateStep honest skippable placeholder"
```

---

### Task 6: Wire `LiveMonitor` controls + `LiveStep` wrapper

**Files:**
- Modify: `clinician-console/src/renderer/LiveMonitor.tsx` (footer + new props)
- Test: `clinician-console/src/renderer/LiveMonitor.test.tsx` (add control tests)
- Create: `clinician-console/src/renderer/LiveStep.tsx`
- Test: `clinician-console/src/renderer/LiveStep.test.tsx`

**Interfaces:**
- Consumes: `useScoreStore` (exists), the score frame's `classifierScore` field.
- Produces: `LiveMonitor` gains optional props `onEndSession?(): void`, `onSwitchMode?(mode: "band_power_only" | "csp_lda_blend"): void`; it derives `canSwitchMode = latest?.classifierScore != null`. `LiveStep` props `{ scoreStore, qualityStore, connectionState, sidecarState, patient, onBegin, onEndSession, onSwitchMode }`; `onBegin()` fires once on mount.

- [ ] **Step 1: Write the failing LiveMonitor control tests**

Add to `clinician-console/src/renderer/LiveMonitor.test.tsx` (keep existing tests). Use the existing `ScoreStore` push shape — check the top of that test file for the frame factory and reuse it; the fields are `intentScore`, `erdScore`, `classifierScore`, `isArtifact`, `mode`, `timestamp`.

```tsx
import { fireEvent } from "@testing-library/react";

it("End session button calls onEndSession", () => {
  const store = new ScoreStore();
  const onEnd = vi.fn();
  render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" onEndSession={onEnd} />);
  fireEvent.click(screen.getByRole("button", { name: /end session/i }));
  expect(onEnd).toHaveBeenCalled();
});

it("disables Switch mode when no classifier score is present", () => {
  const store = new ScoreStore();
  store.push({ intentScore: 40, erdScore: 30, classifierScore: null, isArtifact: false, mode: "band_power_only", timestamp: 1 });
  render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" onSwitchMode={() => {}} />);
  expect((screen.getByRole("button", { name: /switch mode/i }) as HTMLButtonElement).disabled).toBe(true);
});

it("enables Switch mode and calls onSwitchMode when a classifier score is present", () => {
  const store = new ScoreStore();
  store.push({ intentScore: 55, erdScore: 40, classifierScore: 0.7, isArtifact: false, mode: "csp_lda_blend", timestamp: 1 });
  const onSwitch = vi.fn();
  render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" onSwitchMode={onSwitch} />);
  const btn = screen.getByRole("button", { name: /switch mode/i }) as HTMLButtonElement;
  expect(btn.disabled).toBe(false);
  fireEvent.click(btn);
  expect(onSwitch).toHaveBeenCalled();
});
```

> If the existing `LiveMonitor.test.tsx` uses a helper to build frames, reuse it instead of the inline object above (match its exact field names).

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- LiveMonitor`
Expected: FAIL — no accessible "End session" / "Switch mode" buttons wired to handlers (they are currently `disabled` with no onClick).

- [ ] **Step 3: Rewrite the LiveMonitor footer + props**

In `clinician-console/src/renderer/LiveMonitor.tsx`, extend the `Props` type:

```tsx
type Props = {
  store: ScoreStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
  qualityStore?: EegQualityStore;
  patient?: Patient;
  onEndSession?: () => void;
  onSwitchMode?: (mode: "band_power_only" | "csp_lda_blend") => void;
};
```

Update the signature to destructure the new props, and derive the capability:

```tsx
export function LiveMonitor({ store, connectionState, sidecarState, qualityStore, patient, onEndSession, onSwitchMode }: Props) {
```

Just before the `return`, add:

```tsx
  const canSwitchMode = latest?.classifierScore != null;
  const nextMode = latest?.mode === "csp_lda_blend" ? "band_power_only" : "csp_lda_blend";
```

Replace the `<footer className="lm-controls">…</footer>` block with:

```tsx
      <footer className="lm-controls">
        <button
          disabled={!canSwitchMode || !onSwitchMode}
          title={canSwitchMode ? "" : "No classifier loaded (band-power-only session)"}
          onClick={() => onSwitchMode?.(nextMode)}
        >
          Switch mode ▾
        </button>
        <button disabled title="Pause/rest command not built yet">Pause / rest</button>
        <button className="lm-end" disabled={!onEndSession} onClick={() => onEndSession?.()}>
          End session
        </button>
      </footer>
```

- [ ] **Step 4: Run to verify LiveMonitor passes**

Run: `npm run test -- LiveMonitor`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Write the failing LiveStep test**

```tsx
// clinician-console/src/renderer/LiveStep.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveStep } from "./LiveStep";
import { ScoreStore } from "../scoring/scoreStore";
import { EegQualityStore } from "../scoring/eegQualityStore";
import { PatientStore } from "../data/store";

const margaret = new PatientStore().get("#0421")!;

it("arms the session once on mount and renders the monitor", () => {
  const onBegin = vi.fn();
  render(
    <LiveStep
      scoreStore={new ScoreStore()}
      qualityStore={new EegQualityStore()}
      connectionState="open"
      sidecarState="ready"
      patient={margaret}
      onBegin={onBegin}
      onEndSession={() => {}}
      onSwitchMode={() => {}}
    />,
  );
  expect(onBegin).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("intent-score")).toBeTruthy();
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm run test -- LiveStep`
Expected: FAIL — `Cannot find module './LiveStep'`.

- [ ] **Step 7: Implement `LiveStep.tsx`**

```tsx
// clinician-console/src/renderer/LiveStep.tsx
import { useEffect, useRef } from "react";
import type { ScoreStore } from "../scoring/scoreStore";
import type { EegQualityStore } from "../scoring/eegQualityStore";
import type { ConnectionState } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import type { Patient } from "../data/types";
import { LiveMonitor } from "./LiveMonitor";

type Props = {
  scoreStore: ScoreStore;
  qualityStore: EegQualityStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
  patient: Patient;
  onBegin: () => void;
  onEndSession: () => void;
  onSwitchMode: (mode: "band_power_only" | "csp_lda_blend") => void;
};

// Step 4 — Live monitor. Arms the session (sim) exactly once on mount, then
// renders the hero monitor with its controls wired to the session lifecycle.
export function LiveStep(props: Props) {
  const armed = useRef(false);
  useEffect(() => {
    if (armed.current) return;
    armed.current = true;
    props.onBegin();
  }, [props]);

  return (
    <LiveMonitor
      store={props.scoreStore}
      qualityStore={props.qualityStore}
      connectionState={props.connectionState}
      sidecarState={props.sidecarState}
      patient={props.patient}
      onEndSession={props.onEndSession}
      onSwitchMode={props.onSwitchMode}
    />
  );
}
```

- [ ] **Step 8: Run to verify LiveStep passes**

Run: `npm run test -- LiveStep`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/LiveMonitor.tsx src/renderer/LiveMonitor.test.tsx src/renderer/LiveStep.tsx src/renderer/LiveStep.test.tsx
git commit -m "feat(console): wire LiveMonitor End/Switch-mode controls; LiveStep arms session on mount"
```

---

### Task 7: `SessionFlow` stepper shell

**Files:**
- Create: `clinician-console/src/renderer/SessionFlow.tsx`
- Test: `clinician-console/src/renderer/SessionFlow.test.tsx`

**Interfaces:**
- Consumes: `useSession` (Task 2), `SignalCheckStep` (Task 3), `PairDeviceStep` (Task 4), `CalibrateStep` (Task 5), `LiveStep` (Task 6), `Patient`, the stores.
- Produces: `SessionFlow` props `{ patient, scoreStore, qualityStore, connectionState, sidecarState, onExit }`. Owns the step machine (`signal → pair → calibrate → live`), renders a progress header, and calls `useSession.open/begin/end`. `onExit()` runs after End session.

- [ ] **Step 1: Write the failing test**

```tsx
// clinician-console/src/renderer/SessionFlow.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionFlow } from "./SessionFlow";
import { ScoreStore } from "../scoring/scoreStore";
import { EegQualityStore } from "../scoring/eegQualityStore";
import { PatientStore } from "../data/store";

const margaret = new PatientStore().get("#0421")!;

function installBridge() {
  const bridge = {
    open: vi.fn().mockResolvedValue({ code: "ABC234", url: "https://x/?c=ABC234" }),
    begin: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    setMode: vi.fn().mockResolvedValue(undefined),
    onPatientConnected: vi.fn(),
    onPatientDisconnected: vi.fn(),
  };
  (window as any).neuroreach = bridge;
  return bridge;
}

function renderFlow() {
  const onExit = vi.fn();
  render(
    <SessionFlow
      patient={margaret}
      scoreStore={new ScoreStore()}
      qualityStore={new EegQualityStore()}
      connectionState="open"
      sidecarState="ready"
      onExit={onExit}
    />,
  );
  return { onExit };
}

afterEach(() => { delete (window as any).neuroreach; });

describe("SessionFlow", () => {
  it("walks signal → pair → calibrate → live, arming on live, and ends back out", async () => {
    const bridge = installBridge();
    const { onExit } = renderFlow();

    // Step 1 signal check
    fireEvent.click(screen.getByRole("button", { name: /next: pair device/i }));
    // Step 2 pair
    fireEvent.click(screen.getByRole("button", { name: /start session/i }));
    await waitFor(() => expect(screen.getByText("ABC234")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    // Step 3 calibrate
    fireEvent.click(screen.getByRole("button", { name: /continue to live/i }));
    // Step 4 live — armed once
    await waitFor(() => expect(bridge.begin).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("intent-score")).toBeTruthy();
    // End session
    fireEvent.click(screen.getByRole("button", { name: /end session/i }));
    await waitFor(() => expect(bridge.end).toHaveBeenCalled());
    expect(onExit).toHaveBeenCalled();
  });

  it("shows a desktop-app notice and disables Start when the bridge is absent", () => {
    renderFlow(); // no bridge installed
    fireEvent.click(screen.getByRole("button", { name: /next: pair device/i }));
    expect(screen.getByText(/desktop app/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /start session/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- SessionFlow`
Expected: FAIL — `Cannot find module './SessionFlow'`.

- [ ] **Step 3: Implement `SessionFlow.tsx`**

```tsx
// clinician-console/src/renderer/SessionFlow.tsx
import { useState } from "react";
import type { ScoreStore } from "../scoring/scoreStore";
import type { EegQualityStore } from "../scoring/eegQualityStore";
import type { ConnectionState } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import type { Patient } from "../data/types";
import { useSession } from "./useSession";
import { SignalCheckStep } from "./SignalCheckStep";
import { PairDeviceStep } from "./PairDeviceStep";
import { CalibrateStep } from "./CalibrateStep";
import { LiveStep } from "./LiveStep";

type Step = "signal" | "pair" | "calibrate" | "live";
const ORDER: Step[] = ["signal", "pair", "calibrate", "live"];
const LABELS: Record<Step, string> = {
  signal: "Signal", pair: "Pair", calibrate: "Calibrate", live: "Live",
};

type Props = {
  patient: Patient;
  scoreStore: ScoreStore;
  qualityStore: EegQualityStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
  onExit: () => void;
};

export function SessionFlow(props: Props) {
  const { patient, onExit } = props;
  const s = useSession();
  const [step, setStep] = useState<Step>("signal");
  const go = (next: Step) => setStep(next);

  async function endSession() {
    await s.end();
    onExit();
  }

  return (
    <>
      <div className="ws-header">
        <button className="link-btn" onClick={onExit}>← Workspace</button>
        <div className="ws-bio">{patient.name} · Session</div>
        <span className="spacer" style={{ flex: 1 }} />
        <ol className="stepper">
          {ORDER.map((k) => (
            <li key={k} className={`stepper-item ${k === step ? "active" : ""}`}>{LABELS[k]}</li>
          ))}
        </ol>
      </div>

      {step === "signal" && (
        <SignalCheckStep
          qualityStore={props.qualityStore}
          patient={patient}
          source={s.source}
          onSourceChange={s.setSource}
          onNext={() => go("pair")}
          onBack={onExit}
        />
      )}
      {step === "pair" && (
        <PairDeviceStep
          code={s.code}
          url={s.url}
          connected={s.connected}
          bridgeReady={s.bridgeReady}
          onOpen={() => s.open({
            patientFirstName: patient.name.split(" ")[0],
            affectedSide: patient.affectedSide.toLowerCase() as "left" | "right",
            mode: patient.mode,
          })}
          onNext={() => go("calibrate")}
          onBack={() => go("signal")}
        />
      )}
      {step === "calibrate" && (
        <CalibrateStep onNext={() => go("live")} onBack={() => go("pair")} />
      )}
      {step === "live" && (
        <LiveStep
          scoreStore={props.scoreStore}
          qualityStore={props.qualityStore}
          connectionState={props.connectionState}
          sidecarState={props.sidecarState}
          patient={patient}
          onBegin={s.begin}
          onEndSession={endSession}
          onSwitchMode={s.setMode}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Add stepper CSS**

Append to `clinician-console/src/renderer/console.css`:

```css
/* Session stepper progress */
.stepper { display: flex; gap: 8px; list-style: none; margin: 0; padding: 0; }
.stepper-item {
  font-size: 12px; color: #7a8aa8; padding: 4px 10px; border-radius: 999px;
  background: #222c3d; border: 1px solid #313d54;
}
.stepper-item.active { color: #e8eefc; background: #2f4468; border-color: #3f5c8c; }
.source-toggle { display: flex; gap: 18px; border: 0; padding: 8px 0; margin: 0; }
.source-toggle label { display: flex; align-items: center; gap: 6px; font-size: 14px; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -- SessionFlow`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/SessionFlow.tsx src/renderer/SessionFlow.test.tsx src/renderer/console.css
git commit -m "feat(console): SessionFlow stepper shell wiring the four session steps"
```

---

### Task 8: Route the session flow in `App.tsx` + drop the redundant Live tab + docs

**Files:**
- Modify: `clinician-console/src/renderer/App.tsx`
- Test: `clinician-console/src/renderer/App.test.tsx`
- Modify: `clinician-console/src/renderer/PatientWorkspace.tsx` (drop `live` tab)
- Modify: `clinician-console/src/renderer/PatientWorkspace.test.tsx` (if it asserts the Live tab)
- Modify: `docs/todos.md`

**Interfaces:**
- Consumes: `SessionFlow` (Task 7).
- Produces: `App` routes `{ name: "session"; id }`; `WorkspaceTab = "history" | "protocol" | "assessments"` (no `live`).

- [ ] **Step 1: Write the failing App test (replace the stale setup/live test)**

Replace the `"enters setup from the workspace and returns to live"` test in `clinician-console/src/renderer/App.test.tsx` with:

```tsx
  it("launches the session flow from the workspace and returns on exit", () => {
    renderApp();
    fireEvent.click(screen.getByText("Margaret R."));
    fireEvent.click(screen.getByRole("button", { name: /Start session/i }));
    // session flow, step 1
    expect(screen.getByText(/Signal check/i)).toBeTruthy();
    // back out via the workspace link
    fireEvent.click(screen.getByRole("button", { name: /← Workspace/i }));
    expect(screen.getByRole("button", { name: "History & Trends" })).toBeTruthy();
  });
```

Also update the `"opens a patient workspace from the roster"` test — the workspace no longer has a Live Monitor tab:

```tsx
  it("opens a patient workspace from the roster", () => {
    renderApp();
    fireEvent.click(screen.getByText("Margaret R."));
    expect(screen.getByRole("button", { name: "History & Trends" })).toBeTruthy();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- App`
Expected: FAIL — no `/Signal check/` text / no session route yet; and (once Task-7 code is present) the old `setup` view path is gone.

- [ ] **Step 3: Update `App.tsx` routing**

In `clinician-console/src/renderer/App.tsx`: remove the `pairingApi`/`PairingPanel`/`Setup`/`sessionInfoFor` imports and helpers; add a `session` view; render `SessionFlow`.

Replace the imports of `Setup`, `PairingPanel` with:

```tsx
import { SessionFlow } from "./SessionFlow";
```

Delete the `pairingApi()` and `sessionInfoFor()` helpers. Also drop any import that becomes unused after this (`PairingApi`, `SessionInfo`, and the `Patient` type if nothing else references it) so the renderer stays clean.

Change the `View` type:

```tsx
type View =
  | { name: "roster" }
  | { name: "session"; id: string }
  | { name: "workspace"; id: string; tab: WorkspaceTab };
```

Replace the whole `{view.name === "setup" && (…)}` block with:

```tsx
      {view.name === "session" && (
        <SessionFlow
          patient={patientStore.get(view.id)!}
          scoreStore={scoreStore}
          qualityStore={qualityStore}
          connectionState={connectionState}
          sidecarState={sidecarState}
          onExit={() => setView({ name: "workspace", id: view.id, tab: "history" })}
        />
      )}
```

Change the workspace's `onStartSession` to enter the session view:

```tsx
          onStartSession={() => setView({ name: "session", id: view.id })}
```

- [ ] **Step 4: Drop the redundant Live Monitor tab from `PatientWorkspace.tsx`**

In `clinician-console/src/renderer/PatientWorkspace.tsx`: change the tab type and list, and remove the `live` render branch (the live monitor now lives only in the session flow):

```tsx
export type WorkspaceTab = "history" | "protocol" | "assessments";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "history", label: "History & Trends" },
  { id: "protocol", label: "Protocol" },
  { id: "assessments", label: "Assessments" },
];
```

Remove the `import { LiveMonitor } from "./LiveMonitor";` line and the entire `{tab === "live" && (<LiveMonitor … />)}` block. The `scoreStore`, `connectionState`, `sidecarState` props on `PatientWorkspace` are now unused by the workspace — remove them from its `Props` type and from the `App.tsx` render of `PatientWorkspace` (they still flow to `SessionFlow`).

- [ ] **Step 5: Fix any workspace test that asserts the Live tab**

If `clinician-console/src/renderer/PatientWorkspace.test.tsx` references a "Live Monitor" tab or passes `scoreStore`/`connectionState`/`sidecarState`, update it to the reduced tab set and props. Run: `npm run test -- PatientWorkspace` and adjust until green.

- [ ] **Step 6: Run the full console suite + both builds**

Run: `npm run test`
Expected: PASS (all files). Then:
Run: `npm run build:main && npm run build:renderer`
Expected: both clean.

- [ ] **Step 7: Update `docs/todos.md`**

Per the §6 Agent Update Protocol in `docs/todos.md`: move the session workflow + wired controls into `clinician-console` **✅ Implemented** (guided stepper Signal→Pair→Calibrate→Live; Sim/Live toggle + pairing surfaced; End/Switch-mode wired via `session:*` IPC; sim arms on entering Live); update the **⚠️ Engine control channel partial** bullet (End/Switch-mode now wired from the UI; Pause/rest + real calibration still pending); refresh the `clinician-console` **🧪** test count and the **Status-at-a-glance** row from an actual `npm run test` run; add the follow-ups (real marker calibration, Pause command, control-socket ack surfacing). Bump the **_Last updated:_** date.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/PatientWorkspace.tsx src/renderer/PatientWorkspace.test.tsx ../docs/todos.md
git commit -m "feat(console): route guided session flow; drop redundant Live tab; docs"
```

---

## Notes for the implementer

- **Presentational steps:** `SignalCheckStep`, `PairDeviceStep`, `CalibrateStep`, `LiveStep` take plain props — all session state lives in `useSession`, owned by `SessionFlow`. Don't reach for `window.neuroreach` inside a step.
- **Arm exactly once:** `LiveStep` guards `onBegin` with a ref so React 18 StrictMode's double-mount doesn't arm twice.
- **Never hard-gate pairing:** `PairDeviceStep`'s Continue always advances.
- **Switch mode is capability-gated:** enabled only when the latest frame has a non-null `classifierScore`; this keeps the console from ever sending `csp_lda_blend` with no classifier loaded (which the sidecar rejects).
- **Contracts frozen:** don't touch `intentScoreMessage`/`eegQualityMessage` or the `scoreRelay` `eeg_quality` block; the live integration tests guard them.
- Run every command from `clinician-console/`.
