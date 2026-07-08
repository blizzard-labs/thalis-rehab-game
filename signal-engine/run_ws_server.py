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
import time

from acquisition.lsl_inlet import EEGInlet
from acquisition.mock_eeg_outlet import MockUnicornOutlet
from features.erd import ERDCalculator
from preprocessing.artifact import AmplitudeGate, MovementGate
from preprocessing.filters import CausalFilterChain
from preprocessing.spatial import common_average_reference
from scoring.intent_score import IntentScoreEngine
from scoring.scoring_service import ScoringService
from scoring.session_simulator import SessionSimulator
from server.ws_server import NeuroReachWSServer
from vision.frame_sink import VideoFrameSink
from vision.webrtc_receiver import WebRTCReceiver

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

    # Built after the scoring service so the baseline-before-simulator boot order
    # is untouched. Owns the aiortc peer for the patient camera track.
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


if __name__ == "__main__":
    main()
