# NeuroReach developer and deployment guide

[← User guide](../README.md)

Use the README for playing, companion installation, and clinician workflows. This file covers implementation, local development, verification, and deployment.

## Repository map

| Location | Purpose |
| --- | --- |
| `patient-web/` | React + Vite games, staff workspace, reports, and camera processing. |
| `signal-engine/` | Python companion, local records, patient pairing, screen relay, and EEG processing. |
| `clinician-console/` | Separate Electron engineering prototype and LAN workflow. |
| `game-controller-extension/` | Chrome/Edge extension for independent outside games. |
| `scripts/` | Local launcher, companion supervision, website build, and boundary checks. |
| `packaging/` | Windows executable, installer, and upgrade/rollback checks. |
| [Engineering specification](specs.md) | Architecture, data contracts, and scientific requirements. |
| [Status board](todos.md) | Implemented capabilities, test inventory, and remaining work. |
| [Verification evidence](localhost-validation.md) | Acceptance coverage, published release, and physical validation limits. |
| [Garden design](gardengrow.md) / [Star Catcher design](reachcollect.md) | Game behavior and movement goals. |
| [Outside game integration](game-library.md) | Presets, provider research, permissions, and per-game observations. |
| [Privacy notices](privacy-notices.md) | Notice sources, implemented data practices, and operator obligations. |

## Local development

Use Node.js 22.12+ and the Python 3.10 `eeg` Conda environment. Run commands from the repository root unless otherwise noted.

```sh
npm --prefix patient-web ci
conda create -n eeg python=3.10 -y
conda run -n eeg python -m pip install -r signal-engine/requirements-companion.txt
npm start
```

Skip environment creation if `eeg` already exists. The development player opens at **http://127.0.0.1:5173**. The companion listens at **http://127.0.0.1:8766**.

Both `npm start` and `npm --prefix patient-web run dev` supervise the companion: they await readiness, reuse an existing service, and restart a process they own after it exits. Closing the development server stops only the companion it launched. The staff access screen retries unavailable-service reads; it never automatically repeats a write.

To run the built client without the development server:

```sh
npm run build
npm run companion
```

Then open **http://127.0.0.1:8766**. No headset is required to run the companion or use camera/button sessions.

### Configuration

| Variable | Purpose |
| --- | --- |
| `NEUROREACH_PYTHON` | Python executable to use instead of the default Conda launcher. |
| `NEUROREACH_AUTO_COMPANION=0` | Disable automatic companion startup; used by isolated browser tests. |
| `NEUROREACH_DATA_DIR` | Override the default `~/.neuroreach` data directory. |
| `PYLSL_LIB` | Absolute liblsl library path when automatic discovery fails. |
| `EEG_SOURCE=live` | Use physical input in the separate Electron/signal-engine engineering workflow. |
| `UNICORN_STREAM_NAME` | Select the physical bridge in that engineering workflow. |

Keep configuration out of shared frontend bundles when it contains secrets or private station paths.

## EEG runtime and calibration

The supported Unicorn stream has 17 channels at 250 Hz and a name starting with `UN-`. Install the manufacturer's software separately; NeuroReach does not bundle g.tec drivers.

- Rest calibration requires 60 clean seconds and excludes invalid contact, motion artifacts, and sample gaps.
- Optional cued training uses ten rest and ten imagined-hand trials.
- A model that passes the held-out quality threshold can be saved under the selected profile; otherwise play uses rest-calibrated band power.
- Blended input requires fresh camera and EEG observations. Switching to button input is explicit.
- Reports and guest history do not store raw EEG or camera video.

Windows pylsl wheels normally include liblsl. For macOS, the [official liblsl installation guide](https://labstreaminglayer.readthedocs.io/projects/liblsl/guide/getting.html) documents:

```sh
brew install labstreaminglayer/tap/lsl
```

If discovery fails, set `PYLSL_LIB` to the installed `liblsl.dylib` before starting the companion. Linux installation and supported packages are also documented in that guide. This does not establish support for a manufacturer's headset bridge on every operating system.

The browser camera uses the bundled [MediaPipe Pose Landmarker Lite, float16, version 1](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task), SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`. Build preparation copies the pinned WebAssembly runtime locally.

## Patient-device network and certificates

The companion creates a patient-only HTTPS listener when staff issue an invitation. Its default address is the station's LAN address on port **8443**. Staff records and controls stay on loopback port **8766**.

1. Put both devices on the same reachable network; guest-network isolation may prevent communication.
2. Allow the companion's patient listener through the station firewall.
3. Use the invitation panel's **First-time device connection** to download the station authority certificate.
4. Have clinic IT verify and install/trust that authority on the patient device, or supply an organization-managed certificate and hostname.
5. Open the patient link in a browser that trusts the certificate before requesting camera access.

Invitation links expire after ten minutes if unclaimed and can only be claimed once. **Open on this computer** uses a separate local patient window. **Reconnect patient device** replaces a lost device's invitation while preserving the paused visit.

To use a clinic-managed hostname and certificate:

```sh
conda run --no-capture-output -n eeg python signal-engine/local_companion.py --display-host station.clinic.example --display-port 8443 --cert station-chain.pem --key station-key.pem
```

Replace the sample hostname and certificate paths. For same-computer testing only, add `--local-only`; this uses loopback patient links and leaves the LAN listener closed.

Live screen frames and camera previews are buffered for monitoring, not written into session reports or backups. The relay updates changed elements in place and skips stale frames for slow viewers. Physical-device Wi-Fi latency still requires measurement on the actual network.

## Records, backups, and reports

- Default database: `~/.neuroreach/clinic.sqlite3`; `NEUROREACH_DATA_DIR` relocates it.
- A station supports one active supervised run. It checkpoints progress and records interrupted sessions.
- Export a station backup before upgrades or moving data. Restore requires an empty roster.
- Use OS access controls and encrypted storage to protect local records. The app does not itself encrypt the database.
- Browser guest history is separate from station records and exported files.

Session and longitudinal reports are generated from recorded observations. Progress filters cover 4, 12, or 52 weeks, game, and optional through date; the same selection applies to PDF/CSV exports. Session reports include a four-week comparison when suitable prior visits exist.

Sensor sessions retain 30-second summaries of input, mu ERD, available classifier output, arm angles, and trunk tilt. Missing observations appear as gaps. Historical records retain their original totals and event timelines. Weekly comparisons use completed visits with comparable game, input, arm, and pace; synthetic EEG and interrupted visits are excluded. Camera angles are relative estimates; FMA-UE and ARAT scores are staff-entered.

The [sample report](../NeuroReach-StarCatcher-Session-Report-Sample.pdf) is a visual reference, not a promise that every session contains every measurement.

## Tests and builds

```sh
npm test
npm run build
npm --prefix clinician-console ci
npm --prefix clinician-console test
conda run -n eeg python -m pip install -r signal-engine/requirements.txt pytest
conda run -n eeg python -m pytest signal-engine/tests
npm --prefix patient-web exec -- playwright install chromium firefox webkit
npm --prefix patient-web run test:e2e
```

The browser suite uses installed Chrome by default. Set `NEUROREACH_BROWSER=chromium`, `firefox`, or `webkit` to use the corresponding Playwright browser.

| Test setting | Purpose |
| --- | --- |
| `NEUROREACH_TEST_PYTHON` | Python executable in the EEG environment; enables isolated companion/EEG browser scenarios. |
| `NEUROREACH_POSE_FIXTURE` | Local path to the [MediaPipe test image](https://storage.googleapis.com/mediapipe-assets/pose.jpg) for recorded camera checks. |
| `NEUROREACH_COMPANION_EXE` | Frozen Windows executable for packaged-companion browser tests. |
| `THALIS_LIVE_UNICORN=1` | Opt into the physical-headset checks in `test_live_unicorn.py`; real hardware is required. |

EEG browser tests include the full calibration wait. Signal simulations and recorded camera input are not physical hardware validation. See [acceptance coverage and measured latency](localhost-validation.md).

## Website builds and GitHub Pages

```sh
npm run build:website
npm --prefix patient-web run test:e2e -- --config playwright.website.config.ts
```

| Build | Output | Intended host |
| --- | --- | --- |
| `npm run build` | `patient-web/dist` | Local companion at `/`. |
| `npm run build:website` | `patient-web/dist-site` | GitHub Pages at `/thalis-rehab-game/`. |

The website build scopes assets, camera workers, downloads, and offline caches to the project path. Its content policy restricts script and data destinations. `release.json` identifies the source revision. The offline cache contains versioned static assets, not staff APIs or patient invitations.

The **Publish website** workflow requires a successful **Verify NeuroReach** run for the exact current main commit, then tests the production build before publishing. To roll back, revert the faulty commit and allow both workflows to finish. Publish complete builds rather than mixing files from different revisions.

To check the live site, set `NEUROREACH_WEBSITE_URL` to `https://blizzard-labs.github.io/thalis-rehab-game/` and `NEUROREACH_POSE_FIXTURE` to a downloaded pose image, then run the website test command above.

GitHub Pages currently hosts independent play only. Staff and EEG entry points lead to the local companion. A hosted staff backend needs separate server hosting, authenticated workspaces, durable records, and updated data-practice disclosures; it is not enabled by the current deployment.

## Desktop installers and public releases

The desktop launcher bundles Python, the built website, camera assets, report dependencies, Tcl/Tk, and LSL. It starts a loopback service, opens the staff workspace after readiness, and reuses an existing compatible station. Quitting stops only the service that window owns. The service CLI remains available for IT and automated checks.

| Build | Runner | Public asset |
| --- | --- | --- |
| Windows x64 | `windows-latest` | `NeuroReach-Windows-Setup.exe` |
| macOS Apple silicon | `macos-15` | `NeuroReach-macOS-Apple-Silicon.dmg` |
| macOS Intel | `macos-15-intel` | `NeuroReach-macOS-Intel.dmg` |

The declared Mac minimum is macOS 15. Build each architecture natively using Python 3.12 on Mac; the older Intel 3.10 runner runtime has mismatched Tk headers and libraries. Windows currently bundles Python 3.10. Install `packaging/requirements-build.txt` in the build environment (PyInstaller **6.17.0**, with its fix for bundled setuptools dependencies), then:

1. Run `npm run build`.
2. On Mac, install liblsl on the build machine and set `PYLSL_LIB` to its library path. The build copies it into the app; users do not install it. When installing build requirements on Intel Mac, also set `OPENSSL_STATIC=1` and `OPENSSL_DIR` to Homebrew's OpenSSL prefix, and use `pip --no-cache-dir`. Cryptography builds from source there and must not dynamically share Python's different OpenSSL library. The workflow checks its linkage before packaging; see the [upstream build guidance](https://cryptography.io/en/stable/installation/#building-cryptography-on-macos).
3. Run `python -m PyInstaller --clean --noconfirm packaging/companion.spec`.
4. On Windows, compile `packaging/windows.iss` with Inno Setup 6 and `/DCompanionVersion=0.2.BUILD`.
5. On Mac, package `dist/NeuroReach.app` with an Applications shortcut using `hdiutil`; see the verification workflow.

`packaging/verify-companion.py` starts the packaged desktop with Python and Node absent from `PATH`, checks bundled libraries/assets, saves a visit, exports reports, and checks the visit after restart. Windows additionally exercises actual installation, upgrade, rollback and uninstall. Desktop screenshots are retained as workflow artifacts.

After the entire **Verify NeuroReach** workflow succeeds for current main, **Publish companion downloads** downloads those exact tested artifacts, creates SHA-256 checksums, uploads a draft GitHub release, and publishes it only when all three installers are present. Published assets are immutable. Stable `releases/latest/download/...` links serve users without GitHub login. Source tags use `companion-0.2.BUILD`; install only reviewed releases. To roll back, mark a prior verified release latest after assessing record-format compatibility; do not overwrite an existing release's files.

### Signing and first-release limitations

Current public downloads are unsigned by a publisher; Mac bundles have only PyInstaller's ad-hoc signature and are not notarized. OS approval may be needed. No workflow disables Gatekeeper or SmartScreen. The setup guide links Apple's app-specific approval flow; managed devices may require IT.

For a signed release, provision the publisher's Windows signing certificate and Apple Developer ID/notarization credentials. `packaging/sign-windows.ps1` supports a certificate already installed on a release workstation. The Mac spec accepts `NEUROREACH_CODESIGN_IDENTITY`; notarization and stapling must follow signing before final checksums/publication. Signing credentials are not currently configured in CI.

Installers do not include g.tec drivers. Physical Unicorn setup remains Windows-specific. Records live outside the application directory under `~/.neuroreach` and survive replacement/removal of the executable; the launcher records bounded diagnostic logs in `~/.neuroreach/logs`. General clinical distribution still requires operator review and relevant physical validation.

## Separate Electron engineering prototype

This is a separate HTTPS LAN workflow with the original developer roster, signal monitor, and WebRTC camera processing. It uses an explicitly simulated signal source by default. The companion's **Staff workspace** is the user-facing path for participant records and automatic reports.

```sh
conda run -n eeg python -m pip install -r signal-engine/requirements.txt
npm run build
npm --prefix clinician-console ci
npm --prefix clinician-console run dev
```

Use `EEG_SOURCE=live` and `UNICORN_STREAM_NAME` for a physical bridge in this engineering workflow. Use the local companion for resting and classifier calibration. Provision a trusted patient-browser certificate through the clinic's IT process.
