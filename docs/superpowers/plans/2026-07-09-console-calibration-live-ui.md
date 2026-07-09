# Console Calibration + Live UI Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the clinician console a live camera feed with MediaPipe overlay in both the calibration and live tabs, a scientific 8-channel EEG scope, auto-started rest-pose calibration, and relocated status readouts.

**Architecture:** The sidecar (same machine as the console) pushes JPEG frames + MediaPipe landmarks over the existing localhost console↔sidecar WebSocket as a new clinician-only `camera_frame` type. The console renders them on a `<canvas>` overlay component reused in both tabs. Rest-pose calibration auto-fires when the patient presses "I'm ready" via a new `calibration-ready` checkpoint on the existing checkpoint contract. EEG traces already flow in `eeg_quality`; the console buffers them into a stacked scope.

**Tech Stack:** Python (asyncio, cv2/PIL, numpy) sidecar; React + TypeScript + Vitest (jsdom) console renderer; Electron IPC bridge; shared checkpoint contract.

## Global Constraints

- Python runs via `conda run -n eeg` (pytest from repo root so `conftest.py` is discovered).
- The `intent_score` JSON frame contract is byte-identical across clinician-console and patient-web — DO NOT change it. `camera_frame`, `eeg_quality`, `vision_health` are clinician-console-only frames on the localhost socket and must never reach the patient channel.
- Commits carry NO `Co-Authored-By` trailer (user preference).
- The `calibration-ready` checkpoint is a transient trigger, not a persisted gate — it must NOT set `patientCalibrated`.
- `tsc` runs from inside a package directory (`clinician-console/`), never the repo root. Renderer Vitest tests run from inside `clinician-console/` (jsdom config).
- Landmarks are normalized [0,1] image coords so the console overlay scales to any canvas size.

---

## File Structure

**Shared contract (byte-identical pair):**
- Modify `patient-web/src/net/checkpoint.ts` + `clinician-console/src/main/lan/checkpoint.ts` — add `calibration-ready`.

**Patient-web:**
- Modify `patient-web/src/scenes/CalibrationScene.tsx` — `onReady` prop.
- Modify `patient-web/src/App.tsx` — wire `onReady` → `link.notify("calibration-ready")`.

**Console main / IPC:**
- Modify `clinician-console/src/main/lan/lanServer.ts` — explicit checkpoint branch.

**Console renderer — plumbing:**
- Modify `clinician-console/src/renderer/useCheckpoints.ts` — `onCalibrationReady` callback.
- Modify `clinician-console/src/renderer/SessionFlow.tsx` — auto-calibrate wiring + `calibrationStartedAt`.
- Create `clinician-console/src/scoring/cameraFrameMessage.ts` — parser.
- Create `clinician-console/src/scoring/cameraFrameStore.ts` — latest-only store.
- Create `clinician-console/src/renderer/useCameraFrameStore.ts` — hook.
- Modify `clinician-console/src/net/scoreClient.ts` — `onCameraFrame`.
- Modify `clinician-console/src/renderer/App.tsx` — construct store, remove `app-meta`.
- Modify `clinician-console/src/renderer/main.tsx` — wire store to scoreClient (if scoreClient is constructed there).
- Create `clinician-console/src/renderer/CameraView.tsx` — canvas feed + overlay.

**Console renderer — UI:**
- Modify `clinician-console/src/renderer/CalibrateStep.tsx` — remove manual calibrate; add feed + status column.
- Modify `clinician-console/src/renderer/LiveMonitor.tsx` — EEG scope, patient view, header, kinematic graph, remove panel.
- Create `clinician-console/src/renderer/EegScope.tsx` — 8-channel scope + rolling buffer.
- Modify `clinician-console/src/renderer/console.css` + `LiveMonitor.css` — new styles.

**Sidecar:**
- Modify `signal-engine/vision/kinematic_worker.py` — expose latest pose.
- Create `signal-engine/vision/frame_encoder.py` — JPEG encode.
- Modify `signal-engine/server/ws_server.py` — `camera_frame` loop.
- Modify `signal-engine/run_ws_server.py` — pass `camera_hz` (loop auto-starts when a kinematic worker is present).
- Modify `signal-engine/scoring/scoring_service.py:185` — trace all 8 channels.

---

## Phase 1 — Checkpoint plumbing + auto-start calibration

### Task 1: Add `calibration-ready` to the checkpoint contract

**Files:**
- Modify: `patient-web/src/net/checkpoint.ts`
- Modify: `clinician-console/src/main/lan/checkpoint.ts`
- Modify: `clinician-console/src/main/lan/lanServer.ts:95-98`
- Test: `patient-web/src/net/checkpoint.test.ts`, `clinician-console/src/main/lan/checkpoint.test.ts`, `clinician-console/src/main/lan/lanServer.test.ts`

**Interfaces:**
- Produces: `PatientCheckpoint = "session-begin" | "calibration-complete" | "calibration-ready"`; `isPatientCheckpoint` accepts all three.

- [ ] **Step 1: Write the failing contract test** (add to `clinician-console/src/main/lan/checkpoint.test.ts`)

```ts
it("accepts calibration-ready as a patient checkpoint", () => {
  expect(isPatientCheckpoint({ type: "patient-checkpoint", checkpoint: "calibration-ready" })).toBe(true);
});
```

Add the identical test to `patient-web/src/net/checkpoint.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run (from `clinician-console/`): `npx vitest run src/main/lan/checkpoint.test.ts`
Run (from `patient-web/`): `npx vitest run src/net/checkpoint.test.ts`
Expected: FAIL — `calibration-ready` not in set.

- [ ] **Step 3: Update both contract files (byte-identical)**

In BOTH `patient-web/src/net/checkpoint.ts` and `clinician-console/src/main/lan/checkpoint.ts`:

```ts
export type PatientCheckpoint = "session-begin" | "calibration-complete" | "calibration-ready";
```

```ts
const PATIENT_CHECKPOINTS = new Set<string>(["session-begin", "calibration-complete", "calibration-ready"]);
```

- [ ] **Step 4: Write the failing lanServer test** (add to `clinician-console/src/main/lan/lanServer.test.ts`, following the existing `connectPatient`/`fakeSidecar` harness)

```ts
it("forwards calibration-ready without marking the patient calibrated", async () => {
  const events: string[] = [];
  server.on("patient-checkpoint", (c: string) => events.push(c));
  await connectPatient(server, { type: "patient-checkpoint", checkpoint: "calibration-ready" });
  expect(events).toContain("calibration-ready");
  expect(server.checkpointState().patientCalibrated).toBe(false);
});
```

- [ ] **Step 5: Run it to verify it fails**

Run (from `clinician-console/`): `npx vitest run src/main/lan/lanServer.test.ts`
Expected: FAIL — current `else` branch sets `patientCalibrated` for `calibration-ready`.

- [ ] **Step 6: Fix the lanServer branch** (`clinician-console/src/main/lan/lanServer.ts`, the `if (isPatientCheckpoint(msg))` block)

```ts
if (isPatientCheckpoint(msg)) {
  if (msg.checkpoint === "session-begin") this.checkpoints.patientBegan = true;
  else if (msg.checkpoint === "calibration-complete") this.checkpoints.patientCalibrated = true;
  // "calibration-ready" is a transient trigger — forwarded, but no gate flips.
  this.emit("patient-checkpoint", msg.checkpoint);
  return;
}
```

(Preserve the existing `return`/control flow around this block.)

- [ ] **Step 7: Run all four test files to verify pass**

Run (from `clinician-console/`): `npx vitest run src/main/lan/checkpoint.test.ts src/main/lan/lanServer.test.ts`
Run (from `patient-web/`): `npx vitest run src/net/checkpoint.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add patient-web/src/net/checkpoint.ts clinician-console/src/main/lan/checkpoint.ts clinician-console/src/main/lan/lanServer.ts patient-web/src/net/checkpoint.test.ts clinician-console/src/main/lan/checkpoint.test.ts clinician-console/src/main/lan/lanServer.test.ts
git commit -m "feat(checkpoint): add transient calibration-ready checkpoint"
```

---

### Task 2: Patient fires `calibration-ready` on "I'm ready"

**Files:**
- Modify: `patient-web/src/scenes/CalibrationScene.tsx`
- Modify: `patient-web/src/App.tsx:53-58` (CalibrationScene render site)
- Test: `patient-web/src/scenes/CalibrationScene.test.tsx`

**Interfaces:**
- Consumes: `link.notify("calibration-ready")` (existing `usePatientLink.notify`, now accepts the new checkpoint from Task 1).
- Produces: `CalibrationScene` gains `onReady?: () => void`, fired when the "I'm ready" gate is pressed.

- [ ] **Step 1: Write the failing test** (add to `patient-web/src/scenes/CalibrationScene.test.tsx`)

```tsx
it("calls onReady when the 'I'm ready' gate is pressed", () => {
  const onReady = vi.fn();
  render(<CalibrationScene affectedSide="right" onComplete={() => {}} onReady={onReady} />);
  // Framing gate must be satisfied first (Skip = EEG-only).
  fireEvent.click(screen.getByTestId("framing-skip"));
  fireEvent.click(screen.getByTestId("ready-btn"));
  expect(onReady).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `patient-web/`): `npx vitest run src/scenes/CalibrationScene.test.tsx`
Expected: FAIL — `onReady` prop does not exist.

- [ ] **Step 3: Add the `onReady` prop** (`patient-web/src/scenes/CalibrationScene.tsx`)

Add to the props type:

```tsx
  onReady,
}: {
  affectedSide: "left" | "right";
  totalTrials?: number;
  baselineMs?: number;
  onComplete: () => void;
  onReady?: () => void;
}) {
```

Change the ready button handler:

```tsx
          onClick={() => { setReady(true); onReady?.(); }}
```

- [ ] **Step 4: Wire it in patient App** (`patient-web/src/App.tsx`, CalibrationScene render)

```tsx
onReady={() => { if (code) link.notify("calibration-ready"); }}
```

- [ ] **Step 5: Run tests to verify pass**

Run (from `patient-web/`): `npx vitest run src/scenes/CalibrationScene.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add patient-web/src/scenes/CalibrationScene.tsx patient-web/src/App.tsx patient-web/src/scenes/CalibrationScene.test.tsx
git commit -m "feat(patient): notify calibration-ready when patient presses I'm ready"
```

---

### Task 3: Console auto-starts calibration on `calibration-ready`

**Files:**
- Modify: `clinician-console/src/renderer/useCheckpoints.ts`
- Modify: `clinician-console/src/renderer/SessionFlow.tsx`
- Test: `clinician-console/src/renderer/useCheckpoints.test.ts`

**Interfaces:**
- Produces: `useCheckpoints({ onCalibrationReady }?: { onCalibrationReady?: () => void })` — invokes `onCalibrationReady` when a `calibration-ready` patient checkpoint arrives. Return shape unchanged otherwise (`{ active, patientBegan, patientCalibrated, sendGoLive }`).
- Consumes (SessionFlow): `s.calibratePose()` (existing `useSession` bridge method).

- [ ] **Step 1: Write the failing test** (add to `clinician-console/src/renderer/useCheckpoints.test.ts`, following the existing `window.neuroreach` fake pattern)

```ts
it("invokes onCalibrationReady when a calibration-ready checkpoint arrives", () => {
  let emit: (c: string) => void = () => {};
  (window as any).neuroreach = {
    onPatientCheckpoint: (cb: (c: string) => void) => { emit = cb; },
    sendClinicianCheckpoint: async () => {},
    getCheckpointState: async () => ({ patientBegan: false, patientCalibrated: false, clinicianLive: false }),
  };
  const onCalibrationReady = vi.fn();
  renderHook(() => useCheckpoints({ onCalibrationReady }));
  act(() => emit("calibration-ready"));
  expect(onCalibrationReady).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `clinician-console/`): `npx vitest run src/renderer/useCheckpoints.test.ts`
Expected: FAIL — `useCheckpoints` takes no args.

- [ ] **Step 3: Add the callback (ref pattern so it stays fresh)** (`clinician-console/src/renderer/useCheckpoints.ts`)

```ts
import { useCallback, useEffect, useRef, useState } from "react";

export function useCheckpoints(opts?: { onCalibrationReady?: () => void }) {
  const [patientBegan, setBegan] = useState(false);
  const [patientCalibrated, setCalibrated] = useState(false);
  const nr = bridge();
  const readyCb = useRef(opts?.onCalibrationReady);
  readyCb.current = opts?.onCalibrationReady;

  useEffect(() => {
    if (!nr) return;
    void nr.getCheckpointState().then((s) => {
      setBegan(s.patientBegan);
      setCalibrated(s.patientCalibrated);
    });
    nr.onPatientCheckpoint((c) => {
      if (c === "session-begin") setBegan(true);
      if (c === "calibration-complete") setCalibrated(true);
      if (c === "calibration-ready") readyCb.current?.();
    });
  }, [nr]);

  const sendGoLive = useCallback(() => {
    void nr?.sendClinicianCheckpoint("go-live");
  }, [nr]);

  return { active: nr !== null, patientBegan, patientCalibrated, sendGoLive };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (from `clinician-console/`): `npx vitest run src/renderer/useCheckpoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire SessionFlow to auto-calibrate + record start time** (`clinician-console/src/renderer/SessionFlow.tsx`)

Add state and pass the callback:

```tsx
  const [calibrationStartedAt, setCalibrationStartedAt] = useState<number | null>(null);
  const cp = useCheckpoints({
    onCalibrationReady: () => {
      void s.calibratePose();
      setCalibrationStartedAt(Date.now());
    },
  });
```

Pass `calibrationStartedAt` to `CalibrateStep` (prop added in Task 10); remove `onCalibratePose={s.calibratePose}` from the `CalibrateStep` props (superseded by auto-fire).

- [ ] **Step 6: Run the SessionFlow test to verify no regression**

Run (from `clinician-console/`): `npx vitest run src/renderer/SessionFlow.test.tsx`
Expected: PASS (add `calibrationStartedAt` default if the test renders `CalibrateStep` directly — see Task 10).

- [ ] **Step 7: Commit**

```bash
git add clinician-console/src/renderer/useCheckpoints.ts clinician-console/src/renderer/SessionFlow.tsx clinician-console/src/renderer/useCheckpoints.test.ts
git commit -m "feat(console): auto-fire calibrate_pose on calibration-ready checkpoint"
```

---

### Task 4: Remove the manual "Calibrate rest pose" button + status

**Files:**
- Modify: `clinician-console/src/renderer/CalibrateStep.tsx`
- Test: `clinician-console/src/renderer/CalibrateStep.test.tsx`

**Interfaces:**
- Produces: `CalibrateStep` no longer accepts `onCalibratePose`; no `calibration-status` testid, no "Calibrate rest pose" button.

- [ ] **Step 1: Update the failing test** (`clinician-console/src/renderer/CalibrateStep.test.tsx`)

Replace any test asserting the calibrate button / `calibration-status` with:

```tsx
it("no longer renders a manual rest-pose calibrate button or status", () => {
  renderStep({});
  expect(screen.queryByText(/Calibrate rest pose/i)).toBeNull();
  expect(screen.queryByTestId("calibration-status")).toBeNull();
});
```

Update the `renderStep` helper: drop `onCalibratePose`, add `calibrationStartedAt: null` default (used from Task 10).

- [ ] **Step 2: Run it to verify it fails**

Run (from `clinician-console/`): `npx vitest run src/renderer/CalibrateStep.test.tsx`
Expected: FAIL — button/status still present.

- [ ] **Step 3: Remove the manual calibrate UI** (`clinician-console/src/renderer/CalibrateStep.tsx`)

Delete the third `fusion-group` (the "Calibrate rest pose" button + `cal-status` span), the `calText` helper, and the `onCalibratePose` prop from the `Props` type and destructure. Keep the fusion-mode and affected-side groups.

- [ ] **Step 4: Run to verify pass**

Run (from `clinician-console/`): `npx vitest run src/renderer/CalibrateStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run (from `clinician-console/`): `npx tsc -p tsconfig.json --noEmit`
Expected: no errors (SessionFlow no longer passes `onCalibratePose`).

- [ ] **Step 6: Commit**

```bash
git add clinician-console/src/renderer/CalibrateStep.tsx clinician-console/src/renderer/CalibrateStep.test.tsx
git commit -m "feat(console): remove manual rest-pose calibrate button (auto-started now)"
```

---

## Phase 2 — camera_frame plumbing (sidecar → console)

### Task 5: KinematicWorker exposes the latest pose

**Files:**
- Modify: `signal-engine/vision/kinematic_worker.py`
- Test: `signal-engine/tests/test_kinematic_worker.py`

**Interfaces:**
- Produces: `KinematicWorker.latest_pose() -> Optional[PoseFrame]` — the most recent `PoseFrame` from `estimate()` (set even during calibration), or `None` before any frame.

- [ ] **Step 1: Write the failing test** (add to `signal-engine/tests/test_kinematic_worker.py`, using the existing fake sink + fake estimator)

```python
def test_latest_pose_returns_last_estimated_frame():
    sink, estimator, engine, latest = _make_worker_parts()  # existing helpers/fixtures
    worker = KinematicWorker(sink, estimator, engine, latest)
    assert worker.latest_pose() is None
    frame = object()
    sink.push(frame)
    worker._process(sink.latest())  # drive one tick directly
    assert worker.latest_pose() is not None
```

(If the test module has no `_make_worker_parts`, construct the fakes inline the way the existing tests in that file do.)

- [ ] **Step 2: Run it to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematic_worker.py::test_latest_pose_returns_last_estimated_frame -v`
Expected: FAIL — `latest_pose` does not exist.

- [ ] **Step 3: Add the holder + method** (`signal-engine/vision/kinematic_worker.py`)

In `__init__`, add `self._latest_pose = LatestKinematic()  # reuse the thread-safe single-slot holder` — or add a small dedicated holder. Simpler: reuse a plain lock:

```python
        self._pose_lock = threading.Lock()
        self._latest_pose = None  # Optional[PoseFrame]
```

Add the accessor:

```python
    def latest_pose(self):
        with self._pose_lock:
            return self._latest_pose
```

In `_process`, right after `pose_frame = self.estimator.estimate(av_frame)` and BEFORE the calibration branch:

```python
        with self._pose_lock:
            self._latest_pose = pose_frame
```

- [ ] **Step 4: Run to verify pass**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematic_worker.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/kinematic_worker.py signal-engine/tests/test_kinematic_worker.py
git commit -m "feat(vision): KinematicWorker exposes latest_pose for the camera overlay"
```

---

### Task 6: JPEG frame encoder

**Files:**
- Create: `signal-engine/vision/frame_encoder.py`
- Test: `signal-engine/tests/test_frame_encoder.py`

**Interfaces:**
- Produces: `encode_jpeg(av_frame, max_width: int = 480, quality: int = 70) -> str` — base64 JPEG (no data-URI prefix). Uses `frame_to_ndarray` from `pose_estimator` for the rgb24 array, downscales to `max_width`, encodes via cv2 (`import cv2` lazily; mediapipe pulls opencv into the eeg env).

- [ ] **Step 1: Write the failing test** (`signal-engine/tests/test_frame_encoder.py`)

```python
import base64
import numpy as np
from vision.frame_encoder import encode_jpeg


class _FakeFrame:
    def __init__(self, arr):
        self._arr = arr
    def to_ndarray(self, format="rgb24"):
        return self._arr


def test_encode_jpeg_returns_base64_jpeg():
    arr = (np.random.rand(120, 160, 3) * 255).astype(np.uint8)
    out = encode_jpeg(_FakeFrame(arr), max_width=80)
    raw = base64.b64decode(out)
    # JPEG magic bytes.
    assert raw[:2] == b"\xff\xd8"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_frame_encoder.py -v`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the encoder** (`signal-engine/vision/frame_encoder.py`)

```python
"""Encode an aiortc av.VideoFrame to a base64 JPEG for the clinician camera feed.

Downscaled + moderate quality to keep the base64 payload small on the localhost
console<->sidecar socket. cv2 is imported lazily (mediapipe pulls opencv into the
eeg env) so importing this module stays cheap.
"""
from __future__ import annotations

import base64

import numpy as np

from vision.pose_estimator import frame_to_ndarray


def encode_jpeg(av_frame: object, max_width: int = 480, quality: int = 70) -> str:
    import cv2  # lazy
    rgb = frame_to_ndarray(av_frame)  # HxWx3 rgb24
    h, w = rgb.shape[:2]
    if w > max_width:
        scale = max_width / float(w)
        rgb = cv2.resize(rgb, (max_width, max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode("ascii")
```

- [ ] **Step 4: Run to verify pass**

Run: `conda run -n eeg pytest signal-engine/tests/test_frame_encoder.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/frame_encoder.py signal-engine/tests/test_frame_encoder.py
git commit -m "feat(vision): base64 JPEG frame encoder for the console camera feed"
```

---

### Task 7: `camera_frame` broadcast loop in the WS server

**Files:**
- Modify: `signal-engine/server/ws_server.py`
- Modify: `signal-engine/run_ws_server.py`
- Test: `signal-engine/tests/test_ws_server.py` (or a new `test_camera_frame.py`)

**Interfaces:**
- Consumes: `KinematicWorker.latest_pose()` (Task 5), `worker.sink.latest()` / `worker.sink.frame_count`, `encode_jpeg` (Task 6).
- Produces: broadcasts `{"type":"camera_frame","jpeg":str,"landmarks":{"pose":[[x,y,vis]...],"hands":{"left":[[x,y]...]|null,"right":...}},"fps":float,"timestamp":float}` at `camera_hz` (default 12). Emits nothing when `kinematic_worker` is `None`, the sink is empty, or there is no pose.

- [ ] **Step 1: Write the failing test** (`signal-engine/tests/test_ws_server.py`)

```python
def test_camera_frame_broadcast(monkeypatch):
    # Fake worker with a sink holding one frame and a latest_pose.
    import numpy as np
    from vision.types import PoseFrame

    class _Sink:
        frame_count = 1
        def latest(self): return object()

    class _Worker:
        sink = _Sink()
        def latest_pose(self):
            return PoseFrame(pose=np.zeros((33, 4)), hands={"left": None, "right": None}, timestamp=0.0)

    monkeypatch.setattr("server.ws_server.encode_jpeg", lambda *a, **k: "AAAA")
    server = _make_server_with_kinematic_worker(_Worker())  # follow existing start_background harness
    frame = _collect_one_frame_of_type(server, "camera_frame")  # helper: connect a client, read frames
    assert frame["jpeg"] == "AAAA"
    assert len(frame["landmarks"]["pose"]) == 33
```

Model the client-connect + frame-collection on the existing `test_ws_server.py` helpers (`start_background`, a websockets client, filtering by `type`).

- [ ] **Step 2: Run it to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_ws_server.py::test_camera_frame_broadcast -v`
Expected: FAIL — no `camera_frame` emitted.

- [ ] **Step 3: Add the loop** (`signal-engine/server/ws_server.py`)

Import at top: `from vision.frame_encoder import encode_jpeg`.

Add ctor arg `camera_hz: float = 12.0` and store `self.camera_hz = float(camera_hz)` and `self._cam_last_count = -1`, `self._cam_emitted = 0`, `self._cam_t0 = None`.

In `_serve`, after the vision-health task block:

```python
        if self.kinematic_worker is not None:
            self._tasks.append(asyncio.ensure_future(self._camera_frame_loop()))
```

Add the loop + serializer:

```python
    def _serialize_landmarks(self, pose_frame) -> dict:
        pose = [[float(r[0]), float(r[1]), float(r[3])] for r in pose_frame.pose]
        hands = {}
        for side in ("left", "right"):
            h = pose_frame.hands.get(side)
            hands[side] = None if h is None else [[float(p[0]), float(p[1])] for p in h]
        return {"pose": pose, "hands": hands}

    async def _camera_frame_loop(self) -> None:
        """Broadcast JPEG + MediaPipe landmarks for the clinician console feed.
        Clinician-only (localhost socket); the LAN relay allowlists intent_score,
        so this never reaches the patient."""
        interval = 1.0 / self.camera_hz
        worker = self.kinematic_worker
        try:
            while not self._shutdown:
                await asyncio.sleep(interval)
                if not self.clients:
                    continue
                av_frame = worker.sink.latest()
                pose_frame = worker.latest_pose()
                if av_frame is None or pose_frame is None:
                    continue
                jpeg = encode_jpeg(av_frame)
                if not jpeg:
                    continue
                self._cam_emitted += 1
                now = time.time()
                if self._cam_t0 is None:
                    self._cam_t0 = now
                elapsed = max(1e-6, now - self._cam_t0)
                fps = self._cam_emitted / elapsed
                payload = json.dumps({
                    "type": "camera_frame",
                    "jpeg": jpeg,
                    "landmarks": self._serialize_landmarks(pose_frame),
                    "fps": round(fps, 1),
                    "timestamp": now,
                })
                await self._broadcast(payload)
        except asyncio.CancelledError:
            pass
```

- [ ] **Step 4: Wire the entrypoint** (`signal-engine/run_ws_server.py`)

`camera_hz` defaults to 12 in the ctor and the loop auto-starts when a kinematic worker is present — confirm `run_ws_server.py` constructs the server with the kinematic worker (it already does for the vision path). No change needed unless you want to override `camera_hz` via an env var; leave the default.

- [ ] **Step 5: Run to verify pass + full ws_server suite**

Run: `conda run -n eeg pytest signal-engine/tests/test_ws_server.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add signal-engine/server/ws_server.py signal-engine/run_ws_server.py signal-engine/tests/test_ws_server.py
git commit -m "feat(sidecar): broadcast camera_frame (JPEG + landmarks) to the console"
```

---

### Task 8: Console `camera_frame` parser + store + scoreClient wiring

**Files:**
- Create: `clinician-console/src/scoring/cameraFrameMessage.ts`
- Create: `clinician-console/src/scoring/cameraFrameStore.ts`
- Create: `clinician-console/src/renderer/useCameraFrameStore.ts`
- Modify: `clinician-console/src/net/scoreClient.ts`
- Modify: `clinician-console/src/renderer/App.tsx` (+ `main.tsx` if scoreClient is constructed there)
- Test: `clinician-console/src/scoring/cameraFrameMessage.test.ts`, `clinician-console/src/scoring/cameraFrameStore.test.ts`

**Interfaces:**
- Produces:
  - `type CameraFrame = { jpeg: string; landmarks: { pose: number[][]; hands: { left: number[][] | null; right: number[][] | null } }; fps: number; timestamp: number }`
  - `parseCameraFrameMessage(raw: string): { ok: true; frame: CameraFrame } | { ok: false; error: string }`
  - `class CameraFrameStore` with `push(f)`, `getState(): { latest: CameraFrame | null }`, `subscribe(cb)` — mirrors `EegQualityStore`.
  - `useCameraFrameStore(store): { latest: CameraFrame | null }`
  - `scoreClient` gains `onCameraFrame?: (f: CameraFrame) => void`.

- [ ] **Step 1: Write the failing parser test** (`clinician-console/src/scoring/cameraFrameMessage.test.ts`)

```ts
import { parseCameraFrameMessage } from "./cameraFrameMessage";

it("parses a valid camera_frame", () => {
  const raw = JSON.stringify({ type: "camera_frame", jpeg: "AAAA", landmarks: { pose: [[0.1, 0.2, 0.9]], hands: { left: null, right: [[0.3, 0.4]] } }, fps: 12.1, timestamp: 1 });
  const r = parseCameraFrameMessage(raw);
  expect(r.ok).toBe(true);
  if (r.ok) { expect(r.frame.jpeg).toBe("AAAA"); expect(r.frame.landmarks.pose.length).toBe(1); }
});

it("rejects a non-camera_frame type", () => {
  expect(parseCameraFrameMessage(JSON.stringify({ type: "intent_score" })).ok).toBe(false);
});

it("never throws on malformed JSON", () => {
  expect(parseCameraFrameMessage("{not json").ok).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `clinician-console/`): `npx vitest run src/scoring/cameraFrameMessage.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the parser** (`clinician-console/src/scoring/cameraFrameMessage.ts`)

```ts
export type CameraLandmarks = {
  pose: number[][];
  hands: { left: number[][] | null; right: number[][] | null };
};
export type CameraFrame = { jpeg: string; landmarks: CameraLandmarks; fps: number; timestamp: number };
export type CameraFrameParseResult = { ok: true; frame: CameraFrame } | { ok: false; error: string };

function toRows(v: unknown): number[][] {
  if (!Array.isArray(v)) return [];
  return v.filter(Array.isArray).map((row) => (row as unknown[]).filter((n): n is number => typeof n === "number"));
}

export function parseCameraFrameMessage(raw: string): CameraFrameParseResult {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { ok: false, error: "malformed JSON" }; }
  if (typeof data !== "object" || data === null) return { ok: false, error: "not an object" };
  const d = data as Record<string, unknown>;
  if (d.type !== "camera_frame") return { ok: false, error: `unexpected type: ${String(d.type)}` };
  const lm = (d.landmarks ?? {}) as Record<string, unknown>;
  const hands = (lm.hands ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    frame: {
      jpeg: typeof d.jpeg === "string" ? d.jpeg : "",
      landmarks: {
        pose: toRows(lm.pose),
        hands: {
          left: hands.left == null ? null : toRows(hands.left),
          right: hands.right == null ? null : toRows(hands.right),
        },
      },
      fps: typeof d.fps === "number" && Number.isFinite(d.fps) ? d.fps : 0,
      timestamp: typeof d.timestamp === "number" ? d.timestamp : 0,
    },
  };
}
```

- [ ] **Step 4: Implement the store + hook + a store test**

`clinician-console/src/scoring/cameraFrameStore.ts` (copy the `EegQualityStore` shape exactly, substituting `CameraFrame`). `clinician-console/src/renderer/useCameraFrameStore.ts` (copy `useEegQualityStore`). Add `cameraFrameStore.test.ts`:

```ts
import { CameraFrameStore } from "./cameraFrameStore";
it("holds the latest frame", () => {
  const s = new CameraFrameStore();
  expect(s.getState().latest).toBeNull();
  s.push({ jpeg: "x", landmarks: { pose: [], hands: { left: null, right: null } }, fps: 1, timestamp: 0 });
  expect(s.getState().latest?.jpeg).toBe("x");
});
```

- [ ] **Step 5: Wire scoreClient** (`clinician-console/src/net/scoreClient.ts`)

Add `onCameraFrame?: (f: CameraFrame) => void;` to `ScoreClientOptions`, import the parser + type, and add to the `onmessage` chain after the vision-health branch:

```ts
      const cf = parseCameraFrameMessage(raw);
      if (cf.ok) { opts.onCameraFrame?.(cf.frame); return; }
```

- [ ] **Step 6: Wire App/main** — construct a `CameraFrameStore`, pass `onCameraFrame: (f) => cameraFrameStore.push(f)` where the scoreClient is created, and thread the store through `App` → `SessionFlow` → `CalibrateStep` / `LiveMonitor` (props added in Tasks 10/12). Follow exactly how `visionHealthStore` is threaded today.

- [ ] **Step 7: Run tests + typecheck**

Run (from `clinician-console/`): `npx vitest run src/scoring/cameraFrameMessage.test.ts src/scoring/cameraFrameStore.test.ts src/net/scoreClient.test.ts`
Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS / no errors.

- [ ] **Step 8: Commit**

```bash
git add clinician-console/src/scoring/cameraFrameMessage.ts clinician-console/src/scoring/cameraFrameStore.ts clinician-console/src/renderer/useCameraFrameStore.ts clinician-console/src/net/scoreClient.ts clinician-console/src/renderer/App.tsx clinician-console/src/renderer/main.tsx clinician-console/src/scoring/cameraFrameMessage.test.ts clinician-console/src/scoring/cameraFrameStore.test.ts
git commit -m "feat(console): parse + store camera_frame from the sidecar"
```

---

### Task 9: `CameraView` canvas component (feed + overlay)

**Files:**
- Create: `clinician-console/src/renderer/CameraView.tsx`
- Modify: `clinician-console/src/renderer/console.css` (overlay container styles)
- Test: `clinician-console/src/renderer/CameraView.test.tsx`

**Interfaces:**
- Consumes: `useCameraFrameStore`, `CameraFrame`.
- Produces: `<CameraView store={cameraFrameStore} affectedSide="left"|"right" />` — draws the JPEG then the pose/hand skeleton on a `<canvas>`; shows an idle "no camera link" state when `latest` is null.

- [ ] **Step 1: Write the failing test** (`clinician-console/src/renderer/CameraView.test.tsx`)

```tsx
import { render, screen } from "@testing-library/react";
import { CameraView } from "./CameraView";
import { CameraFrameStore } from "../scoring/cameraFrameStore";

it("shows an idle state with no frame", () => {
  render(<CameraView store={new CameraFrameStore()} affectedSide="right" />);
  expect(screen.getByTestId("camera-view-idle")).toBeTruthy();
});

it("renders a canvas once a frame arrives", () => {
  const store = new CameraFrameStore();
  store.push({ jpeg: "AAAA", landmarks: { pose: [], hands: { left: null, right: null } }, fps: 10, timestamp: 0 });
  render(<CameraView store={store} affectedSide="right" />);
  expect(document.querySelector("canvas")).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `clinician-console/`): `npx vitest run src/renderer/CameraView.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `CameraView`** (`clinician-console/src/renderer/CameraView.tsx`)

Render a `<canvas>` when `latest` is non-null, else a `<div data-testid="camera-view-idle">no camera link</div>`. In a `useEffect` keyed on `latest`: get `canvas.getContext("2d")`; if null, return (jsdom). Decode the JPEG via `const img = new Image(); img.src = \`data:image/jpeg;base64,${latest.jpeg}\`; img.onload = () => { ctx.drawImage(...); drawOverlay(ctx, latest.landmarks, affectedSide); }`. `drawOverlay` connects the standard MediaPipe pose edges (shoulder→elbow→wrist etc.) and plots hand points, scaling normalized coords by canvas width/height; affected side drawn in an accent color, the rest muted. Keep `drawOverlay` a pure local helper so it is unit-testable later if needed. Guard every canvas call behind the null-context check.

- [ ] **Step 4: Run to verify pass**

Run (from `clinician-console/`): `npx vitest run src/renderer/CameraView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/renderer/CameraView.tsx clinician-console/src/renderer/console.css clinician-console/src/renderer/CameraView.test.tsx
git commit -m "feat(console): CameraView canvas with MediaPipe overlay"
```

---

## Phase 3 — UI assembly

### Task 10: Calibration tab — live feed + status column

**Files:**
- Modify: `clinician-console/src/renderer/CalibrateStep.tsx`
- Modify: `clinician-console/src/renderer/SessionFlow.tsx` (pass `cameraFrameStore`, `calibrationStartedAt`)
- Modify: `clinician-console/src/renderer/console.css`
- Test: `clinician-console/src/renderer/CalibrateStep.test.tsx`

**Interfaces:**
- Consumes: `CameraView`, `useCameraFrameStore`, `useVisionHealthStore`, `calibrationStartedAt: number | null`, `cameraFrameStore`.
- Produces: `CalibrateStep` renders `data-testid="cal-feed"` (CameraView) + a status column with `data-testid="cal-status-inframe"`, `cal-status-cv`, `cal-status-eeg`.

- [ ] **Step 1: Write the failing tests** (`clinician-console/src/renderer/CalibrateStep.test.tsx`)

```tsx
it("shows the camera feed + three calibration status rows", () => {
  renderStep({ calibrationStartedAt: null });
  expect(screen.getByTestId("cal-status-inframe")).toBeTruthy();
  expect(screen.getByTestId("cal-status-cv")).toBeTruthy();
  expect(screen.getByTestId("cal-status-eeg")).toBeTruthy();
});

it("marks in-frame yes once pose landmarks arrive", () => {
  const cameraFrameStore = new CameraFrameStore();
  cameraFrameStore.push({ jpeg: "x", landmarks: { pose: [[0.5, 0.5, 0.95]], hands: { left: null, right: null } }, fps: 10, timestamp: 0 });
  renderStep({ cameraFrameStore });
  expect(screen.getByTestId("cal-status-inframe").textContent).toMatch(/yes/i);
});
```

Extend the `renderStep` helper with `cameraFrameStore` (default `new CameraFrameStore()`) and `calibrationStartedAt` (default `null`) props.

- [ ] **Step 2: Run to verify fail**

Run (from `clinician-console/`): `npx vitest run src/renderer/CalibrateStep.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the feed + status column** (`clinician-console/src/renderer/CalibrateStep.tsx`)

Replace the `placeholder` div with a `cal-live` row: left `<CameraView store={cameraFrameStore} affectedSide={side} data-testid="cal-feed" />`, right a status column:
- **In frame** (`cal-status-inframe`): read `useCameraFrameStore(cameraFrameStore).latest`; "in frame — yes" if `latest` has ≥1 pose row with visibility (col index 2) ≥ 0.5, else "no".
- **CV rest pose** (`cal-status-cv`): from `vh.calibration` — "calibrating…" when `collecting`, "✓ done" when `complete`/`restCalibrated`, "waiting" otherwise.
- **EEG baseline** (`cal-status-eeg`): a determinate bar. If `calibrationStartedAt` is null → "waiting"; else compute `pct = min(100, (Date.now() - calibrationStartedAt) / 60000 * 100)` on a 1 Hz `setInterval` tick (clear on unmount); render a `.cal-bar` filled to `pct`.

Add the `cameraFrameStore` and `calibrationStartedAt` props to the `Props` type and destructure. Add `.cal-live`, `.cal-statuscol`, `.cal-bar` styles to `console.css` (instrument look: mono labels, thin bars, status dots).

- [ ] **Step 4: Wire SessionFlow** — pass `cameraFrameStore={props.cameraFrameStore}` and `calibrationStartedAt={calibrationStartedAt}` to `CalibrateStep`.

- [ ] **Step 5: Run tests + typecheck**

Run (from `clinician-console/`): `npx vitest run src/renderer/CalibrateStep.test.tsx`
Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS / no errors.

- [ ] **Step 6: Commit**

```bash
git add clinician-console/src/renderer/CalibrateStep.tsx clinician-console/src/renderer/SessionFlow.tsx clinician-console/src/renderer/console.css clinician-console/src/renderer/CalibrateStep.test.tsx
git commit -m "feat(console): live camera feed + calibration status column"
```

---

### Task 11: Live tab — scientific 8-channel EEG scope

**Files:**
- Create: `clinician-console/src/renderer/EegScope.tsx`
- Modify: `clinician-console/src/renderer/LiveMonitor.tsx` (replace `ChannelStrip` usage)
- Modify: `clinician-console/src/renderer/LiveMonitor.css`
- Modify: `signal-engine/scoring/scoring_service.py:185`
- Test: `clinician-console/src/renderer/EegScope.test.tsx`, `signal-engine/tests/test_scoring_service.py`

**Interfaces:**
- Consumes: `useEegQualityStore`, `EegQualityFrame` (`channels[]` + `trace: Record<string, number[]>`).
- Produces: `<EegScope qualityStore={qualityStore} />` — a stacked 8-row scope; each row: mono channel label, quality dot, rolling trace line. Maintains a per-channel rolling buffer (last `MAX_SAMPLES = 500`) appended from each incoming `trace[label]`.

- [ ] **Step 1: Sidecar test first** (`signal-engine/tests/test_scoring_service.py` — extend the existing quality-snapshot test)

```python
def test_quality_snapshot_traces_all_eight_channels(...):
    # Drive one snapshot as the existing quality test does, then:
    snap = service.latest_quality()
    assert set(snap["trace"].keys()) == set(service.engine.eeg_channel_labels)
```

- [ ] **Step 2: Run to verify fail**

Run: `conda run -n eeg pytest signal-engine/tests/test_scoring_service.py -k trace -v`
Expected: FAIL — only C3/Cz/C4 present.

- [ ] **Step 3: Trace all channels** (`signal-engine/scoring/scoring_service.py:185`)

```python
            "trace": extract_trace(gate_window, labels, labels),
```

(Leave `TRACE_CHANNELS` defined if referenced elsewhere; otherwise remove the now-unused constant.)

- [ ] **Step 4: Run to verify pass**

Run: `conda run -n eeg pytest signal-engine/tests/test_scoring_service.py -v`
Expected: PASS.

- [ ] **Step 5: Write the failing EegScope test** (`clinician-console/src/renderer/EegScope.test.tsx`)

```tsx
it("renders one row per channel", () => {
  const store = new EegQualityStore();
  store.push({ fs: 250, timestamp: 0,
    channels: ["C3","Cz","C4","Fz","Pz","P3","P4","Oz"].map((label) => ({ label, quality: "good", p2p: 5 })),
    trace: Object.fromEntries(["C3","Cz","C4","Fz","Pz","P3","P4","Oz"].map((l) => [l, [0, 1, -1, 0]])) });
  render(<EegScope qualityStore={store} />);
  expect(screen.getAllByTestId("eeg-scope-row").length).toBe(8);
});
```

- [ ] **Step 6: Run to verify fail**

Run (from `clinician-console/`): `npx vitest run src/renderer/EegScope.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 7: Implement `EegScope`** (`clinician-console/src/renderer/EegScope.tsx`)

Keep a `useRef<Map<string, number[]>>` rolling buffer. On each new `latest` frame, for every `label` in `latest.trace`, append the samples and trim to `MAX_SAMPLES`. Render one `<div data-testid="eeg-scope-row">` per channel: mono `<span class="eeg-label">`, a quality `<span class="dot">` (`background: var(--{quality})`), and an inline `<svg>` polyline of the buffered samples auto-scaled to the row height (normalize by the per-row max-abs, thin stroke). Faint grid via CSS. This is a pure render from the buffer — no canvas needed.

Add scope styles to `LiveMonitor.css`: dark scope background, mono labels, thin traces, faint gridlines — deliberately NOT matched to the console chrome.

- [ ] **Step 8: Swap into LiveMonitor** — in the "EEG — 8 channel quality" panel, replace `<ChannelStrip .../>` with `<EegScope qualityStore={qualityStore} />`. Remove the now-unused `ChannelStrip` helper.

- [ ] **Step 9: Run tests + typecheck**

Run (from `clinician-console/`): `npx vitest run src/renderer/EegScope.test.tsx src/renderer/LiveMonitor.test.tsx`
Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add clinician-console/src/renderer/EegScope.tsx clinician-console/src/renderer/LiveMonitor.tsx clinician-console/src/renderer/LiveMonitor.css signal-engine/scoring/scoring_service.py clinician-console/src/renderer/EegScope.test.tsx signal-engine/tests/test_scoring_service.py
git commit -m "feat(console): scientific 8-channel EEG scope; trace all channels"
```

---

### Task 12: Live tab — patient view, header relocation, kinematic graph, remove panel

**Files:**
- Modify: `clinician-console/src/renderer/LiveMonitor.tsx`
- Modify: `clinician-console/src/renderer/LiveMonitor.css`
- Test: `clinician-console/src/renderer/LiveMonitor.test.tsx`, `clinician-console/src/renderer/LiveMonitor.css` (visual, no test)

**Interfaces:**
- Consumes: `CameraView`, `useCameraFrameStore` (fps), `useVisionHealthStore` (`restCalibrated`, `degraded`), `latest.kinematicScore`, `latest.compensationFlag`.
- Produces: header conn badge includes a camera segment; a full-width thin kinematic graph under the intent hero; `VisionHealthPanel` removed from above the boxes.

- [ ] **Step 1: Write the failing tests** (`clinician-console/src/renderer/LiveMonitor.test.tsx`)

```tsx
it("shows the camera fps in the header when a frame is present", () => {
  const cameraFrameStore = new CameraFrameStore();
  cameraFrameStore.push({ jpeg: "x", landmarks: { pose: [], hands: { left: null, right: null } }, fps: 12.3, timestamp: 0 });
  renderMonitor({ cameraFrameStore });
  expect(screen.getByTestId("conn-badge").textContent).toMatch(/12\.3 fps/);
});

it("shows 'not calibrated' for the kinematic graph when CV is uncalibrated", () => {
  renderMonitor({ /* vision_health.restCalibrated = false */ });
  expect(screen.getByTestId("kinematic-graph").textContent).toMatch(/not calibrated/i);
});

it("no longer renders the vision-health panel above the boxes", () => {
  renderMonitor({});
  expect(screen.queryByTestId("vision-health-panel")).toBeNull();
});
```

Extend the `renderMonitor` helper with a `cameraFrameStore` prop (default `new CameraFrameStore()`) and a way to seed `visionHealthStore` (default `restCalibrated: false`).

- [ ] **Step 2: Run to verify fail**

Run (from `clinician-console/`): `npx vitest run src/renderer/LiveMonitor.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the changes** (`clinician-console/src/renderer/LiveMonitor.tsx`)

- Add a `cameraFrameStore` prop; read `const cam = useCameraFrameStore(cameraFrameStore).latest`.
- **Header:** append a camera segment to the `conn-badge` when `cam` is present: ` · 📷 {cam.fps.toFixed(1)} fps`.
- **Remove** the `{visionHealthStore && <VisionHealthPanel .../>}` block above `grid-2`.
- **Patient-view box:** replace the placeholder with `<CameraView store={cameraFrameStore} affectedSide={patient ? patient.affectedSide.toLowerCase() : "right"} />`.
- **Kinematic graph:** below the `lm-hero` block, add:

```tsx
      <div className="lm-kin" data-testid="kinematic-graph">
        <span className="lm-kin-label">KINEMATIC</span>
        {vh?.restCalibrated
          ? <Trace buffer={state.buffer.map((f) => f.kinematicScore ?? 0)} />
          : <span className="lm-kin-uncal">not calibrated</span>}
      </div>
```

where `vh = useVisionHealthStore(visionHealthStore).latest`. Reuse the existing `Trace`; add `.lm-kin` (thin, full-width, ~1/3 hero height) + `.lm-kin-uncal` styles to `LiveMonitor.css`.
- **Relocate** the degraded + compensation cues: render small inline indicators (e.g. a `.lm-flag` near the header for `vh?.degraded` → "vision degraded — EEG-only", and keep the `compensationFlag` "⚠ trunk compensation" as a sub-tile or inline flag).

- [ ] **Step 4: Thread `cameraFrameStore`** through `LiveStep` → `LiveMonitor` props (and `SessionFlow` → `LiveStep`).

- [ ] **Step 5: Run tests + typecheck**

Run (from `clinician-console/`): `npx vitest run src/renderer/LiveMonitor.test.tsx src/renderer/VisionHealthPanel.test.tsx`
Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS. (If `VisionHealthPanel.test.tsx` only tested the component in isolation it can stay; if it asserted placement inside LiveMonitor, update it.)

- [ ] **Step 6: Commit**

```bash
git add clinician-console/src/renderer/LiveMonitor.tsx clinician-console/src/renderer/LiveMonitor.css clinician-console/src/renderer/LiveStep.tsx clinician-console/src/renderer/SessionFlow.tsx clinician-console/src/renderer/LiveMonitor.test.tsx
git commit -m "feat(console): live patient feed, header camera fps, kinematic graph, drop panel"
```

---

### Task 13: Remove "Dr. Ortiz · Clinic A" from the top bar

**Files:**
- Modify: `clinician-console/src/renderer/App.tsx:36`
- Test: `clinician-console/src/renderer/App.test.tsx`

- [ ] **Step 1: Write/adjust the failing test** (`clinician-console/src/renderer/App.test.tsx`)

```tsx
it("does not show a clinician/clinic label in the top bar", () => {
  renderApp();
  expect(screen.queryByText(/Ortiz|Clinic A/)).toBeNull();
});
```

- [ ] **Step 2: Run to verify fail**

Run (from `clinician-console/`): `npx vitest run src/renderer/App.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Delete the span** (`clinician-console/src/renderer/App.tsx`)

Remove `<span className="app-meta">Dr. Ortiz · Clinic A</span>`.

- [ ] **Step 4: Run to verify pass**

Run (from `clinician-console/`): `npx vitest run src/renderer/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/renderer/App.tsx clinician-console/src/renderer/App.test.tsx
git commit -m "chore(console): remove Dr. Ortiz · Clinic A from the top bar"
```

---

## Final verification

- [ ] Full console suite (from `clinician-console/`): `npm run test` — all green.
- [ ] Both console tsconfig targets: `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p tsconfig.main.json --noEmit`.
- [ ] Patient-web (from `patient-web/`): `npm run test` and `npm run build`.
- [ ] Sidecar (from repo root): `conda run -n eeg pytest signal-engine/tests/`.
- [ ] Manual smoke (cannot be verified headlessly): `npm run dev` in `clinician-console`, run a `sim` session with the mock camera; confirm the calibration tab shows the feed + overlay + status bars, the live tab shows the EEG scope + patient feed + kinematic graph + header fps, and pressing patient "I'm ready" auto-starts CV calibration.
- [ ] `graphify update .` if available on PATH.
- [ ] Update `docs/todos.md` with the completed feature and any remaining holes.

## Self-review notes (coverage)

- #1 auto-start → Tasks 1–4. #2 calibration feed+status → Tasks 8–10. #3 EEG scope + patient feed → Tasks 11–12. #4 header + kinematic graph + relocation → Task 12. #5 remove label → Task 13. Shared camera transport → Tasks 5–9.
- Known approximations (per spec, intentional): EEG-baseline bar is a console 60 s timer; in-frame derived from landmark visibility; CV progress is indeterminate/done from `vision_health.calibration`.
