"""Integration tests for the NeuroReachWSServer.

Driven by the MockUnicornOutlet (no headset). The server is started ONCE per
module (start_background) and shared by all tests — startup costs ~1 s for LSL
discovery + baseline calibration, so per-test restarts would be wasteful.

Uses the websockets *synchronous* client (``websockets.sync.client.connect``)
so the test body stays plain blocking code.
"""

from __future__ import annotations

import json
import time

import pytest
from websockets.sync.client import connect

from acquisition.mock_eeg_outlet import MockUnicornOutlet
from server.ws_server import NeuroReachWSServer

# Reuse the Prompt 3 dependency-wiring helper.
from tests.test_scoring_service import make_scoring_service

HOST = "localhost"
PORT = 8770  # off the default 8765 to avoid clashing with a running server
URI = f"ws://{HOST}:{PORT}"


# --------------------------------------------------------------------------- fixtures

@pytest.fixture(scope="module")
def ws_server():
    outlet = MockUnicornOutlet(seed=11)
    outlet.start()
    time.sleep(0.3)  # let LSL discovery settle before the inlet connects

    service, _out_q, inlet = make_scoring_service(outlet)
    server = NeuroReachWSServer(service, host=HOST, port=PORT, broadcast_hz=20.0)
    server.start_background()
    try:
        yield server
    finally:
        server.stop()
        inlet.close()
        outlet.stop()


def _collect(ws, duration_s: float):
    """Collect intent_score messages for ``duration_s`` seconds."""
    deadline = time.monotonic() + duration_s
    msgs = []
    while time.monotonic() < deadline:
        try:
            raw = ws.recv(timeout=0.5)
        except TimeoutError:
            continue
        data = json.loads(raw)
        if data.get("type") == "intent_score":
            msgs.append(data)
    return msgs


def _recv_type(ws, want_type: str, timeout_s: float):
    """Receive until a message of ``want_type`` arrives (ignoring score frames)."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        remaining = max(0.01, deadline - time.monotonic())
        try:
            raw = ws.recv(timeout=remaining)
        except TimeoutError:
            break
        data = json.loads(raw)
        if data.get("type") == want_type:
            return data
    return None


# --------------------------------------------------------------------------- tests

def test_connection_accepted(ws_server):
    with connect(URI) as ws:
        assert ws is not None  # connect() raises on failure; reaching here = OK


def test_broadcast_rate(ws_server):
    with connect(URI) as ws:
        msgs = _collect(ws, 3.0)
    # 20 Hz x 3 s = 60, allow ~15% scheduling jitter.
    assert 50 <= len(msgs) <= 70, f"expected 50-70 msgs in 3s, got {len(msgs)}"


def test_message_schema(ws_server):
    with connect(URI) as ws:
        data = _recv_type(ws, "intent_score", timeout_s=2.0)
    assert data is not None, "no intent_score frame received"
    for key in ("type", "intent_score", "erd_score", "is_artifact", "mode", "timestamp"):
        assert key in data, f"missing key: {key}"
    assert data["type"] == "intent_score"
    assert isinstance(data["intent_score"], float)
    assert 0.0 <= data["intent_score"] <= 100.0
    assert isinstance(data["timestamp"], float)
    assert abs(time.time() - data["timestamp"]) < 2.0, "timestamp not recent"


def test_multi_client_same_broadcast(ws_server):
    clients = [connect(URI) for _ in range(3)]
    counts = [0, 0, 0]
    try:
        # Drain all three within ONE shared window — collecting them
        # sequentially would let the idle sockets buffer and skew the counts.
        deadline = time.monotonic() + 1.0
        while time.monotonic() < deadline:
            for i, ws in enumerate(clients):
                try:
                    raw = ws.recv(timeout=0.02)
                except TimeoutError:
                    continue
                if json.loads(raw).get("type") == "intent_score":
                    counts[i] += 1
    finally:
        for ws in clients:
            ws.close()
    lo, hi = min(counts), max(counts)
    assert hi - lo <= 3, f"clients got uneven broadcasts: {counts}"


def test_client_disconnect_does_not_crash(ws_server):
    survivor = connect(URI)
    try:
        # An abrupt client connects, takes 5 messages, then drops mid-stream.
        victim = connect(URI)
        got = 0
        while got < 5:
            victim.recv(timeout=1.0)
            got += 1
        victim.close()  # abrupt close

        # Server keeps broadcasting to the survivor...
        assert len(_collect(survivor, 1.0)) > 0, "survivor stopped receiving"
    finally:
        survivor.close()

    # ...and still accepts a brand-new client afterwards.
    with connect(URI) as fresh:
        assert fresh.recv(timeout=2.0) is not None


def test_ping_pong(ws_server):
    with connect(URI) as ws:
        t0 = time.monotonic()
        ws.send(json.dumps({"cmd": "ping"}))
        pong = _recv_type(ws, "pong", timeout_s=1.0)
        elapsed = time.monotonic() - t0
    assert pong is not None, "no pong received"
    assert pong["type"] == "pong"
    assert isinstance(pong["timestamp"], float)
    assert elapsed < 0.2, f"pong took {elapsed * 1000:.0f}ms (>200ms)"


def test_unknown_command(ws_server):
    with connect(URI) as ws:
        ws.send(json.dumps({"cmd": "nonexistent"}))
        err = _recv_type(ws, "error", timeout_s=1.0)
    assert err is not None, "no error reply"
    assert err["type"] == "error"
    assert "nonexistent" in err["message"]


def test_zero_clients_runs_clean(ws_server):
    # No clients connected: the broadcast loop should keep ticking (skipping the
    # send) without crashing. Verify by sleeping, then confirming a client can
    # still connect and receive afterwards.
    time.sleep(2.0)
    with connect(URI) as ws:
        assert ws.recv(timeout=2.0) is not None


def test_eeg_quality_broadcast(ws_server):
    """Server broadcasts a separate eeg_quality frame (console C2 setup):
    per-channel contact verdicts + MI-channel trace, distinct from the score."""
    with connect(URI) as ws:
        data = _recv_type(ws, "eeg_quality", timeout_s=3.0)
    assert data is not None, "no eeg_quality frame received"
    assert data["type"] == "eeg_quality"
    assert isinstance(data["channels"], list) and len(data["channels"]) == 8
    for c in data["channels"]:
        assert set(c.keys()) >= {"label", "quality", "p2p"}
        assert c["quality"] in ("good", "check", "poor")
    assert "C3" in data["trace"] and len(data["trace"]["C3"]) > 0
    assert isinstance(data["timestamp"], float)


# ------------------------------------------------------- V2-2b kinematic fields

def test_intent_frame_carries_kinematic_fields(ws_server):
    with connect(URI) as ws:
        msgs = _collect(ws, 2.0)
    assert msgs, "no intent_score frame observed"
    assert "kinematic_score" in msgs[0]
    assert "compensation_flag" in msgs[0]


def test_calibrate_pose_without_worker_errors(ws_server):
    with connect(URI) as ws:
        ws.send(json.dumps({"cmd": "calibrate_pose"}))
        reply = _recv_type(ws, "error", 2.0)
    assert reply is not None
    assert "worker" in reply["message"]


# --------------------------------------------------- V2-2c vision_health frame

class _FakeVisionMonitor:
    def sample(self):
        return {"connection": "connected", "fps": 14.0,
                "kinematic_active": True, "degraded": False}


def test_vision_health_frame_broadcast():
    """A server with a VisionHealthMonitor broadcasts a clinician-only
    vision_health frame; the intent_score contract stays untouched."""
    outlet = MockUnicornOutlet(seed=13)
    outlet.start()
    time.sleep(0.3)
    service, _q, inlet = make_scoring_service(outlet)
    server = NeuroReachWSServer(
        service, host=HOST, port=8771, broadcast_hz=20.0,
        vision_health_monitor=_FakeVisionMonitor(), vision_health_hz=50.0,
    )
    server.start_background()
    try:
        with connect("ws://localhost:8771") as ws:
            frame = _recv_type(ws, "vision_health", timeout_s=2.0)
    finally:
        server.stop()
        inlet.close()
        outlet.stop()

    assert frame is not None, "no vision_health frame received"
    assert frame["type"] == "vision_health"
    assert frame["connection"] == "connected"
    assert frame["fps"] == 14.0
    assert frame["kinematic_active"] is True
    assert frame["degraded"] is False
    assert isinstance(frame["timestamp"], float)


def test_no_vision_health_without_monitor(ws_server):
    """The default server (no monitor) never emits a vision_health frame."""
    with connect(URI) as ws:
        got = _recv_type(ws, "vision_health", timeout_s=0.5)
    assert got is None


# --------------------------------------------------- camera_frame (console feed)

class _FakeSink:
    frame_count = 1

    def latest(self):
        return object()  # opaque av-frame stand-in; encode_jpeg is monkeypatched


class _FakeCamWorker:
    sink = _FakeSink()

    def latest_pose(self):
        import numpy as np
        from vision.types import PoseFrame
        return PoseFrame(pose=np.zeros((33, 4)), hands={"left": None, "right": None}, timestamp=0.0)


def test_camera_frame_broadcast(monkeypatch):
    """A server with a kinematic worker broadcasts a clinician-only camera_frame
    (JPEG + landmarks). Clinician-only: never gated, never reaches the patient."""
    monkeypatch.setattr("server.ws_server.encode_jpeg", lambda *a, **k: "AAAA")
    outlet = MockUnicornOutlet(seed=17)
    outlet.start()
    time.sleep(0.3)
    service, _q, inlet = make_scoring_service(outlet)
    server = NeuroReachWSServer(
        service, host=HOST, port=8772, broadcast_hz=20.0,
        kinematic_worker=_FakeCamWorker(), camera_hz=50.0,
    )
    server.start_background()
    try:
        with connect("ws://localhost:8772") as ws:
            frame = _recv_type(ws, "camera_frame", timeout_s=2.0)
    finally:
        server.stop()
        inlet.close()
        outlet.stop()

    assert frame is not None, "no camera_frame received"
    assert frame["jpeg"] == "AAAA"
    assert len(frame["landmarks"]["pose"]) == 33
    assert frame["landmarks"]["hands"]["left"] is None
    assert isinstance(frame["fps"], (int, float))
