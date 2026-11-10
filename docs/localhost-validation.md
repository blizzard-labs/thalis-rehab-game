# Localhost verification

## Software acceptance

Run the patient and console builds and unit suites from the README. Run the signal tests in the pinned EEG environment. The browser tests use independent browser contexts and temporary station databases. They never require a real participant record.

For the full browser suite, set `NEUROREACH_TEST_PYTHON` to the Python executable in that environment and `NEUROREACH_POSE_FIXTURE` to a local copy of the [MediaPipe test image](https://storage.googleapis.com/mediapipe-assets/pose.jpg). Run `npm run build` followed by `npm --prefix patient-web run test:e2e`. The tests launch their own acquisition companions. Run the headless browser from an account with access to loopback sockets. For Windows packaging verification, point `NEUROREACH_COMPANION_EXE` at the frozen executable.

| Check | Evidence |
|---|---|
| No sensors | All five games have a headset-free path. Browser tests exercise rowing and channel changes, orchard pickup and delivery, and resuming a restored lighthouse from saved outings. Pausing prevents actions. Guest history survives reload and can be cleared. |
| Webcam | The real browser model processes the fixture. The player sets rest and reach, returns to rest, catches a star, and releases the camera on exit. Permission denial offers button play. |
| EEG and blended | A synthetic 17-channel, 250 Hz LSL outlet enters through production discovery and acquisition. The browser waits for the full clean baseline. Both a stream-only star catch and a blended garden action are exercised. Removing the outlet stops measured progress. |
| Calibration | Clean epochs, finite fit probabilities, held-out folds, affected-hand selection and profile-isolated model reload have numerical tests. The synthetic unit tests do not establish on-head decoding reliability. |
| Two screens | A separate browser pairs with a one-use invitation. Staff start, pause, resume, end and read the report. Patient rest is visible to staff and remains in effect across reloads and connection loss. End-session retries preserve the newest acknowledged trial record. A TLS integration test exercises the patient listener with a trusted test certificate and denies its access to the roster. |
| Local records | Isolated tests cover consent, login and lock, PDF/CSV export, qualitative feedback, restart, backup restore, and interrupted-session status. |
| Offline | After the production service worker takes control, the guest app reloads and completes a game with browser networking disabled. The cache contains versioned assets and excludes station APIs. |
| Accessibility | Browser checks cover keyboard play, reduced motion, phone layouts and automated WCAG A/AA rules. Manual assistive-technology and participant sessions remain necessary for evaluating usability. |

For a full-duration calibration check, set `NEUROREACH_TEST_TRAINING=1` and run `pytest signal-engine/tests/test_cued_training.py` in the EEG environment. Its labelled synthetic outlet responds to engine-generated cues. The test verifies a reliable saved classifier for the left hand and loads it in a second session.

## Timing

The companion timestamps the newest LSL sample in an input window using the LSL clock correction. The player estimates the workstation/display clock offset with short round-trip requests and records the delay at the next animation-frame callback following the rendered input update. A synthetic EEG browser run checks p95 below 250 ms. Reports identify the number of timed updates. A paint callback approximates display timing. The one-second ERD and four-second classifier windows, smoothing, and the time needed to make a deliberate movement or imagery attempt are separate from this transport/display measurement.

## Physical and pilot checks

1. **H1, acquisition.** With an operator present, select the known Unicorn serial in the vendor bridge. Set `THALIS_LIVE_UNICORN=1`, `THALIS_UNICORN_STREAM_NAME` to its exact name, and `THALIS_ON_HEAD=1` only when the cap is fitted and the wearer is ready. Run `conda run -n eeg python -m pytest -s signal-engine/tests/test_live_unicorn.py`. Record contact, clean-window counts, dropouts and measured latency. Missing hardware fails the explicitly requested run.
2. **H2, calibration.** In the actual browser, select the correct hand and follow the 60-second rest and optional 20-trial imagery block. Check cue delivery, fitted-model quality, fallback when data are insufficient, and repeat calibration with the same profile. Record actual setup duration. Keep datasets and identifying details local.
3. **H3, feedback.** Complete EEG-only and blended sessions on the intended display. Verify the transmitted source, sample freshness, camera-loss handling, pause/resume and p95 timing. Compare motion estimates with reference angles measured by a qualified partner before interpreting degrees. Record the device, browser, software version and observed limitations.
4. **H4, usability.** With the site's approvals and consent, observe a short community turn and a staffed session with a rest break. Let the participant stop early. Record feedback about instructions, reach comfort, pace, controls and willingness to repeat. Reconcile the report with the observed actions and end state. Treat attempt counts, setup time, and adjustments as observations.

On a Windows signing workstation, use `packaging/sign-windows.ps1` with the certificate thumbprint, the issuing authority's timestamp URL, and the built executable. Compile the installer with Inno Setup, then sign and verify the installer with the same script. The repository contains no signing credential.

General distribution requires review of the intended use and the public-facing copy, site-appropriate approvals, signing of the distributed installer, and supported-device validation. An unsigned CI artifact is a developer prototype. Restart or roll back the station using a known build and a verified backup.
