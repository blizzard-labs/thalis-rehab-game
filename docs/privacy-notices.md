# Safety and privacy notices

Reviewed 2026-11-25. Copy lives in `patient-web/src/legal/notices.ts`; presentation and entry gates in `LegalNotice.tsx`. These are factual prototype-use notices and acknowledgments, not a signed clinical consent, research authorization, liability release or determination of legal compliance.

## Where notices appear

| Entry | Notice and behavior |
|---|---|
| Start a built-in game | Prototype limits, comfortable seated activity, optional browser history, MIT warranty/liability summary. Camera and EEG explanations match the selected input. The session and sensor hooks mount only after acknowledgment. |
| Staff workspace | Supervision, participant agreement, individual records, live viewing, report limitations. Shown before station data loads; remembered in that tab. |
| Patient invitation (`#display=` or legacy `?c=`) | Explicit live game/camera sharing and station record disclosure before connection or pairing. Acknowledgment is scoped to that invitation and tab. A new invitation requires a new choice. |
| External library | Provider privacy/terms, ads/purchases, flashing content, compatibility and independent-only scope before library access. |
| Direct extension controller | Sensor limitations, debugging permission, transmitted game actions and the distinction between stopping controls and stopping camera capture. |
| Safety shield beside the resources icon | Reopens the full notice, including privacy, research/media separation, warranty/liability and project contact. Pauses built-in gameplay / stops extension input. The existing Notion information link stays available. |
| Report reader / PDF / CSV | Practice-only interpretation and uncertainty statement travels with exported reports. |

Escape or Go back cancels the entry without starting its session, camera or EEG connection. Acknowledgments are versioned and stored in browser storage, with an in-memory fallback if storage is blocked. They are not identity-verified or copied to a central consent log. Next guest clears independent acknowledgments as well as guest records; open controller tabs return to the notice and release their sensors. The staff registration checkbox remains a staff confirmation, separate from the patient's per-invitation sharing choice.

## What the reviewed materials do and do not establish

The supplied **NeuroReach (2).pdf** describes a wellness/engagement adjunct and a first supervised pilot. The **sample Star Catcher report** says its metrics are not diagnoses or standalone recovery measures, distinguishes relative movement estimates, and explains session normalization. The **newsletter** describes preparation for first clinical pilots and supplies the project contact. These documents establish intended framing, not proof of efficacy, regulatory authorization or present implementation guarantees.

The public [Notion resources](https://neuroreach.notion.site/NeuroReach-EEG-Assisted-Motor-Rehabilitation-RESOURCES-3ac0b3bfcc1381189586e200abe4d8cd), reviewed including “Safety, privacy and regulatory” and “Consent and data”, describe a participation-count-only, offline community program with no individual outcome records. **That description does not cover this app's optional individual guest history, supervised station records or internet-based external games.** The notices disclose the implemented behavior. Align public program materials with the actual deployment before using them as its privacy statement.

Avoid carrying forward unverified claims such as “fully eliminates seizure risks”, automatic IRB compliance, guaranteed latency/results, or a blanket legal classification of the software as not a medical device. Software tests and sample reports do not establish those claims.

## Data behavior checked against implementation

- Independent camera processing uses the browser's pose worker; no microphone or raw-video recording in the built-in player. Current-round measurements stay in memory until the guest chooses to save or download. Browser storage also holds the guest identifier, settings, acknowledgment version/context and offline app assets.
- Supervised game state, camera-preview frames and telemetry reach authenticated station viewers. The screen mirror buffers current frames in memory; session measurements and participant information go to the local station database. Pausing play can leave the preview visible. Ending or closing the player releases its camera; already saved measurements remain.
- Optional EEG calibration/model files live on the companion computer. Next guest removes the browser's link, not the model files themselves. Browser deletion also cannot recall exported files or station backups.
- The extension sends keyboard/pointer events to the selected provider game. Provider pages handle their own cookies, network requests, accounts and purchases. A covered controller can keep tracking the camera. Stop controls releases game input; closing the controller ends sensor capture.
- No built-in cloud record sync or advertising analytics was found in the current player. Hosting, operator configuration, external sites, exports and third-party tools have separate data practices. The app does not itself encrypt its local database or certify HIPAA/GDPR compliance.

## Copy and deployment review

Primary guidance consulted: [FTC mobile health app best practices](https://www.ftc.gov/business-guidance/resources/mobile-health-app-developers-ftc-best-practices) on clear disclosures, data minimization and affirmative choices; [FDA digital health policy navigator](https://www.fda.gov/medical-devices/digital-health-center-excellence/step-3-software-function-intended-maintaining-or-encouraging-healthy-lifestyle) on intended use and disease-related claims; [HHS health app developer resources](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/index.html) on laws depending on the app, its data and its deployment. Liability wording summarizes the repository's [MIT License](../LICENSE), preserves non-excludable rights and does not add arbitration, indemnities or an injury waiver.

Before public/clinical deployment, the responsible operator and qualified counsel still need to establish the legal operator, jurisdictions, intended use/regulatory status, applicable privacy duties, retention/access/deletion procedures, hosting practices and arrangements for minors or represented participants. Any research requires its own appropriate institutional review and consent; media permission is separate. Do not treat the popups as satisfying those obligations.

When practices or material wording change, update `NOTICE_VERSION` and this document. Verify cancellation before acquisition/pairing, returning-reader behavior, a fresh invitation, Next guest across tabs, blocked storage, keyboard/Escape/focus, small screens, 400% zoom, and unchanged supervised/extension controls. Do not put personal or sensor data in acknowledgment records.

Verified for this change: 155 patient-web unit tests, two station-record tests, 12 Chromium notice cases and 11 WebKit notice cases (native Chromium zoom is inapplicable in WebKit). Regression checks cover built-in games, library controls, guest reports/handoff, native 200%/400% keyboard zoom, separate-window supervised launch, mirrored play, and recorded-camera/synthetic-EEG controller handoff. Desktop and 320/390-pixel notice screenshots were visually inspected. No physical headset or second-device test was performed for these notice changes.
