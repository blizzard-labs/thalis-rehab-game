from threading import Event
from uuid import uuid4
import numpy as np
from acquisition import practice_eeg
from calibration.orchestrator import CalibrationDataset
from classifiers.online_classifier import OnlineClassifier


def test_trained_left_hand_profile_roundtrips_and_stays_scoped(tmp_path, monkeypatch):
    monkeypatch.setenv("NEUROREACH_DATA_DIR", str(tmp_path))
    rng = np.random.default_rng(9)
    labels = ["imagine_left_hand","rest"] * 10
    epochs = rng.normal(size=(20,8,1000))
    epochs[::2,3] += 6 * np.sin(2*np.pi*10*np.arange(1000)/250)
    ds = CalibrationDataset(epochs, labels, list(range(20)), {"fs":250})
    monkeypatch.setattr(practice_eeg.CalibrationOrchestrator, "run", lambda *a,**k: ds)
    monkeypatch.setattr(practice_eeg, "CueOutlet", lambda emit: None)
    stream = type("Stream", (), {"name":lambda self:"UN-test"})()
    a, b = str(uuid4()), str(uuid4())
    path = practice_eeg.model_path(a,stream,"left",list(range(8)))
    other = practice_eeg.model_path(b,stream,"left",list(range(8)))
    model = practice_eeg.calibration(None, Event(), {"side":"left","train":True},path,lambda e:None)
    assert model is not None and path.is_file() and not other.exists()
    restored = practice_eeg.calibration(None, Event(), {"side":"left"},path,lambda e:None)
    actual = OnlineClassifier(restored,"imagine_left_hand").mi_score(epochs[0],list(range(8)))
    assert np.isfinite(actual) and actual > 60
