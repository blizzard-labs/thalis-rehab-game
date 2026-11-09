"""Per-patient CSP + LDA motor-imagery classifier.

Trained offline on one calibration block (Section 6, step 4). CSP filters are
*not* transferable across patients/sessions, so this is refit every session.
The fit reports 5-fold cross-validated accuracy; that number is the quality
gate from spec Section 6, step 5 — below 0.60 the model is flagged unreliable
and the system runs in band-power-only / Blended fallback mode rather than
trusting EEG-led decoding.

Filtering reuses the OFFLINE (zero-phase ``filtfilt``) path from
``preprocessing/filters.py`` — never reimplemented here, and never the causal
path (this is post-hoc batch analysis, lookahead is allowed).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Union

import joblib
import numpy as np
from mne.decoding import CSP
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder

from calibration.epoch_extractor import label_encode
from calibration.orchestrator import CalibrationDataset
from preprocessing.filters import bandpass_filter_offline, notch_filter_offline

logger = logging.getLogger(__name__)

# Quality gate (spec Section 6, step 5): mean CV accuracy must clear this for
# the model to drive EEG-led scoring.
RELIABILITY_THRESHOLD = 0.60

# Offline analysis band / line-noise notch (spec Section 5.3).
_BANDPASS_LOW = 1.0
_BANDPASS_HIGH = 40.0
_NOTCH_FREQ = 60.0
_DEFAULT_FS = 250.0


class ModelNotFittedError(RuntimeError):
    """Raised when an operation needs a fitted model but none exists yet."""


@dataclass
class FitResult:
    """Outcome of a calibration fit, including the §6.5 reliability gate."""

    mean_cv_accuracy: float
    per_fold_accuracies: list[float]
    is_reliable: bool
    n_trials: int
    classes: list[str]
    timestamp: float = field(default_factory=time.time)


def _filter_epochs_offline(epochs: np.ndarray, fs: float) -> np.ndarray:
    """Apply offline notch + bandpass to every epoch independently.

    ``epochs`` is ``[n_trials, n_channels, n_samples]``. Each trial is filtered
    on its own (zero-phase, along the sample axis) — matching how a single live
    window will be filtered at inference, so train/inference stay consistent.
    Notch first (kill line noise), then restrict to the analysis band.
    """
    epochs = np.asarray(epochs, dtype=np.float64)
    if epochs.ndim != 3:
        raise ValueError(
            f"expected epochs [n_trials, n_channels, n_samples], got {epochs.shape}"
        )
    out = np.empty_like(epochs)
    for i in range(epochs.shape[0]):
        notched = notch_filter_offline(epochs[i], fs=fs, freq=_NOTCH_FREQ)
        out[i] = bandpass_filter_offline(
            notched, fs=fs, low=_BANDPASS_LOW, high=_BANDPASS_HIGH
        )
    return out


def _filter_single_epoch_offline(epoch: np.ndarray, fs: float) -> np.ndarray:
    """Offline notch + bandpass for one ``[n_channels, n_samples]`` epoch."""
    epoch = np.asarray(epoch, dtype=np.float64)
    if epoch.ndim != 2:
        raise ValueError(
            f"expected epoch [n_channels, n_samples], got {epoch.shape}"
        )
    notched = notch_filter_offline(epoch, fs=fs, freq=_NOTCH_FREQ)
    return bandpass_filter_offline(
        notched, fs=fs, low=_BANDPASS_LOW, high=_BANDPASS_HIGH
    )


class CSPLDAClassifier:
    """CSP spatial filters + shrinkage-LDA, fit on one calibration block."""

    def __init__(
        self,
        n_components: int = 4,
        regularization: str = "ledoit_wolf",
        **kwargs,
    ):
        """
        Parameters
        ----------
        n_components : int
            CSP filter pairs. Keep <= 4 on the 8-channel montage to avoid
            overfitting (spec Section 5.3).
        regularization : str
            LDA covariance regularization. ``"ledoit_wolf"`` maps to sklearn's
            automatic Ledoit-Wolf shrinkage (``shrinkage="auto"``); any other
            value is passed straight through as the ``shrinkage`` argument.
        **kwargs
            ``csp_kwargs`` / ``lda_kwargs`` dicts override the defaults passed
            to ``mne.decoding.CSP`` and ``LinearDiscriminantAnalysis``
            respectively. Anything else is forwarded to CSP for convenience.
        """
        self.n_components = n_components
        self.regularization = regularization

        self._csp_kwargs = dict(kwargs.pop("csp_kwargs", {}))
        self._lda_kwargs = dict(kwargs.pop("lda_kwargs", {}))
        # Remaining kwargs are treated as CSP overrides.
        self._csp_kwargs.update(kwargs)

        # Populated by fit().
        self._pipeline: Pipeline | None = None
        self._encoder: LabelEncoder | None = None
        self._fit_result: FitResult | None = None
        self.n_channels_: int | None = None
        self.fs_: float = _DEFAULT_FS

    # ------------------------------------------------------------------ build
    def _build_pipeline(self) -> Pipeline:
        csp_params = dict(
            n_components=self.n_components,
            reg=None,
            log=True,
            norm_trace=False,
        )
        csp_params.update(self._csp_kwargs)

        shrinkage = (
            "auto" if self.regularization == "ledoit_wolf" else self.regularization
        )
        lda_params = dict(solver="lsqr", shrinkage=shrinkage)
        lda_params.update(self._lda_kwargs)

        return Pipeline(
            [
                ("csp", CSP(**csp_params)),
                ("lda", LinearDiscriminantAnalysis(**lda_params)),
            ]
        )

    # -------------------------------------------------------------------- fit
    def fit(self, dataset: CalibrationDataset) -> FitResult:
        """Filter, CSP-transform, fit LDA, and 5-fold cross-validate."""
        fs = float(dataset.session_info.get("fs", _DEFAULT_FS))
        self.fs_ = fs

        y, encoder = label_encode(dataset)
        classes = list(encoder.classes_)
        if len(classes) < 2:
            raise ValueError(
                "CSP requires at least 2 classes; calibration dataset has "
                f"{len(classes)}: {classes}. Cannot fit a discriminative model."
            )

        if not np.isfinite(dataset.epochs).all():
            raise ValueError("Calibration epochs contain non-finite samples")
        X = _filter_epochs_offline(dataset.epochs, fs)
        self.n_channels_ = int(X.shape[1])

        # 5-fold stratified CV on the full CSP+LDA pipeline. cross_val_score
        # clones the pipeline per fold, so CSP is refit inside each fold (no
        # leakage of the spatial filters across the train/test split).
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        fold_scores = cross_val_score(
            self._build_pipeline(), X, y, cv=cv, scoring="accuracy"
        )
        per_fold = [float(s) for s in fold_scores]
        mean_cv = float(np.mean(per_fold))
        is_reliable = mean_cv >= RELIABILITY_THRESHOLD

        # Production model: refit on ALL trials.
        self._pipeline = self._build_pipeline()
        self._pipeline.fit(X, y)
        fitted_probs = self._pipeline.predict_proba(X)
        if not np.isfinite(fitted_probs).all() or not np.isfinite(fold_scores).all():
            raise ValueError("Classifier produced non-finite validation scores or probabilities")
        self._encoder = encoder

        result = FitResult(
            mean_cv_accuracy=mean_cv,
            per_fold_accuracies=per_fold,
            is_reliable=is_reliable,
            n_trials=int(dataset.n_trials),
            classes=classes,
        )
        self._fit_result = result

        if not is_reliable:
            logger.warning(
                "Calibration UNRELIABLE: mean CV accuracy %.3f < %.2f gate. "
                "Model still loads, but EEG-led scoring should fall back to "
                "band-power-only / Blended mode (spec Section 6 step 5 / 8.3).",
                mean_cv, RELIABILITY_THRESHOLD,
            )
        else:
            logger.info(
                "Calibration OK: mean CV accuracy %.3f (folds=%s), n_trials=%d, "
                "classes=%s", mean_cv, per_fold, result.n_trials, classes,
            )
        return result

    # --------------------------------------------------------------- predict
    @property
    def is_fitted(self) -> bool:
        return self._pipeline is not None and self._encoder is not None

    @property
    def fit_result(self) -> FitResult | None:
        return self._fit_result

    @property
    def classes_(self) -> list[str]:
        if self._encoder is None:
            raise ModelNotFittedError("Model not fitted; no classes available.")
        return list(self._encoder.classes_)

    def predict_proba(
        self, epoch: np.ndarray, channel_labels: list[str]
    ) -> dict[str, float]:
        """Return ``{class_name: probability}`` for one filtered MI window.

        ``epoch`` is ``[n_channels, n_samples]`` (the full MI window). It is
        offline-filtered exactly like training before going through the
        pipeline.
        """
        if not self.is_fitted:
            raise ModelNotFittedError("Call fit() (or load()) before predict.")

        epoch = np.asarray(epoch, dtype=np.float64)
        if epoch.ndim != 2:
            raise ValueError(
                f"expected epoch [n_channels, n_samples], got shape {epoch.shape}"
            )
        n_ch = epoch.shape[0]
        if n_ch != self.n_channels_:
            raise ValueError(
                f"channel count mismatch: model trained on {self.n_channels_} "
                f"channels, got {n_ch} (channel_labels={channel_labels})."
            )
        if channel_labels is not None and len(channel_labels) != n_ch:
            raise ValueError(
                f"channel_labels has {len(channel_labels)} entries but epoch "
                f"has {n_ch} channels."
            )

        filtered = _filter_single_epoch_offline(epoch, self.fs_)
        X = filtered[np.newaxis, :, :]  # [1, n_channels, n_samples]
        proba = self._pipeline.predict_proba(X)[0]

        if not np.isfinite(proba).all():
            raise ValueError("Classifier produced non-finite probabilities")
        # LDA class order is the sorted integer labels 0..k-1, which the encoder
        # decodes back to the original class names.
        class_names = self._encoder.inverse_transform(self._pipeline.classes_)
        return {str(name): float(p) for name, p in zip(class_names, proba)}

    # ------------------------------------------------------------ persistence
    def save(self, path: Union[str, Path]) -> None:
        """Serialize pipeline + label encoder + metadata to a single file."""
        if not self.is_fitted:
            raise ModelNotFittedError("Cannot save(): model is not fitted.")
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "pipeline": self._pipeline,
            "encoder": self._encoder,
            "fit_result": self._fit_result,
            "n_components": self.n_components,
            "regularization": self.regularization,
            "n_channels": self.n_channels_,
            "fs": self.fs_,
            "csp_kwargs": self._csp_kwargs,
            "lda_kwargs": self._lda_kwargs,
        }
        joblib.dump(payload, path)
        logger.info("Saved CSPLDAClassifier to %s", path)

    @classmethod
    def load(cls, path: Union[str, Path]) -> "CSPLDAClassifier":
        """Reload a classifier (pipeline + encoder travel together)."""
        path = Path(path)
        payload = joblib.load(path)
        obj = cls(
            n_components=payload["n_components"],
            regularization=payload["regularization"],
        )
        obj._csp_kwargs = dict(payload.get("csp_kwargs", {}))
        obj._lda_kwargs = dict(payload.get("lda_kwargs", {}))
        obj._pipeline = payload["pipeline"]
        obj._encoder = payload["encoder"]
        obj._fit_result = payload["fit_result"]
        obj.n_channels_ = payload["n_channels"]
        obj.fs_ = payload.get("fs", _DEFAULT_FS)
        logger.info("Loaded CSPLDAClassifier from %s", path)
        return obj
