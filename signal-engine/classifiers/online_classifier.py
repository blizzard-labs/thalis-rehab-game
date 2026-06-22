"""Online decode wrapper around a fitted :class:`CSPLDAClassifier`.

Consumes the full 4 s MI window from the live ring buffer (spec Section 5.3:
CSP needs the whole window, not a short chunk, for the covariance estimate to
be meaningful) and returns per-class probabilities plus a 0–100 EEG_Score for
the IntentScore fusion in the next prompt.

If the loaded model failed the reliability gate, decoding still runs (so the
pipeline never hard-stops), but a warning is logged — throttled to once per
minute so a 20–60 Hz scoring loop can't spam the log.
"""

from __future__ import annotations

import logging
import time

import numpy as np

from classifiers.csp_lda import CSPLDAClassifier, ModelNotFittedError

logger = logging.getLogger(__name__)

_DEFAULT_TARGET = "imagine_right_hand"
_WARN_INTERVAL_S = 60.0


class OnlineClassifier:
    """Thin real-time decode layer over a fitted CSPLDAClassifier."""

    def __init__(self, classifier: CSPLDAClassifier):
        if not getattr(classifier, "is_fitted", False):
            raise ModelNotFittedError(
                "OnlineClassifier requires a fitted/loaded CSPLDAClassifier."
            )
        self.classifier = classifier
        self._last_unreliable_warn: float = 0.0

    @property
    def is_reliable(self) -> bool:
        fr = self.classifier.fit_result
        return bool(fr.is_reliable) if fr is not None else True

    def _maybe_warn_unreliable(self) -> None:
        if self.is_reliable:
            return
        now = time.time()
        if now - self._last_unreliable_warn >= _WARN_INTERVAL_S:
            self._last_unreliable_warn = now
            fr = self.classifier.fit_result
            acc = fr.mean_cv_accuracy if fr is not None else float("nan")
            logger.warning(
                "Decoding with an UNRELIABLE model (CV acc %.3f < gate). EEG "
                "score should be down-weighted in Blended fusion (spec §8.3).",
                acc,
            )

    def predict_proba(
        self, epoch: np.ndarray, channel_labels: list[str]
    ) -> dict[str, float]:
        """``{class_name: probability}`` for one full MI window."""
        self._maybe_warn_unreliable()
        return self.classifier.predict_proba(epoch, channel_labels)

    def mi_score(
        self,
        epoch: np.ndarray,
        channel_labels: list[str],
        target_class: str = _DEFAULT_TARGET,
    ) -> float:
        """Probability of ``target_class`` as a 0–100 float (EEG_Score)."""
        proba = self.predict_proba(epoch, channel_labels)
        if target_class not in proba:
            raise ValueError(
                f"target_class {target_class!r} not among model classes "
                f"{list(proba.keys())}."
            )
        return float(proba[target_class] * 100.0)
