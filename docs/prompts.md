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