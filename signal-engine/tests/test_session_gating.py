"""End-to-end: the mock+simulator stream floors while idle and rises after a
start_session command, proving the session gate drives IntentScore."""
from __future__ import annotations

import json
import time

import pytest
from websockets.sync.client import connect

from acquisition.mock_eeg_outlet import MockUnicornOutlet
from scoring.session_simulator import SessionSimulator
from server.ws_server import NeuroReachWSServer
from tests.test_scoring_service import make_scoring_service

HOST, PORT = "localhost", 8771
URI = f"ws://{HOST}:{PORT}"


@pytest.fixture()
def gated_server():
    outlet = MockUnicornOutlet(seed=13)
    outlet.start()
    time.sleep(0.3)
    service, _q, inlet = make_scoring_service(outlet)
    # Short arc so gameplay ERD is reached quickly in the test.
    sim = SessionSimulator(outlet, seed=1, settle_s=0.0, calib_s=0.0, step_s=0.2)
    server = NeuroReachWSServer(service, host=HOST, port=PORT, broadcast_hz=20.0, session_controller=sim)
    server.start_background()
    try:
        yield
    finally:
        sim.disarm()
        server.stop()
        inlet.close()
        outlet.stop()


def _count_frames(ws, duration_s):
    deadline = time.monotonic() + duration_s
    n = 0
    while time.monotonic() < deadline:
        try:
            raw = ws.recv(timeout=0.3)
        except TimeoutError:
            continue
        if json.loads(raw).get("type") == "intent_score":
            n += 1
    return n


def test_intent_score_streams_only_during_active_session(gated_server):
    with connect(URI) as ws:
        idle = _count_frames(ws, 1.5)
        ws.send(json.dumps({"cmd": "start_session"}))
        time.sleep(1.0)
        active = _count_frames(ws, 1.5)
        ws.send(json.dumps({"cmd": "end_session"}))
        _count_frames(ws, 0.6)  # drain any frames already in flight at end
        after = _count_frames(ws, 1.5)
    assert idle == 0, f"expected no frames before start_session, got {idle}"
    assert active > 10, f"expected active frames after start_session, got {active}"
    assert after == 0, f"expected streaming to stop after end_session, got {after}"
