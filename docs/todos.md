# thalis-rehab-game — Development Status & TODOs

_Last updated: 2026-06-21. Scope of this doc: the `signal-engine` Python stack
(acquisition → preprocessing → features) and its validation against the real
g.tec Unicorn Hybrid Black. Game client, classifier, CV, and clinician console
are tracked at a high level under "Roadmap" only._

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

runs live and meets the MVP latency target. **Next major piece: the online
classifier + the WebSocket/OSC score server to the game** (neither exists yet).

Test suite: **26 passing, 1 skipped** (21 offline + 5 live; the skip is the
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
| Classifier unit/integration tests | LDA/EEGNet online decode | classifier not built |
| WebSocket/OSC score-server tests | game-facing score stream, latency budget | server not built |
| Calibration-block tests | baseline + CSP/LDA fit, versioned per patient | calibration routine not built |
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

### Still required
- **Front-end DC-offset removal.** Raw Unicorn EEG carries a ~-3.8e5 µV
  electrode DC offset; feeding it cold into the causal IIR rings for seconds.
  Live tests subtract a per-channel DC estimate before filtering — this belongs
  in the production acquisition/preprocessing front-end, not just the tests.
  (Alternative: initialise `CausalFilterChain` state to the first-sample
  steady-state; note this would change the chunked==single-call equivalence
  assumption baked into `test_preprocessing.py`.)
- **`pytest.ini` / markers.** Add a `live` marker so live tests run via
  `-m live` instead of an env var, and register markers to silence warnings.
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

- [ ] Online classifier: LDA baseline → optional EEGNet (`signal-engine/classifiers/`).
- [ ] Calibration block + per-patient versioned filters (spec §6).
- [ ] Fusion/scoring service over WebSocket/OSC, EMA-smoothed IntentScore (spec §8).
- [ ] Camera/CV pipeline (MediaPipe pose/hands) as validity gate + kinematic scoring (spec §7).
- [ ] Unity game client consuming the score stream (spec §11).
- [ ] Clinician console: live signal quality, ERD/LI trends, session history (spec §10).
- [ ] Full-pipeline latency instrumentation incl. WebSocket→Unity frame (spec §13.2).
