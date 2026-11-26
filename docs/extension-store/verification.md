# Extension 0.5.0 — verification record

Prepared November 25, 2026. Store approval is a separate step.

## Completed local checks

- 155 patient-web unit tests and 13 root checks passed.
- Eight input-security regressions passed: controller origin/path validation, malformed commands and field stripping, library/duplicate-controller rejection, stale-command invalidation, pending-arm cancellation, bounded command floods, heartbeat release, navigation/focus/shortcut/disconnect stops.
- The store archive passed ZIP CRC validation, manifest-at-root and referenced-file checks, PNG dimensions, exact permission and CSP checks, absence of script fetching/eval, deterministic rebuild comparison, SHA-256 verification, and runtime parity with the manual-install ZIP.
- All eight browser acceptance scenarios passed against files extracted from the store ZIP. These cover trusted input through nested cross-origin frames, active-drag reselection, held steering, simulated EEG bursts, recorded camera movement with a covered controller, camera/signal-loss release, full 60-clean-second synthetic LSL EEG calibration, blended camera/EEG, guest reset, and sidebar/pop-up switching.

## Publication checks

Public-site, actual-provider, visual, and clean-run CI results are recorded here when completed. A missing result is not a pass. No physical headset or second physical patient device was available; those are not represented by the simulations above.

## Boundaries

Browser fixtures emulate the toolbar activeTab grant with a single intercepted-host permission in their disposable test copy. The submission archive itself does not include that extra host. The store ZIP contains readable bundled extension code; the isolated hosted controller and its fixed command bridge are disclosed in the review materials. Google makes the final policy/approval decision.
