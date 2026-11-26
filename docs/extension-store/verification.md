# Extension 0.5.0 — verification record

Prepared November 25, 2026. Store approval is a separate step.

## Local checks

| Check | Result |
| --- | --- |
| Patient-web unit tests | 155 passed |
| Root checks | 14 checks, including nine extension security/startup regressions |
| Production website acceptance | All six passed: project paths, downloads, notices, camera play, offline behavior, and external-game control |
| Packaged extension browser acceptance | All eight passed, including recorded camera input and synthetic EEG; the final sidebar handoff also passed the layout-switching test again |
| Production dependency audit | No known vulnerabilities reported by `npm audit --omit=dev` |
| Submission archive | CRC, root manifest, referenced files, icon dimensions, permission/CSP allowlists, local scripts, deterministic rebuild, checksum, and manual/store runtime parity passed |

The browser scenarios cover trusted input through nested cross-origin frames, active-drag reselection, held steering, simulated EEG bursts, recorded camera movement while the controller is covered, camera/signal-loss release, a full 60-clean-second synthetic LSL baseline, blended camera/EEG, guest reset, and sidebar/pop-up switching. Security checks reject malformed commands, extra fields, unauthorized entry pages/controllers, stale queued commands and pending arms, and excessive command queues. They verify releases on heartbeat loss, navigation, focus changes, disconnect, and the stop shortcut.

## Actual browser and game

A fresh Chrome for Testing 149 profile loaded the unmodified extracted store archive, without extra provider permissions. The normal Extensions menu granted temporary active-tab access to **play2048.co**. Area selection, the default sidebar, the public controller, input setup, enabled arrow controls, and Stop controls were exercised. Four controller arrows changed the real game's score from 0 to 8; Stop disabled the controller buttons.

This uncovered a first-use bug: opening the sidebar could destroy the toolbar popup before it sent the selection request. The worker now owns both steps. A second fresh profile confirmed that **one** Choose game area click opens both sidebar and rectangle selection. An automated regression verifies that the handoff survives the toolbar closing.

The 1280 × 800 listing screenshot shows the actual public controller connected to the real 2048 provider, with on-screen controls enabled. It contains no patient data. The capture harness emulates active-tab permission; the unchanged-manifest permission flow was checked separately above. The image and 128 px icon were visually inspected.

## Clean builds and public delivery

[Verify NeuroReach](https://github.com/blizzard-labs/thalis-rehab-game/actions/workflows/verify.yml) is the release gate. It checks Windows, macOS Apple Silicon and Intel, the web app, signal processing, installer startup and saved records, and packaged browser acceptance. A prepared archive is not by itself evidence that every job passed: check the run for the exact commit being submitted. The website deployment only follows a successful verification of the current main commit.

The initial preparation run passed web, signal, and both macOS jobs, but one of three Windows live-monitor measurements missed its 220 ms limit (483 ms; the other two were 58 and 59 ms). The next clean run passed all three at 57, 53, and 50 ms; three local repeats passed at 53, 50, and 55 ms. The threshold was not weakened. That next run exposed a missing Chromium installation in the new Windows extension test stage; the workflow now installs its required browser explicitly. The final commit must pass the complete gate before submission.

After deployment, verify the [public privacy notice](https://blizzard-labs.github.io/thalis-rehab-game/extension-privacy.html) and [store ZIP](https://blizzard-labs.github.io/thalis-rehab-game/neuroreach-game-controller-store.zip); compare the downloaded archive with `dist/extension/SHA256SUMS.txt`. The exact hash is generated alongside the archive and must be checked again if source files change.

## Boundaries

Automated browser fixtures emulate the toolbar's active-tab grant with one intercepted-host permission in their disposable copy. The submission archive does not contain that permission. Recorded camera frames and synthetic EEG are software tests; no physical headset or second physical patient device was available. They do not establish clinical effectiveness or every game's compatibility. Chrome was tested directly; Microsoft Edge and a store-installed/signed build still need their own acceptance checks.

The store ZIP contains readable bundled extension code. The isolated hosted controller and its fixed command bridge are disclosed in the review materials. Google makes the final policy and approval decision.
