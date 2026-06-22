# thalis-rehab-game — Development Status & TODOs

_Last updated: 2026-06-21. Scope of this doc: the `signal-engine` Python stack
(acquisition → preprocessing → features → calibration) and its validation against
the real g.tec Unicorn Hybrid Black. Game client, classifier, CV, and clinician
console are tracked at a high level under "Roadmap" only._

Reference spec: [`docs/specs.md`](specs.md). Phase prompts: [`docs/prompts/`](prompts/).

---

## 1. Current phase

**Signal acquisition + preprocessing + ERD feature extraction are implemented
and validated against real hardware.** The end-to-end real-time path

```
Unicorn HW → Unicorn LSL bridge → pylsl
           → CausalFilterChain (notch+bandpass) → CommonAverageReference
           → ERDCalculator (mu/beta band power → ERD% → laterality index)
```

runs live and meets the MVP latency target. The **Graz-style cued MI calibration
block** (cue paradigm + marker stream + labeled epoch collection) and the
**CSP+LDA online classifier** (offline fit on calibration epochs + live decode +
joblib persistence) are now built and tested against synthetic/mock data.
**Next major piece: the WebSocket/OSC score server feeding the game**, plus the
60 s baseline-rest block and per-patient versioned filter persistence (spec
§6.1/§6.6).

Test suite: **44 passing, 1 skipped** (39 offline + 5 live; the skip is the
on-head validation, which requires the cap worn). Run everything with:

```bash
conda run -n eeg python -m pytest signal-engine/tests/ -v
```

---

## 2. Completed & tested

### Acquisition — `signal-engine/acquisition/`
- `lsl_inlet.EEGInlet` — resolves an LSL stream, slices EEG/IMU sub-streams.
  Now supports BOTH label-based (mock / labelled streams) and **positional
  fallback** (real Unicorn bridge — see §4).
- `mock_eeg_outlet.MockUnicornOutlet` — 17-ch synthetic Unicorn stream with
  mu/beta sinusoids + scheduled ERD injection, used as the test fixture.
- Tests (`test_lsl_inlet.py`): channel identification, permuted-order slicing,
  chunk shape/dtype/no-NaN, IMU shape, time correction, graceful behaviour
  after outlet stops, `StreamNotFoundError` on timeout.

### Preprocessing — `signal-engine/preprocessing/`
- `filters.py` — dual path: offline zero-phase (`*_offline`) + causal
  `CausalFilterChain` (persistent SOS state for real-time).
- `spatial.py` — `common_average_reference`.
- `artifact.py` — `AmplitudeGate`, `MovementGate`.
- Tests (`test_preprocessing.py`): notch rejects 60 Hz / keeps 10 Hz, bandpass
  removes drift+70 Hz, chunked-causal == single-call equivalence, CAR removes
  common offset, amplitude/movement gates.

### Features — `signal-engine/features/`
- `band_power.py` — Welch PSD band power.
- `erd.py` — `ERDCalculator` (per-channel/per-band ERD% vs calibrated
  baseline) + `laterality_index`.
- Tests (`test_erd.py`): ERD detected on injected channel only, laterality
  sign for left/right injection, pre-calibration guard, zero-denominator LI,
  band-power shape contract. (End-to-end against the mock outlet.)

### Calibration — `signal-engine/calibration/`
- `orchestrator.py` — `CalibrationOrchestrator` runs the Graz cue-paced block
  (fixation → cue → MI window → randomized ITI) with `perf_counter` absolute
  per-segment deadlines (no accumulating sleep overshoot). Builds a balanced,
  ≤3-consecutive trial order (rejection sampling, 1000-attempt fallback),
  collects one fixed-length epoch per MI window, supports clean `abort_event`
  early-exit (partial MI windows discarded), and returns a `CalibrationDataset`
  (`epochs [n_trials, n_ch, n_samp]`, `labels`, `marker_timestamps`,
  `session_info`). Raises `InsufficientDataError` only on an empty result;
  below-`min_trials_per_class` is a soft warning so the §6.5 cross-val quality
  gate decides usability.
- `marker_outlet.py` — `create_marker_outlet` (LSL "NeuroReach-Markers", type
  "Markers", 1-ch, irregular, string) + `send_marker`/`format_marker`/
  `parse_marker` using the canonical `"label|{json}"` format shared with epoch
  extraction and the game client.
- `epoch_extractor.py` — `extract_epochs_from_dataset` (re-slice MI buffer to a
  sub-window without re-running calibration; identity when `post_onset_s=None`)
  + `label_encode` (sklearn `LabelEncoder`; returns `(y_int, encoder)` to
  serialize alongside the classifier).
- Tests (`test_calibration.py`, end-to-end against the mock outlet): dataset
  shape `[6,8,N]` + label balance + no-long-runs, ±10% wall-clock timing, clean
  abort → exactly 2 trials, `InsufficientDataError` on pre-trial abort, and the
  `label_encode` int/length/`classes_` contract.

### Classifiers — `signal-engine/classifiers/`
- `csp_lda.py` — `CSPLDAClassifier`: offline notch(60 Hz)+bandpass(1–40 Hz)
  `filtfilt` of each epoch (reuses `preprocessing.filters`, never the causal
  path), `label_encode`, `mne.decoding.CSP(n_components≤4, log=True)` →
  shrinkage-LDA (`solver='lsqr'`, Ledoit-Wolf `shrinkage='auto'`) chained in a
  sklearn `Pipeline`. `fit` runs `StratifiedKFold(5)` `cross_val_score` and
  returns a `FitResult` (`mean_cv_accuracy`, `per_fold_accuracies`,
  `is_reliable = acc ≥ 0.60` §6.5 gate — warns, not errors, on fail; `n_trials`,
  `classes`, `timestamp`). Raises `ValueError` on <2 classes. `save`/`load`
  joblib-serialize the fitted pipeline **and** the `LabelEncoder` together (the
  encoder decodes predictions to class names); `save` on an unfitted instance
  raises `ModelNotFittedError`.
- `online_classifier.py` — `OnlineClassifier` wraps a fitted `CSPLDAClassifier`:
  `predict_proba(epoch, channel_labels)` filters the full 4 s MI window and
  returns `{class_name: prob}` (warns once/min when the model is unreliable);
  `mi_score(...)` returns the target-class probability as 0–100 (EEG_Score for
  the IntentScore fusion). Channel-count mismatch raises a clear `ValueError`.
- Tests (`test_classifier.py`, synthetic lateralized 10 Hz MI vs rest, no
  headset): strong-pattern fit CV > 0.65, noise quality-gate `is_reliable=False`
  & acc≈0.5, save/load round-trip identical proba, `ModelNotFittedError` on
  unfit save, single-class `ValueError`, `mi_score ∈ [0,100]`, channel-mismatch
  `ValueError`. **8 passing.**

### Live hardware validation — `signal-engine/tests/test_live_unicorn.py`
Opt-in (`THALIS_LIVE_UNICORN=1`), gated so CI/mock never runs it.
- `test_stream_metadata_well_formed` — 250 Hz, 17 channels.
- `test_eeg_data_is_live` — finite, majority channels live, C3/C4 live (off-head
  liveness only; see §5).
- `test_imu_data_is_live` — 6 IMU rows, finite.
- **`test_acquisition_to_feature_latency_p95`** — 30 s loop, full pipeline,
  end-to-end latency measured against newest LSL timestamp. **Result: p95
  ≈ 18 ms (budget 250 ms), compute-only ≈ 1.5 ms.** ✅
- `test_pipeline_end_to_end_on_live_data` — full chain yields finite,
  well-formed features (structure only off-head).
- `lsl_diagnostic.py` — standalone connectivity probe (run directly).

---

## 3. Tests still lined up

| Test / task | Why | Blocker |
|---|---|---|
| **On-head signal quality + ERD magnitude** (`test_signal_quality_on_head_TODO`, currently `@skip`) | Validate real µV amplitude (10–100 µV) and 20–40% mu-ERD with contralateral laterality | Needs cap worn + self-paced MI protocol |
| Wire `test_live_unicorn.py` to use `EEGInlet` instead of the local `_LiveUnicorn` shim | Exercise the production acquisition path end-to-end (needs timestamp access for the latency test) | EEGInlet drops LSL timestamps; add a timestamped pull or keep tapping `_inlet` |
| ~~Classifier unit/integration tests~~ | ~~CSP/LDA fit on `CalibrationDataset.epochs` + online decode~~ | **done** — `test_classifier.py` (8 tests, synthetic MI vs rest). Real on-head CV accuracy still pending H2. |
| WebSocket/OSC score-server tests | game-facing score stream, latency budget | server not built |
| ~~Calibration-block orchestration tests~~ | ~~cue paradigm + labeled epoch collection~~ | **done** — `test_calibration.py` (CSP/LDA fit + per-patient versioning still pending, belongs to the classifier piece) |
| 60 s baseline-rest block + per-patient versioned filter persistence | spec §6.1/§6.6: resting spectral baseline + serialize CSP/LDA per patient/session | orchestrator collects MI trials only; baseline block + disk versioning not built |
| Offline replay / regression harness | shadow-mode "no regression" before deploy | needs stored raw EEG+pose corpus |

---

## 4. Required changes (signal-engine)

### Done in this pass
- **EEGInlet now reads the real bridge.** The live Unicorn stream is **type
  `Data`, has NO channel-label XML, and is fixed-positional** — the original
  label-only `EEGInlet` (resolve `type=="EEG"`, slice by parsed label) found
  nothing. Patched to: resolve by `stream_name` OR type (configurable), and fall
  back to the fixed Unicorn positional layout (`0..7` EEG, `8..13` IMU) when
  labels are absent. Label-based path unchanged for labelled streams (mock).
  Covered by `test_inlet_positional_fallback_when_no_labels` (offline) and
  verified live: `EEGInlet(stream_name="UN-2024.06.42")` slices 8 EEG / 6 IMU.
- **Front-end DC-offset removal is now in production.** Added
  `preprocessing.filters.DCOffsetRemover` — a stateful, causal front-end stage
  that latches ONE per-channel offset (from `calibrate(baseline)` or lazily from
  the first chunk) and subtracts that SAME constant on every later chunk, so it
  never injects a boundary discontinuity that would re-excite the IIR. Sits
  before the chain: `DCOffsetRemover → CausalFilterChain → CAR → …`.
  `CausalFilterChain` is untouched, so its chunked==single-call equivalence test
  still holds (rejected the "init filter state to steady-state" alternative for
  exactly that reason). Live tests now consume the production component instead
  of a local `_estimate_dc` helper. Offline coverage:
  `test_dc_remover_*` in `test_preprocessing.py` (latch, fixed-offset-across-
  chunks, cold-start-transient collapse, channel-count guard, reset). Suite:
  **26 offline passing** (was 21); **31 passing / 1 skipped** with hardware
  (live gated). _Live re-verify on hardware still pending (device was
  unoccupied)._

### Still required
- **`pytest.ini` / markers.** Add a `live` marker so live tests run via
  `-m live` instead of an env var, and register markers to silence warnings.
  (`test_calibration.py` is mock-only/offline, so `-m "not live"` already
  excludes nothing there, but the marker registration cleanup still applies.)
- **Dead-channel handling.** Off-head, individual electrodes go flat (std 0).
  Production needs a per-channel quality flag feeding the clinician console’s
  "Check Cz contact" indicator (spec §10.2), not just a test tolerance.
- **Units/scaling note.** Confirm the bridge streams µV (values are µV + huge DC
  offset, not raw ADC counts) — documented, but assert in onboarding.

---

## 5. Important context for developers

- **Off-head vs on-head.** Latency is signal-source-independent, so the p95
  result is trustworthy now. **EEG amplitude and ERD magnitude are NOT** — they
  were measured off-head (floating-electrode noise). Re-run on-head before
  trusting any µV/ERD number; un-skip `test_signal_quality_on_head_TODO`.
- **Real stream identity:** name `UN-2024.06.42`, type `Data`, 17 ch, 250 Hz,
  host `whitetower`, no XML labels. Positional layout:
  `0..7` EEG `[Fz,C3,Cz,C4,Pz,PO7,Oz,PO8]`,
  `8..13` IMU `[AccX,AccY,AccZ,Gyro1,Gyro2,Gyro3]`,
  `14..16` `[Battery,Counter,Validation]`.
- **Always use the `eeg` conda env** (`conda run -n eeg ...`). `conda run`
  needs `--no-capture-output` to see `-s` test prints, and pass env vars via
  `env VAR=… python` (they don’t propagate through `conda run` reliably).
- **Bring-up order:** start the Unicorn LSL bridge → `python
  signal-engine/tests/lsl_diagnostic.py` (confirm stream visible) →
  `THALIS_LIVE_UNICORN=1 … pytest test_live_unicorn.py`.

---

## 6. Roadmap (beyond signal-engine, per `docs/specs.md`)

- [~] Online classifier: **CSP+LDA baseline built** (`signal-engine/classifiers/`,
  fit on `CalibrationDataset.epochs` / `label_encode` output, §6.5 CV gate,
  joblib persistence, online decode + EEG_Score). Optional EEGNet upgrade later.
- [~] Calibration block (spec §6): **cued MI orchestration + marker stream + labeled
  epoch collection done** (`signal-engine/calibration/`); still TODO — 60 s baseline-rest
  block, CSP/LDA fit, per-patient versioned filter persistence.
- [ ] Fusion/scoring service over WebSocket/OSC, EMA-smoothed IntentScore (spec §8).
- [ ] Camera/CV pipeline (MediaPipe pose/hands) as validity gate + kinematic scoring (spec §7).
- [ ] Unity game client consuming the score stream (spec §11).
- [ ] Clinician console: live signal quality, ERD/LI trends, session history (spec §10).
- [ ] Full-pipeline latency instrumentation incl. WebSocket→Unity frame (spec §13.2).

---

## 7. Headset testing schedule

**Design principle:** everything that can be validated with synthetic/mock data must be, before
touching the headset. Four on-head sessions, each gated on a code milestone.

### Why only 4

- Latency is signal-source-independent → the p95 18 ms result off-head is valid.
- Classifier logic, calibration block protocol, fusion math, WebSocket server, CV pipeline, Unity
  client, and clinician console can all be built and unit/integration tested with mock data.
- Only four things genuinely require a real brain signal: (1) amplitude/ERD ground-truth,
  (2) labeled MI calibration data, (3) end-to-end perceptual latency through the full stack,
  (4) clinical workflow validation.

---

### Session H1 — Signal quality + ERD ground-truth
**Gate:** §4 "still required" items done (pytest markers, dead-channel flag). No new code needed.  
**When:** now (signal-engine is otherwise complete).

| What | How |
|---|---|
| Un-skip `test_signal_quality_on_head_TODO` | Remove `@pytest.mark.skip`; run with headset on |
| Confirm µV amplitudes in range 10–100 µV on C3/Cz/C4 | Assert in test |
| Confirm DCOffsetRemover latches correct on-head DC (~−3.8e5 µV expected) | Log pre/post per channel |
| Self-paced MI: 5 × "imagine right-hand grasp" → verify mu-ERD > 15% at C3, laterality index > 0 | Manual check; log ERD% to stdout |
| IMU noise floor on a still head | Assert AccX/Y/Z variance < threshold |

**Output:** confirmed µV/ERD numbers to set production thresholds. Updates §5 "important context."

---

### Session H2 — Calibration data collection + classifier validation
**Gate:** `signal-engine/classifiers/` (LDA baseline) + calibration block routine built and
unit-tested with mock data. Graz cue-paced block must run in software before this session.
**Cued MI orchestration AND the CSP+LDA classifier are now built**
(`calibration/orchestrator.py` + `classifiers/`, both mock/synthetic-tested);
remaining gate items: 60 s baseline-rest block, per-patient filter versioning to
disk, and the real on-head CV-accuracy check.

| What | How |
|---|---|
| Run full Graz calibration block (~8 min): 60 s rest baseline + 20 cued MI trials | Use the production calibration routine |
| Fit CSP + LDA on collected trials; log cross-validated accuracy | Must be ≥ 60% to proceed with EEG-led mode (else flag Blended Mode path) |
| Verify per-patient CSP filters serialized/versioned to disk | Load back and confirm identical output |
| Run online classifier for 5 min post-calibration; spot-check live ERD → classifier output correlation | Visual/stdout check |

**Output:** first real calibration dataset. Confirms the classifier pipeline works with real neural
signal before the game client exists. Dataset also seeds the offline regression harness (§3 table).

---

### Session H3 — End-to-end stack + perceptual latency
**Gate:** Unity game client + WebSocket/OSC server + IntentScore fusion service all built and
integration-tested with mock signal. CV pipeline may still be absent (use `w_kin=0` Mode A).

| What | How |
|---|---|
| Full pipeline live: Unicorn → signal-engine → WebSocket → Unity | Visual check: game responds to MI |
| Instrument end-to-end latency: LSL EEG timestamp → Unity frame update | Target p95 < 250 ms (spec §9.1); log distribution |
| Subjective responsiveness check: does the game feel coupled to MI? | Developer judgment; 5–10 min play |
| EMA smoothing τ ≈ 300 ms: does it reduce jitter without killing feel? | Tune if needed |
| Clinician console live ERD/LI trace (if built) | Confirm trace updates < 500 ms behind signal |

**Output:** first proof that the closed-loop BCI game actually works. Latency number for spec §13.

---

### Session H4 — Internal usability pilot + clinical workflow
**Gate:** clinician console complete, hardening pass done (installer, signal-quality UX, dead-channel
indicator), camera/CV pipeline integrated (or at minimum stubbed to `w_kin=0`).

| What | How |
|---|---|
| Full 30–40 min session protocol end-to-end (spec §10.2) | One developer as "patient" |
| Setup time: Unicorn BT pair → LSL bridge → calibration ready | Target < 10 min (spec §10.1) |
| Adaptive difficulty staircase: does 70–80% success-rate band hold? | Check trial-level log |
| Fatigue proxy: does declining classifier confidence actually trigger console flag? | Simulate by removing headset briefly mid-session |
| Dead-channel indicator triggers on bad electrode contact | Lift one electrode, confirm console shows "Check Cz contact" |
| Full session SQLite log + PDF export | Verify all trial fields populated |

**Output:** pre-patient-pilot readiness check. Go/no-go for spec §13.2 (usability testing with
healthy volunteers before any patient contact).
