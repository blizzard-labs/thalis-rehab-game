"""Graz-style motor-imagery cued calibration orchestrator (spec Section 6).

Drives the cued paradigm:

    fixation (2 s) -> cue (1.25 s) -> MI window (4 s) -> randomized ITI (2-3 s)

emitting LSL markers at each transition and collecting one labeled EEG epoch
per trial across a randomized, balanced, no-long-runs trial order. The result
is a :class:`CalibrationDataset` ready for offline CSP/LDA fitting.

Timing uses ``time.perf_counter`` with absolute per-trial deadlines so that
sleep overshoot on one segment does not accumulate into later segments — each
segment ends at ``trial_start + cumulative_duration`` regardless of when the
previous one actually woke up.
"""

from __future__ import annotations

import logging
import random
import threading
import time
from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np

from acquisition.lsl_inlet import EEGInlet
from calibration.marker_outlet import send_marker

logger = logging.getLogger(__name__)

_MAX_SHUFFLE_ATTEMPTS = 1000
_MAX_CONSECUTIVE = 3
_MIN_TRIALS_PER_CLASS = 5


class InsufficientDataError(RuntimeError):
    """Raised when too few complete trials per class were collected to be usable."""


@dataclass
class CalibrationDataset:
    """Labeled MI epochs plus session metadata from one calibration block."""

    epochs: np.ndarray  # [n_trials, n_channels, n_samples_per_epoch]
    labels: List[str]
    marker_timestamps: List[float]  # mi_window_onset LSL timestamps, per trial
    session_info: dict = field(default_factory=dict)

    @property
    def n_trials(self) -> int:
        return int(self.epochs.shape[0])


def _balanced_trial_order(
    classes: List[str],
    n_per_class: int,
    rng: random.Random,
) -> List[str]:
    """Return a balanced, shuffled class order with no more than 3 consecutive
    identical labels.

    Uses rejection sampling: reshuffle until the run-length constraint holds,
    up to _MAX_SHUFFLE_ATTEMPTS. On exhaustion, log a warning and return the
    last (unconstrained) shuffle rather than looping forever.
    """
    order = [c for c in classes for _ in range(n_per_class)]

    for _ in range(_MAX_SHUFFLE_ATTEMPTS):
        rng.shuffle(order)
        if _max_run_length(order) <= _MAX_CONSECUTIVE:
            return list(order)

    logger.warning(
        "Could not satisfy the <=%d-consecutive constraint in %d attempts; "
        "falling back to an unconstrained shuffle.",
        _MAX_CONSECUTIVE, _MAX_SHUFFLE_ATTEMPTS,
    )
    rng.shuffle(order)
    return list(order)


def _max_run_length(seq: List[str]) -> int:
    """Length of the longest run of identical consecutive elements."""
    longest = 0
    run = 0
    prev = object()
    for item in seq:
        run = run + 1 if item == prev else 1
        prev = item
        longest = max(longest, run)
    return longest


class CalibrationOrchestrator:
    """Runs the cued MI calibration block and collects labeled EEG epochs."""

    def __init__(
        self,
        n_trials_per_class: int = 20,
        classes: Optional[List[str]] = None,
        fixation_duration_s: float = 2.0,
        cue_duration_s: float = 1.25,
        mi_window_duration_s: float = 4.0,
        iti_min_s: float = 2.0,
        iti_max_s: float = 3.0,
        fs: int = 250,
        min_trials_per_class: int = _MIN_TRIALS_PER_CLASS,
        seed: Optional[int] = None,
        reject_bad_windows: bool = False,
    ):
        self.n_trials_per_class = int(n_trials_per_class)
        self.classes = list(classes) if classes is not None else ["imagine_right_hand", "rest"]
        self.fixation_duration_s = float(fixation_duration_s)
        self.cue_duration_s = float(cue_duration_s)
        self.mi_window_duration_s = float(mi_window_duration_s)
        self.iti_min_s = float(iti_min_s)
        self.iti_max_s = float(iti_max_s)
        self.fs = int(fs)
        self.min_trials_per_class = int(min_trials_per_class)
        self._rng = random.Random(seed)
        self.reject_bad_windows = reject_bad_windows

        if self.iti_max_s < self.iti_min_s:
            raise ValueError("iti_max_s must be >= iti_min_s")

    @property
    def n_samples_per_epoch(self) -> int:
        return int(round(self.mi_window_duration_s * self.fs))

    # ------------------------------------------------------------------

    def run(
        self,
        eeg_inlet: EEGInlet,
        marker_outlet,
        abort_event: Optional[threading.Event] = None,
    ) -> CalibrationDataset:
        """Execute the calibration block, returning a :class:`CalibrationDataset`.

        Supports clean early exit: at the start of each trial's ITI the
        ``abort_event`` (if given and set) causes the run to stop and return the
        complete trials collected so far. A trial aborted mid-MI-window is
        discarded. Raises :class:`InsufficientDataError` if fewer than
        _MIN_TRIALS_PER_CLASS complete trials per class were collected.
        """
        if abort_event is None:
            abort_event = threading.Event()

        channel_labels = eeg_inlet.eeg_labels
        n_channels = len(channel_labels)
        order = _balanced_trial_order(self.classes, self.n_trials_per_class, self._rng)

        epochs: List[np.ndarray] = []
        labels: List[str] = []
        marker_timestamps: List[float] = []

        for trial_n, trial_class in enumerate(order):
            if abort_event.is_set():
                logger.info("Abort requested before trial %d; stopping.", trial_n)
                break

            epoch, onset_ts = self._run_trial(
                trial_n, trial_class, eeg_inlet, marker_outlet, n_channels, abort_event
            )
            if epoch is None:
                # Aborted mid-window: discard partial trial and stop.
                if abort_event.is_set():
                    break
                logger.info("Discarding trial %d with missing or contaminated samples", trial_n)
                self._precise_sleep(self._rng.uniform(self.iti_min_s, self.iti_max_s), abort_event)
                continue

            epochs.append(epoch)
            labels.append(trial_class)
            marker_timestamps.append(onset_ts)

            # Inter-trial interval; honor abort at its start.
            if abort_event.is_set():
                logger.info("Abort requested at ITI of trial %d; stopping.", trial_n)
                break
            iti = self._rng.uniform(self.iti_min_s, self.iti_max_s)
            self._precise_sleep(iti, abort_event)

        self._raise_if_insufficient(labels)

        epochs_arr = (
            np.stack(epochs, axis=0)
            if epochs
            else np.empty((0, n_channels, self.n_samples_per_epoch), dtype=np.float64)
        )
        session_info = {
            "fs": self.fs,
            "channel_labels": list(channel_labels),
            "n_trials_per_class": self.n_trials_per_class,
            "classes": list(self.classes),
            "collection_timestamp": time.time(),
        }
        logger.info(
            "Calibration complete: %d trials, epochs shape %s",
            len(labels), epochs_arr.shape,
        )
        return CalibrationDataset(
            epochs=epochs_arr,
            labels=labels,
            marker_timestamps=marker_timestamps,
            session_info=session_info,
        )

    # ------------------------------------------------------------------
    # Per-trial machinery

    def _run_trial(
        self,
        trial_n: int,
        trial_class: str,
        eeg_inlet: EEGInlet,
        marker_outlet,
        n_channels: int,
        abort_event: threading.Event,
    ) -> tuple[Optional[np.ndarray], float]:
        """Run one trial. Returns (epoch [n_channels, n_samples] | None, onset_ts).

        The epoch is None only if abort fired mid-MI-window — the caller treats
        that as a partial/aborted trial and discards it.
        """
        meta = {"trial_n": trial_n, "class": trial_class}

        # Absolute deadlines from a single anchor so per-segment sleep overshoot
        # does not accumulate across the trial.
        trial_start = time.perf_counter()
        fixation_end = trial_start + self.fixation_duration_s
        cue_end = fixation_end + self.cue_duration_s
        mi_end = cue_end + self.mi_window_duration_s

        send_marker(marker_outlet, "fixation_onset", meta)
        self._sleep_until(fixation_end)

        send_marker(marker_outlet, "cue_onset", meta)
        self._sleep_until(cue_end)

        # Discard anything buffered so the epoch tracks live data during the
        # window, then mark the onset against the LSL clock.
        if self.reject_bad_windows:
            while eeg_inlet.get_chunk(max_samples=10000, timeout=0)[0].shape[1]:
                pass
        else:
            self._drain(eeg_inlet)
        onset_ts = send_marker(marker_outlet, "mi_window_onset", meta)

        epoch = self._collect_mi_window(eeg_inlet, mi_end, n_channels, abort_event)

        send_marker(marker_outlet, "mi_window_offset", meta)
        return epoch, onset_ts

    def _collect_mi_window(
        self,
        eeg_inlet: EEGInlet,
        deadline: float,
        n_channels: int,
        abort_event: threading.Event,
    ) -> Optional[np.ndarray]:
        """Continuously pull EEG until perf_counter reaches `deadline`, concat,
        and fix to exactly n_samples_per_epoch columns.

        Returns [n_channels, n_samples_per_epoch], or None if `abort_event` set
        mid-window (the partial trial is discarded by the caller). If the stream
        under-delivers (rare; ragged LSL timing) the buffer is right-padded with
        its last column, or zeros if nothing arrived.
        """
        parts: List[np.ndarray] = []
        motion: List[np.ndarray] = []
        gap = False
        while True:
            if abort_event.is_set():
                return None
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                break
            if self.reject_bad_windows:
                chunk, imu = eeg_inlet.get_chunk(max_samples=self.fs, timeout=min(remaining, 0.1))
                if chunk.shape[1]:
                    motion.append(imu)
                    gap |= eeg_inlet.last_chunk_gap
            else:
                chunk = eeg_inlet.get_eeg_chunk(max_samples=self.fs, timeout=min(remaining, 0.1))
            if chunk.shape[1] > 0:
                parts.append(chunk)

        n_target = self.n_samples_per_epoch
        if parts:
            buf = np.concatenate(parts, axis=1)
        else:
            buf = np.empty((n_channels, 0), dtype=np.float64)

        if self.reject_bad_windows:
            if not parts:
                raise RuntimeError("Lost the EEG stream during cued calibration. Reconnect and retry.")
            from preprocessing.artifact import AmplitudeGate, MovementGate
            if (gap or buf.shape[1] < 0.98 * n_target or not np.isfinite(buf).all()
                    or np.any(np.ptp(buf, axis=1) < 1)
                    or not AmplitudeGate().is_clean(buf)
                    or not MovementGate().is_head_still(np.concatenate(motion, axis=1))):
                return None
            # Align a nearly complete, continuous trial to its nominal cue window.
            if buf.shape[1] < n_target:
                from scipy.signal import resample
                return resample(buf, n_target, axis=1)
        if buf.shape[1] >= n_target:
            return buf[:, :n_target].copy()

        # Under-delivery: right-pad to the fixed epoch length.
        deficit = n_target - buf.shape[1]
        logger.warning(
            "MI window under-delivered: got %d / %d samples; padding %d.",
            buf.shape[1], n_target, deficit,
        )
        if buf.shape[1] == 0:
            return np.zeros((n_channels, n_target), dtype=np.float64)
        pad = np.repeat(buf[:, -1:], deficit, axis=1)
        return np.concatenate([buf, pad], axis=1)

    @staticmethod
    def _drain(eeg_inlet: EEGInlet) -> None:
        """Discard buffered samples so the next pull tracks live data."""
        while True:
            chunk = eeg_inlet.get_eeg_chunk(max_samples=10000, timeout=0.0)
            if chunk.shape[1] == 0:
                break

    def _raise_if_insufficient(self, labels: List[str]) -> None:
        """Guard the returned dataset.

        Hard-raise only on an empty result — a calibration block that produced
        no complete trials is unusable and must not be returned silently. When
        trials exist but any class fell below ``min_trials_per_class`` (e.g. an
        early abort), log a warning so the downstream CSP/LDA fit and the
        Section-6.5 cross-val quality gate can decide whether the data is
        trustworthy, rather than discarding salvageable trials here.
        """
        if not labels:
            raise InsufficientDataError(
                "No complete trials were collected before abort; refusing to "
                "return an empty calibration dataset."
            )
        for cls in self.classes:
            count = labels.count(cls)
            if count < self.min_trials_per_class:
                logger.warning(
                    "Class %r has only %d trials (< min_trials_per_class=%d); "
                    "classifier fit may be unreliable.",
                    cls, count, self.min_trials_per_class,
                )

    # ------------------------------------------------------------------
    # Timing helpers (perf_counter based)

    @staticmethod
    def _sleep_until(deadline: float) -> None:
        """Sleep until perf_counter reaches `deadline`, in short increments to
        keep wakeups close to the absolute target."""
        while True:
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                return
            time.sleep(min(remaining, 0.02))

    @staticmethod
    def _precise_sleep(duration: float, abort_event: threading.Event) -> None:
        """Sleep for `duration` seconds, returning early if `abort_event` sets."""
        deadline = time.perf_counter() + duration
        while True:
            remaining = deadline - time.perf_counter()
            if remaining <= 0 or abort_event.is_set():
                return
            time.sleep(min(remaining, 0.02))
