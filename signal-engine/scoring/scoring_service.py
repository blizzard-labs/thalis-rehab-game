"""Real-time scoring loop, run on a background thread.

Pulls EEG/IMU from the inlet, runs the causal filter + common-average-reference
front end, keeps a rolling ring buffer, gates artifacts, and throttles
IntentScore computation to ``update_rate_hz``. Results are pushed onto an
``output_queue`` for downstream consumers (e.g. the WebSocket server) — the
loop NEVER blocks on a slow consumer: a full queue drops its oldest item.

Pipeline note — the AmplitudeGate runs on a separate RAW (pre-filter,
pre-reference) buffer, not on the scoring ring buffer. Common-average-reference
removes exactly the common-mode component a global electrode-pop produces, and
the 1–40 Hz bandpass attenuates the spike's energy, so a post-pipeline gate
would be blind to large-amplitude artifacts. Gating raw voltage is the standard
choice and the only one that reliably catches them. The scoring ring buffer
still holds the clean filtered+referenced signal for ERD / CSP.
"""

from __future__ import annotations

import logging
import queue
import threading
import time

from preprocessing.artifact import AmplitudeGate, MovementGate
from preprocessing.filters import CausalFilterChain
from preprocessing.spatial import common_average_reference
from scoring.intent_score import IntentScoreEngine, IntentScoreResult
from scoring.ring_buffer import RingBuffer
from scoring.signal_quality import compute_channel_quality, extract_trace

logger = logging.getLogger(__name__)

# MI channels the clinician inspects on the C2 setup screen (specsv2 wireframe).
TRACE_CHANNELS = ("C3", "Cz", "C4")


class ScoringService:
    """Background thread driving the EEG -> IntentScore loop."""

    def __init__(
        self,
        eeg_inlet,
        amplitude_gate: AmplitudeGate,
        movement_gate: MovementGate,
        causal_filter: CausalFilterChain,
        intent_score_engine: IntentScoreEngine,
        output_queue: "queue.Queue[IntentScoreResult]",
        update_rate_hz: float = 20.0,
        chunk_size: int = 12,
        kinematic_source=None,
        kinematic_worker=None,
        kinematic_staleness_s: float = 0.3,
    ):
        self.eeg_inlet = eeg_inlet
        self.amplitude_gate = amplitude_gate
        self.movement_gate = movement_gate
        self.causal_filter = causal_filter
        self.engine = intent_score_engine
        self.output_queue = output_queue
        self.update_rate_hz = float(update_rate_hz)
        self.chunk_size = int(chunk_size)
        # Kinematic (vision) fusion source — optional; EEG-only when absent.
        self._kinematic_source = kinematic_source
        self._kinematic_worker = kinematic_worker
        self.kinematic_staleness_s = float(kinematic_staleness_s)

        self.fs = int(self.engine.fs)
        n_ch = len(self.engine.eeg_channel_labels)
        # Scoring buffer: filtered + referenced, full MI window for CSP.
        self.ring_buffer = RingBuffer(n_ch, self.engine.mi_window_samples)
        # Raw buffer for the amplitude gate: most recent ~1 s, unfiltered.
        self._raw_gate_buffer = RingBuffer(n_ch, max(self.fs, self.chunk_size))

        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._last_score_time = 0.0

        # Latest per-channel contact-quality snapshot for the console C2 setup
        # screen. Single writer (the loop), many readers; the dict is replaced
        # wholesale each tick so a reader always sees a consistent object.
        self._latest_quality: dict | None = None

    def latest_quality(self) -> dict | None:
        """Most recent contact-quality + MI-trace snapshot, or ``None`` until
        the first scoring tick. See ``scoring.signal_quality``."""
        return self._latest_quality

    def _read_kinematic(self):
        """Freshest KinematicResult, or ``None`` if absent/stale.

        A result older than ``kinematic_staleness_s`` is an arrival gap — absent
        evidence, never fabricated as stillness or movement (spec §7.3)."""
        if self._kinematic_source is None:
            return None
        result = self._kinematic_source.get()
        if result is None:
            return None
        if (time.time() - result.timestamp) > self.kinematic_staleness_s:
            return None
        return result

    # ------------------------------------------------------------------ lifecycle

    def start(self) -> "ScoringService":
        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("ScoringService already running")
        self._stop.clear()
        self._last_score_time = 0.0
        self._thread = threading.Thread(
            target=self._run, name="ScoringService", daemon=True
        )
        self._thread.start()
        if self._kinematic_worker is not None:
            self._kinematic_worker.start()
        logger.info("ScoringService started (%.1f Hz)", self.update_rate_hz)
        return self

    def stop(self, join_timeout: float = 2.0) -> None:
        if self._kinematic_worker is not None:
            self._kinematic_worker.stop()
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=join_timeout)
            if self._thread.is_alive():
                logger.warning("ScoringService thread did not join within %.1fs", join_timeout)
        self._thread = None
        logger.info("ScoringService stopped")

    # ------------------------------------------------------------------ main loop

    def _run(self) -> None:
        # Pull frequently enough to keep the ring buffer fresh between scores.
        pull_timeout = min(0.05, 1.0 / self.update_rate_hz)
        try:
            while not self._stop.is_set():
                # Single combined pull keeps the EEG stream contiguous (and the
                # IMU time-aligned). Two separate pulls would gap the EEG and
                # break the stateful causal filter.
                chunk, imu = self.eeg_inlet.get_chunk(
                    max_samples=self.chunk_size, timeout=pull_timeout
                )
                if chunk.shape[1] == 0:
                    # No new data: yield briefly so stop() stays responsive.
                    self._stop.wait(timeout=0.005)
                    continue

                # Raw -> amplitude gate buffer (before filtering / referencing).
                self._raw_gate_buffer.push(chunk)

                # Filter (causal) -> common average reference -> scoring buffer.
                filtered = self.causal_filter.process_chunk(chunk)
                referenced = common_average_reference(filtered)
                self.ring_buffer.push(referenced)

                gate_window = self._raw_gate_buffer.get_window(self.fs)
                is_clean = self.amplitude_gate.is_clean(gate_window)
                is_head_still = self._head_still(imu)
                artifact_clean = is_clean and is_head_still

                now = time.monotonic()
                if (now - self._last_score_time) < (1.0 / self.update_rate_hz):
                    continue
                self._last_score_time = now

                result = self.engine.compute(
                    self.ring_buffer, artifact_clean, kinematic=self._read_kinematic()
                )
                self._publish(result)
                self._update_quality(gate_window)
        except Exception:
            logger.exception("ScoringService loop crashed")

    def _update_quality(self, gate_window) -> None:
        """Refresh the contact-quality + MI-trace snapshot from the raw window.

        Contact problems are amplitude-domain and live in the RAW (pre-filter,
        pre-CAR) signal — the same window the AmplitudeGate uses — so we derive
        both the per-channel verdict and the live trace from it.
        """
        labels = self.engine.eeg_channel_labels
        self._latest_quality = {
            "fs": self.fs,
            "channels": compute_channel_quality(gate_window, labels),
            "trace": extract_trace(gate_window, labels, list(TRACE_CHANNELS)),
            "timestamp": time.time(),
        }

    # ------------------------------------------------------------------ helpers

    def _head_still(self, imu) -> bool:
        """Movement verdict; an empty IMU pull is treated as 'still'."""
        if imu is None or imu.shape[1] == 0:
            return True
        return self.movement_gate.is_head_still(imu)

    def _publish(self, result: IntentScoreResult) -> None:
        """Non-blocking put; on a full queue drop the oldest and retry once."""
        try:
            self.output_queue.put_nowait(result)
        except queue.Full:
            try:
                self.output_queue.get_nowait()
            except queue.Empty:
                pass
            logger.warning("output_queue full; dropped oldest IntentScoreResult")
            try:
                self.output_queue.put_nowait(result)
            except queue.Full:
                pass
