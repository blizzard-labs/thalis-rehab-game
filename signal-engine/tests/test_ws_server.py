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
        raw = ws.recv(timeout=2.0)
    data = json.loads(raw)
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
