"""Unit/integration tests for the CSP+LDA classifier and online decode layer.

No headset required: we synthesize calibration data with a *detectable* spatial
pattern (a classifier trained on pure noise can't beat chance, which would make
the quality-gate assertions flaky). The discriminating signal is a 10 Hz
sinusoid that loads heavily on channel 0 (C3-proxy) and weakly on channel 3
(C4-proxy) for the MI class, and is absent for rest — exactly the kind of
lateralized variance difference CSP is built to find.
"""

from __future__ import annotations

import numpy as np
import pytest

from calibration.orchestrator import CalibrationDataset
from classifiers.csp_lda import (
    CSPLDAClassifier,
    FitResult,
    ModelNotFittedError,
)
from classifiers.online_classifier import OnlineClassifier

FS = 250
N_CHANNELS = 8
N_SAMPLES = 1000  # 4 s at 250 Hz — matches the real MI window duration
N_PER_CLASS = 25
C3_PROXY = 0
C4_PROXY = 3
CLASSES = ["imagine_right_hand", "rest"]
CH_LABELS = [f"ch{i}" for i in range(N_CHANNELS)]  # 8 channel names


# --------------------------------------------------------------------------- #
# Synthetic data
# --------------------------------------------------------------------------- #
def _make_synthetic_dataset(seed: int = 42, noise_std: float = 1.0) -> CalibrationDataset:
    """8-channel epochs with a CSP-detectable lateralized 10 Hz pattern.

    imagine_right_hand: Gaussian noise + 10 Hz sinusoid, amplitude 3*std on the
    C3-proxy channel and 0.5*std on the C4-proxy channel.
    rest: same Gaussian noise, no sinusoid.
    """
    rng = np.random.default_rng(seed)
    t = np.arange(N_SAMPLES) / FS
    sine = np.sin(2 * np.pi * 10.0 * t)

    epochs = []
    labels = []
    for _ in range(N_PER_CLASS):
        mi = rng.normal(0.0, noise_std, size=(N_CHANNELS, N_SAMPLES))
        mi[C3_PROXY] += 3.0 * noise_std * sine
        mi[C4_PROXY] += 0.5 * noise_std * sine
        epochs.append(mi)
        labels.append("imagine_right_hand")

        rest = rng.normal(0.0, noise_std, size=(N_CHANNELS, N_SAMPLES))
        epochs.append(rest)
        labels.append("rest")

    epochs = np.asarray(epochs, dtype=np.float64)
    marker_ts = list(np.arange(len(labels), dtype=float))
    return CalibrationDataset(
        epochs=epochs,
        labels=labels,
        marker_timestamps=marker_ts,
        session_info={"fs": FS, "classes": CLASSES},
    )


def _make_noise_dataset(seed: int = 42, noise_std: float = 1.0) -> CalibrationDataset:
    """Pure Gaussian noise — no class-discriminating pattern at all."""
    np.random.seed(seed)
    rng = np.random.default_rng(seed)
    epochs = []
    labels = []
    for _ in range(N_PER_CLASS):
        for cls in CLASSES:
            epochs.append(rng.normal(0.0, noise_std, size=(N_CHANNELS, N_SAMPLES)))
            labels.append(cls)
    epochs = np.asarray(epochs, dtype=np.float64)
    return CalibrationDataset(
        epochs=epochs,
        labels=labels,
        marker_timestamps=list(np.arange(len(labels), dtype=float)),
        session_info={"fs": FS, "classes": CLASSES},
    )


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
def test_fit_strong_pattern_beats_gate():
    ds = _make_synthetic_dataset(seed=42)
    clf = CSPLDAClassifier(n_components=4)
    result = clf.fit(ds)

    assert isinstance(result, FitResult)
    assert result.n_trials == 2 * N_PER_CLASS
    assert sorted(result.classes) == sorted(CLASSES)
    assert len(result.per_fold_accuracies) == 5
    # Strong, separable pattern: should land well above the 0.60 gate.
    assert result.mean_cv_accuracy > 0.65, (
        f"CV accuracy {result.mean_cv_accuracy:.3f} too low — classifier likely "
        f"broken (per-fold {result.per_fold_accuracies})"
    )
    assert result.is_reliable is True


def test_quality_gate_rejects_noise():
    ds = _make_noise_dataset(seed=42)
    clf = CSPLDAClassifier(n_components=4)
    result = clf.fit(ds)

    assert result.is_reliable is False
    # No signal -> accuracy near chance. Allow slack for finite-sample noise.
    assert result.mean_cv_accuracy < 0.60
    assert abs(result.mean_cv_accuracy - 0.5) < 0.15


def test_save_load_round_trip(tmp_path):
    ds = _make_synthetic_dataset(seed=1)
    clf = CSPLDAClassifier(n_components=4)
    clf.fit(ds)

    epoch = ds.epochs[0]
    before = clf.predict_proba(epoch, CH_LABELS)

    path = tmp_path / "model.joblib"
    clf.save(path)
    loaded = CSPLDAClassifier.load(path)
    after = loaded.predict_proba(epoch, CH_LABELS)

    assert set(before) == set(after)
    for k in before:
        assert before[k] == pytest.approx(after[k], abs=1e-6)


def test_save_unfitted_raises(tmp_path):
    clf = CSPLDAClassifier()
    with pytest.raises(ModelNotFittedError):
        clf.save(tmp_path / "nope.joblib")


def test_single_class_raises():
    ds = _make_synthetic_dataset(seed=3)
    # Collapse to one class.
    ds.labels[:] = ["rest"] * len(ds.labels)
    clf = CSPLDAClassifier()
    with pytest.raises(ValueError, match="at least 2 classes"):
        clf.fit(ds)


def test_mi_score_in_range():
    ds = _make_synthetic_dataset(seed=42)
    clf = CSPLDAClassifier(n_components=4)
    clf.fit(ds)
    online = OnlineClassifier(clf)

    mi_epoch = ds.epochs[0]     # imagine_right_hand
    rest_epoch = ds.epochs[1]   # rest
    for ep in (mi_epoch, rest_epoch):
        score = online.mi_score(ep, CH_LABELS, target_class="imagine_right_hand")
        assert isinstance(score, float)
        assert 0.0 <= score <= 100.0


def test_predict_proba_channel_mismatch_raises():
    ds = _make_synthetic_dataset(seed=42)
    clf = CSPLDAClassifier(n_components=4)
    clf.fit(ds)

    bad_epoch = np.zeros((N_CHANNELS - 1, N_SAMPLES))  # wrong channel count
    with pytest.raises(ValueError, match="channel count mismatch"):
        clf.predict_proba(bad_epoch, CLASSES[: N_CHANNELS - 1])


def test_online_requires_fitted_classifier():
    clf = CSPLDAClassifier()
    with pytest.raises(ModelNotFittedError):
        OnlineClassifier(clf)
