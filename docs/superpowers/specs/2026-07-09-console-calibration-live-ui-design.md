# Clinician-Console Calibration + Live UI Overhaul — Design

**Date:** 2026-07-09
**Status:** Approved (design)
**Scope:** clinician-console (renderer), signal-engine (sidecar), patient-web (one checkpoint hook)

## Goal

Five improvements to the clinician console flow:

1. Auto-start rest-pose calibration when the patient presses "I'm ready" (remove the manual clinician button + status).
2. Populate the calibration-tab placeholder with a live camera feed (MediaPipe overlay) + status/progress bars.
3. Populate the live-tab EEG box with a scientific 8-channel trace + quality indicators, and the patient-view box with the camera feed + overlay.
4. Relocate the camera-link debug info: connection+fps into the header status; kinematic score into a thin full-width flowing graph under the intent-score graph.
5. Remove "Dr. Ortiz · Clinic A" from the top bar.

## Key constraint discovered

The clinician console currently receives **no camera video** — the patient publishes a single WebRTC stream to the sidecar's aiortc receiver, which runs MediaPipe and emits only `vision_health` telemetry. The sidecar runs on the **same machine** as the console (Electron main spawns it). The console↔sidecar link is one localhost WebSocket already routing `intent_score`, `eeg_quality` (carries per-channel `trace[]`), and `vision_health`. Frames on this socket are inherently clinician-only — the LAN relays whitelist specific types and never forward console↔sidecar frames to the patient.

## Decisions (from brainstorming)

- **Camera transport:** sidecar pushes JPEG + landmarks over the existing localhost WS as a new clinician-only `camera_frame` type (~12 fps). Chosen over a second WebRTC peer (doubles patient upload, new signaling topology) and landmarks-only skeleton (no real feed).
- **Calibration progress bars:** derive/approximate on the console — no new backend progress signal. In-frame from landmark visibility; CV rest-pose from `vision_health.calibration` status (indeterminate → done); EEG baseline from a console timer started on the patient "I'm ready" signal.
- **EEG trace:** stacked 8-row scope (montage-viewer norm).
- **Camera frame rate:** 12 fps JPEG.

---

## Shared plumbing (new)

### 1. `camera_frame` WS frame (sidecar → console, clinician-only)

New broadcast loop in `signal-engine/server/ws_server.py` (~12 fps). Reads `VideoFrameSink.latest()` and the latest `PoseFrame`, JPEG-encodes the frame, and broadcasts:

```json
{
  "type": "camera_frame",
  "jpeg": "<base64>",
  "landmarks": {"pose": [[x, y, vis], …], "hands": {"left": [[x,y,z],…]|null, "right": …}},
  "fps": 12.3,
  "timestamp": 1720000000.0
}
```

- Emitted only when a frame + pose are available (EEG-only / no-camera sessions emit nothing — no camera box content, honest).
- JPEG encode via PIL or cv2 (whichever is already a dependency; add if neither). Downscale to a modest width (e.g. 480 px) to keep base64 small on localhost.
- Landmarks are the same arrays MediaPipe already produces in `pose_estimator.py`; normalized [0,1] image coords so the console overlay scales to any canvas size.
- Never relayed to the patient (stays on the localhost socket).

**Console side:**
- `clinician-console/src/scoring/cameraFrameMessage.ts` — defensive parser (never throws on a bad frame), mirroring the other parsers.
- `clinician-console/src/scoring/cameraFrameStore.ts` — latest-only store, same stable-snapshot pattern as `EegQualityStore`.
- `clinician-console/src/renderer/useCameraFrameStore.ts` — `useSyncExternalStore` hook.
- Wire `scoreClient.ts`: add `onCameraFrame?` option; try the parser in the `onmessage` chain.
- Wire `App.tsx`: construct the store, thread it to `LiveMonitor` and `CalibrateStep`.

### 2. `CameraView` component

`clinician-console/src/renderer/CameraView.tsx` — reused in both tabs.

- `<canvas>`; draws the decoded JPEG (via `createImageBitmap`) then the MediaPipe skeleton overlay (pose connections + hand landmarks) scaled to the canvas.
- Affected side highlighted (color from patient record / `vision_health.affectedSide`).
- Empty/idle state ("no camera link") when the store has no recent frame.
- jsdom mocks the canvas 2D context in tests; the component must no-op gracefully when the context is null.

### 3. Patient "I'm ready" → console signal

- New checkpoint id `calibration-ready` on the existing checkpoint contract (`patient-web/src/net/checkpoint.ts` + `clinician-console/src/main/lan/checkpoint.ts`).
- Patient `CalibrationScene.tsx` fires it in the existing `onClick={() => setReady(true)}` handler.
- Console `useCheckpoints.ts` surfaces the new signal; `App.tsx` reacts:
  - auto-fires the `calibrate_pose` sidecar command (the path the manual button used),
  - starts the EEG-baseline console timer (drives the #2 baseline bar).

---

## Feature #1 — Auto-start calibration

`clinician-console/src/renderer/CalibrateStep.tsx`:
- Remove the "Calibrate rest pose" button, the `cal-status` text, the `calText` helper, and the `onCalibratePose` manual wiring.
- Rest-pose CV calibration now fires automatically on the `calibration-ready` checkpoint (in `App`/`SessionFlow`, not the step).
- Keep the fusion-mode and affected-side controls.

## Feature #2 — Calibration tab: live feed + status

Replace the `placeholder` block in `CalibrateStep` with a two-column row:
- **Left:** `CameraView` (feed + overlay).
- **Right:** status column:
  - **In frame?** ● yes / ○ no — from landmark presence + visibility threshold.
  - **CV rest pose** — indeterminate "calibrating…" while `vision_health.calibration === "collecting"`, ✓ done when `complete` / `restCalibrated`.
  - **EEG baseline** — determinate bar, console timer 0→60 s, started on `calibration-ready`.

Styling: instrument-panel look — mono labels, thin bars, status dots. New CSS in `console.css`.

## Feature #3 — Live tab: EEG strip + patient view

`clinician-console/src/renderer/LiveMonitor.tsx`:
- **EEG box** (`grid-2` left): replace `ChannelStrip` pills with a scientific 8-channel strip chart — stacked rolling traces (one row per channel), mono channel labels, faint grid, thin lines, per-channel quality dot. Styling deliberately NOT matched to console chrome (dark scope look), in `LiveMonitor.css`.
  - Rolling per-channel ring buffer on the console: append incoming `eeg_quality.trace` chunks (keep the last N samples per channel). Implement as a small helper or an extension to the quality store; keep the latest-only store contract intact for other consumers.
  - **Sidecar tweak:** `extract_trace` currently emits ~3 channels — extend the `want` list to all 8 EEG labels so the strip has all rows.
- **Patient-view box** (`grid-2` right): replace the placeholder with `CameraView`.

## Feature #4 — Relocate camera debug info

`LiveMonitor.tsx`:
- **Header top-right:** merge camera-connected + fps into the existing conn badge → `● live · sidecar ready · 📷 12.3 fps`. Camera segment shows only when a `camera_frame` is flowing.
- Remove `VisionHealthPanel` from above the boxes (delete that placement).
- **Kinematic graph:** new thin, full-width flowing graph directly under the IntentScore hero, reusing the `Trace` visual at ~1/3 height. Buffer of `kinematicScore` values. When `vision_health.restCalibrated` is false (CV not calibrated), render a static **"not calibrated"** state instead of the flowing line.
- Keep the degraded + trunk-compensation cues as small inline indicators (relocated from the panel; e.g. near the header or as a compact tile).

## Feature #5 — Remove top-bar label

Delete the `<span className="app-meta">Dr. Ortiz · Clinic A</span>` at `clinician-console/src/renderer/App.tsx:36`.

---

## Testing

**Vitest (clinician-console):**
- `cameraFrameMessage` parser — valid frame, malformed JSON, wrong type, missing fields.
- `cameraFrameStore` — push/getState/subscribe.
- `CameraView` — renders canvas, no-ops on null 2D context, idle state with no frame.
- EEG strip rolling buffer — append/trim behavior.
- `CalibrateStep` — button/status removed, feed + status column present, no manual-calibrate path.
- `LiveMonitor` — header shows camera fps segment when frame present; kinematic graph shows "not calibrated" when uncalibrated, flows when calibrated; VisionHealthPanel no longer above boxes.
- `useCheckpoints` / checkpoint contract — `calibration-ready` round-trips.

**Vitest (patient-web):**
- `CalibrationScene` fires `calibration-ready` on "I'm ready".
- `checkpoint` contract parity.

**Pytest (signal-engine):**
- `camera_frame` emit loop — fake `VideoFrameSink` + fake `PoseEstimator`; asserts frame shape, base64 JPEG decodes, landmarks present; no emit when sink empty.
- `extract_trace` returns all 8 EEG labels.

## Non-goals / out of scope

- Real staged EEG-calibration backend progress (approximated on the console).
- A second WebRTC peer / real `<video>` element in the console.
- Rewiring the cosmetic Graz block to a real LSL marker stream.

## Suggested plan phasing

1. Shared plumbing: `camera_frame` (sidecar + parser/store/hook + `scoreClient`/`App` wiring) + `CameraView` + `calibration-ready` checkpoint.
2. #1 auto-start calibration.
3. #2 calibration-tab feed + status.
4. #3 live-tab EEG strip + patient view.
5. #4 relocate debug info + kinematic graph; #5 remove label.
