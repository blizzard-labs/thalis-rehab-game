# V2-2a — WebRTC Transport Spine (design)

_2026-07-07. Reference: [`docs/specs.md`](../../specs.md) §4.3–4.4, §7.2. First sub-project of the
V2-2 vision pipeline._

## 1. Context & scope

The V2-2 vision pipeline (spec §7) is one closed loop across three subsystems: the patient browser
publishes its camera over WebRTC → the clinician-console LAN server brokers signaling → the
signal-engine sidecar receives the track via `aiortc`, runs MediaPipe, and produces a
`kinematic_score` that the fusion engine blends into the IntentScore.

That loop is too large for one implementation plan. It is decomposed into three sequenced
sub-projects, each with its own spec → plan → build cycle:

- **V2-2a — Transport spine (this doc).** Patient camera publish → real signaling broker → sidecar
  `aiortc` receiver that decodes frames into a bounded sink. End state: real decoded video frames
  arrive in Python. **No scoring.**
- **V2-2b — Vision & kinematics.** MediaPipe Pose/Hands on the decoded frames; rest-pose calibration
  (5 s) + framing-check setup step; kinematic features (joint angles, trunk displacement, jerk);
  `kinematic_score`; confidence / last-known-good gating.
- **V2-2c — Fusion & UX.** Wire `kinematic_score` into `IntentScoreEngine` (Modes B/C weights,
  compensation penalty); camera-link health panel (console); frame-drop / permission-deny → EEG-only
  fallback surfaced on both sides.

This document specifies **V2-2a only**.

### Non-goals (deferred to 2-2b / 2-2c)
MediaPipe, `kinematic_score`, rest-pose / framing-check UI, fusion weight changes, compensation
penalty, camera-link health panel. V2-2a produces frames and stops there.

## 2. Architecture

The camera media track travels its own WebRTC path. Signaling (SDP offer/answer + trickled ICE)
rides the **existing paired LAN WebSocket** — the single persistent patient socket
(`usePatientLink` → `lanClient`), per the single-socket invariant. Media bytes never cross the WS.

```
patient-web                     clinician-console (Electron main)         signal-engine sidecar
─────────────                   ─────────────────────────────────         ─────────────────────
getUserMedia                    lanServer.onConnection                    ws_server dispatch
  → RTCPeerConnection (offerer)   paired socket routes webrtc-* ──┐        webrtc-offer →
  → addTrack(video)               (replaces echo stub)            │          aiortc RTCPeerConnection
  → createOffer ──webrtc-offer──▶ signalingRelay ⇄ sidecar WS ────┼──WS──▶    .setRemoteDescription
  ◀─webrtc-answer/ice────────────  (forwards both directions)     │          createAnswer ──▶
  (send-only; no ontrack)                                         │          on track → VideoFrameSink
                                                                  └──◀── webrtc-answer / ice
```

Roles:
- **Patient = offerer, send-only.** It owns the media, so it creates the offer and adds the video
  track; it expects no inbound track.
- **Sidecar = answerer.** It owns the `aiortc` peer, running inside the **existing asyncio event
  loop** of `run_ws_server.py` (aiortc is asyncio-native; no separate process).
- **Console main = dumb bidirectional relay.** It forwards `webrtc-*` frames between the paired
  patient socket and the sidecar WS. It never parses SDP or terminates a peer.

ICE uses **host candidates only** — single clinic LAN, no STUN/TURN, no internet (spec §4.3).

## 3. Signaling contract

Reuse the already-frozen `SignalingMessage` union (`clinician-console/src/main/lan/signaling.ts`),
mirrored on the patient side:

```ts
type SignalingMessage =
  | { type: "webrtc-offer"; sdp: string }
  | { type: "webrtc-answer"; sdp: string }
  | { type: "webrtc-ice"; candidate: unknown };
```

Trickle ICE flows in both directions as independent `webrtc-ice` frames. `candidate: null` signals
end-of-candidates and is forwarded verbatim. The contract is byte-stable across all three
subsystems; changing it means changing all three together.

## 4. Components

### 4.1 patient-web
- **`net/cameraPublisher.ts` (new).** Pure module. Inputs: a `MediaStream`, an outbound
  `send(msg: SignalingMessage)`, and a way to feed inbound signaling frames in. Builds an
  `RTCPeerConnection`, adds the video track, creates/sends the offer, applies the inbound answer,
  and exchanges ICE. `RTCPeerConnection` and `getUserMedia` are injected so jsdom tests use fakes.
  Exposes `start()` / `stop()` (stop closes the PC and stops tracks).
- **`net/lanClient.ts` + `net/usePatientLink.ts` (change).** Expose an outbound `send(raw)` on the
  paired socket and route inbound `webrtc-*` frames to a subscriber callback. Pairing and
  `intent_score` handling are untouched. `usePatientLink` returns a `sendSignaling` fn and accepts an
  `onSignaling` subscriber (or returns a small signaling channel object).
- **Camera-step wiring (change).** Where `CameraFeed` already runs `getUserMedia`, hand the resulting
  `MediaStream` to `cameraPublisher` once the link is paired and camera permission is granted.
  Publisher stops on scene unmount / session end. Permission-denied → no publish, no error to the
  patient; EEG-only continues.

### 4.2 clinician-console
- **`lan/signaling.ts` (rewrite).** Replace the echo stub with a real relay: patient `webrtc-offer` /
  `webrtc-ice` → forward to sidecar; sidecar `webrtc-answer` / `webrtc-ice` → forward to patient. Keep
  `isSignalingMessage` and the frozen type union. The relay is injectable so it is unit-testable
  without real sockets.
- **`lan/signalingRelay.ts` (new).** A console↔sidecar WS carrier modeled on `createScoreRelay`
  (injectable `createSocket`, reconnect/backoff): opens/holds a signaling channel to the sidecar,
  forwards patient→sidecar frames, and invokes a `send` callback for sidecar→patient frames. Kept
  separate from `scoreRelay` (score relay is one-directional intent_score; signaling is
  bidirectional webrtc-*) to preserve single responsibility.
- **`lan/lanServer.ts` (change).** In `onConnection`, the existing `isSignalingMessage(msg)` branch
  calls the new relay instead of `handleSignalingMessage` stub. Bind the signaling relay lifecycle to
  the paired socket (create on pair, stop on disconnect / `endSession`), the same way `scoreRelay` is
  managed. Only the paired socket may signal (existing `boundSocketId` gate).

### 4.3 signal-engine
- **`vision/webrtc_receiver.py` (new).** Wraps an `aiortc` `RTCPeerConnection`. `handle_offer(sdp)` →
  `setRemoteDescription` → `createAnswer` → returns answer sdp; `add_ice(candidate)`; emits local ICE
  candidates via a callback. On `track` (video), pumps decoded `av.VideoFrame`s into the frame sink.
  The `aiortc` peer factory is injected so tests substitute a fake peer.
- **`vision/frame_sink.py` (new).** Bounded latest-frame buffer (drop-oldest, keeps last N or last
  frame + count). V2-2a exposes `latest()` and a received-frame counter; V2-2b's MediaPipe worker
  will consume it. Missing frames are absence, never a fabricated frame.
- **`server/ws_server.py` (change).** Dispatch `webrtc-offer` / `webrtc-ice`; reply `webrtc-answer` /
  `webrtc-ice`. Score / `eeg_quality` / session dispatch untouched. The receiver is created lazily on
  first offer and torn down on `end_session` / client drop.
- **`run_ws_server.py` (change).** Construct the `VideoFrameSink` + `WebRTCReceiver` and pass them to
  the server. Boot order relative to the scoring service / simulator is preserved (no reorder of the
  baseline-calibration-before-simulator invariant).

## 5. Error handling & fallback (V2-2a slice)

- **No camera / permission denied.** Patient sends no offer and remains EEG-only. Reuse the existing
  `CameraFeed` deny path. A minimal camera-state flag is emitted for V2-2c to surface; V2-2a does not
  build the panel.
- **Signaling before paired.** Dropped by the existing `boundSocketId` gate.
- **Sidecar peer / ICE failure.** Receiver closes the PC; patient publisher closes on connection
  failure; the session continues EEG-only. No crash, no blocked session.
- **Session end / patient disconnect.** Console stops the signaling relay (mirrors `scoreRelay`
  teardown); sidecar closes the PC and flushes the frame sink.

## 6. Testing (inject + mock at the boundary)

Keeps all three suites hermetic on CI (no camera, no headset), matching the existing on-head skip
pattern.

- **patient-web (Vitest + jsdom).** Fake `RTCPeerConnection` + `getUserMedia`. Assert: offer created
  and sent after pair + grant; inbound answer applied; ICE exchanged both directions; publisher torn
  down on unmount; permission-denied path sends no offer and does not error.
- **clinician-console (Vitest).** Relay unit test with a fake patient socket and a fake sidecar
  socket: patient offer → sidecar; sidecar answer → patient; ICE both directions; relay stops on
  disconnect. `isSignalingMessage` guard retained.
- **signal-engine (pytest).** `webrtc_receiver` with a fake `aiortc` peer + synthetic offer → asserts
  an answer is produced and decoded frames land in the sink; `frame_sink` bounded/drop-oldest
  behavior. One `@pytest.mark.live` real-`aiortc` loopback test (offerer↔answerer in-process),
  **skipped on CI** like the existing live/on-head skips.

## 7. Dependencies

`aiortc` (pulls `av`/PyAV, `cryptography`, `pyee`) added to the `eeg` conda env. Real deps live
behind the injected boundary so they are exercised only by the opt-in live test. Verified importable
on macOS dev; the clinic target is Windows (spec §3.3) — install validated per-platform at packaging
(V2-4), out of scope here.

## 8. Definition of done

- Patient publishes camera; real SDP/ICE cross the paired socket; sidecar answers and decodes frames
  into the sink (verified by the live loopback test).
- Echo stub fully removed from the console signaling path.
- All three unit suites green and hermetic (no new CI dependency on camera/aiortc).
- No regression to pairing, score relay, `eeg_quality`, session gating, or the
  baseline-before-simulator boot invariant.
- `docs/todos.md` updated: V2-2a done, V2-2b/2-2c remain.
