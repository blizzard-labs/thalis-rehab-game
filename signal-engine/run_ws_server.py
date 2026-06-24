"""Runnable WebSocket server entrypoint for local Unity client testing.

Wires the full real-time scoring chain to a MockUnicornOutlet (no headset
needed) and serves it over ws://localhost:8765 via NeuroReachWSServer.

    conda run -n eeg python signal-engine/run_ws_server.py

Ctrl-C to stop. To drive a real Unicorn headset instead, drop the
MockUnicornOutlet block and start your real LSL stream before launching.
"""

from __future__ import annotations

import os
import queue
import threading
import time

from acquisition.lsl_inlet import EEGInlet
from acquisition.mock_eeg_outlet import MockUnicornOutlet
from features.erd import ERDCalculator
from preprocessing.artifact import AmplitudeGate, MovementGate
from preprocessing.filters import CausalFilterChain
from preprocessing.spatial import common_average_reference
from scoring.intent_score import IntentScoreEngine
from scoring.scoring_service import ScoringService
from server.ws_server import NeuroReachWSServer

FS = 250


def _pull_for(inlet: EEGInlet, seconds: float):
    deadline = time.monotonic() + seconds
    parts = []
    while time.monotonic() < deadline:
        chunk = inlet.get_eeg_chunk(max_samples=250, timeout=0.2)
        if chunk.shape[1] > 0:
            parts.append(chunk)
    import numpy as np

    return np.concatenate(parts, axis=1) if parts else np.empty((8, 0))


def build_scoring_service():
    inlet = EEGInlet(timeout=5.0, pull_timeout=1.0)
    eeg_labels = inlet.eeg_labels

    print("Calibrating ERD baseline on 2s of rest...")
    baseline_raw = _pull_for(inlet, 2.0)
    proc = common_average_reference(
        CausalFilterChain(fs=FS).process_chunk(baseline_raw)
    )
    erd_calc = ERDCalculator(channel_labels=["C3", "C4"], fs=FS)
    erd_calc.calibrate_baseline(proc, eeg_labels)

    engine = IntentScoreEngine(
        eeg_channel_labels=eeg_labels,
        erd_calculator=erd_calc,
        online_classifier=None,        # band-power-only mode
        classifier_reliable=False,
        fs=FS,
        ema_alpha=0.15,
    )
    return ScoringService(
        eeg_inlet=inlet,
        amplitude_gate=AmplitudeGate(threshold_uv=100.0, fs=FS),
        movement_gate=MovementGate(threshold=0.05, fs=FS),
        causal_filter=CausalFilterChain(fs=FS),
        intent_score_engine=engine,
        output_queue=queue.Queue(),
        update_rate_hz=20.0,
        chunk_size=12,
    )


def drive_virtual_mi(outlet: MockUnicornOutlet, stop_event: threading.Event,
                     mi_seconds: float = 6.0, rest_seconds: float = 3.0,
                     suppression: float = 0.9) -> None:
    """Simulate a patient repeatedly doing motor imagery on the mock stream.

    Without this the mock streams only resting rhythm, so ERD (and the Intent
    Score) never rises and the garden plant just twitches near the floor. Each
    cycle suppresses mu+beta power on C3 and C4 (an ERD burst) for `mi_seconds`,
    then rests for `rest_seconds`. The plant grows during the burst and blooms on
    a sustained one; it wilts gently during rest. Disable with NEUROREACH_NO_MI=1
    to see the true (flat) mock baseline.
    """
    period = mi_seconds + rest_seconds
    while not stop_event.is_set():
        for ch in ("C3", "C4"):
            outlet.inject_erd(ch, (8.0, 12.0), 0.0, mi_seconds, suppression)
            outlet.inject_erd(ch, (13.0, 30.0), 0.0, mi_seconds, suppression * 0.8)
        # Re-arm one cycle before the events expire so MI bursts are continuous.
        stop_event.wait(period)


def main():
    outlet = MockUnicornOutlet(seed=7)
    outlet.start()
    print("MockUnicornOutlet streaming; letting LSL discovery settle...")
    time.sleep(0.3)

    # Baseline ERD must calibrate on TRUE rest, so build the service (which pulls
    # 2s of clean rest) BEFORE starting the virtual-MI driver.
    svc = build_scoring_service()

    stop_mi = threading.Event()
    if os.environ.get("NEUROREACH_NO_MI") != "1":
        threading.Thread(
            target=drive_virtual_mi, args=(outlet, stop_mi), daemon=True
        ).start()
        print("Virtual MI driver ON (6s imagine / 3s rest). NEUROREACH_NO_MI=1 to disable.")

    srv = NeuroReachWSServer(svc, host="localhost", port=8765, broadcast_hz=20.0)
    print("WS server starting on ws://localhost:8765 (Ctrl-C to stop)")
    try:
        srv.start()  # blocks
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        stop_mi.set()
        srv.stop()
        outlet.stop()


if __name__ == "__main__":
    main()
