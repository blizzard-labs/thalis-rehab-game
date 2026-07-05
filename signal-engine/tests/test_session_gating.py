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


def _mean_score(ws, duration_s):
    deadline = time.monotonic() + duration_s
    vals = []
    while time.monotonic() < deadline:
        try:
            raw = ws.recv(timeout=0.5)
        except TimeoutError:
            continue
        d = json.loads(raw)
        if d.get("type") == "intent_score":
            vals.append(d["intent_score"])
    return sum(vals) / len(vals) if vals else 0.0


def test_score_rises_only_after_start_session(gated_server):
    with connect(URI) as ws:
        idle = _mean_score(ws, 2.0)
        ws.send(json.dumps({"cmd": "start_session"}))
        # allow the arc + EMA to climb
        time.sleep(3.0)
        active = _mean_score(ws, 3.0)
    assert active > idle + 10.0, f"expected a clear rise; idle={idle:.1f} active={active:.1f}"
