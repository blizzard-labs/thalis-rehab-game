# Session-gated Simulated EEG (Dev Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a console-selected "Simulated EEG (dev)" mode whose canonical, session-gated data stream drives the full clinician-console ↔ patient-web pipeline end-to-end without a headset.

**Architecture:** A new `SessionSimulator` (Python) drives the existing `MockUnicornOutlet` through a realistic session arc, armed/disarmed via two new WebSocket commands on the *existing* inbound `cmd` dispatch. The sidecar boots idle (flat rest — baseline calibration stays clean); the console's `start-session`/`end-session` IPC also opens a persistent control socket to arm/disarm the simulator, and a Setup-screen toggle (in `PairingPanel`) carries a `source: "sim" | "live"` field.

**Tech Stack:** Python 3.10 (`conda run -n eeg`), pylsl, websockets, pytest · Electron + React + TypeScript + Vitest.

## Global Constraints

- Run all Python via `conda run -n eeg` from the repo root (conftest prepends `signal-engine/` to `sys.path`). Copy verbatim: `conda run -n eeg pytest signal-engine/tests/`.
- The 20 Hz `intent_score` JSON frame contract is FROZEN — do not change its keys or types. The shared `intentScoreMessage` parser is byte-identical across console/patient; do not touch it.
- `eeg_quality` frames are clinician-side only and must never reach the patient channel.
- Per-client command replies (`session`, `error`, `pong`, `status`) are sent to the requesting socket ONLY — never broadcast.
- Baseline invariant: `ERDCalculator.calibrate_baseline()` must see clean rest. The simulator MUST be disarmed at sidecar boot so the 2 s baseline pull reads flat mock rest.
- Always use `EEGInlet.get_chunk()` (never separate EEG/IMU pulls). Not touched by this plan, but do not introduce violations.
- Commits: no `Co-Authored-By` trailer.
- Update `docs/todos.md` after the work (project rule) — folded into Task 6.

---

### Task 1: `SessionSimulator` — the scripted session arc

**Files:**
- Create: `signal-engine/scoring/session_simulator.py`
- Test: `signal-engine/tests/test_session_simulator.py`

**Interfaces:**
- Consumes: any object exposing `inject_erd(channel_label: str, band: tuple[float, float], start_in_s: float, duration_s: float, suppression_fraction: float) -> None` and `inject_spike(amplitude_uv: float, n_samples: int, start_in_s: float) -> None` (satisfied by `MockUnicornOutlet`).
- Produces: `SessionSimulator(outlet, *, seed=None, settle_s=4.0, calib_s=16.0, step_s=1.0, mi_channels=("C3","C4"), mu_band=(8.0,12.0), beta_band=(13.0,30.0))` with methods `arm() -> None`, `disarm() -> None`, `status() -> dict` (`{"armed": bool, "phase": str, "elapsed_s": float}`), and a pure classifier `phase_at(elapsed_s: float) -> str` returning one of `"settle" | "calibration" | "gameplay"`.

- [ ] **Step 1: Write the failing test for the pure phase classifier**

```python
# signal-engine/tests/test_session_simulator.py
from __future__ import annotations

import time

from scoring.session_simulator import SessionSimulator


class FakeOutlet:
    """Records inject_erd / inject_spike calls; no LSL."""
    def __init__(self):
        self.erd_calls = []
        self.spike_calls = []

    def inject_erd(self, channel_label, band, start_in_s, duration_s, suppression_fraction):
        self.erd_calls.append((channel_label, tuple(band), suppression_fraction))

    def inject_spike(self, amplitude_uv=200.0, n_samples=25, start_in_s=0.0):
        self.spike_calls.append(amplitude_uv)


def test_phase_at_boundaries():
    sim = SessionSimulator(FakeOutlet(), settle_s=4.0, calib_s=16.0)
    assert sim.phase_at(0.0) == "settle"
    assert sim.phase_at(3.9) == "settle"
    assert sim.phase_at(4.0) == "calibration"
    assert sim.phase_at(19.9) == "calibration"
    assert sim.phase_at(20.0) == "gameplay"
    assert sim.phase_at(120.0) == "gameplay"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_session_simulator.py::test_phase_at_boundaries -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scoring.session_simulator'`

- [ ] **Step 3: Write the module with the pure phase logic and lifecycle skeleton**

```python
# signal-engine/scoring/session_simulator.py
"""Scripted session simulator for dev / headset-free end-to-end testing.

Drives a MockUnicornOutlet through a canonical rehab-session arc so the full
pipeline (filter -> ERD -> IntentScore -> LAN relay -> patient game) can be
exercised without a real headset. Owns one worker thread, armed on Start Session
and disarmed on End Session. Knows nothing about WebSockets or the console.

Arc (all durations tunable):
  settle       ~4 s   clean rest, no ERD (scores floor; contact quality reads good)
  calibration  ~16 s  alternating 4 s rest / 4 s imagine, moderate consistent ERD
  gameplay     until disarm: cue -> ramped imagine (variable depth) -> release,
               with slow fatigue drift and occasional artifact spikes
"""
from __future__ import annotations

import logging
import threading
import time

import numpy as np

logger = logging.getLogger(__name__)


class SessionSimulator:
    def __init__(
        self,
        outlet,
        *,
        seed: int | None = None,
        settle_s: float = 4.0,
        calib_s: float = 16.0,
        step_s: float = 1.0,
        mi_channels: tuple[str, ...] = ("C3", "C4"),
        mu_band: tuple[float, float] = (8.0, 12.0),
        beta_band: tuple[float, float] = (13.0, 30.0),
    ):
        self._outlet = outlet
        self._rng = np.random.default_rng(seed)
        self.settle_s = float(settle_s)
        self.calib_s = float(calib_s)
        self.step_s = float(step_s)
        self.mi_channels = tuple(mi_channels)
        self.mu_band = (float(mu_band[0]), float(mu_band[1]))
        self.beta_band = (float(beta_band[0]), float(beta_band[1]))

        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._armed_at: float | None = None

    # ------------------------------------------------------------------ pure logic
    def phase_at(self, elapsed_s: float) -> str:
        if elapsed_s < self.settle_s:
            return "settle"
        if elapsed_s < self.settle_s + self.calib_s:
            return "calibration"
        return "gameplay"

    # ------------------------------------------------------------------ lifecycle
    def status(self) -> dict:
        elapsed = 0.0 if self._armed_at is None else max(0.0, time.monotonic() - self._armed_at)
        armed = self._armed_at is not None
        return {
            "armed": armed,
            "phase": self.phase_at(elapsed) if armed else "idle",
            "elapsed_s": elapsed,
        }

    def arm(self) -> None:
        self.disarm()  # idempotent: restart the arc from phase 0
        self._stop.clear()
        self._armed_at = time.monotonic()
        self._thread = threading.Thread(target=self._run, name="SessionSimulator", daemon=True)
        self._thread.start()
        logger.info("SessionSimulator armed")

    def disarm(self) -> None:
        self._stop.set()
        t = self._thread
        if t is not None and t.is_alive():
            t.join(timeout=2.0)
        self._thread = None
        self._armed_at = None
        logger.info("SessionSimulator disarmed")

    # ------------------------------------------------------------------ worker
    def _run(self) -> None:
        trial = 0
        try:
            while not self._stop.is_set():
                elapsed = time.monotonic() - (self._armed_at or time.monotonic())
                phase = self.phase_at(elapsed)
                if phase == "settle":
                    pass  # no injection: mock streams clean rest
                elif phase == "calibration":
                    # 4 s rest / 4 s imagine cycle within the calibration window.
                    block = int(elapsed - self.settle_s) // 4
                    if block % 2 == 1:
                        self._inject_imagine(depth_mu=0.75, depth_beta=0.6, duration_s=self.step_s)
                else:  # gameplay
                    self._drive_trial(trial)
                    trial += 1
                self._stop.wait(self.step_s)
        except Exception:  # noqa: BLE001 - worker must not take down the process
            logger.exception("SessionSimulator worker crashed")

    def _inject_imagine(self, *, depth_mu: float, depth_beta: float, duration_s: float) -> None:
        for ch in self.mi_channels:
            self._outlet.inject_erd(ch, self.mu_band, 0.0, duration_s, depth_mu)
            self._outlet.inject_erd(ch, self.beta_band, 0.0, duration_s, depth_beta)

    def _drive_trial(self, trial: int) -> None:
        # Slow fatigue: peak depth decays ~10%/min (~ per-20-trial), floored at 0.5.
        fatigue = max(0.5, 1.0 - 0.005 * trial)
        # Per-trial outcome variability: success / partial / miss.
        base = float(self._rng.uniform(0.6, 0.9)) * fatigue
        # Ramp-in: two stepped sub-injections approximate an ease-in, then plateau.
        self._inject_imagine(depth_mu=base * 0.5, depth_beta=base * 0.4, duration_s=self.step_s * 0.4)
        self._inject_imagine(depth_mu=base, depth_beta=base * 0.8, duration_s=self.step_s)
        # Occasional artifact (~1 in 35 gameplay steps) to exercise the gate.
        if self._rng.random() < (1.0 / 35.0):
            self._outlet.inject_spike(amplitude_uv=250.0, n_samples=25, start_in_s=0.0)
```

- [ ] **Step 4: Run the phase test to verify it passes**

Run: `conda run -n eeg pytest signal-engine/tests/test_session_simulator.py::test_phase_at_boundaries -v`
Expected: PASS

- [ ] **Step 5: Write the failing tests for status, arming, and disarm**

```python
def test_status_idle_before_arm():
    sim = SessionSimulator(FakeOutlet())
    st = sim.status()
    assert st == {"armed": False, "phase": "idle", "elapsed_s": 0.0}


def test_arm_drives_injections_then_disarm_stops():
    outlet = FakeOutlet()
    # Tiny arc so gameplay is reached within the test window.
    sim = SessionSimulator(outlet, seed=1, settle_s=0.0, calib_s=0.0, step_s=0.05)
    sim.arm()
    assert sim.status()["armed"] is True
    time.sleep(0.4)  # several gameplay steps
    sim.disarm()
    assert sim.status()["armed"] is False
    # Gameplay drove ERD on BOTH MI channels, mu + beta each.
    channels = {c[0] for c in outlet.erd_calls}
    assert channels == {"C3", "C4"}, f"expected both MI channels, got {channels}"
    bands = {c[1] for c in outlet.erd_calls}
    assert (8.0, 12.0) in bands and (13.0, 30.0) in bands
    # After disarm no further injections accumulate.
    n_after_disarm = len(outlet.erd_calls)
    time.sleep(0.2)
    assert len(outlet.erd_calls) == n_after_disarm


def test_arm_is_idempotent():
    outlet = FakeOutlet()
    sim = SessionSimulator(outlet, seed=2, settle_s=0.0, calib_s=0.0, step_s=0.05)
    sim.arm()
    sim.arm()  # must not spawn a second worker or raise
    time.sleep(0.15)
    sim.disarm()
    assert sim._thread is None
```

- [ ] **Step 6: Run all simulator tests to verify they pass**

Run: `conda run -n eeg pytest signal-engine/tests/test_session_simulator.py -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add signal-engine/scoring/session_simulator.py signal-engine/tests/test_session_simulator.py
git commit -m "feat(signal-engine): SessionSimulator scripted session arc for dev mode"
```

---

### Task 2: WebSocket `start_session` / `end_session` commands

**Files:**
- Modify: `signal-engine/server/ws_server.py` (constructor ~45-76, `_dispatch` ~72-76, add two command coroutines near ~283)
- Test: `signal-engine/tests/test_ws_session_commands.py` (create)

**Interfaces:**
- Consumes: a session controller object with `arm() -> None`, `disarm() -> None`, `status() -> dict` (Task 1's `SessionSimulator`).
- Produces: `NeuroReachWSServer(..., session_controller=None)` constructor param; inbound `{"cmd":"start_session"}` → per-client reply `{"type":"session","armed":true, ...status}`; `{"cmd":"end_session"}` → `{"type":"session","armed":false, ...status}`; when `session_controller is None`, both reply `{"type":"error","message":"no session controller"}`.

- [ ] **Step 1: Write failing unit tests that drive the command coroutines directly**

```python
# signal-engine/tests/test_ws_session_commands.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `conda run -n eeg pytest signal-engine/tests/test_ws_session_commands.py -v`
Expected: FAIL — `TypeError: __init__() got an unexpected keyword argument 'session_controller'`

- [ ] **Step 3: Add the constructor param, dispatch entries, and command coroutines**

In `signal-engine/server/ws_server.py`, add `session_controller=None` to `__init__` (place it after `quality_hz`):

```python
    def __init__(
        self,
        scoring_service,
        host: str = "localhost",
        port: int = 8765,
        broadcast_hz: float = 20.0,
        quality_hz: float = 5.0,
        session_controller=None,
    ):
```

Immediately after `self.quality_hz = float(quality_hz)` add:

```python
        # Optional dev-mode session gate (SessionSimulator). None on a real
        # headset run; then start_session/end_session reply with an error.
        self.session_controller = session_controller
```

Extend `self._dispatch` to include the two commands:

```python
        self._dispatch = {
            "ping": self._cmd_ping,
            "get_status": self._cmd_get_status,
            "set_mode": self._cmd_set_mode,
            "start_session": self._cmd_start_session,
            "end_session": self._cmd_end_session,
        }
```

Add the two coroutines in the commands section (after `_cmd_set_mode`):

```python
    async def _cmd_start_session(self, websocket, data) -> None:
        await self._session_command(websocket, arm=True)

    async def _cmd_end_session(self, websocket, data) -> None:
        await self._session_command(websocket, arm=False)

    async def _session_command(self, websocket, *, arm: bool) -> None:
        ctrl = self.session_controller
        if ctrl is None:
            await self._send(websocket, {"type": "error", "message": "no session controller"})
            return
        if arm:
            ctrl.arm()
        else:
            ctrl.disarm()
        await self._send(websocket, {"type": "session", **ctrl.status()})
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `conda run -n eeg pytest signal-engine/tests/test_ws_session_commands.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the existing ws_server suite to confirm no regression**

Run: `conda run -n eeg pytest signal-engine/tests/test_ws_server.py -v`
Expected: PASS (all existing tests, including `test_unknown_command`)

- [ ] **Step 6: Commit**

```bash
git add signal-engine/server/ws_server.py signal-engine/tests/test_ws_session_commands.py
git commit -m "feat(signal-engine): start_session/end_session WS commands gate the session controller"
```

---

### Task 3: Wire the simulator into the entrypoint + `EEG_SOURCE` + integration gating test

**Files:**
- Modify: `signal-engine/run_ws_server.py` (whole `main()`, remove `drive_virtual_mi` ~76-95 and its boot thread ~107-112)
- Test: `signal-engine/tests/test_session_gating.py` (create)

**Interfaces:**
- Consumes: `SessionSimulator` (Task 1), `NeuroReachWSServer(..., session_controller=...)` (Task 2).
- Produces: sidecar that boots idle; `EEG_SOURCE=sim` (default) builds mock+simulator, `EEG_SOURCE=live` builds neither and binds the real `"Data"` stream. No behavioural interface consumed by later tasks.

- [ ] **Step 1: Write the failing integration test (score floors idle, rises after start_session)**

```python
# signal-engine/tests/test_session_gating.py
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_session_gating.py -v`
Expected: FAIL (import of `SessionSimulator` succeeds, but this test is new; if run before Task 1/2 merged it errors — here it should FAIL on the assertion only if wiring is wrong. It is expected to PASS once run, since Tasks 1-2 exist. If it fails, debug the arc constants.)

> Note: this test depends only on Tasks 1-2 code, not on the `run_ws_server.py` edit. It should pass immediately. Its purpose is to lock the gating behaviour before refactoring the entrypoint in Step 3.

- [ ] **Step 3: Rewrite `main()` in `run_ws_server.py` — drop `drive_virtual_mi`, add source select + gating**

Replace the `drive_virtual_mi` function (delete it entirely) and rewrite `main()`:

```python
def main():
    source = os.environ.get("EEG_SOURCE", "sim").lower()

    outlet = None
    sim = None
    if source == "sim":
        outlet = MockUnicornOutlet(seed=7)
        outlet.start()
        print("MockUnicornOutlet streaming (idle); letting LSL discovery settle...")
        time.sleep(0.3)
    elif source == "live":
        print("EEG_SOURCE=live: expecting a real Unicorn 'Data' LSL stream.")
    else:
        raise SystemExit(f"unknown EEG_SOURCE={source!r} (expected 'sim' or 'live')")

    # Baseline ERD calibrates on clean rest. In sim mode the simulator is NOT yet
    # armed, so the mock streams flat rest -> the 2 s baseline is clean.
    try:
        svc = build_scoring_service()
    except Exception as exc:  # live with no stream present, etc.
        if source == "live":
            raise SystemExit(
                "no EEG source: expected a live Unicorn 'Data' stream; none resolved"
            ) from exc
        raise

    if source == "sim":
        sim = SessionSimulator(outlet)
        print("SessionSimulator ready (idle). Arms on Start Session.")

    srv = NeuroReachWSServer(
        svc, host="localhost", port=8765, broadcast_hz=20.0, session_controller=sim
    )
    print("WS server starting on ws://localhost:8765 (Ctrl-C to stop)")
    try:
        srv.start()  # blocks
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        if sim is not None:
            sim.disarm()
        srv.stop()
        if outlet is not None:
            outlet.stop()
```

Update the imports at the top of `run_ws_server.py`: add `from scoring.session_simulator import SessionSimulator` and remove the now-unused `threading` import only if nothing else uses it (leave `import os`).

- [ ] **Step 4: Re-run the gating test and the full signal-engine suite**

Run: `conda run -n eeg pytest signal-engine/tests/test_session_gating.py signal-engine/tests/ -v`
Expected: PASS (gating test + entire existing suite; no test references `drive_virtual_mi` or `NEUROREACH_NO_MI`)

- [ ] **Step 5: Smoke-test the entrypoint boots idle**

Run: `conda run -n eeg python -c "import signal_engine" 2>/dev/null; cd signal-engine && conda run -n eeg python -c "import run_ws_server"` — Expected: imports clean, no error. (Full run is exercised by the integration test; do not leave a server running.)

- [ ] **Step 6: Commit**

```bash
git add signal-engine/run_ws_server.py signal-engine/tests/test_session_gating.py
git commit -m "feat(signal-engine): session-gated sim entrypoint with EEG_SOURCE select; drop always-on MI driver"
```

---

### Task 4: `SessionInfo.source` + Setup-screen dev toggle

**Files:**
- Modify: `clinician-console/src/main/lan/pairing.ts:4-8` (`SessionInfo` type)
- Modify: `clinician-console/src/renderer/PairingPanel.tsx`
- Test: `clinician-console/src/renderer/PairingPanel.test.tsx`

**Interfaces:**
- Consumes: `PairingApi.startSession(s: SessionInfo)` (existing).
- Produces: `SessionInfo` gains `source: "sim" | "live"`; `PairingPanel` renders a source toggle (default `"sim"`) and calls `api.startSession({ ...session, source })`.

- [ ] **Step 1: Add `source` to `SessionInfo`**

In `clinician-console/src/main/lan/pairing.ts`:

```typescript
export type SessionInfo = {
  patientFirstName: string;
  affectedSide: "left" | "right";
  mode: string;
  source: "sim" | "live";
};
```

- [ ] **Step 2: Write the failing test for the toggle behaviour**

Add to `clinician-console/src/renderer/PairingPanel.test.tsx` (keep existing tests; this asserts default source + toggle):

```tsx
import { fireEvent, render, screen } from "@testing-library/react";

it("defaults to simulated source and forwards it on Start Session", async () => {
  const api = {
    startSession: vi.fn().mockResolvedValue({ code: "ABC234", url: "https://x/?c=ABC234" }),
    endSession: vi.fn(),
    onPatientConnected: vi.fn(),
    onPatientDisconnected: vi.fn(),
  };
  const session = { patientFirstName: "Ana", affectedSide: "left" as const, mode: "garden" };
  render(<PairingPanel api={api} session={session} />);
  fireEvent.click(screen.getByRole("button", { name: /start session/i }));
  await screen.findByText("ABC234");
  expect(api.startSession).toHaveBeenCalledWith({ ...session, source: "sim" });
});

it("forwards live source when toggled to Live headset", async () => {
  const api = {
    startSession: vi.fn().mockResolvedValue({ code: "ABC234", url: "https://x/?c=ABC234" }),
    endSession: vi.fn(),
    onPatientConnected: vi.fn(),
    onPatientDisconnected: vi.fn(),
  };
  const session = { patientFirstName: "Ana", affectedSide: "left" as const, mode: "garden" };
  render(<PairingPanel api={api} session={session} />);
  fireEvent.click(screen.getByRole("radio", { name: /live headset/i }));
  fireEvent.click(screen.getByRole("button", { name: /start session/i }));
  await screen.findByText("ABC234");
  expect(api.startSession).toHaveBeenCalledWith({ ...session, source: "live" });
});
```

> Note: existing `PairingPanel.test.tsx` passes a `session` literal without `source` — that stays valid because `PairingPanel` injects `source`, not the caller. If any existing test asserts `startSession` was called with the bare `session`, update its expectation to `{ ...session, source: "sim" }`.
>
> Note: `SessionInfo` now has a required `source` field. `App.tsx` builds the session object it passes to `PairingPanel`; because Step 4 changes the prop type to `Omit<SessionInfo, "source">`, a bare object literal keeps compiling. If `App.tsx` (or any caller) explicitly annotates that object as `SessionInfo`, drop the annotation (or add `source: "sim"`) so the console still typechecks. Verify with `npm run test` / the build in Step 5.

- [ ] **Step 3: Run to verify it fails**

Run: `cd clinician-console && npm run test -- PairingPanel`
Expected: FAIL — no radio named "Live headset"; `startSession` called without `source`.

- [ ] **Step 4: Add the toggle to `PairingPanel.tsx`**

Add a `source` state and a radio group before the Start button; forward it in `start()`:

```tsx
export function PairingPanel({ api, session }: { api: PairingApi; session: SessionInfo }) {
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [source, setSource] = useState<"sim" | "live">("sim");

  useEffect(() => {
    api.onPatientConnected(() => setConnected(true));
    api.onPatientDisconnected(() => setConnected(false));
  }, [api]);

  async function start() {
    const { code, url } = await api.startSession({ ...session, source });
    setCode(code);
    setQr(await QRCode.toDataURL(url));
  }
```

`PairingPanel`'s `session` prop type is `SessionInfo`, which now requires `source`; to avoid forcing every caller to supply it, change the prop to accept the session without `source`:

```tsx
export function PairingPanel({
  api,
  session,
}: {
  api: PairingApi;
  session: Omit<SessionInfo, "source">;
}) {
```

And update `PairingApi.startSession` to keep taking the full `SessionInfo` (unchanged). Render the radio group inside the `!code` branch, above the Start button:

```tsx
      {!code ? (
        <>
          <fieldset className="source-toggle" aria-label="EEG source">
            <label>
              <input
                type="radio"
                name="eeg-source"
                checked={source === "sim"}
                onChange={() => setSource("sim")}
              />
              Simulated EEG (dev)
            </label>
            <label>
              <input
                type="radio"
                name="eeg-source"
                checked={source === "live"}
                onChange={() => setSource("live")}
              />
              Live headset
            </label>
          </fieldset>
          <button className="btn btn-primary" onClick={start}>Start Session</button>
        </>
      ) : (
```

- [ ] **Step 5: Run PairingPanel tests to verify they pass**

Run: `cd clinician-console && npm run test -- PairingPanel`
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add clinician-console/src/main/lan/pairing.ts clinician-console/src/renderer/PairingPanel.tsx clinician-console/src/renderer/PairingPanel.test.tsx
git commit -m "feat(console): Simulated/Live EEG source toggle on the pairing panel"
```

---

### Task 5: Control socket + IPC forwarding in Electron main

**Files:**
- Modify: `clinician-console/src/main/main.ts` (`nodeSidecarSocket` reuse, `startLan` IPC handlers ~37-38)
- Test: `clinician-console/src/main/sessionControl.test.ts` (create) — test the pure forwarding function

**Interfaces:**
- Consumes: `RelaySocket` + `SIDECAR_WS_URL` (existing), `SessionInfo.source` (Task 4).
- Produces: a pure `sessionControlCommand(source, action) -> string | null` returning the JSON command to send (or `null` when no command should be sent), wired into the `start-session` / `end-session` IPC handlers over a persistent control socket.

- [ ] **Step 1: Write the failing unit test for the forwarding rule**

```typescript
// clinician-console/src/main/sessionControl.test.ts
import { describe, it, expect } from "vitest";
import { sessionControlCommand } from "./sessionControl";

describe("sessionControlCommand", () => {
  it("arms the simulator when starting a sim session", () => {
    expect(sessionControlCommand("sim", "start")).toBe(JSON.stringify({ cmd: "start_session" }));
  });
  it("does not arm when starting a live session", () => {
    expect(sessionControlCommand("live", "start")).toBeNull();
  });
  it("always disarms on end (sim or live)", () => {
    expect(sessionControlCommand("sim", "end")).toBe(JSON.stringify({ cmd: "end_session" }));
    expect(sessionControlCommand("live", "end")).toBe(JSON.stringify({ cmd: "end_session" }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd clinician-console && npm run test -- sessionControl`
Expected: FAIL — `Cannot find module './sessionControl'`.

- [ ] **Step 3: Create the pure helper**

```typescript
// clinician-console/src/main/sessionControl.ts
import type { SessionInfo } from "./lan/pairing";

export type SessionAction = "start" | "end";

/**
 * The sidecar control command to send for a given source + action, or null
 * when nothing should be sent. Only a "sim" start arms the simulator; end
 * always disarms (harmless if never armed).
 */
export function sessionControlCommand(
  source: SessionInfo["source"],
  action: SessionAction,
): string | null {
  if (action === "end") return JSON.stringify({ cmd: "end_session" });
  return source === "sim" ? JSON.stringify({ cmd: "start_session" }) : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd clinician-console && npm run test -- sessionControl`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the persistent control socket + IPC in `main.ts`**

Add a module-level control socket and use the helper in the IPC handlers. In `clinician-console/src/main/main.ts`, add after the `lan`/`supervisor` declarations:

```typescript
import { SIDECAR_WS_URL } from "./config";
import { sessionControlCommand } from "./sessionControl";

let controlSocket: RelaySocket | null = null;
let controlReady = false;
const controlOutbox: string[] = [];

function openControlSocket() {
  const s = nodeSidecarSocket(SIDECAR_WS_URL);
  controlSocket = s;
  controlReady = false;
  s.onopen = () => {
    controlReady = true;
    while (controlOutbox.length) sendControl(controlOutbox.shift()!);
  };
  s.onclose = () => {
    controlReady = false;
    controlSocket = null;
    setTimeout(openControlSocket, 1000); // reconnect like the relay
  };
}

function sendControl(raw: string) {
  // Queue until the socket is open; the onopen handler drains the outbox.
  if (!controlReady || !controlSocket) {
    controlOutbox.push(raw);
    return;
  }
  controlSocket.send?.(raw);
}
```

> `RelaySocket` currently has no `send`. Extend it: in `clinician-console/src/main/lan/scoreRelay.ts` add `send?(raw: string): void;` to the `RelaySocket` type, and in `nodeSidecarSocket` (`main.ts`) set `s.send = (raw) => ws.send(raw)`. The relay never calls `send`, so this is additive and safe.

Update `nodeSidecarSocket` in `main.ts` to wire `send` and `onopen`:

```typescript
function nodeSidecarSocket(url: string): RelaySocket {
  const ws = new WebSocket(url);
  const s: RelaySocket = {
    onmessage: null, onclose: null, onopen: null,
    send: (raw: string) => ws.send(raw),
    close: () => ws.close(),
  };
  ws.on("open", () => s.onopen?.());
  ws.on("message", (d) => s.onmessage?.({ data: d.toString() }));
  ws.on("close", () => s.onclose?.());
  ws.on("error", () => {});
  return s;
}
```

Replace the IPC handlers in `startLan()` and open the control socket:

```typescript
  ipcMain.handle("start-session", (_e, session: SessionInfo) => {
    const result = lan!.startSession(session);
    const cmd = sessionControlCommand(session.source, "start");
    if (cmd) sendControl(cmd);
    return result;
  });
  ipcMain.handle("end-session", () => {
    sendControl(sessionControlCommand("sim", "end")!); // end always disarms
    return lan!.endSession();
  });
```

Call `openControlSocket()` at the end of `startLan()`. Close it in the `before-quit` handler alongside `lan.stop()` (`controlSocket?.close()`).

- [ ] **Step 6: Run the console unit suite + typecheck**

Run: `cd clinician-console && npm run test`
Expected: PASS (88 existing + new sessionControl + PairingPanel additions). If a build/typecheck script exists (`npm run build` for the main process), run it to confirm `main.ts` compiles.

- [ ] **Step 7: Commit**

```bash
git add clinician-console/src/main/main.ts clinician-console/src/main/sessionControl.ts clinician-console/src/main/sessionControl.test.ts clinician-console/src/main/lan/scoreRelay.ts
git commit -m "feat(console): persistent sidecar control socket arms/disarms sim on session start/end"
```

---

### Task 6: End-to-end verification + docs

**Files:**
- Modify: `docs/todos.md` (project rule — §6 Agent Update Protocol)

**Interfaces:** none (verification + docs only).

- [ ] **Step 1: Run the full Python suite**

Run: `conda run -n eeg pytest signal-engine/tests/`
Expected: PASS (all, including the 3 new session-command tests, 4 simulator tests, gating test).

- [ ] **Step 2: Run the full console suite**

Run: `cd clinician-console && npm run test`
Expected: PASS.

- [ ] **Step 3: Manual end-to-end smoke (documented, not automated)**

Run: `cd clinician-console && npm run dev`. In the console: pick a patient → Setup step → leave source on **Simulated EEG (dev)** → Start Session. On a second device/tab, open the LAN URL / scan QR, pair, and confirm the garden plant grows and the score climbs through the arc (settle → calibration → gameplay), then End Session and confirm the score floors. Record the outcome in the commit message / todos. (This uses the verify skill if the reviewer prefers a driven check.)

- [ ] **Step 4: Update `docs/todos.md`**

Follow the §6 Agent Update Protocol already in `docs/todos.md`: mark the dev-mode / session-gated-simulator item complete, note the `EEG_SOURCE=sim|live` env var and the deferred full live source-switching follow-up, and add the two follow-ups from the spec (game-reactive sim; surface simulator phase in Live Monitor).

- [ ] **Step 5: Commit**

```bash
git add docs/todos.md
git commit -m "docs: record dev-mode simulated EEG completion and follow-ups in todos"
```

---

## Notes for the implementer

- **Do not** re-add the always-on MI driver or `NEUROREACH_NO_MI`; session gating replaces it.
- **Do not** alter the `intent_score` frame or the shared parser. The new `session` reply is a distinct per-client frame, never broadcast.
- The `SessionSimulator` drives `MockUnicornOutlet.inject_erd` with the exact signature `inject_erd(channel_label, band, start_in_s, duration_s, suppression_fraction)` — re-injecting each `step_s` tick is the proven pattern from the old `drive_virtual_mi`.
- Keep the baseline-calibration ordering in `run_ws_server.py`: build the scoring service (which pulls 2 s of rest) BEFORE constructing/arming the simulator. The simulator is never armed at boot.
