# Prompt 1 — LSL Acquisition Module + Mock EEG Outlet

Working in the `thalis-rehab-game` repo, following the layout in docs/specs.md (read and understand this document carefully first)
Section 4.1. (use conda environement: "eeg")

Create signal-engine/acquisition/lsl_inlet.py:

- An `EEGInlet` class that connects to an LSL stream of type=='EEG' via
  resolve_byprop('type', 'EEG', timeout=5.0). If no stream is found within
  the timeout, raise a custom `StreamNotFoundError` — do not let the
  process hang indefinitely or crash with an unhandled exception.
- On connect, read the stream's channel labels from the StreamInfo's
  XML description (info.desc()) rather than assuming fixed positions.
  Do not hardcode channel indices. The g.tec Unicorn LSL stream
  typically carries 17 channels in one stream: 8 EEG, 3 accelerometer
  (X/Y/Z), 3 gyroscope (X/Y/Z), battery, counter, and a validity flag —
  but verify this against the actual parsed labels at runtime and log
  them on connect rather than assuming. Use the parsed labels to find
  and slice out only the EEG channels.
- `get_eeg_chunk(max_samples: int) -> np.ndarray` returns a float64
  array shaped [8, n_samples] (n_samples <= max_samples) containing only
  the EEG channels, in the units reported by the stream's channel_format/
  unit metadata if available, otherwise assume raw microvolts.
- `get_imu_chunk(max_samples: int) -> np.ndarray` returns the 6 IMU
  channels (accel xyz + gyro xyz) the same way, sliced by label.
- Call `inlet.time_correction()` internally on a 5-second interval
  (not on every pull) and expose `get_time_correction() -> float`.
- All methods must be non-blocking beyond a configurable short timeout
  (default 1.0s) — never block forever waiting for samples.

Create signal-engine/acquisition/mock_eeg_outlet.py:

- A `MockUnicornOutlet` class that publishes an LSL outlet matching the
  real device's shape/labels described above (17 channels, 250 Hz),
  stream name "UnicornRecorderLSLStream", type "EEG", running in a
  background thread that pushes samples at 250 Hz using a high-resolution
  timer (not time.sleep alone — account for drift).
- Default signal: pink or white noise baseline per EEG channel, plus a
  configurable resting mu-band (8-12 Hz) and beta-band (13-30 Hz)
  sinusoidal component on every channel.
- Method `inject_erd(channel_label: str, band: tuple[float,float],
  start_in_s: float, duration_s: float, suppression_fraction: float)`
  that schedules a temporary reduction in that channel's power in that
  band starting `start_in_s` seconds from now, lasting `duration_s`,
  by `suppression_fraction` (e.g. 0.5 = 50% power reduction) — used to
  simulate event-related desynchronization for downstream testing.
- `start()` / `stop()` methods; `stop()` must cleanly join the thread.

Create signal-engine/tests/test_lsl_inlet.py (pytest):

- Start a MockUnicornOutlet in a background thread/process.
- Connect EEGInlet, assert it resolves within the timeout and correctly
  identifies 8 EEG channels and 6 IMU channels by label (not by assuming
  a fixed order — to prove this, have the mock declare channels in the
  real device's documented order, and add a second test where you
  permute the channel order in the mock and assert EEGInlet still slices
  correctly).
- Pull a chunk, assert shape [8, N], dtype float64, no NaNs.
- Assert get_time_correction() returns a float without raising.
- Cleanly stop the mock outlet and assert the inlet's next pull either
  returns an empty result or raises a clear "stream ended" condition,
  not a hang or crash.
- Add one test that does NOT start a mock outlet at all, and asserts
  EEGInlet(timeout=1.0) raises StreamNotFoundError within ~1s, not
  immediately and not after a long hang.

Do not write any preprocessing, filtering, or scoring logic in this
prompt — acquisition only. Output a short summary of what you built and
how to run the tests. Additionally, you can use code from my previous eeg projects in "archive" to inform your coding.

# Prompt 2 - Preprocessing Module

Working in the same thalis-rehab-game repo (with docs/specs.md as a references. Be sure to read through this thoroughly and understand the final criteria). Reuse signal-engine/acquisition/
mock_eeg_outlet.py from the previous step as a test fixture — do not
duplicate signal-generation logic.

Create signal-engine/preprocessing/filters.py with TWO distinct code
paths, clearly documented as different use cases:

1. Offline/batch path (used for calibration-block analysis, not live
   scoring): `bandpass_filter_offline(data, fs=250, low=1.0, high=40.0,
   order=4)` and `notch_filter_offline(data, fs=250, freq=60.0, q=30.0)`
   using scipy.signal.butter + filtfilt (zero-phase, non-causal — uses
   the whole buffer, fine for post-hoc analysis, NOT fine for live
   per-chunk scoring since it requires lookahead).

2. Live/causal streaming path (used for real-time scoring): a
   `CausalFilterChain` class wrapping scipy.signal.sosfilt with
   PERSISTENT filter state (zi) carried between calls, exposing
   `process_chunk(chunk: np.ndarray) -> np.ndarray` that can be called
   repeatedly on successive small chunks and produce output equivalent
   to filtering the full concatenated signal at once (within numerical
   tolerance) — this persistent-state correctness is the main thing to
   get right and test.

Create signal-engine/preprocessing/spatial.py:
- `common_average_reference(data: np.ndarray) -> np.ndarray` — subtracts
  the per-timepoint mean across the channel axis (axis=0 for [n_ch, n_samples]
  input).

Create signal-engine/preprocessing/artifact.py:
- `AmplitudeGate` class: configurable peak-to-peak microvolt threshold
  (default 100), configurable channel indices to check, rolling 1-second
  window. Method `is_clean(window: np.ndarray) -> bool`.
- `MovementGate` class: takes an IMU chunk (from EEGInlet.get_imu_chunk),
  computes rolling variance of accel+gyro magnitude over a 1s window,
  flags `is_head_still(window) -> bool` against a configurable threshold.

Create signal-engine/tests/test_preprocessing.py (pytest), using
synthetic signals (no need for the mock LSL outlet here — direct
numpy array generation is fine and simpler):

- Generate 10s of 8ch/250Hz synthetic data: a 10 Hz sine (intended to
  survive filtering) + a 60 Hz sine (line noise, should be removed) +
  Gaussian white noise. Assert after notch_filter_offline, the power at
  60 Hz (via Welch PSD) is reduced by at least 20 dB relative to before,
  while power at 10 Hz changes by less than 1 dB.
- Assert bandpass_filter_offline removes a 0.2 Hz drift component and a
  70 Hz component while preserving the 10 Hz component (same PSD-based
  tolerance approach).
- CausalFilterChain correctness test: filter a 5000-sample signal in one
  call vs. in chunks of 50 samples fed sequentially through the SAME
  CausalFilterChain instance; assert the two outputs match within 1e-6
  (this is the persistent-state continuity check — get it wrong and
  every chunk boundary introduces a transient).
- common_average_reference: inject an identical DC offset on all 8
  channels, assert it's fully removed; assert per-channel relative
  differences are preserved.
- AmplitudeGate: inject a single 150 µV synthetic spike into otherwise
  ~20 µV noise, assert is_clean() is False for the window containing it
  and True for a clean window.
- MovementGate: feed a flat/near-zero IMU window, assert is_head_still
  is True; feed a window with a large injected accel spike, assert False.

Output a short summary and test run instructions when done. Additionally, you can use code from my previous eeg projects in "archive" to inform your coding.

# Prompt 3 - Feature Extraction: Band Power + ERD/Laterality

Working in the same thalis-rehab-game repo (with docs/specs.md as a reference. Be sure to read through this thoroughly and understand the final criteria), building on
signal-engine/preprocessing/ from the previous step.

Create signal-engine/features/band_power.py:
- `compute_band_power(data: np.ndarray, fs: int, band: tuple[float,float],
  window_sec: float = 1.0) -> np.ndarray` — returns per-channel power
  in the given band using Welch's method (scipy.signal.welch), input
  shape [n_channels, n_samples], output shape [n_channels].

Create signal-engine/features/erd.py:
- An `ERDCalculator` class, constructed with a list of channel labels
  (e.g. ["C3","C4"]) and the bands to track (default mu=(8,12) and
  beta=(13,30)).
- `calibrate_baseline(baseline_chunk: np.ndarray, channel_labels: list[str])`
  — stores per-channel, per-band baseline power from a rest-period chunk.
  Must be called once per calibration block before any ERD computation
  (raise a clear error if compute_erd is called before this).
- `compute_erd(task_chunk: np.ndarray, channel_labels: list[str]) -> dict`
  — returns {channel: {band_name: erd_percent}} using
  erd_percent = (baseline_power - task_power) / baseline_power * 100,
  resolving channels by label against the labels passed in, not by
  position (reuse the label-resolution pattern from the acquisition
  module — don't hardcode "C3 is always index 2").
- `laterality_index(erd_dict: dict, left_channel="C3", right_channel="C4",
  band="mu") -> float` — returns (ERD_left - ERD_right) / (ERD_left + ERD_right),
  handling the near-zero-denominator case gracefully (return 0.0 with a
  logged warning rather than raising or returning inf/nan).

Create signal-engine/tests/test_erd.py (pytest):
- Reuse MockUnicornOutlet and its inject_erd() method from Prompt 1.
  Start the mock outlet, schedule inject_erd(channel_label="C3",
  band=(8,12), start_in_s=2.0, duration_s=4.0, suppression_fraction=0.5).
- Pull a ~1.5s baseline chunk before the injection window and call
  calibrate_baseline on it.
- Pull a chunk during the injected suppression window (roughly
  start_in_s+0.5 to start_in_s+duration_s-0.5, to avoid edge transients)
  and call compute_erd.
- Assert ERD% at C3/mu is substantially positive (e.g. > 25%) given the
  50% power suppression injected, within reasonable tolerance for noise.
- Assert ERD% at C4/mu (no injection there) is close to 0 (e.g. within
  +/-15%) over the same window — i.e. the calculator isn't just picking
  up global signal changes.
- Inject at C4 instead of C3 in a second test and assert
  laterality_index flips sign accordingly.
- Test the "calibrate_baseline not called yet" error path.
- Test laterality_index's near-zero-denominator handling directly with
  a constructed all-zero erd_dict.

This prompt should NOT include classifier/CSP/LDA code or the WebSocket
fusion service — feature extraction only. Output a short summary and
test run instructions when done.