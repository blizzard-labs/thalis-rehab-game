"""IntentScore engine — the mathematical heart of the scoring system.

Fuses a band-power ERD score and (optionally) a CSP+LDA classifier score into
a single 0–100 ``IntentScore``, with per-session adaptive normalization and an
exponential-moving-average smoother (spec Section 8.5: τ ≈ 300 ms).

Phase 1 runs in MODE A (covert motor imagery, no camera yet, spec §8.2):

    classifier reliable -> raw = 0.4·ERD + 0.6·classifier
    otherwise           -> raw = ERD          (band-power-only fallback)

Artifact windows (``artifact_clean=False``) freeze the score: they return the
previous value and do NOT update the EMA or the running normalization, so those
only ever track genuine signal.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import numpy as np

from acquisition.lsl_inlet import UNICORN_POSITIONAL_EEG_LABELS
from classifiers.online_classifier import OnlineClassifier
from features.erd import ERDCalculator
from scoring.ring_buffer import RingBuffer
from vision.types import KinematicResult

logger = logging.getLogger(__name__)

_NEUTRAL_SCORE = 50.0
# Don't let one early extreme value collapse the adaptive range: hold the
# 0/100 priors until this many real (non-artifact) points have been seen.
_NORM_WARMUP_POINTS = 10


@dataclass
class IntentScoreResult:
    """One scoring tick. Sub-scores are ``None`` when not computed this cycle."""

    intent_score: float
    erd_score: float | None
    classifier_score: float | None
    is_artifact: bool
    timestamp: float
    kinematic_score: float | None = None
    compensation_flag: bool = False
    mu_erd: dict[str, float] | None = None


class IntentScoreEngine:
    """Blend ERD + classifier into a smoothed, normalized 0–100 IntentScore."""

    def __init__(
        self,
        eeg_channel_labels: list[str] | None = None,
        erd_calculator: ERDCalculator | None = None,
        online_classifier: OnlineClassifier | None = None,
        classifier_reliable: bool = False,
        fs: int = 250,
        mi_window_samples: int = 1000,   # 4 s @ 250 Hz — full CSP window
        erd_window_samples: int = 250,   # 1 s @ 250 Hz — band-power ERD
        ema_alpha: float = 0.15,         # ~τ=300 ms at 20 Hz (spec §8.5)
    ):
        self.eeg_channel_labels = (
            list(eeg_channel_labels)
            if eeg_channel_labels is not None
            else list(UNICORN_POSITIONAL_EEG_LABELS)
        )
        if erd_calculator is None:
            raise ValueError("erd_calculator is required (must be baseline-calibrated)")
        self.erd_calculator = erd_calculator
        self.online_classifier = online_classifier
        self.classifier_reliable = bool(classifier_reliable)
        self.fs = int(fs)
        self.mi_window_samples = int(mi_window_samples)
        self.erd_window_samples = int(erd_window_samples)
        self.ema_alpha = float(ema_alpha)

        # Running state (only advanced on non-artifact ticks).
        self._prev_intent: float | None = None
        self._ema: float | None = None
        self._running_min: float = 0.0
        self._running_max: float = 100.0
        self._n_real: int = 0

        # Fusion session mode (spec §8.2–8.4). Camera absent -> Mode A (EEG only).
        self.session_mode: str = "A"
        self.classifier_input: RingBuffer | None = None

    _MODE_WEIGHTS = {"A": (1.0, 0.0), "B": (0.6, 0.4), "C": (0.25, 0.75)}

    def set_session_mode(self, mode: str) -> None:
        if mode not in self._MODE_WEIGHTS:
            raise ValueError(f"unknown session mode: {mode}")
        self.session_mode = mode

    # ------------------------------------------------------------------

    def compute(
        self,
        ring_buffer: RingBuffer,
        artifact_clean: bool,
        kinematic: "KinematicResult | None" = None,
    ) -> IntentScoreResult:
        now = time.time()

        if not artifact_clean:
            # Freeze: hold the last value, touch no running state.
            held = self._prev_intent if self._prev_intent is not None else _NEUTRAL_SCORE
            return IntentScoreResult(
                intent_score=held,
                erd_score=None,
                classifier_score=None,
                is_artifact=True,
                timestamp=now,
            )

        erd_score, mu_erd = self._compute_erd_score(ring_buffer)
        classifier_score = self._compute_classifier_score(self.classifier_input or ring_buffer)

        if self.classifier_reliable and classifier_score is not None:
            raw_score = 0.4 * erd_score + 0.6 * classifier_score
        else:
            raw_score = erd_score

        eeg_normalized = self._normalize(raw_score)   # 0–100 EEG component

        w_eeg, w_kin = self._MODE_WEIGHTS[self.session_mode]
        # Absent/invalid pose is absent evidence — never scored as clean stillness
        # or as movement: drop w_kin and renormalize to EEG-only (spec §7.3/§8.1).
        kin_valid = kinematic is not None and kinematic.pose_valid and w_kin > 0.0
        if kin_valid:
            total = w_eeg + w_kin
            fused = (w_eeg * eeg_normalized + w_kin * kinematic.kinematic_score) / total
            fused -= kinematic.compensation_penalty
            reported_kin = kinematic.kinematic_score
            comp_flag = kinematic.compensation_flag
        else:
            fused = eeg_normalized
            reported_kin = None
            comp_flag = False

        fused = float(np.clip(fused, 0.0, 100.0))
        intent = self._apply_ema(fused)
        self._prev_intent = intent

        return IntentScoreResult(
            intent_score=intent,
            erd_score=erd_score,
            classifier_score=classifier_score,
            is_artifact=False,
            timestamp=now,
            kinematic_score=reported_kin,
            compensation_flag=comp_flag,
            mu_erd=mu_erd,
        )

    # ------------------------------------------------------------------

    def _compute_erd_score(self, ring_buffer: RingBuffer) -> tuple[float, dict[str, float]]:
        """C3+C4 mu-band ERD averaged, clipped to [0, 100] (ERS -> 0).

        Returns 0.0 until a full ERD window of real samples exists: band power
        over a zero-padded window is meaningless (it reads as ~100% ERD) and
        would otherwise inject a large startup transient into the EMA.
        """
        if ring_buffer.n_samples_available() < self.erd_window_samples:
            return 0.0, {}
        window = ring_buffer.get_window(self.erd_window_samples)
        erd = self.erd_calculator.compute_erd(window, self.eeg_channel_labels)

        mu_vals = [erd[ch]["mu"] for ch in ("C3", "C4") if ch in erd]
        if not mu_vals:
            # No C3/C4 in this montage: fall back to all available mu ERDs.
            mu_vals = [bands.get("mu", 0.0) for bands in erd.values()]
        erd_avg = float(np.mean(mu_vals)) if mu_vals else 0.0
        return float(np.clip(erd_avg, 0.0, 100.0)), {
            ch: float(bands["mu"]) for ch, bands in erd.items()
            if "mu" in bands and np.isfinite(bands["mu"])
        }

    def _compute_classifier_score(self, ring_buffer: RingBuffer) -> float | None:
        """Classifier EEG_Score (0–100), or None when unavailable this cycle."""
        if self.online_classifier is None or not self.classifier_reliable:
            return None
        if ring_buffer.n_samples_available() < self.mi_window_samples:
            # Not enough data yet for a meaningful CSP covariance estimate.
            return None
        window = ring_buffer.get_window(self.mi_window_samples)
        return float(self.online_classifier.mi_score(window, self.eeg_channel_labels))

    def _normalize(self, raw_score: float) -> float:
        """Per-session adaptive min-max normalization to [0, 100]."""
        self._n_real += 1
        if self._n_real > _NORM_WARMUP_POINTS:
            self._running_min = min(self._running_min, raw_score)
            self._running_max = max(self._running_max, raw_score)
        span = self._running_max - self._running_min + 1e-9
        normalized = (raw_score - self._running_min) / span * 100.0
        return float(np.clip(normalized, 0.0, 100.0))

    def _apply_ema(self, normalized: float) -> float:
        if self._ema is None:
            self._ema = normalized
        else:
            self._ema = self.ema_alpha * normalized + (1.0 - self.ema_alpha) * self._ema
        return float(self._ema)
