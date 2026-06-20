"""Mock Unicorn LSL outlet for end-to-end testing without the real headset.

Publishes a 17-channel LSL stream that matches the shape and channel labels
of the g.tec Unicorn Hybrid Black via the official UnicornRecorderLSLStream.
Default signal is per-channel white-noise baseline plus configurable mu
(8–12 Hz) and beta (13–30 Hz) sinusoids, with an ERD injection hook so
downstream code can be tested against simulated event-related desynchronization.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np
from pylsl import StreamInfo, StreamOutlet, cf_float32

logger = logging.getLogger(__name__)

DEFAULT_EEG_LABELS = ["Fz", "C3", "Cz", "C4", "Pz", "PO7", "Oz", "PO8"]
DEFAULT_IMU_LABELS = [
    "Accelerometer X", "Accelerometer Y", "Accelerometer Z",
    "Gyroscope X", "Gyroscope Y", "Gyroscope Z",
]
DEFAULT_AUX_LABELS = ["Battery Level", "Counter", "Validation Indicator"]

DEFAULT_LABELS = DEFAULT_EEG_LABELS + DEFAULT_IMU_LABELS + DEFAULT_AUX_LABELS

DEFAULT_STREAM_NAME = "UnicornRecorderLSLStream"
DEFAULT_STREAM_TYPE = "EEG"
DEFAULT_SAMPLE_RATE = 250.0
DEFAULT_N_CHANNELS = 17


@dataclass
class _ErdEvent:
    channel_label: str
    band_lo: float
    band_hi: float
    start_mono: float
    end_mono: float
    suppression_fraction: float


@dataclass
class MockSignalConfig:
    """Per-channel synthetic-signal parameters (µV)."""
    noise_std: float = 2.0
    mu_freq: float = 10.0
    mu_amp: float = 5.0
    beta_freq: float = 20.0
    beta_amp: float = 3.0


class MockUnicornOutlet:
    """Threaded LSL outlet that mimics the Unicorn Hybrid Black stream."""

    def __init__(
        self,
        channel_labels: Optional[List[str]] = None,
        stream_name: str = DEFAULT_STREAM_NAME,
        stream_type: str = DEFAULT_STREAM_TYPE,
        sample_rate: float = DEFAULT_SAMPLE_RATE,
        signal: Optional[MockSignalConfig] = None,
        block_samples: int = 10,
        seed: Optional[int] = None,
    ):
        if channel_labels is None:
            channel_labels = list(DEFAULT_LABELS)
        if len(channel_labels) != DEFAULT_N_CHANNELS:
            raise ValueError(
                f"channel_labels must have {DEFAULT_N_CHANNELS} entries, got {len(channel_labels)}"
            )

        self._labels = list(channel_labels)
        self._stream_name = stream_name
        self._stream_type = stream_type
        self._sample_rate = float(sample_rate)
        self._signal = signal or MockSignalConfig()
        self._block_samples = int(block_samples)
        self._rng = np.random.default_rng(seed)

        # Map each label to its channel index in the published stream.
        self._label_to_idx = {lbl: i for i, lbl in enumerate(self._labels)}
        if len(self._label_to_idx) != len(self._labels):
            raise ValueError("channel_labels must be unique")

        # Per-label classification so the generator knows what to put in each row.
        self._eeg_indices: list[int] = [
            self._label_to_idx[lbl] for lbl in self._labels if lbl in DEFAULT_EEG_LABELS
        ]
        self._eeg_labels_in_order: list[str] = [
            self._labels[i] for i in self._eeg_indices
        ]
        self._accel_idx = {
            "x": self._label_to_idx.get("Accelerometer X"),
            "y": self._label_to_idx.get("Accelerometer Y"),
            "z": self._label_to_idx.get("Accelerometer Z"),
        }
        self._gyro_idx = {
            "x": self._label_to_idx.get("Gyroscope X"),
            "y": self._label_to_idx.get("Gyroscope Y"),
            "z": self._label_to_idx.get("Gyroscope Z"),
        }
        self._battery_idx = self._label_to_idx.get("Battery Level")
        self._counter_idx = self._label_to_idx.get("Counter")
        self._valid_idx = self._label_to_idx.get("Validation Indicator")

        self._outlet: Optional[StreamOutlet] = None
        self._thread: Optional[threading.Thread] = None
        self._running = threading.Event()
        self._erd_events: list[_ErdEvent] = []
        self._erd_lock = threading.Lock()

    # ------------------------------------------------------------------
    # Lifecycle

    def start(self) -> "MockUnicornOutlet":
        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("MockUnicornOutlet is already running")

        info = StreamInfo(
            name=self._stream_name,
            type=self._stream_type,
            channel_count=DEFAULT_N_CHANNELS,
            nominal_srate=self._sample_rate,
            channel_format=cf_float32,
            source_id=f"mock-unicorn-{id(self):x}",
        )
        chans = info.desc().append_child("channels")
        for label in self._labels:
            ch = chans.append_child("channel")
            ch.append_child_value("label", label)
            ch.append_child_value("unit", "microvolts" if label in DEFAULT_EEG_LABELS else "")
            ch.append_child_value("type", "EEG" if label in DEFAULT_EEG_LABELS else "AUX")

        self._outlet = StreamOutlet(info, chunk_size=self._block_samples, max_buffered=60)
        self._running.set()
        self._thread = threading.Thread(target=self._run, name="MockUnicornOutlet", daemon=True)
        self._thread.start()
        logger.info("MockUnicornOutlet started: name=%r srate=%.1f", self._stream_name, self._sample_rate)
        return self

    def stop(self, join_timeout: float = 2.0) -> None:
        self._running.clear()
        if self._thread is not None:
            self._thread.join(timeout=join_timeout)
            if self._thread.is_alive():
                logger.warning("MockUnicornOutlet thread did not join within %.1fs", join_timeout)
        self._thread = None
        # Drop the outlet so consumers see the stream disappear from LSL.
        self._outlet = None
        logger.info("MockUnicornOutlet stopped")

    def __enter__(self) -> "MockUnicornOutlet":
        return self.start()

    def __exit__(self, exc_type, exc, tb) -> None:
        self.stop()

    # ------------------------------------------------------------------
    # ERD scheduling

    def inject_erd(
        self,
        channel_label: str,
        band: tuple[float, float],
        start_in_s: float,
        duration_s: float,
        suppression_fraction: float,
    ) -> None:
        """Schedule a temporary power suppression on `channel_label` in `band`.

        Suppression of 0.0 = no change; 1.0 = full removal of that band's sinusoid.
        """
        if channel_label not in self._label_to_idx:
            raise ValueError(f"Unknown channel label: {channel_label!r}")
        lo, hi = float(band[0]), float(band[1])
        if hi <= lo:
            raise ValueError(f"Invalid band: {band!r}")
        now = time.monotonic()
        event = _ErdEvent(
            channel_label=channel_label,
            band_lo=lo,
            band_hi=hi,
            start_mono=now + max(0.0, start_in_s),
            end_mono=now + max(0.0, start_in_s) + max(0.0, duration_s),
            suppression_fraction=float(np.clip(suppression_fraction, 0.0, 1.0)),
        )
        with self._erd_lock:
            self._erd_events.append(event)

    # ------------------------------------------------------------------
    # Generator thread

    def _run(self) -> None:
        sr = self._sample_rate
        block_n = self._block_samples
        block_dt = block_n / sr

        start_mono = time.perf_counter()
        sample_idx = 0
        # `start_t` is the elapsed-time-of-stream basis for sinusoids; it stays
        # tied to sample_idx (not wall time) so the synthetic waveform stays
        # phase-coherent even if the thread sleeps slightly off-schedule.
        try:
            while self._running.is_set():
                block = self._generate_block(sample_idx, block_n)
                if self._outlet is not None:
                    # push_chunk expects [n_samples][n_channels]; transpose to list-of-lists.
                    self._outlet.push_chunk(block.T.tolist())
                sample_idx += block_n
                next_deadline = start_mono + (sample_idx / sr)
                sleep_for = next_deadline - time.perf_counter()
                if sleep_for > 0:
                    # Use Event.wait so stop() can interrupt sleep promptly.
                    interrupted = self._running.wait(timeout=sleep_for)
                    if not interrupted and not self._running.is_set():
                        break
                # else: behind schedule, loop and catch up without sleeping
        except Exception:
            logger.exception("MockUnicornOutlet generator thread crashed")

    def _generate_block(self, start_sample: int, n_samples: int) -> np.ndarray:
        """Generate a [17, n_samples] float32 block starting at sample index start_sample."""
        sr = self._sample_rate
        sig = self._signal
        block = np.zeros((DEFAULT_N_CHANNELS, n_samples), dtype=np.float32)

        sample_indices = np.arange(start_sample, start_sample + n_samples, dtype=np.float64)
        t = sample_indices / sr
        block_wall_now = time.monotonic()
        block_end_wall = block_wall_now + (n_samples / sr)

        # Per-channel attenuation factors for mu and beta, default 1.0.
        active = self._snapshot_active_erd(block_wall_now, block_end_wall)

        mu_wave = np.sin(2 * math.pi * sig.mu_freq * t)
        beta_wave = np.sin(2 * math.pi * sig.beta_freq * t)

        for idx, label in zip(self._eeg_indices, self._eeg_labels_in_order):
            mu_scale = 1.0
            beta_scale = 1.0
            for ev in active.get(label, ()):
                if ev.band_lo <= sig.mu_freq <= ev.band_hi:
                    mu_scale *= (1.0 - ev.suppression_fraction)
                if ev.band_lo <= sig.beta_freq <= ev.band_hi:
                    beta_scale *= (1.0 - ev.suppression_fraction)
            noise = self._rng.standard_normal(n_samples) * sig.noise_std
            block[idx] = (
                sig.mu_amp * mu_scale * mu_wave
                + sig.beta_amp * beta_scale * beta_wave
                + noise
            ).astype(np.float32)

        # IMU: small white noise; accelerometer Z biased to 1.0 g.
        for axis in ("x", "y", "z"):
            ai = self._accel_idx[axis]
            if ai is not None:
                bias = 1.0 if axis == "z" else 0.0
                block[ai] = (self._rng.standard_normal(n_samples) * 0.01 + bias).astype(np.float32)
            gi = self._gyro_idx[axis]
            if gi is not None:
                block[gi] = (self._rng.standard_normal(n_samples) * 0.05).astype(np.float32)

        if self._battery_idx is not None:
            block[self._battery_idx] = 95.0
        if self._counter_idx is not None:
            block[self._counter_idx] = (sample_indices.astype(np.int64) % 65536).astype(np.float32)
        if self._valid_idx is not None:
            block[self._valid_idx] = 1.0

        return block

    def _snapshot_active_erd(self, block_start: float, block_end: float):
        """Return {label: [events]} for ERD events overlapping [block_start, block_end]."""
        out: dict[str, list[_ErdEvent]] = {}
        with self._erd_lock:
            # Drop fully-elapsed events so the list doesn't grow without bound.
            self._erd_events = [e for e in self._erd_events if e.end_mono > block_start]
            for ev in self._erd_events:
                if ev.start_mono <= block_end and ev.end_mono >= block_start:
                    out.setdefault(ev.channel_label, []).append(ev)
        return out
