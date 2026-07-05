"""Unit tests for the session-gating WS commands. These drive the command
coroutines directly (asyncio.run) with a fake websocket + fake controller, so no
live server / LSL / baseline calibration is needed."""
from __future__ import annotations

import asyncio
import json

from server.ws_server import NeuroReachWSServer


class FakeWs:
    def __init__(self):
        self.sent = []
    async def send(self, payload):
        self.sent.append(json.loads(payload))


class FakeController:
    def __init__(self):
        self.armed = False
    def arm(self):
        self.armed = True
    def disarm(self):
        self.armed = False
    def status(self):
        return {"armed": self.armed, "phase": "gameplay" if self.armed else "idle", "elapsed_s": 0.0}


def _server(controller):
    # scoring_service is never started in these unit tests (we only call the
    # command coroutines), so a bare object with the attributes touched by the
    # command path is enough.
    return NeuroReachWSServer(scoring_service=object(), session_controller=controller)


def test_start_session_arms_and_replies():
    ctrl = FakeController()
    srv = _server(ctrl)
    ws = FakeWs()
    asyncio.run(srv._handle_message(ws, json.dumps({"cmd": "start_session"})))
    assert ctrl.armed is True
    assert ws.sent[-1]["type"] == "session"
    assert ws.sent[-1]["armed"] is True


def test_end_session_disarms_and_replies():
    ctrl = FakeController()
    ctrl.armed = True
    srv = _server(ctrl)
    ws = FakeWs()
    asyncio.run(srv._handle_message(ws, json.dumps({"cmd": "end_session"})))
    assert ctrl.armed is False
    assert ws.sent[-1]["type"] == "session"
    assert ws.sent[-1]["armed"] is False


def test_session_command_without_controller_errors():
    srv = _server(None)
    ws = FakeWs()
    asyncio.run(srv._handle_message(ws, json.dumps({"cmd": "start_session"})))
    assert ws.sent[-1]["type"] == "error"
    assert "controller" in ws.sent[-1]["message"]
