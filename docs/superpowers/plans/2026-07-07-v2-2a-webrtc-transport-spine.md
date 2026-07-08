# V2-2a WebRTC Transport Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the patient device's camera published over WebRTC and decoded into video frames inside the Python sidecar, brokered by the console LAN server — the transport foundation for the vision pipeline, with no scoring yet.

**Architecture:** The media track travels its own WebRTC path (patient = offerer/send-only, sidecar = answerer). SDP/ICE signaling rides the existing paired LAN WebSocket. The console main process is a dumb bidirectional relay forwarding `webrtc-*` frames between the paired patient socket and the sidecar WS. The sidecar's `aiortc` peer runs in the existing asyncio loop and pumps decoded frames into a bounded sink.

**Tech Stack:** Python `aiortc` (+ `av`/PyAV) in the `eeg` conda env; TypeScript `RTCPeerConnection`/`getUserMedia` in the browser; Node `ws` in Electron main. Vitest (patient-web, clinician-console) + pytest (signal-engine).

## Global Constraints

- **Signaling contract is byte-stable across all three subsystems** — `{type:"webrtc-offer",sdp}` / `{type:"webrtc-answer",sdp}` / `{type:"webrtc-ice",candidate}`. Change all three together or none.
- **Host ICE candidates only** — single clinic LAN, no STUN/TURN, no internet.
- **Single patient socket** — signaling rides the existing `usePatientLink`→`lanClient` socket; never open a second patient socket.
- **Tests hermetic on CI** — real `aiortc`/`getUserMedia`/`RTCPeerConnection` only behind injected boundaries; real-dep exercise goes in a `@pytest.mark.live` test skipped on CI (matches the existing on-head skip pattern).
- **Do not reorder the sidecar boot sequence** — baseline calibration (2 s rest pull) must precede `SessionSimulator` construction; the WebRTC receiver is constructed without disturbing that order.
- **Python via conda:** all pytest runs use `conda run -n eeg python -m pytest ...` from the repo root.
- **No `Co-Authored-By` trailer in commits.**
- **`signal-engine/` is not a package** (hyphen); tests rely on `signal-engine/tests/conftest.py` prepending it to `sys.path` — run pytest from repo root.

---

## Task 1: VideoFrameSink (sidecar)

A bounded latest-frame buffer that the WebRTC receiver pushes into and V2-2b's MediaPipe worker will consume. Missing frames are absence, never fabricated.

**Files:**
- Create: `signal-engine/vision/__init__.py` (empty)
- Create: `signal-engine/vision/frame_sink.py`
- Test: `signal-engine/tests/test_frame_sink.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `VideoFrameSink()` with `push(frame) -> None`, `latest() -> object | None`, `frame_count -> int` (property), `clear() -> None`.

- [ ] **Step 1: Write the failing test**

```python
# signal-engine/tests/test_frame_sink.py
from vision.frame_sink import VideoFrameSink


def test_latest_returns_most_recent_and_counts():
    sink = VideoFrameSink()
    assert sink.latest() is None
    assert sink.frame_count == 0

    sink.push("frame-a")
    sink.push("frame-b")

    assert sink.latest() == "frame-b"
    assert sink.frame_count == 2


def test_clear_resets_latest_but_not_count():
    sink = VideoFrameSink()
    sink.push("frame-a")
    sink.clear()
    assert sink.latest() is None
    # count is a monotonic received-tally, not a buffer size
    assert sink.frame_count == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg python -m pytest signal-engine/tests/test_frame_sink.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vision'`

- [ ] **Step 3: Write minimal implementation**

```python
# signal-engine/vision/frame_sink.py
"""Bounded latest-frame buffer for the WebRTC video path.

The receiver pushes decoded frames here; downstream consumers (V2-2b MediaPipe
worker) read the latest. Keeping only the newest frame means a slow consumer
drops stale frames rather than building an unbounded backlog. `frame_count` is a
monotonic received-tally used for the camera-link health check.
"""
from __future__ import annotations

from typing import Optional


class VideoFrameSink:
    def __init__(self) -> None:
        self._latest: Optional[object] = None
        self._count = 0

    def push(self, frame: object) -> None:
        self._latest = frame
        self._count += 1

    def latest(self) -> Optional[object]:
        return self._latest

    @property
    def frame_count(self) -> int:
        return self._count

    def clear(self) -> None:
        self._latest = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `conda run -n eeg python -m pytest signal-engine/tests/test_frame_sink.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/__init__.py signal-engine/vision/frame_sink.py signal-engine/tests/test_frame_sink.py
git commit -m "feat(vision): add VideoFrameSink bounded latest-frame buffer"
```

---

## Task 2: WebRTCReceiver (sidecar)

Wraps an injectable `aiortc` peer. Accepts a patient offer, produces an answer, accepts trickled ICE, and pumps decoded video frames into the sink. The peer factory is injected so unit tests never import `aiortc`.

**Files:**
- Create: `signal-engine/vision/webrtc_receiver.py`
- Test: `signal-engine/tests/test_webrtc_receiver.py`

**Interfaces:**
- Consumes: `VideoFrameSink` (Task 1).
- Produces:
  - `WebRTCReceiver(sink, pc_factory=None, on_local_signal=None)`.
  - `async handle_offer(sdp: str) -> dict` → returns `{"type": "webrtc-answer", "sdp": <answer_sdp>}`.
  - `async add_ice(candidate: dict | None) -> None`.
  - `async close() -> None`.
  - `on_local_signal`: optional `async (dict) -> None`, invoked with `{"type":"webrtc-ice","candidate":...}` frames the receiver wants sent to the patient.

- [ ] **Step 1: Write the failing test**

```python
# signal-engine/tests/test_webrtc_receiver.py
import asyncio

from vision.frame_sink import VideoFrameSink
from vision.webrtc_receiver import WebRTCReceiver


class FakeDescription:
    def __init__(self, sdp, type_):
        self.sdp = sdp
        self.type = type_


class FakePeer:
    """Stands in for aiortc.RTCPeerConnection in unit tests."""

    def __init__(self):
        self.remote = None
        self.local = None
        self.handlers = {}
        self.added_ice = []
        self.closed = False

    def on(self, event):
        def deco(fn):
            self.handlers[event] = fn
            return fn
        return deco

    async def setRemoteDescription(self, desc):
        self.remote = desc

    async def createAnswer(self):
        return FakeDescription("answer-sdp", "answer")

    async def setLocalDescription(self, desc):
        self.local = desc

    @property
    def localDescription(self):
        return self.local

    async def addIceCandidate(self, candidate):
        self.added_ice.append(candidate)

    async def close(self):
        self.closed = True


def test_handle_offer_returns_answer_and_sets_remote():
    peer = FakePeer()
    sink = VideoFrameSink()
    rx = WebRTCReceiver(sink, pc_factory=lambda: peer)

    answer = asyncio.run(rx.handle_offer("offer-sdp"))

    assert answer == {"type": "webrtc-answer", "sdp": "answer-sdp"}
    assert peer.remote.sdp == "offer-sdp"
    assert peer.remote.type == "offer"


def test_add_ice_forwards_parsed_candidate_to_peer():
    peer = FakePeer()
    rx = WebRTCReceiver(VideoFrameSink(), pc_factory=lambda: peer)
    asyncio.run(rx.handle_offer("offer-sdp"))  # creates the peer

    asyncio.run(rx.add_ice({"candidate": "candidate:1 1 udp ...", "sdpMid": "0", "sdpMLineIndex": 0}))

    assert len(peer.added_ice) == 1


def test_null_ice_is_ignored():
    peer = FakePeer()
    rx = WebRTCReceiver(VideoFrameSink(), pc_factory=lambda: peer)
    asyncio.run(rx.handle_offer("offer-sdp"))
    asyncio.run(rx.add_ice(None))  # end-of-candidates sentinel
    assert peer.added_ice == []


def test_close_closes_peer_and_clears_sink():
    peer = FakePeer()
    sink = VideoFrameSink()
    sink.push("f")
    rx = WebRTCReceiver(sink, pc_factory=lambda: peer)
    asyncio.run(rx.handle_offer("offer-sdp"))
    asyncio.run(rx.close())
    assert peer.closed is True
    assert sink.latest() is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg python -m pytest signal-engine/tests/test_webrtc_receiver.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'vision.webrtc_receiver'`

- [ ] **Step 3: Write minimal implementation**

```python
# signal-engine/vision/webrtc_receiver.py
"""aiortc-backed receiver for the patient's camera track.

Patient is the offerer/publisher; this is the answerer. aiortc gathers its ICE
candidates into the answer SDP (non-trickle), so this side rarely emits separate
`webrtc-ice` frames — but the contract supports them and the patient (browser)
trickles candidates to us via `add_ice`.

`pc_factory` and all aiortc imports are lazy/injected so unit tests run without
aiortc installed; only the live loopback test (Task 4) and production supply the
real peer.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, Optional

logger = logging.getLogger(__name__)

LocalSignalCb = Callable[[dict], Awaitable[None]]


def _default_pc_factory():
    from aiortc import RTCPeerConnection  # lazy: unit tests never hit this
    return RTCPeerConnection()


class _Description:
    def __init__(self, sdp: str, type_: str):
        self.sdp = sdp
        self.type = type_


class WebRTCReceiver:
    def __init__(
        self,
        sink,
        pc_factory: Optional[Callable[[], object]] = None,
        on_local_signal: Optional[LocalSignalCb] = None,
    ) -> None:
        self._sink = sink
        self._pc_factory = pc_factory or _default_pc_factory
        self._on_local_signal = on_local_signal
        self._pc = None

    def _ensure_pc(self):
        if self._pc is not None:
            return self._pc
        pc = self._pc_factory()
        self._pc = pc

        @pc.on("track")
        def _on_track(track):  # pragma: no cover - exercised by the live test
            if getattr(track, "kind", None) == "video":
                asyncio.ensure_future(self._pump(track))

        return pc

    async def _pump(self, track) -> None:  # pragma: no cover - live test only
        while True:
            try:
                frame = await track.recv()
            except Exception:
                break
            self._sink.push(frame)

    async def handle_offer(self, sdp: str) -> dict:
        pc = self._ensure_pc()
        await pc.setRemoteDescription(self._remote_desc(sdp))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        return {"type": "webrtc-answer", "sdp": pc.localDescription.sdp}

    async def add_ice(self, candidate: Optional[dict]) -> None:
        if not candidate:
            return  # None / empty = end-of-candidates
        pc = self._ensure_pc()
        await pc.addIceCandidate(self._parse_candidate(candidate))

    async def close(self) -> None:
        if self._pc is not None:
            await self._pc.close()
            self._pc = None
        self._sink.clear()

    # -- helpers; aiortc types imported lazily so unit tests stay hermetic ----

    def _remote_desc(self, sdp: str):
        try:
            from aiortc import RTCSessionDescription
            return RTCSessionDescription(sdp=sdp, type="offer")
        except ImportError:
            return _Description(sdp=sdp, type_="offer")

    def _parse_candidate(self, candidate: dict):
        try:
            from aiortc.sdp import candidate_from_sdp
            cand = candidate_from_sdp(candidate["candidate"].split(":", 1)[1])
            cand.sdpMid = candidate.get("sdpMid")
            cand.sdpMLineIndex = candidate.get("sdpMLineIndex")
            return cand
        except ImportError:
            return candidate  # fake peer in unit tests records it verbatim
```

- [ ] **Step 4: Run test to verify it passes**

Run: `conda run -n eeg python -m pytest signal-engine/tests/test_webrtc_receiver.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/webrtc_receiver.py signal-engine/tests/test_webrtc_receiver.py
git commit -m "feat(vision): add aiortc WebRTCReceiver with injectable peer"
```

---

## Task 3: Sidecar WS signaling dispatch + wiring

Route `webrtc-*` frames (keyed on `type`, not `cmd`) to the receiver, send the answer back on the same socket, and construct the receiver in `run_ws_server.py` without reordering boot.

**Files:**
- Modify: `signal-engine/server/ws_server.py` (constructor + `_handle_message` + new `_handle_signaling`)
- Modify: `signal-engine/run_ws_server.py` (construct sink + receiver, pass to server)
- Test: `signal-engine/tests/test_ws_server_signaling.py`

**Interfaces:**
- Consumes: `WebRTCReceiver` (Task 2).
- Produces: `NeuroReachWSServer(..., webrtc_receiver=None)`; on `{"type":"webrtc-offer","sdp":...}` replies `{"type":"webrtc-answer","sdp":...}`; on `{"type":"webrtc-ice","candidate":...}` calls `receiver.add_ice`.

- [ ] **Step 1: Write the failing test**

```python
# signal-engine/tests/test_ws_server_signaling.py
import asyncio
import json

from server.ws_server import NeuroReachWSServer


class FakeReceiver:
    def __init__(self):
        self.offers = []
        self.ices = []

    async def handle_offer(self, sdp):
        self.offers.append(sdp)
        return {"type": "webrtc-answer", "sdp": f"answer:{sdp}"}

    async def add_ice(self, candidate):
        self.ices.append(candidate)

    async def close(self):
        pass


class FakeWebSocket:
    def __init__(self):
        self.sent = []

    async def send(self, raw):
        self.sent.append(raw)


def _make_server(receiver):
    # scoring_service is unused on the signaling path; None is fine here.
    return NeuroReachWSServer(
        scoring_service=None, host="localhost", port=0, webrtc_receiver=receiver
    )


def test_offer_gets_answer_on_same_socket():
    rx = FakeReceiver()
    srv = _make_server(rx)
    ws = FakeWebSocket()

    asyncio.run(srv._handle_message(ws, json.dumps({"type": "webrtc-offer", "sdp": "S"})))

    assert rx.offers == ["S"]
    assert json.loads(ws.sent[0]) == {"type": "webrtc-answer", "sdp": "answer:S"}


def test_ice_forwarded_to_receiver():
    rx = FakeReceiver()
    srv = _make_server(rx)
    ws = FakeWebSocket()

    asyncio.run(
        srv._handle_message(ws, json.dumps({"type": "webrtc-ice", "candidate": {"candidate": "c"}}))
    )

    assert rx.ices == [{"candidate": "c"}]


def test_signaling_without_receiver_is_silent_noop():
    srv = _make_server(None)
    ws = FakeWebSocket()
    asyncio.run(srv._handle_message(ws, json.dumps({"type": "webrtc-offer", "sdp": "S"})))
    # no receiver -> no answer, no crash, no "unknown command" error
    assert ws.sent == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg python -m pytest signal-engine/tests/test_ws_server_signaling.py -v`
Expected: FAIL — `TypeError: __init__() got an unexpected keyword argument 'webrtc_receiver'`

- [ ] **Step 3: Write minimal implementation**

In `signal-engine/server/ws_server.py`, add the constructor parameter. Find the `__init__` signature (near the top of the class) and add `webrtc_receiver=None`, storing `self.webrtc_receiver = webrtc_receiver`. Then add a `type`-based branch at the top of `_handle_message` (before the `cmd` lookup) and a handler method:

```python
# in __init__ signature, add parameter:
#     webrtc_receiver=None,
# and in the body:
        self.webrtc_receiver = webrtc_receiver

    _SIGNALING_TYPES = {"webrtc-offer", "webrtc-answer", "webrtc-ice"}

    async def _handle_message(self, websocket, raw) -> None:
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            await self._send(websocket, {"type": "error", "message": "invalid json"})
            return
        msg_type = data.get("type") if isinstance(data, dict) else None
        if msg_type in self._SIGNALING_TYPES:
            await self._handle_signaling(websocket, data)
            return
        cmd = data.get("cmd") if isinstance(data, dict) else None
        handler = self._dispatch.get(cmd)
        if handler is None:
            await self._send(
                websocket, {"type": "error", "message": f"unknown command: {cmd}"}
            )
            return
        await handler(websocket, data)

    async def _handle_signaling(self, websocket, data) -> None:
        rx = self.webrtc_receiver
        if rx is None:
            return  # standalone / no camera path: silently ignore
        if data["type"] == "webrtc-offer":
            answer = await rx.handle_offer(data["sdp"])
            await self._send(websocket, answer)
        elif data["type"] == "webrtc-ice":
            await rx.add_ice(data.get("candidate"))
        # webrtc-answer from patient is a no-op (patient is the offerer)
```

Then wire the receiver in `signal-engine/run_ws_server.py`. Add imports and construct the sink + receiver **after** the scoring service is built (preserving the baseline-before-simulator order), then pass it to the server:

```python
# add near the other imports:
from vision.frame_sink import VideoFrameSink
from vision.webrtc_receiver import WebRTCReceiver

# in main(), AFTER the scoring service (`svc`) and simulator (`sim`) are built,
# BEFORE constructing the server:
    frame_sink = VideoFrameSink()
    receiver = WebRTCReceiver(frame_sink)

    srv = NeuroReachWSServer(
        svc,
        host="localhost",
        port=8765,
        broadcast_hz=20.0,
        session_controller=sim,
        webrtc_receiver=receiver,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `conda run -n eeg python -m pytest signal-engine/tests/test_ws_server_signaling.py signal-engine/tests/test_ws_server.py -v`
Expected: PASS (3 new + existing ws_server tests still green)

- [ ] **Step 5: Commit**

```bash
git add signal-engine/server/ws_server.py signal-engine/run_ws_server.py signal-engine/tests/test_ws_server_signaling.py
git commit -m "feat(server): dispatch webrtc signaling to the aiortc receiver"
```

---

## Task 4: Live aiortc loopback (opt-in integration)

Prove the real `aiortc` peer answers a real offer and decodes frames into the sink. Skipped on CI (matches the on-head skip pattern).

**Files:**
- Modify: `signal-engine/environment.yml` or `signal-engine/requirements.txt` (add `aiortc`) — whichever the repo uses.
- Test: `signal-engine/tests/test_webrtc_live.py`

**Interfaces:**
- Consumes: `WebRTCReceiver` (Task 2), real `aiortc`.
- Produces: nothing (verification only).

- [ ] **Step 1: Add the dependency**

Check which file pins Python deps: `ls signal-engine/*.yml signal-engine/*.txt 2>/dev/null`. Add `aiortc` to it. Then install into the env:

Run: `conda run -n eeg python -m pip install aiortc`
Expected: installs `aiortc`, `av`, `cryptography`, `pyee` without error.

Verify importable:
Run: `conda run -n eeg python -c "import aiortc, av; print(aiortc.__version__)"`
Expected: prints a version string.

- [ ] **Step 2: Write the live test (starts skipped)**

```python
# signal-engine/tests/test_webrtc_live.py
"""Opt-in: real aiortc offerer <-> our receiver, in-process loopback.

Skipped by default (needs aiortc + av). Run explicitly with:
    conda run -n eeg python -m pytest signal-engine/tests/test_webrtc_live.py -m live
"""
import asyncio

import pytest

pytest.importorskip("aiortc")
pytest.importorskip("av")


@pytest.mark.live
def test_real_aiortc_offer_gets_answer_and_frames():
    import numpy as np
    from aiortc import RTCPeerConnection, RTCSessionDescription
    from aiortc.mediastreams import VideoStreamTrack
    from av import VideoFrame

    from vision.frame_sink import VideoFrameSink
    from vision.webrtc_receiver import WebRTCReceiver

    class ColorBars(VideoStreamTrack):
        async def recv(self):
            pts, time_base = await self.next_timestamp()
            arr = np.zeros((240, 320, 3), dtype=np.uint8)
            frame = VideoFrame.from_ndarray(arr, format="rgb24")
            frame.pts, frame.time_base = pts, time_base
            return frame

    async def run():
        sink = VideoFrameSink()
        rx = WebRTCReceiver(sink)  # real aiortc peer

        offerer = RTCPeerConnection()
        offerer.addTrack(ColorBars())
        offer = await offerer.createOffer()
        await offerer.setLocalDescription(offer)

        answer = await rx.handle_offer(offerer.localDescription.sdp)
        await offerer.setRemoteDescription(
            RTCSessionDescription(sdp=answer["sdp"], type="answer")
        )

        # let a few frames flow
        for _ in range(50):
            if sink.frame_count > 0:
                break
            await asyncio.sleep(0.1)

        assert sink.frame_count > 0
        await rx.close()
        await offerer.close()

    asyncio.run(run())
```

- [ ] **Step 3: Register the `live` marker if not present**

Check `signal-engine/pytest.ini` / `pyproject.toml` / `conftest.py` for a `markers` entry. If `live` is not registered, add under `[pytest] markers` (or the existing markers block): `live: opt-in tests needing real hardware/heavy deps (skipped on CI)`.

Confirm default collection skips it:
Run: `conda run -n eeg python -m pytest signal-engine/tests/ -m "not live" -q`
Expected: full suite passes; the live test is deselected.

- [ ] **Step 4: Run the live test explicitly to verify the real path**

Run: `conda run -n eeg python -m pytest signal-engine/tests/test_webrtc_live.py -m live -v`
Expected: PASS — `sink.frame_count > 0`.

- [ ] **Step 5: Commit**

```bash
git add signal-engine/tests/test_webrtc_live.py signal-engine/environment.yml signal-engine/requirements.txt signal-engine/pytest.ini
git commit -m "test(vision): real-aiortc loopback (opt-in live) + add aiortc dep"
```

---

## Task 5: SignalingRelay (console main)

A console↔sidecar WS carrier for `webrtc-*` frames, modeled on `createScoreRelay` but bidirectional. Injectable socket for tests.

**Files:**
- Create: `clinician-console/src/main/lan/signalingRelay.ts`
- Test: `clinician-console/src/main/lan/signalingRelay.test.ts`

**Interfaces:**
- Consumes: `RelaySocket` type from `./scoreRelay`.
- Produces:
  ```ts
  createSignalingRelay(opts: {
    sidecarWsUrl: string;
    createSocket: (url: string) => RelaySocket;
    sendToPatient: (raw: string) => void;
    scheduler?: (fn: () => void, ms: number) => void;
    reconnectMs?: number;
  }) => { connect(): void; sendToSidecar(raw: string): void; stop(): void };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// clinician-console/src/main/lan/signalingRelay.test.ts
import { describe, it, expect, vi } from "vitest";
import { createSignalingRelay } from "./signalingRelay";
import type { RelaySocket } from "./scoreRelay";

function fakeSocket(): RelaySocket & { sent: string[] } {
  return {
    onmessage: null,
    onclose: null,
    onopen: null,
    sent: [],
    send(raw: string) {
      (this as any).sent.push(raw);
    },
    close() {
      this.onclose?.();
    },
  };
}

describe("signalingRelay", () => {
  it("forwards sidecar webrtc frames to the patient", () => {
    const sidecar = fakeSocket();
    const toPatient = vi.fn();
    const relay = createSignalingRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => sidecar,
      sendToPatient: toPatient,
    });
    relay.connect();

    sidecar.onmessage?.({ data: JSON.stringify({ type: "webrtc-answer", sdp: "A" }) });

    expect(toPatient).toHaveBeenCalledWith(JSON.stringify({ type: "webrtc-answer", sdp: "A" }));
  });

  it("ignores non-signaling sidecar frames (e.g. intent_score)", () => {
    const sidecar = fakeSocket();
    const toPatient = vi.fn();
    const relay = createSignalingRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => sidecar,
      sendToPatient: toPatient,
    });
    relay.connect();
    sidecar.onmessage?.({ data: JSON.stringify({ type: "intent_score", intent_score: 5 }) });
    expect(toPatient).not.toHaveBeenCalled();
  });

  it("forwards patient frames to the sidecar", () => {
    const sidecar = fakeSocket();
    const relay = createSignalingRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => sidecar,
      sendToPatient: vi.fn(),
    });
    relay.connect();

    relay.sendToSidecar(JSON.stringify({ type: "webrtc-offer", sdp: "O" }));

    expect(sidecar.sent).toContain(JSON.stringify({ type: "webrtc-offer", sdp: "O" }));
  });

  it("reconnects on close and stops cleanly", () => {
    const sockets: (RelaySocket & { sent: string[] })[] = [];
    const schedule = vi.fn((fn: () => void) => fn());
    const relay = createSignalingRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => {
        const s = fakeSocket();
        sockets.push(s);
        return s;
      },
      sendToPatient: vi.fn(),
      scheduler: schedule,
    });
    relay.connect();
    sockets[0].onclose?.();
    expect(sockets.length).toBe(2); // reconnected
    relay.stop();
    sockets[1].onclose?.();
    expect(sockets.length).toBe(2); // no reconnect after stop
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lan/signalingRelay.test.ts`
Expected: FAIL — cannot find module `./signalingRelay`.

- [ ] **Step 3: Write minimal implementation**

```ts
// clinician-console/src/main/lan/signalingRelay.ts
import type { RelaySocket } from "./scoreRelay";

const SIGNALING_TYPES = new Set(["webrtc-offer", "webrtc-answer", "webrtc-ice"]);

export type SignalingRelayOptions = {
  sidecarWsUrl: string;
  createSocket: (url: string) => RelaySocket;
  sendToPatient: (raw: string) => void;
  scheduler?: (fn: () => void, ms: number) => void;
  reconnectMs?: number;
};

// Bidirectional carrier: patient webrtc-* -> sidecar, sidecar webrtc-* -> patient.
// Kept separate from scoreRelay (one-way intent_score) to preserve one clear
// responsibility per relay.
export function createSignalingRelay(opts: SignalingRelayOptions) {
  const schedule = opts.scheduler ?? ((fn, ms) => setTimeout(fn, ms));
  const reconnectMs = opts.reconnectMs ?? 1000;
  let socket: RelaySocket | null = null;
  let stopped = false;

  function open() {
    const s = opts.createSocket(opts.sidecarWsUrl);
    socket = s;
    s.onmessage = (ev) => {
      const raw = String(ev.data);
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (parsed && SIGNALING_TYPES.has(parsed.type)) opts.sendToPatient(raw);
    };
    s.onclose = () => {
      socket = null;
      if (stopped) return;
      schedule(open, reconnectMs);
    };
  }

  return {
    connect() {
      stopped = false;
      open();
    },
    sendToSidecar(raw: string) {
      socket?.send?.(raw);
    },
    stop() {
      stopped = true;
      socket?.close();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd clinician-console && npx vitest run src/main/lan/signalingRelay.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/main/lan/signalingRelay.ts clinician-console/src/main/lan/signalingRelay.test.ts
git commit -m "feat(console): add bidirectional signaling relay to sidecar"
```

---

## Task 6: Wire the real relay into lanServer; remove the echo stub

Replace the `handleSignalingMessage` echo stub path with the real relay, managed on the same lifecycle as `scoreRelay`.

**Files:**
- Modify: `clinician-console/src/main/lan/signaling.ts` (drop `handleSignalingMessage`; keep `isSignalingMessage` + `SignalingMessage`)
- Modify: `clinician-console/src/main/lan/lanServer.ts` (import, field, create-on-pair, forward, teardown)
- Modify: `clinician-console/src/main/lan/signaling.test.ts` (remove stub-behavior tests)
- Test: extend `clinician-console/src/main/lan/lanServer.test.ts`

**Interfaces:**
- Consumes: `createSignalingRelay` (Task 5), `isSignalingMessage` (existing).
- Produces: no new exported API; `LanServer` now forwards patient signaling to the sidecar and sidecar signaling back.

- [ ] **Step 1: Write the failing test**

Add to `clinician-console/src/main/lan/lanServer.test.ts`. Follow the file's existing harness for constructing a `LanServer` with injected `createSidecarSocket` and simulating a paired patient socket (mirror the existing scoreRelay tests). The new test asserts a paired patient's offer reaches the sidecar socket:

```ts
it("relays a paired patient's webrtc-offer to the sidecar", async () => {
  // Arrange: start server, mint a code, connect+pair a fake patient socket,
  // using the same injected sidecar-socket capture the scoreRelay tests use.
  // (Reuse the existing test helpers in this file.)
  const { server, sidecarSockets, connectPairedPatient } = setupPairedServer();
  const patient = await connectPairedPatient();

  patient.emit("message", JSON.stringify({ type: "webrtc-offer", sdp: "O" }));

  const sidecar = sidecarSockets.at(-1)!;
  expect(sidecar.sent).toContain(JSON.stringify({ type: "webrtc-offer", sdp: "O" }));
});

it("relays a sidecar webrtc-answer back to the paired patient", async () => {
  const { sidecarSockets, connectPairedPatient } = setupPairedServer();
  const patient = await connectPairedPatient();
  const sidecar = sidecarSockets.at(-1)!;

  sidecar.onmessage?.({ data: JSON.stringify({ type: "webrtc-answer", sdp: "A" }) });

  expect(patient.sent).toContain(JSON.stringify({ type: "webrtc-answer", sdp: "A" }));
});
```

> If `setupPairedServer`/`connectPairedPatient` helpers don't already exist in the file, factor them from the existing scoreRelay test's setup (same socket-injection pattern) so both suites share one harness. Do not invent new injection seams — reuse `createSidecarSocket`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lan/lanServer.test.ts`
Expected: FAIL — offer not forwarded (stub still echoes locally; no sidecar send).

- [ ] **Step 3: Implement**

In `clinician-console/src/main/lan/signaling.ts`, delete `handleSignalingMessage` and its `S1 stub` comment. Keep `SignalingMessage`, `SIGNALING_TYPES`, and `isSignalingMessage`.

In `clinician-console/src/main/lan/lanServer.ts`:

1. Update the import:
```ts
import { isSignalingMessage } from "./signaling";
import { createSignalingRelay } from "./signalingRelay";
```
2. Add a field beside `relay`:
```ts
  private signalingRelay: ReturnType<typeof createSignalingRelay> | null = null;
```
3. In `onConnection`, replace the stub branch (the `if (isSignalingMessage(msg)) { handleSignalingMessage(...) }` block) with a forward to the sidecar:
```ts
      if (isSignalingMessage(msg)) {
        this.signalingRelay?.sendToSidecar(data.toString());
        return;
      }
```
4. In `handlePair`, after the `scoreRelay` is created, create the signaling relay bound to this patient socket:
```ts
    this.signalingRelay?.stop();
    this.signalingRelay = createSignalingRelay({
      sidecarWsUrl: this.opts.sidecarWsUrl,
      createSocket: this.opts.createSidecarSocket,
      sendToPatient: (raw) => {
        if (this.patientSocket?.readyState === WebSocket.OPEN) this.patientSocket.send(raw);
      },
    });
    this.signalingRelay.connect();
```
5. In the `ws.on("close")` handler and in `endSession()`, tear it down alongside `relay`:
```ts
    this.signalingRelay?.stop();
    this.signalingRelay = null;
```

- [ ] **Step 4: Run the full console suite**

Run: `cd clinician-console && npm run test`
Expected: PASS — new relay tests green; the removed stub tests are gone; no other regressions.

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/main/lan/signaling.ts clinician-console/src/main/lan/lanServer.ts clinician-console/src/main/lan/signaling.test.ts clinician-console/src/main/lan/lanServer.test.ts
git commit -m "feat(console): relay real webrtc signaling to sidecar, drop echo stub"
```

---

## Task 7: Patient signaling channel (lanClient + usePatientLink)

Let the single paired socket carry signaling: expose an outbound `send` and route inbound `webrtc-*` frames to a subscriber.

**Files:**
- Create: `patient-web/src/net/signaling.ts` (mirror of the console contract)
- Modify: `patient-web/src/net/lanClient.ts` (add `onSignaling`, return `send`)
- Modify: `patient-web/src/net/usePatientLink.ts` (expose `sendSignaling` + `subscribeSignaling`)
- Test: `patient-web/src/net/signaling.test.ts`, extend `patient-web/src/net/usePatientLink.test.tsx`

**Interfaces:**
- Produces:
  - `patient-web/src/net/signaling.ts`: `type SignalingMessage` (same union), `isSignalingMessage(msg): msg is SignalingMessage`.
  - `lanClient` return gains `send(raw: string): void`; `LanClientOptions` gains `onSignaling?: (msg: SignalingMessage) => void`.
  - `usePatientLink` return type `PatientLink` gains `sendSignaling: (msg: SignalingMessage) => void` and `subscribeSignaling: (fn: (msg: SignalingMessage) => void) => void`.

- [ ] **Step 1: Write the failing tests**

```ts
// patient-web/src/net/signaling.test.ts
import { describe, it, expect } from "vitest";
import { isSignalingMessage } from "./signaling";

describe("isSignalingMessage", () => {
  it("accepts webrtc frames", () => {
    expect(isSignalingMessage({ type: "webrtc-offer", sdp: "x" })).toBe(true);
    expect(isSignalingMessage({ type: "webrtc-answer", sdp: "x" })).toBe(true);
    expect(isSignalingMessage({ type: "webrtc-ice", candidate: null })).toBe(true);
  });
  it("rejects other frames", () => {
    expect(isSignalingMessage({ type: "intent_score" })).toBe(false);
    expect(isSignalingMessage({})).toBe(false);
  });
});
```

Add to `patient-web/src/net/usePatientLink.test.tsx` (reuse its existing fake-socket harness):

```ts
it("routes inbound webrtc frames to a signaling subscriber", async () => {
  // render usePatientLink with a code + injected fake socket (as existing tests do)
  const received: any[] = [];
  link.subscribeSignaling((m) => received.push(m));
  // simulate the paired socket delivering an answer
  fakeSocket.onmessage?.({ data: JSON.stringify({ type: "webrtc-answer", sdp: "A" }) });
  expect(received).toEqual([{ type: "webrtc-answer", sdp: "A" }]);
});

it("sendSignaling writes to the paired socket", async () => {
  link.sendSignaling({ type: "webrtc-offer", sdp: "O" });
  expect(fakeSocket.sent).toContain(JSON.stringify({ type: "webrtc-offer", sdp: "O" }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd patient-web && npx vitest run src/net/signaling.test.ts src/net/usePatientLink.test.tsx`
Expected: FAIL — `./signaling` missing; `subscribeSignaling`/`sendSignaling` undefined.

- [ ] **Step 3: Implement**

Create `patient-web/src/net/signaling.ts`:
```ts
export type SignalingMessage =
  | { type: "webrtc-offer"; sdp: string }
  | { type: "webrtc-answer"; sdp: string }
  | { type: "webrtc-ice"; candidate: unknown };

const SIGNALING_TYPES = new Set(["webrtc-offer", "webrtc-answer", "webrtc-ice"]);

export function isSignalingMessage(msg: { type?: string }): msg is SignalingMessage {
  return !!msg && typeof msg.type === "string" && SIGNALING_TYPES.has(msg.type);
}
```

In `patient-web/src/net/lanClient.ts`:
1. Import: `import { isSignalingMessage, type SignalingMessage } from "./signaling";`
2. Add to `LanClientOptions`: `onSignaling?: (msg: SignalingMessage) => void;`
3. In `s.onmessage`, add a branch after the `intent_score` one:
```ts
      else if (isSignalingMessage(msg)) opts.onSignaling?.(msg);
```
4. Add `send` to the returned object:
```ts
  return {
    connect() {
      open();
    },
    send(raw: string) {
      socket?.send?.(raw);
    },
    stop() {
      socket?.close();
    },
  };
```

In `patient-web/src/net/usePatientLink.ts`:
1. Import the type: `import { isSignalingMessage, type SignalingMessage } from "./signaling";` (isSignalingMessage only if referenced; the type is needed for the return shape).
2. Add refs above the effect:
```ts
  const clientRef = useRef<ReturnType<typeof createLanClient> | null>(null);
  const signalingSubRef = useRef<((m: SignalingMessage) => void) | null>(null);
```
3. In the `createLanClient({...})` options, add:
```ts
        onSignaling: (m) => signalingSubRef.current?.(m),
```
4. After `client = createLanClient({...})`, set `clientRef.current = client;`. In cleanup, also `clientRef.current = null;`.
5. Extend the `PatientLink` type and the returned object:
```ts
// type:
  sendSignaling: (msg: SignalingMessage) => void;
  subscribeSignaling: (fn: (msg: SignalingMessage) => void) => void;

// return:
  return {
    store: storeRef.current,
    conn,
    session,
    error,
    sendSignaling: (msg) => clientRef.current?.send(JSON.stringify(msg)),
    subscribeSignaling: (fn) => {
      signalingSubRef.current = fn;
    },
  };
```

- [ ] **Step 4: Run the full patient suite**

Run: `cd patient-web && npm run test`
Expected: PASS — new signaling + link tests green, existing suite unaffected.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/net/signaling.ts patient-web/src/net/lanClient.ts patient-web/src/net/usePatientLink.ts patient-web/src/net/signaling.test.ts patient-web/src/net/usePatientLink.test.tsx
git commit -m "feat(patient): carry webrtc signaling over the paired lan socket"
```

---

## Task 8: cameraPublisher (patient-web)

Pure module: acquire the camera, build an `RTCPeerConnection`, offer, handle the answer + ICE. `getUserMedia`/`RTCPeerConnection` injected for jsdom.

**Files:**
- Create: `patient-web/src/net/cameraPublisher.ts`
- Test: `patient-web/src/net/cameraPublisher.test.ts`

**Interfaces:**
- Consumes: `SignalingMessage` (Task 7).
- Produces:
  ```ts
  createCameraPublisher(deps: {
    getStream: () => Promise<MediaStream>;
    createPeer: () => RTCPeerConnection;
    send: (msg: SignalingMessage) => void;
  }) => {
    start(): Promise<void>;
    handleSignaling(msg: SignalingMessage): Promise<void>;
    stop(): void;
  };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// patient-web/src/net/cameraPublisher.test.ts
import { describe, it, expect, vi } from "vitest";
import { createCameraPublisher } from "./cameraPublisher";

function fakePeer() {
  return {
    localDescription: null as any,
    remote: null as any,
    added: [] as any[],
    tracks: [] as any[],
    onicecandidate: null as any,
    addTrack(t: any) {
      this.tracks.push(t);
    },
    async createOffer() {
      return { type: "offer", sdp: "OFFER" };
    },
    async setLocalDescription(d: any) {
      this.localDescription = d;
    },
    async setRemoteDescription(d: any) {
      this.remote = d;
    },
    async addIceCandidate(c: any) {
      this.added.push(c);
    },
    close: vi.fn(),
  };
}

function fakeStream() {
  const track = { stop: vi.fn(), kind: "video" };
  return { getTracks: () => [track], _track: track } as any;
}

describe("cameraPublisher", () => {
  it("offers after acquiring the stream", async () => {
    const peer = fakePeer();
    const stream = fakeStream();
    const send = vi.fn();
    const pub = createCameraPublisher({
      getStream: async () => stream,
      createPeer: () => peer as any,
      send,
    });

    await pub.start();

    expect(peer.tracks).toContain(stream._track);
    expect(peer.localDescription).toEqual({ type: "offer", sdp: "OFFER" });
    expect(send).toHaveBeenCalledWith({ type: "webrtc-offer", sdp: "OFFER" });
  });

  it("applies an inbound answer", async () => {
    const peer = fakePeer();
    const pub = createCameraPublisher({
      getStream: async () => fakeStream(),
      createPeer: () => peer as any,
      send: vi.fn(),
    });
    await pub.start();

    await pub.handleSignaling({ type: "webrtc-answer", sdp: "ANS" });

    expect(peer.remote).toEqual({ type: "answer", sdp: "ANS" });
  });

  it("adds inbound ice candidates and ignores null", async () => {
    const peer = fakePeer();
    const pub = createCameraPublisher({
      getStream: async () => fakeStream(),
      createPeer: () => peer as any,
      send: vi.fn(),
    });
    await pub.start();

    await pub.handleSignaling({ type: "webrtc-ice", candidate: { candidate: "c" } });
    await pub.handleSignaling({ type: "webrtc-ice", candidate: null });

    expect(peer.added).toEqual([{ candidate: "c" }]);
  });

  it("emits local ice candidates via send", async () => {
    const peer = fakePeer();
    const send = vi.fn();
    const pub = createCameraPublisher({
      getStream: async () => fakeStream(),
      createPeer: () => peer as any,
      send,
    });
    await pub.start();

    peer.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: "local" }) } });

    expect(send).toHaveBeenCalledWith({ type: "webrtc-ice", candidate: { candidate: "local" } });
  });

  it("stop() stops tracks and closes the peer", async () => {
    const peer = fakePeer();
    const stream = fakeStream();
    const pub = createCameraPublisher({
      getStream: async () => stream,
      createPeer: () => peer as any,
      send: vi.fn(),
    });
    await pub.start();
    pub.stop();

    expect(stream._track.stop).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd patient-web && npx vitest run src/net/cameraPublisher.test.ts`
Expected: FAIL — cannot find module `./cameraPublisher`.

- [ ] **Step 3: Implement**

```ts
// patient-web/src/net/cameraPublisher.ts
import type { SignalingMessage } from "./signaling";

export type CameraPublisherDeps = {
  getStream: () => Promise<MediaStream>;
  createPeer: () => RTCPeerConnection;
  send: (msg: SignalingMessage) => void;
};

/**
 * Publishes the patient camera to the sidecar's aiortc receiver. Patient is the
 * offerer/send-only peer; SDP + trickled ICE go out via `send` (over the paired
 * LAN socket), and the sidecar's answer/ICE come back through `handleSignaling`.
 * getUserMedia and RTCPeerConnection are injected so jsdom tests use fakes.
 */
export function createCameraPublisher(deps: CameraPublisherDeps) {
  let pc: RTCPeerConnection | null = null;
  let stream: MediaStream | null = null;

  return {
    async start(): Promise<void> {
      stream = await deps.getStream();
      const peer = deps.createPeer();
      pc = peer;
      stream.getTracks().forEach((t) => peer.addTrack(t, stream as MediaStream));
      peer.onicecandidate = (e) => {
        if (e.candidate) deps.send({ type: "webrtc-ice", candidate: e.candidate.toJSON() });
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      deps.send({ type: "webrtc-offer", sdp: offer.sdp as string });
    },

    async handleSignaling(msg: SignalingMessage): Promise<void> {
      if (!pc) return;
      if (msg.type === "webrtc-answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp } as RTCSessionDescriptionInit);
      } else if (msg.type === "webrtc-ice" && msg.candidate) {
        await pc.addIceCandidate(msg.candidate as RTCIceCandidateInit);
      }
    },

    stop(): void {
      stream?.getTracks().forEach((t) => t.stop());
      pc?.close();
      pc = null;
      stream = null;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd patient-web && npx vitest run src/net/cameraPublisher.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/net/cameraPublisher.ts patient-web/src/net/cameraPublisher.test.ts
git commit -m "feat(patient): add cameraPublisher webrtc offerer"
```

---

## Task 9: Mount the publisher in App (useCameraPublish)

Start publishing when the device is paired (a `?c=` code is present) and the link is open; stop on unmount/session end. Wires Tasks 7 + 8 together.

**Files:**
- Create: `patient-web/src/net/useCameraPublish.ts`
- Modify: `patient-web/src/App.tsx` (mount the hook)
- Test: `patient-web/src/net/useCameraPublish.test.tsx`

**Interfaces:**
- Consumes: `PatientLink` (`sendSignaling`, `subscribeSignaling` from Task 7), `createCameraPublisher` (Task 8).
- Produces: `useCameraPublish(link: PatientLink, enabled: boolean): void`.

> **Scope note:** V2-2a's publisher owns its own camera stream. The existing `CameraFeed` local preview also calls `getUserMedia`; unifying them onto one stream is V2-2b's framing-check step (which owns the session camera). To avoid a double-acquire on the real device in the interim, this hook is gated to only run for paired LAN sessions (`enabled`), and the calibration/warm-up preview is unchanged for local/dev.

- [ ] **Step 1: Write the failing test**

```tsx
// patient-web/src/net/useCameraPublish.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const startSpy = vi.fn();
const stopSpy = vi.fn();
let lastSignalingHandler: ((m: any) => void) | null = null;

vi.mock("./cameraPublisher", () => ({
  createCameraPublisher: (deps: any) => {
    return {
      start: async () => {
        startSpy();
      },
      handleSignaling: deps.__capture ? deps.__capture : vi.fn(),
      stop: stopSpy,
    };
  },
}));

import { useCameraPublish } from "./useCameraPublish";

function fakeLink(overrides: any = {}) {
  return {
    store: {} as any,
    conn: "open",
    session: { patientFirstName: "M", affectedSide: "left", mode: "band_power_only" },
    error: null,
    sendSignaling: vi.fn(),
    subscribeSignaling: (fn: any) => {
      lastSignalingHandler = fn;
    },
    ...overrides,
  };
}

describe("useCameraPublish", () => {
  beforeEach(() => {
    startSpy.mockClear();
    stopSpy.mockClear();
    lastSignalingHandler = null;
  });

  it("starts publishing when enabled", () => {
    renderHook(() => useCameraPublish(fakeLink() as any, true));
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("does not start when disabled", () => {
    renderHook(() => useCameraPublish(fakeLink() as any, false));
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("stops publishing on unmount", () => {
    const { unmount } = renderHook(() => useCameraPublish(fakeLink() as any, true));
    unmount();
    expect(stopSpy).toHaveBeenCalled();
  });

  it("subscribes so inbound signaling reaches the publisher", () => {
    renderHook(() => useCameraPublish(fakeLink() as any, true));
    expect(lastSignalingHandler).toBeTypeOf("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd patient-web && npx vitest run src/net/useCameraPublish.test.tsx`
Expected: FAIL — cannot find module `./useCameraPublish`.

- [ ] **Step 3: Implement the hook**

```ts
// patient-web/src/net/useCameraPublish.ts
import { useEffect } from "react";
import type { PatientLink } from "./usePatientLink";
import { createCameraPublisher } from "./cameraPublisher";

/**
 * Mounts the camera publisher for paired LAN sessions. Acquires the camera and
 * publishes over the paired socket's signaling channel; tears down on unmount /
 * session end. A denied/absent camera resolves to no publish (EEG-only) without
 * throwing — the session continues.
 */
export function useCameraPublish(link: PatientLink, enabled: boolean): void {
  const { sendSignaling, subscribeSignaling } = link;

  useEffect(() => {
    if (!enabled) return;

    const publisher = createCameraPublisher({
      getStream: () =>
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }),
      createPeer: () => new RTCPeerConnection({ iceServers: [] }), // host candidates only
      send: sendSignaling,
    });

    subscribeSignaling((msg) => {
      void publisher.handleSignaling(msg);
    });

    let cancelled = false;
    publisher.start().catch(() => {
      // no camera / permission denied / no RTCPeerConnection -> stay EEG-only
    });

    return () => {
      cancelled = true;
      void cancelled;
      publisher.stop();
    };
  }, [enabled, sendSignaling, subscribeSignaling]);
}
```

- [ ] **Step 4: Mount in App and run tests**

In `patient-web/src/App.tsx`, after `const link = usePatientLink(code, wssUrl);` (line ~24), add:
```tsx
  useCameraPublish(link, Boolean(code) && link.conn === "open");
```
and the import at the top: `import { useCameraPublish } from "./net/useCameraPublish";`

Run: `cd patient-web && npm run test`
Expected: PASS — new hook tests green; `App.test.tsx` still green (jsdom has no `RTCPeerConnection`/`getUserMedia`, so `start()` rejects and is swallowed — no publish, no error).

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/net/useCameraPublish.ts patient-web/src/net/useCameraPublish.test.tsx patient-web/src/App.tsx
git commit -m "feat(patient): mount camera publisher for paired lan sessions"
```

---

## Task 10: Update docs/todos.md

Reflect V2-2a done; V2-2b/2-2c remain.

**Files:**
- Modify: `docs/todos.md`

- [ ] **Step 1: Read the maintenance protocol**

Open `docs/todos.md` §6 (Maintaining this document) and follow it — this is a status board, not a changelog.

- [ ] **Step 2: Edit**

- Milestone map: mark **V2-2a transport spine ✅** (add the sub-milestone), leave V2-2b/2-2c ⏳.
- `signal-engine/` section: add `vision/` (`VideoFrameSink`, `WebRTCReceiver`, aiortc dep, ws signaling dispatch) under Implemented; note MediaPipe/kinematic_score still absent (V2-2b).
- `clinician-console/` section: signaling is now a **real relay** (echo stub removed); camera-link health panel still pending (V2-2c).
- `patient-web/` section: **camera publish** (getUserMedia → WebRTC → sidecar) done; framing-check step + single-stream unification pending (V2-2b).
- Update test counts to the new totals from the runs in Tasks 3–9.

- [ ] **Step 3: Verify counts by running all suites**

```bash
conda run -n eeg python -m pytest signal-engine/tests/ -m "not live" -q
cd patient-web && npm run test
cd clinician-console && npm run test
```
Record the three passing totals into the board.

- [ ] **Step 4: Commit**

```bash
git add docs/todos.md
git commit -m "docs: mark V2-2a webrtc transport spine complete"
```

---

## Self-Review

**Spec coverage:**
- §4.3 signaling broker → Tasks 5, 6 (real relay), Task 3 (sidecar dispatch). ✅
- §7.2 patient getUserMedia → RTCPeerConnection → aiortc receiver → frames → sink → Tasks 8, 9, 2, 1. ✅
- Host-candidates-only / no STUN-TURN → Task 9 (`iceServers: []`), noted in constraints. ✅
- Single paired socket carries signaling → Task 7. ✅
- Camera-deny → EEG-only fallback (transport slice) → Task 9 (swallowed `start()` rejection). ✅
- Hermetic tests + opt-in live → Tasks 1–3, 5–9 mocked; Task 4 `@pytest.mark.live`. ✅
- Deferred (correctly out of scope): MediaPipe, kinematic_score, rest-pose/framing UI, fusion, health panel — these are V2-2b/2-2c per the design's non-goals.

**Placeholder scan:** No TBD/TODO; every code step carries full code. Task 6's `setupPairedServer` helper explicitly says to factor from the existing scoreRelay test harness (not invent a seam), because the exact helper shape depends on that file's current form — an intentional, bounded instruction, not a placeholder.

**Type consistency:** `SignalingMessage` union identical across `signaling.ts` (both apps) and the sidecar's `_SIGNALING_TYPES`. `WebRTCReceiver.handle_offer` returns `{"type":"webrtc-answer","sdp"}` — consumed verbatim by Task 3. `createSignalingRelay` `sendToSidecar`/`sendToPatient` names match their Task 6 call sites. `usePatientLink` `sendSignaling`/`subscribeSignaling` match Task 9's destructure. `createCameraPublisher` `start`/`handleSignaling`/`stop` match Task 9's usage.
