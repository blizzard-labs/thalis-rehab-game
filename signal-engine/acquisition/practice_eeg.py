"""One selected Unicorn stream owns a local practice session until its socket closes."""
import hashlib
import json
import os
import time
from pathlib import Path
from uuid import UUID

import numpy as np
from pylsl import resolve_streams

from acquisition.lsl_inlet import EEGInlet, UNICORN_POSITIONAL_EEG_LABELS
from calibration.marker_outlet import create_marker_outlet, parse_marker
from calibration.orchestrator import CalibrationOrchestrator, InsufficientDataError
from classifiers.csp_lda import CSPLDAClassifier
from classifiers.online_classifier import OnlineClassifier
from features.erd import ERDCalculator
from preprocessing.artifact import AmplitudeGate, MovementGate
from preprocessing.filters import CausalFilterChain
from preprocessing.spatial import common_average_reference
from scoring.intent_score import IntentScoreEngine
from scoring.ring_buffer import RingBuffer
from scoring.signal_quality import compute_channel_quality

FS = 250
BASELINE_SECONDS = 60


def devices():
    # A label-free positional layout is specific to the Unicorn bridge.
    return {s.uid(): s for s in resolve_streams(wait_time=1)
            if s.name().startswith("UN-") and s.type() in {"EEG", "Data"}
            and s.channel_count() == 17 and s.nominal_srate() == FS}


def quality(window, imu, labels):
    contacts = compute_channel_quality(window, labels)
    bad = [c["label"] for c in contacts if c["quality"] == "poor"]
    clean = (not bad and np.isfinite(window).all() and AmplitudeGate().is_clean(window)
             and MovementGate().is_head_still(imu))
    return clean, bad


def baseline(inlet, stop, emit):
    accepted, pending, motion = [], [], []
    count = 0
    deadline = time.monotonic() + BASELINE_SECONDS + 90
    while len(accepted) < BASELINE_SECONDS and not stop.is_set():
        if time.monotonic() >= deadline:
            raise ValueError("Could not capture enough clean resting EEG. Check contact and retry.")
        eeg, imu = inlet.get_chunk(max_samples=FS, timeout=0.25)
        if eeg.shape[1] == 0:
            continue
        if inlet.last_chunk_gap:
            pending, motion, count = [], [], 0
            continue
        pending.append(eeg)
        motion.append(imu)
        count += eeg.shape[1]
        if count < FS:
            continue
        window, imu_window = np.concatenate(pending, axis=1), np.concatenate(motion, axis=1)
        clean, bad = quality(window[:, :FS], imu_window[:, :FS], inlet.eeg_labels)
        if clean:
            accepted.append(window[:, :FS])
        pending, motion = [window[:, FS:]], [imu_window[:, FS:]]
        count -= FS
        emit({"type": "phase", "message": f"Rest quietly · {len(accepted)} / {BASELINE_SECONDS} clean seconds",
              "contacts": bad})
    if stop.is_set():
        raise InterruptedError()
    return np.concatenate(accepted, axis=1)


class CueOutlet:
    def __init__(self, emit):
        self.outlet = create_marker_outlet()
        self.emit = emit

    def push_sample(self, sample, timestamp):
        self.outlet.push_sample(sample, timestamp)
        label, meta = parse_marker(sample[0])
        hand = meta["class"].replace("imagine_", "").replace("_", " ")
        cue = "Relax" if hand == "rest" else f"Imagine moving your {hand}"
        instructions = {"fixation_onset": "Rest your arm", "cue_onset": cue,
                        "mi_window_onset": cue, "mi_window_offset": "Rest"}
        self.emit({"type": "phase", "message": f"Trial {meta['trial_n'] + 1} of 20 · {instructions[label]}"})


def model_path(profile, stream, side, labels):
    if not profile:
        return None
    owner = UUID(profile).hex
    key = hashlib.sha256(json.dumps(["v1", stream.name(), side, FS, labels]).encode()).hexdigest()[:20]
    base = Path(os.getenv("NEUROREACH_DATA_DIR", Path.home() / ".neuroreach"))
    return base / "models" / owner / (key + ".joblib")


def calibration(inlet, stop, options, path, emit):
    if not options.get("train"):
        if path and path.is_file():
            model = CSPLDAClassifier.load(path)
            if model.fit_result and model.fit_result.is_reliable:
                return model
        return None
    target = f"imagine_{options['side']}_hand"
    runner = CalibrationOrchestrator(n_trials_per_class=10, classes=[target, "rest"], reject_bad_windows=True)
    try:
        dataset = runner.run(inlet, CueOutlet(emit), abort_event=stop)
    except InsufficientDataError:
        return None
    if stop.is_set():
        raise InterruptedError()
    if min(dataset.labels.count(c) for c in [target, "rest"]) < 5:
        return None
    emit({"type": "phase", "message": "Checking imagery classification on held-out trials…"})
    model = CSPLDAClassifier()
    result = model.fit(dataset)
    if not result.is_reliable or not np.isfinite(result.per_fold_accuracies).all():
        return None
    if path:
        temp = path.with_suffix(".tmp")
        model.save(temp)
        temp.replace(path)
    return model


def run(stream, options, stop, emit):
    inlet = EEGInlet(stream_info=stream, pull_timeout=.25)
    try:
        labels = inlet.eeg_labels
        if set(labels) != set(UNICORN_POSITIONAL_EEG_LABELS) or len(inlet.imu_labels) != 6:
            raise ValueError("This stream does not contain the supported Unicorn EEG and motion channels.")
        emit({"type": "phase", "message": "Rest quietly while the resting baseline is measured."})
        resting = baseline(inlet, stop, emit)
        dc = resting.mean(axis=1, keepdims=True)
        filters = CausalFilterChain(FS)
        erd = ERDCalculator(channel_labels=["C3","C4"], fs=FS)
        erd.calibrate_baseline(common_average_reference(filters.process_chunk(resting - dc)), labels)
        model = calibration(inlet, stop, options, model_path(options.get("profile"), stream, options["side"], labels), emit)
        target = f"imagine_{options['side']}_hand"
        classifier = OnlineClassifier(model, target) if model else None
        engine = IntentScoreEngine(labels, erd, classifier, bool(model))
        filtered, raw, imu_buffer = RingBuffer(8,1000), RingBuffer(8,1000), RingBuffer(6,FS)
        engine.classifier_input = raw
        method = "CSP/LDA + band power" if model else "rest-calibrated band power"
        emit({"type":"ready", "message": f"EEG ready · {method}", "method":method,
              "accuracy":model.fit_result.mean_cv_accuracy if model else None})
        # Empty old samples accumulated during classifier fitting.
        while not stop.is_set() and inlet.get_chunk(max_samples=2000, timeout=0)[0].shape[1]:
            pass
        last_sample = time.monotonic()
        while not stop.is_set():
            chunk, imu = inlet.get_chunk(max_samples=20, timeout=.12)
            if not chunk.shape[1]:
                if time.monotonic() - last_sample > 3:
                    raise ValueError("EEG signal lost. Check the headset and reconnect.")
                continue
            last_sample = time.monotonic()
            if inlet.last_chunk_gap or not np.isfinite(chunk).all():
                raw, filtered, imu_buffer = RingBuffer(8,1000), RingBuffer(8,1000), RingBuffer(6,FS)
                engine.classifier_input = raw
                filters.reset()
                emit({"type":"score","level":None,"message":"Waiting for continuous EEG"})
                continue
            raw.push(chunk)
            imu_buffer.push(imu)
            filtered.push(common_average_reference(filters.process_chunk(chunk - dc)))
            if raw.n_samples_available() < FS:
                continue
            clean, bad = quality(raw.get_window(FS), imu_buffer.get_window(FS), labels)
            result = engine.compute(filtered, clean)
            valid = clean and np.isfinite(result.intent_score)
            emit({"type":"score","level":float(result.intent_score / 100) if valid else None,
                  "contacts":bad, "message":"EEG connected" if valid else "Check electrode contact or keep your head still"})
    finally:
        inlet.close()
