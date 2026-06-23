# Phase 1 Agent Prompts — Calibration → Classifier → Scoring → WebSocket → Unity Game

Five scoped prompts that take you from the Phase 0 acquisition/preprocessing/ERD modules to a fully running end-to-end loop: cued calibration → CSP+LDA classifier → real-time IntentScore → WebSocket broadcast → Unity Garden Grow game reacting to it live.

Prompts chain: each one assumes the previous one's files exist and tests pass. Run `pytest signal-engine/tests/` after each before advancing. Phase 0 modules are treated as stable imports throughout.

Reference: `motor-imagery-rehab-game-spec.md` Sections 5.3 (CSP/LDA), 6 (calibration protocol), 8 (IntentScore fusion), 9.2 (Garden Grow).

---

## Prompt 1 — Calibration Block Orchestrator

```
Working in the thalis-rehab-game repo. Python 3.10. Assumes signal-engine/acquisition/
lsl_inlet.py (EEGInlet) and signal-engine/acquisition/mock_eeg_outlet.py
(MockUnicornOutlet) from Phase 0 exist and their tests pass (refer to docs/specs.md and docs/todos.md for current progress and the final criterion).

Create signal-engine/calibration/orchestrator.py:

A `CalibrationOrchestrator` class implementing the Graz-style motor-imagery
cued paradigm described in the spec (Section 6).

Constructor args (all with defaults so tests can override quickly):
- n_trials_per_class: int = 20
- classes: list[str] = ["imagine_right_hand", "rest"]
- fixation_duration_s: float = 2.0
- cue_duration_s: float = 1.25
- mi_window_duration_s: float = 4.0
- iti_min_s: float = 2.0, iti_max_s: float = 3.0 (randomized ITI)
- fs: int = 250

Method `run(eeg_inlet: EEGInlet, marker_outlet: pylsl.StreamOutlet) -> CalibrationDataset`:
- Generates a randomized, balanced trial order (equal class counts, no
  more than 3 consecutive same-class trials — shuffle with rejection
  sampling until this constraint is met, max 1000 attempts before
  falling back to unconstrained shuffle with a logged warning).
- For each trial:
  1. Emit marker "fixation_onset" with trial metadata as JSON in the
     marker string field: {"trial_n": int, "class": str}.
  2. Sleep fixation_duration_s (use time.perf_counter for high-resolution
     timing; do NOT use time.sleep alone for the MI window timing —
     account for sleep overshoot by measuring actual elapsed time and
     adjusting the next segment accordingly).
  3. Emit marker "cue_onset" with same metadata.
  4. Sleep cue_duration_s.
  5. Emit marker "mi_window_onset".
  6. Collect EEG chunks continuously for exactly mi_window_duration_s,
     concatenating them into a single epoch buffer, using the high-res
     timing approach above.
  7. Emit marker "mi_window_offset".
  8. Sleep a random ITI drawn from Uniform(iti_min_s, iti_max_s).
- Supports clean early exit: check a threading.Event `abort_event` at the
  start of each trial's ITI — if set, save whatever complete trials
  have been collected so far and return normally (not raise). Partial
  trials (aborted mid-MI-window) are discarded.
- Returns a `CalibrationDataset` dataclass containing:
  - epochs: np.ndarray shaped [n_trials, n_channels, n_samples_per_epoch]
    where n_samples_per_epoch = round(mi_window_duration_s * fs)
  - labels: list[str] of length n_trials
  - marker_timestamps: list[float] of mi_window_onset LSL timestamps
  - session_info: dict with fs, channel_labels (read from the inlet),
    n_trials_per_class, classes, collection_timestamp
- If fewer than 5 trials per class were collected before abort, raise
  `InsufficientDataError` — not a silent empty return.

Also create signal-engine/calibration/marker_outlet.py:
- `create_marker_outlet() -> pylsl.StreamOutlet` that creates an LSL outlet
  named "NeuroReach-Markers", type "Markers", 1 channel, irregular rate.
- `send_marker(outlet, label: str, metadata: dict = None)` helper that
  pushes a single string sample formatted as "label|{json}" (e.g.
  "fixation_onset|{"trial_n":0,"class":"rest"}"). Keep the format
  consistent — downstream epoch extraction and the game client both
  parse this.

Create signal-engine/calibration/epoch_extractor.py:
- `extract_epochs_from_dataset(dataset: CalibrationDataset,
  pre_onset_s: float = 0.0, post_onset_s: float = None) -> CalibrationDataset`
  that, if post_onset_s is None, returns the dataset unchanged (epochs
  are already the MI window), but if pre/post are specified, re-slices
  the raw epoch buffer to a sub-window. Used later to experiment with
  different epoch lengths without re-running calibration.
- `label_encode(dataset: CalibrationDataset) -> tuple[np.ndarray, LabelEncoder]`
  using sklearn.preprocessing.LabelEncoder; returns (y_int_array, fitted_encoder).
  Serialize the encoder alongside the classifier so labels can be decoded
  at inference time.

Create signal-engine/tests/test_calibration.py (pytest):

- Use MockUnicornOutlet (from Phase 0) to provide a real LSL stream.
  Run CalibrationOrchestrator with n_trials_per_class=3 (not 20 — keep
  tests fast), mi_window_duration_s=0.5, fixation_duration_s=0.1,
  cue_duration_s=0.1, iti_min_s=0.1, iti_max_s=0.2.
- Assert the returned CalibrationDataset has epochs shaped [6, 8, N]
  (6 trials = 3 per class, 8 EEG channels, N samples).
- Assert labels contains exactly 3 of each class.
- Assert no more than 3 consecutive identical labels in the full 6-trial
  sequence (if the constraint could be enforced given n=3 per class).
- Timing test: assert the total wall-clock time for the 6-trial run is
  within ±10% of the expected duration
  (n_trials * (fixation + cue + mi_window + mean_iti)).
- Abort test: set abort_event after 2 complete trials using a Timer;
  assert run() returns normally (no exception) with exactly 2 valid
  trials, not 6, and the returned epochs are shaped [2, 8, N].
- InsufficientDataError test: set abort_event before any trials complete
  (Timer fires after 50ms, before fixation period ends); assert the
  error is raised.
- label_encode test: assert y array has dtype int, length matches
  n_trials, and LabelEncoder.classes_ matches the input classes list.

Do not write any classifier or scoring logic here — orchestration and
epoch collection only. Output a short summary and test run instructions.

After completion, update todos.md on the current state of the pipeline and next steps.
```

---

## Prompt 2 — CSP + LDA Classifier with Quality Gate

```
Assumes Phase 0 preprocessing
modules and Phase 1 Prompt 1 (CalibrationDataset, label_encode) exist.
Dependencies: mne>=1.6.0, scikit-learn>=1.4.0, joblib, numpy (work in conda eeg environment) Additionally refere to docs/specs.md and todos.md for final criterion.

Create signal-engine/classifiers/csp_lda.py:

A `CSPLDAClassifier` class:

Constructor:
- n_components: int = 4 (CSP filter pairs — keep ≤4 given the 8-channel
  montage to avoid overfitting; see spec Section 5.3)
- regularization: str = "ledoit_wolf" (passed to LDA as solver)
- Any other sklearn/MNE params should be configurable via kwargs.

`fit(dataset: CalibrationDataset) -> FitResult`:
- Applies offline bandpass (1–40 Hz) and notch (60 Hz) filtering to the
  epochs before fitting — import from signal-engine/preprocessing/filters.py,
  do not reimplement. Filter each epoch independently using the offline
  (filtfilt) path, not the causal path.
- Calls label_encode from epoch_extractor.py to get integer labels.
- Fits mne.decoding.CSP(n_components=n_components, reg=None,
  log=True, norm_trace=False) — use the MNE CSP implementation, not a
  manual one. CSP requires at least 2 classes; raise `ValueError` with a
  clear message if fewer than 2 classes are present in the dataset.
- Fits sklearn LinearDiscriminantAnalysis(solver='lsqr',
  shrinkage='auto') on the CSP-transformed epochs.
- Runs StratifiedKFold(n_splits=5) cross-validation using
  sklearn.model_selection.cross_val_score on the combined CSP+LDA
  pipeline (use sklearn.pipeline.Pipeline to chain them), returning
  per-fold accuracies.
- Returns a `FitResult` dataclass containing:
  - mean_cv_accuracy: float
  - per_fold_accuracies: list[float]
  - is_reliable: bool = (mean_cv_accuracy >= 0.60)
    — this is the quality gate from spec Section 6, step 5. Log a clear
    warning when is_reliable is False; it is not an error — the system
    stays functional in band-power-only fallback mode.
  - n_trials: int
  - classes: list[str]
  - timestamp: float (time.time())

`save(path: str | Path)` / `@classmethod load(path) -> CSPLDAClassifier`:
- Serialize with joblib.dump / joblib.load.
- Save as a single file containing both the fitted sklearn Pipeline
  AND the LabelEncoder from label_encode — they must travel together
  since the encoder is required to decode predictions back to class names.
- Raise `ModelNotFittedError` if save() is called before fit().

Create signal-engine/classifiers/online_classifier.py:

An `OnlineClassifier` class:

Constructor: takes a loaded `CSPLDAClassifier` (already fitted).

`predict_proba(epoch: np.ndarray, channel_labels: list[str]) -> dict`:
- Input: a single epoch shaped [n_channels, n_samples] (the full 4s MI
  window from the ring buffer — see spec Section 5.3 for why the full
  window, not a short chunk, is needed for CSP to work).
- Applies the same offline bandpass + notch to this single epoch before
  passing to the pipeline (same filter approach as in fit()).
- Returns {"class_name": probability} for all classes (from
  predict_proba), e.g. {"imagine_right_hand": 0.72, "rest": 0.28}.
- If the model is not reliable (FitResult.is_reliable was False), this
  method still runs but logs a warning per call (not per invocation —
  throttle the warning to once per minute using a timestamp check to
  avoid log spam).

`mi_score(epoch: np.ndarray, channel_labels: list[str],
  target_class: str = "imagine_right_hand") -> float`:
- Returns the probability of the target_class as a 0–100 float (just
  * 100) — this is the EEG_Score component for the IntentScore fusion
  in the next prompt. Simple wrapper around predict_proba.

Create signal-engine/tests/test_classifier.py (pytest):

For testing without a live headset, generate SYNTHETIC calibration data
that has a detectable pattern (do not use pure random noise — a classifier
trained on noise cannot be expected to exceed chance, which would make
the quality-gate test unreliable). Generate synthetic epochs as follows:
- Class "imagine_right_hand": 8-channel Gaussian noise + a 10 Hz
  sinusoidal component with higher amplitude on channel index 0 (C3-proxy)
  than channel index 3 (C4-proxy). Specifically: C3-proxy amplitude = 3x
  background noise std; C4-proxy amplitude = 0.5x background noise std.
- Class "rest": same noise, no sinusoidal component on any channel.
- Generate 25 trials per class, each [8 channels, 1000 samples] (4s at
  250 Hz — match the real calibration window duration).
- Construct a CalibrationDataset from these arrays directly (do not run
  the calibration orchestrator — pure in-memory construction is fine here
  and much faster for testing).

Tests:
- fit() test: assert FitResult.mean_cv_accuracy > 0.65 on the synthetic
  data described above (the pattern is strong enough that CSP+LDA should
  achieve well above the 0.60 quality gate). If it doesn't, the classifier
  implementation is likely wrong — fail loudly.
- Quality gate test: fit on pure Gaussian noise (no class-discriminating
  pattern); assert FitResult.is_reliable is False and mean_cv_accuracy
  is near 0.5. Note: due to randomness, this may occasionally be above
  0.60 — use a fixed random seed (np.random.seed(42)) for reproducibility.
- save/load round-trip test: fit on synthetic data, save to a temp path
  (use pytest's tmp_path fixture), load, and assert predict_proba output
  is identical before and after save/load (within float32 tolerance).
- ModelNotFittedError test: assert calling save() on an unfitted instance
  raises ModelNotFittedError.
- mi_score test: assert the output is a float in [0, 100] for both
  synthetic classes.
- Channel label mismatch: pass epoch with wrong channel count to
  predict_proba and assert a clear ValueError is raised, not a silent
  shape error from numpy.

Output a short summary and test run instructions. Then update todos.md appropriately
```

---

## Prompt 3 — Online Real-Time Scoring Service

```
This is the main real-time
loop that integrates all Phase 0 modules and the Phase 1 classifier into
a continuous IntentScore stream. Assumes all previous tests pass. Continue to use conda "eeg" environment and refer to docs/specs.md for final criterion. Note that the headset is not currently streaming data.

Create signal-engine/scoring/ring_buffer.py:

`RingBuffer` class:
- Fixed-capacity circular buffer for EEG data: constructor takes
  n_channels: int, capacity_samples: int.
- `push(chunk: np.ndarray)`: appends [n_channels, n_new] chunk, evicting
  oldest samples if over capacity.
- `get_window(n_samples: int) -> np.ndarray`: returns the most recent
  n_samples as [n_channels, n_samples], zero-padded at the START if
  fewer than n_samples have been pushed yet (not at the end — we want
  the most recent samples right-aligned). Return shape must always be
  exactly [n_channels, n_samples] regardless of fill level.
- `n_samples_available() -> int`: returns how many real (non-padded)
  samples are currently held.

Create signal-engine/scoring/intent_score.py:

`IntentScoreEngine` class. This is the mathematical heart of the scoring
system. Constructor args (all with sensible defaults):
- eeg_channel_labels: list[str] — passed in from the connected EEGInlet
- erd_calculator: ERDCalculator — already calibrated (baseline set)
- online_classifier: OnlineClassifier | None — may be None if calibration
  quality gate failed (band-power-only fallback mode)
- classifier_reliable: bool = False
- fs: int = 250
- mi_window_samples: int = 1000 (4s * 250Hz — full window for CSP)
- erd_window_samples: int = 250 (1s window for band-power ERD)
- ema_alpha: float = 0.15 (exponential moving average smoothing;
  lower = smoother but more lag — 0.15 corresponds to ~τ=300ms at 20Hz
  update rate, matching spec Section 8.5)

`compute(ring_buffer: RingBuffer, artifact_clean: bool) -> IntentScoreResult`:
- If artifact_clean is False: return an IntentScoreResult with
  intent_score = previous value (or 50.0 if no history), is_artifact=True,
  and all sub-scores as None. Do NOT update the EMA or running
  normalization during artifact windows — they should only track genuine
  signal.
- ERD score: take `erd_window_samples` from the ring buffer, run through
  ERDCalculator.compute_erd(), extract C3+C4 mu-band ERD, average them,
  clip to [0, 100] (negative ERD — ERS — maps to 0, not negative scores).
- Classifier score: if online_classifier is not None and
  classifier_reliable is True, take `mi_window_samples` from the ring
  buffer, call OnlineClassifier.mi_score() — handle the case where fewer
  than mi_window_samples are available (ring_buffer.n_samples_available()
  < mi_window_samples) by returning classifier_score = None and using
  ERD-only blending for this update cycle.
- Blending (MODE A, Phase 1 — no camera yet):
  - If classifier_reliable and classifier_score is not None:
    raw_score = 0.4 * erd_score + 0.6 * classifier_score
  - Else: raw_score = erd_score
- Per-session adaptive normalization: maintain running min/max of raw_score
  (initialized to 0/100 as priors, updated each non-artifact call). Apply
  min-max normalization: normalized = (raw - running_min) / (running_max -
  running_min + 1e-9) * 100. Clamp output to [0, 100].
  Only update running_min/max after the first 10 real data points to avoid
  a single early extreme outlier collapsing the whole range.
- EMA smoothing: apply EMA to the normalized score before returning.
- Returns `IntentScoreResult` dataclass: intent_score: float, erd_score:
  float | None, classifier_score: float | None, is_artifact: bool,
  timestamp: float (time.time()).

Create signal-engine/scoring/scoring_service.py:

`ScoringService` class — the main loop, runs in a background thread.

Constructor:
- eeg_inlet: EEGInlet
- amplitude_gate: AmplitudeGate
- movement_gate: MovementGate
- causal_filter: CausalFilterChain
- intent_score_engine: IntentScoreEngine
- output_queue: queue.Queue — ScoringService pushes IntentScoreResult
  objects here; downstream consumers (WebSocket server) read from it
- update_rate_hz: float = 20.0 — target scoring update rate
- chunk_size: int = 12 — samples per EEG pull (~50ms at 250Hz; pull
  more frequently than scoring rate to keep the ring buffer fresh)

`start()` / `stop()` — start/stop the background thread cleanly.

The main loop:
1. Pull a chunk from eeg_inlet.get_eeg_chunk(max_samples=chunk_size).
2. If chunk is empty (stream had no new data), sleep briefly and continue.
3. Apply CausalFilterChain.process_chunk() to the chunk.
4. Apply common_average_reference() to the filtered chunk.
5. Push filtered chunk into the RingBuffer.
6. Pull IMU chunk from eeg_inlet.get_imu_chunk().
7. Evaluate AmplitudeGate.is_clean() on the most recent 1s of ring buffer.
8. Evaluate MovementGate.is_head_still() on the IMU chunk.
9. artifact_clean = is_clean AND is_head_still.
10. Throttle scoring to update_rate_hz: only compute IntentScore if
    (current_time - last_score_time) >= (1.0 / update_rate_hz).
11. Call IntentScoreEngine.compute(ring_buffer, artifact_clean).
12. Put result on output_queue (non-blocking put; if queue is full,
    drop the oldest item and log a warning — never block the scoring
    loop waiting for a consumer).

Create signal-engine/tests/test_scoring_service.py (pytest):

Use MockUnicornOutlet as the EEG source. Use a pre-fitted
CSPLDAClassifier from the synthetic calibration data described in
Prompt 2's test (or just test in band-power-only mode by passing
online_classifier=None — acceptable for this integration test since
classifier correctness is already covered in test_classifier.py).

Setup helper: a function `make_scoring_service(mock_outlet, **overrides)`
that constructs the full dependency chain (EEGInlet, CausalFilterChain,
AmplitudeGate, MovementGate, ERDCalculator with a baseline set from 2s
of mock data, IntentScoreEngine, ScoringService) so individual tests
don't repeat boilerplate.

Tests:
- Smoke test: start ScoringService, run for 3s, stop. Assert at least
  40 IntentScoreResult objects were put on the output queue (≥20Hz * 2s
  of headroom — not 60 since the first few seconds may have fewer samples
  than the mi_window requires, but scoring in ERD-only mode should
  still proceed).
- Artifact suppression test: inject a 200 µV amplitude spike via the
  mock outlet (extend MockUnicornOutlet with a method to inject a
  single large spike on all EEG channels for N samples). Assert that
  during and immediately after the spike, IntentScoreResult.is_artifact
  is True for those frames.
- EMA smoothing test: inject a step change in ERD (via inject_erd) and
  assert that IntentScore rises gradually over ~300ms rather than jumping
  instantaneously — specifically, assert the IntentScore 100ms after
  injection onset is less than 80% of the IntentScore 500ms after onset
  (i.e., the smoothing is visible and non-trivial).
- stop() test: assert that stop() returns and joins the thread within
  2 seconds with no hanging.
- Queue-full test: create a queue with maxsize=1, run the service for
  1s without consuming from the queue; assert no exception is raised
  (the service should drop, not block) and the final queue item is recent
  (within 200ms of the test ending).

Output a short summary and test run instructions. Then update todos.md.
```

---

## Prompt 4 — WebSocket Score Server

Dependencies: websockets>=12.0,
asyncio (stdlib). Assumes ScoringService and IntentScoreResult from Prompt 3 exist.

Continue to use conda "eeg" environment and refer to docs/specs.md for final criterion. Note that the headset is not currently streaming data.

Create signal-engine/server/ws_server.py:

`NeuroReachWSServer` class. Bridges the ScoringService's output_queue to
connected WebSocket clients (Unity game, clinician console), and accepts
commands back from those clients to control session state.

Design constraint: ScoringService runs in a regular threading.Thread
(synchronous); the WebSocket server runs in asyncio. The bridge between
them is a thread-safe queue.Queue (already the ScoringService's
output_queue). Use asyncio.get_event_loop().run_in_executor to poll the
queue without blocking the event loop — do NOT use asyncio.Queue as the
bridge type, since ScoringService is not async.

Constructor:
- scoring_service: ScoringService
- host: str = "localhost"
- port: int = 8765
- broadcast_hz: float = 20.0

Outbound message (server → clients), broadcast to ALL connected clients
at broadcast_hz:
```json
{
  "type": "intent_score",
  "intent_score": 72.3,
  "erd_score": 68.1,
  "classifier_score": 75.8,
  "is_artifact": false,
  "mode": "band_power_only",
  "timestamp": 1234567890.123
}
```
- "mode" is "band_power_only" when classifier is None or not reliable,
  "csp_lda_blend" when the classifier is contributing.
- If is_artifact is True, still broadcast the message (Unity uses this
  to display an artifact indicator in the UI) but the intent_score field
  holds the last clean value (not 0 — see IntentScoreEngine design).

Inbound message (client → server):
```json
{"cmd": "ping"}              → respond {"type": "pong", "timestamp": ...}
{"cmd": "get_status"}        → respond current session state
{"cmd": "set_mode", "mode": "band_power_only" | "csp_lda_blend"}
                              → update IntentScoreEngine mode at runtime
```
Use a simple dispatcher pattern — do not use a heavy framework. Unknown
commands get a {"type": "error", "message": "unknown command: X"} response
to that client only (not broadcast).

Connection lifecycle:
- Log each connect/disconnect with client address and current client count.
- Maintain a set of active connections. Broadcast must gracefully handle
  a client disconnecting mid-broadcast (catch websockets.exceptions.
  ConnectionClosed, remove from set, continue).
- If zero clients are connected, the broadcast loop still runs but simply
  skips the send — ScoringService continues running regardless of client
  count.

`start()` → starts the scoring service AND begins serving websockets.
  Runs the asyncio event loop in the calling thread (blocking call).
  For tests, expose `start_background()` that runs the event loop in
  a daemon thread so the test can interact with it and then call `stop()`.
`stop()` → cleanly shuts down: stops the scoring service, closes all
  connections, stops the event loop.

Create signal-engine/tests/test_ws_server.py (pytest):

Use MockUnicornOutlet + the `make_scoring_service` helper from Prompt 3.
Start NeuroReachWSServer via start_background() in a pytest fixture with
module scope (start once, run all tests, then stop — not once per test,
since startup takes a second).

Tests:
- Connection test: connect a websocket client (use the websockets library's
  synchronous client or connect() in a new event loop). Assert the server
  accepts the connection without error.
- Broadcast rate test: collect messages for 3 seconds. Assert the count
  is between 50 and 70 (20Hz × 3s ± 15% tolerance for scheduling jitter).
- Message schema test: parse the first received message as JSON. Assert
  it has all required keys ("type", "intent_score", "erd_score",
  "is_artifact", "mode", "timestamp"). Assert intent_score is a float
  in [0, 100]. Assert timestamp is a recent Unix timestamp (within 2s
  of now).
- Multi-client test: connect 3 clients simultaneously. Collect 1s of
  messages from all 3. Assert all 3 receive approximately the same number
  of messages (within ±3 of each other — they should all get the same
  broadcast).
- Client disconnect test: connect, receive 5 messages, abruptly close
  the client socket. Assert the server does NOT crash, does NOT stop
  broadcasting to other connected clients, and a new client can connect
  successfully afterward.
- Ping/pong test: send {"cmd": "ping"}, assert response is
  {"type": "pong", "timestamp": <float>} within 200ms.
- Unknown command test: send {"cmd": "nonexistent"}, assert response
  contains "type": "error" and "message" mentions the unknown command.
- Zero-client test: connect no clients, let the server run for 2s,
  assert it doesn't crash or log errors (other than "no clients").

Output a short summary and test run instructions. Then, update todos.md appropriately.


---

## Prompt 5 — Unity Garden Grow Game

```
Working in the same repo, inside the game-client/ Unity 2022 LTS
project (Unity 6 is not the target — stay on 2022 LTS for clinic
stability). C#, .NET Standard 2.1. Target platform: Windows Standalone.

Continue to use conda "eeg" environment and refer to docs/specs.md for final criterion. Note that the headset is not currently streaming data.

IMPORTANT: you cannot run Unity to test this, so structure all
non-MonoBehaviour logic as pure C# classes testable with NUnit
(editmode tests in game-client/Assets/Tests/EditMode/). MonoBehaviours
should be thin wrappers delegating to those pure classes. Do not write
tests that require the Unity runtime (playmode tests) — editmode only.

Install NativeWebSocket package (https://github.com/endel/NativeWebSocket)
by adding it to game-client/Packages/manifest.json under dependencies:
"com.endel.nativewebsocket": "https://github.com/endel/NativeWebSocket.git#upm"
Do NOT use websocket-sharp or any other WebSocket library — NativeWebSocket
is the correct one for this project.

--- PURE C# (testable) ---

Create game-client/Assets/Scripts/Scoring/IntentScoreMessage.cs:
- A simple [Serializable] class (NOT a MonoBehaviour) with public float
  fields: IntentScore, ErdScore, ClassifierScore (float, nullable as float
  with -1 sentinel), IsArtifact (bool), Mode (string), Timestamp (double).
- Static method `FromJson(string json) -> IntentScoreMessage` using
  Unity's JsonUtility. The JSON field names from the server use snake_case
  ("intent_score") but JsonUtility requires matching C# field names — use
  [System.Serializable] with snake_case field names OR write a thin manual
  parser. Note: JsonUtility does NOT support snake_case-to-PascalCase
  mapping, so either name the C# fields in snake_case (unusual but works)
  or use Newtonsoft Json.NET (available via com.unity.nuget.newtonsoft-json
  package). Use Newtonsoft Json.NET and [JsonProperty("intent_score")] for
  clean mapping — add it to manifest.json as "com.unity.nuget.newtonsoft-json":
  "3.2.1".

Create game-client/Assets/Scripts/Scoring/IntentScoreBuffer.cs:
- Pure C# class (NOT MonoBehaviour). Holds a fixed-size circular buffer
  of the last N IntentScoreMessage objects (default N=600, representing
  30 seconds at 20Hz).
- `Add(IntentScoreMessage msg)`: push to buffer.
- `Latest -> IntentScoreMessage`: most recent message, or null if empty.
- `RecentAverage(int n) -> float`: mean IntentScore of the last n messages,
  or 0 if fewer than n exist. Used for streak/bloom detection.
- `StreakAboveThreshold(float threshold, int n) -> bool`: returns true if
  the last n messages all have IntentScore >= threshold. Used to trigger
  the bloom particle effect.

Create game-client/Assets/Scripts/Garden/PlantGrowthModel.cs:
- Pure C# class. Tracks the plant's logical growth state entirely
  separately from Unity's Transform/Animator — the MonoBehaviour reads
  from this and applies it to GameObjects.
- State: CurrentGrowth (float 0–1), TargetGrowth (float 0–1), IsBloom (bool).
- `Update(float intentScore01, float deltaTime)`:
  - TargetGrowth = intentScore01 (clamped [0,1]).
  - CurrentGrowth lerps toward TargetGrowth with:
    - grow_speed = 0.8 per second when TargetGrowth > CurrentGrowth
    - wilt_speed = 0.3 per second when TargetGrowth < CurrentGrowth
    (intentional asymmetry: growth feels rewarding and quick; wilting is
    slower and less punishing — never punitive hard resets, per spec 9.1)
  - IsBloom = true when CurrentGrowth > 0.75 AND has been > 0.75 for at
    least 3.0 accumulated seconds (tracked internally). IsBloom resets to
    false only when CurrentGrowth drops below 0.60 (hysteresis — avoids
    rapid bloom on/off flicker at the threshold boundary).

--- MONOBEHAVIOURS (thin, not unit-tested) ---

Create game-client/Assets/Scripts/Networking/NeuroReachClient.cs:
- MonoBehaviour that wraps NativeWebSocket. Connects to
  ws://localhost:8765 (configurable in Inspector) on Start().
- OnMessage: parse JSON into IntentScoreMessage, push to a static
  IntentScoreBuffer (shared singleton — GardenGrowController reads from it).
- Reconnect: if connection drops (OnClose), attempt reconnect every 5s,
  up to 10 attempts, then log an error and stop retrying (do not crash
  or loop forever). Display reconnect status via a static string property
  (ConnectionStatus) that the UI can poll.
- DispatchMessageQueue() must be called in Update() — this is required
  by NativeWebSocket on WebGL/non-threading builds; include the call even
  though the target is Windows Standalone, for future portability.

Create game-client/Assets/Scripts/Garden/GardenGrowController.cs:
- MonoBehaviour. References (via [SerializeField]):
  - Transform PlantTransform: the plant's root transform
  - ParticleSystem BloomParticles: particle burst on bloom
  - UnityEngine.UI.Slider HistorySlider: shows RecentAverage(20) (1s
    running average) as a subtle background progress indicator
  - TextMeshProUGUI StatusText: shows "Rest" / "Imagine now!" / connection
    status
- Has a PlantGrowthModel instance (initialized in Awake).
- In Update():
  1. Get Latest message from the shared IntentScoreBuffer.
  2. Call PlantGrowthModel.Update(intentScore / 100f, Time.deltaTime).
  3. Apply PlantTransform.localScale = Vector3.one * Mathf.Lerp(0.3f, 1.5f,
     model.CurrentGrowth). (Minimum scale 0.3 so plant never fully disappears.)
  4. If model.IsBloom and !BloomParticles.isPlaying: BloomParticles.Play().
  5. If !model.IsBloom and BloomParticles.isPlaying: BloomParticles.Stop().
  6. HistorySlider.value = IntentScoreBuffer.RecentAverage(20) / 100f.
  7. If Latest.IsArtifact: StatusText = "⚡ Signal check..." (artifact indicator).
     Else if Latest.Mode == "band_power_only": StatusText = "Focus...".
     Else: StatusText = "".

Create game-client/Assets/Scripts/UI/SessionSummaryController.cs:
- MonoBehaviour. Tracks across the session (receives events via a
  static event that GardenGrowController fires):
  - TotalActiveSeconds (non-artifact time)
  - BestStreak (longest consecutive run of StreakAboveThreshold(70, 5))
  - TrialsCompleted (incremented each time trial_state "mi_window_offset"
    marker arrives — add this to the IntentScoreMessage or a separate
    MarkerMessage type TBD)
- ShowSummary() populates TextMeshPro fields: "You focused for X minutes"
  / "Your best streak was Y seconds" / "Great session!". Keep language
  positive and non-comparative (spec Section 9.3 — never show a raw
  percentage or letter grade).

--- SCENE STRUCTURE ---

Create a document at game-client/Assets/Scenes/README.md describing the
three scenes needed for MVP and how they connect:
1. CalibrationScene: shows "Calibration in progress" text + a progress
   bar driven by a trial counter received via WebSocket. No plant yet.
   When calibration complete marker arrives, load GardenScene.
2. GardenScene: main game scene with GardenGrowController and NeuroReachClient.
3. SummaryScene: loaded when session_end command is received; shows
   SessionSummaryController.

--- EDIT MODE TESTS ---

Create game-client/Assets/Tests/EditMode/TestIntentScoreMessage.cs:
- Test FromJson() with a known valid JSON string; assert all fields parsed
  correctly.
- Test FromJson() with missing optional fields (classifier_score absent);
  assert it returns a message with the sentinel value, not an exception.
- Test FromJson() with malformed JSON; assert it returns null or throws
  a clearly catchable exception (document which behavior you implement).

Create game-client/Assets/Tests/EditMode/TestIntentScoreBuffer.cs:
- Add 25 messages with IntentScore alternating 80.0 and 20.0. Assert
  RecentAverage(10) is approximately 50.0 (±5).
- Add 10 messages all with IntentScore = 90.0. Assert
  StreakAboveThreshold(75.0, 10) is true.
- Add 9 messages at 90.0 then 1 at 60.0. Assert
  StreakAboveThreshold(75.0, 10) is false.
- Assert Latest on an empty buffer returns null, not an exception.

Create game-client/Assets/Tests/EditMode/TestPlantGrowthModel.cs:
- Simulate 5 seconds of Update() with intentScore01=1.0 at 0.02s steps;
  assert CurrentGrowth reaches >= 0.99 before 5s (grow_speed 0.8/s).
- Simulate growth to 0.9 (intentScore01=1.0), then set intentScore01=0.0
  and simulate 3s; assert CurrentGrowth is still > 0.0 (wilt_speed is
  slow — plant should not hit zero in 3s from 0.9 at 0.3/s).
- IsBloom hysteresis test: drive to CurrentGrowth > 0.75, simulate 3.1s
  to trigger bloom; assert IsBloom is True. Then set intentScore01 to
  give CurrentGrowth = 0.70 (above the 0.60 off-threshold); assert
  IsBloom remains True. Then drive to CurrentGrowth = 0.55; assert
  IsBloom becomes False.
- Assert CurrentGrowth is always clamped to [0, 1] across arbitrary inputs.

Output a scene-structure README and a summary of all files created.
Do NOT attempt to set up the Unity project itself (project creation,
package manager operations) — assume the Unity project already exists
at game-client/. Focus entirely on the C# scripts and test files.

Finally update todos.md.
```

---

### Notes for you, not the agent

- **Phase 1 has one dependency you need to manage manually**: after Prompt 1, the CalibrationOrchestrator needs a real or mock marker outlet stream that the scoring service (Prompt 3) and game client (Prompt 5) can subscribe to. The marker_outlet.py from Prompt 1 handles the server side; confirm it runs in your test environment before proceeding to Prompt 3.

- **The synthetic calibration data trick in Prompt 2 is important**: don't let the agent substitute "just generate random noise" — the C3 amplitude asymmetry described there is carefully constructed to give CSP something real to find. If the test uses pure noise, the quality-gate assertion will flake (sometimes passes chance, sometimes doesn't) and you'll never know if the classifier works.

- **Prompts 3 and 4 together form the "engine + API" pair** — run Prompt 3's tests first in isolation, then add Prompt 4's server on top. The cleanest way is: write and test the ScoringService to a queue, then wrap it with the WebSocket server in a second session so you're not debugging async + signal processing simultaneously.

- **For Prompt 5, the agent cannot run Unity** — the value of the editmode tests is that you can verify the pure C# logic (growth model, buffer, JSON parsing) entirely in the IDE before ever opening a scene. Run them via `Unity.exe -batchmode -runTests -testPlatform EditMode` from the CLI before touching a scene.

- **End-to-end smoke test (do this manually after all 5 prompts pass their unit tests)**: start MockUnicornOutlet → start ScoringService → start WSServer → open Unity in the editor and enter Play mode in GardenScene. The plant should visibly pulse. Inject a sustained ERD via mock_eeg_outlet.inject_erd("C3", (8,12), 0, 10, 0.6) and watch the plant grow over ~5–10 seconds. This is the first real validation that all 5 modules are actually talking to each other correctly.