import numpy as np

from features.erd import ERDCalculator
from scoring.intent_score import IntentScoreEngine
from scoring.ring_buffer import RingBuffer
from vision.types import KinematicResult

_LABELS = ["Fz", "C3", "Cz", "C4", "Pz", "PO7", "Oz", "PO8"]


def _engine(mode="A"):
    erd = ERDCalculator(channel_labels=["C3", "C4"], fs=250)
    erd.calibrate_baseline(np.random.default_rng(0).normal(0, 10, (8, 500)), _LABELS)
    eng = IntentScoreEngine(
        eeg_channel_labels=_LABELS,
        erd_calculator=erd, online_classifier=None, classifier_reliable=False, fs=250,
    )
    eng.set_session_mode(mode)
    return eng


def _rb():
    rb = RingBuffer(8, 1000)
    rb.push(np.random.default_rng(1).normal(0, 10, (8, 1000)))
    return rb


def test_mode_a_ignores_kinematic():
    eng = _engine("A")
    kin = KinematicResult(100.0, 0.0, False, True, True, 0.0)
    r = eng.compute(_rb(), artifact_clean=True, kinematic=kin)
    assert r.kinematic_score is None            # Mode A: w_kin=0, no kinematic contribution
    eng2 = _engine("A")
    r2 = eng2.compute(_rb(), artifact_clean=True, kinematic=None)
    assert r.intent_score == r2.intent_score


def test_mode_c_kinematic_dominates():
    strong = _engine("C").compute(_rb(), artifact_clean=True,
                                  kinematic=KinematicResult(100.0, 0.0, False, True, True, 0.0))
    weak = _engine("C").compute(_rb(), artifact_clean=True,
                                kinematic=KinematicResult(0.0, 0.0, False, False, True, 0.0))
    assert strong.intent_score > weak.intent_score


def test_absent_pose_falls_back_to_eeg_only():
    invalid = KinematicResult(0.0, 0.0, False, False, False, 0.0)  # pose_valid False
    r = _engine("B").compute(_rb(), artifact_clean=True, kinematic=invalid)
    r_none = _engine("B").compute(_rb(), artifact_clean=True, kinematic=None)
    assert r.intent_score == r_none.intent_score
    assert r.kinematic_score is None


def test_compensation_penalty_subtracts():
    clean = _engine("C").compute(_rb(), artifact_clean=True,
                                 kinematic=KinematicResult(80.0, 0.0, False, True, True, 0.0))
    penalized = _engine("C").compute(_rb(), artifact_clean=True,
                                     kinematic=KinematicResult(80.0, 30.0, True, True, True, 0.0))
    assert penalized.intent_score < clean.intent_score
    assert penalized.compensation_flag is True


def test_backward_compatible_two_arg_call():
    r = _engine("A").compute(_rb(), artifact_clean=True)  # no kinematic kwarg
    assert r.kinematic_score is None and r.compensation_flag is False
