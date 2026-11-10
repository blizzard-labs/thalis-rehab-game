# NeuroReach: EEG-Assisted Motor Rehabilitation
> Repository: `thalis-rehab-game`

<div align="center">
  <img src="patient-web/img/logo-small.png" alt="NeuroReach Logo" width="500">
</div>

NeuroReach is an open-source wellness and engagement prototype for seated upper-limb practice. Garden Grow and Star Catcher accept keyboard, switch, touch, webcam movement, or motor-imagery input from a supported Unicorn EEG headset. The public player runs in a browser. The optional local companion handles EEG and supervised records. Camera video and raw EEG stay on the acquisition device or the clinic LAN.

* **Brief Introduction: [https://youtu.be/hHVyAqoD-6w](https://youtu.be/hHVyAqoD-6w)**
* **System Walkthrough: [https://youtu.be/Uo2iDNLLS2w](https://youtu.be/Uo2iDNLLS2w)**


---

## Play on localhost

Use Node.js 22.12 or later. From the repository root, run `npm --prefix patient-web ci` once, then `npm start` and open **http://127.0.0.1:5173**. Choose Garden Grow or Star Catcher and use a button, touch, keyboard, or an adaptive switch. Pause or end a round at any time. Saving a summary is optional and local to the browser. Choose **Camera** to set a resting position and a comfortable reach for either arm. The browser processes frames in a local worker. In Star Catcher, save up to four comfortable directions and hold the net over a star until its ring fills. Move clear of that catch to collect the next one. In Garden Grow, return to rest between actions. You can switch to one-button input during setup or play. QR links from the clinician console still open the paired workflow.

### Local EEG companion

Start the g.tec Unicorn Suite LSL bridge with your headset streaming. The root `npm start` launcher also starts the companion if the `eeg` Conda environment is installed. Set `NEUROREACH_PYTHON` to select another Python environment. For a standalone companion with the built web app, run `npm run companion`. The companion binds to **127.0.0.1:8766**. You can also run `npm run build` and open **http://127.0.0.1:8766** to use the built app without Vite. On the game setup screen choose **EEG headset** or **Camera + EEG**, choose the arm and device, and follow the resting instructions. No headset is required to start either server.

The companion recognizes 17-channel, 250 Hz Unicorn streams whose names start with `UN-`. It requires 60 clean seconds of rest and excludes motion artifacts, invalid contact, and sample gaps. Optional cued training uses ten rest and ten imagined-hand trials. A model that clears the held-out quality threshold can be saved locally by choosing the calibration checkbox on a personal computer. Otherwise play uses rest-calibrated band power. Blended mode needs fresh input from both sources; a user can explicitly switch to button input. No raw EEG or video is written to session history.

Install the companion dependencies with Python 3.10. On macOS, install liblsl and set `PYLSL_LIB` to its library path if your environment cannot locate it. Windows wheels for pylsl normally include the LSL runtime. Install g.tec's software separately on the headset computer.

```sh
conda create -n eeg python=3.10 -y
conda run -n eeg python -m pip install -r signal-engine/requirements-companion.txt
```

### Supervised sessions

Open **Staff workspace** on localhost with the companion running. Set the station password, add a participant label with consent, choose an arm and session settings, and start either game. The station checkpoints progress, records pauses, and produces CSV and PDF reports. Select a five-minute round or two nine-minute blocks separated by a rest. Staff can save participant feedback with a completed session. Locking the workspace protects record access; an OS account with encrypted storage protects the files on disk. The roster supports assessments, deletion, and exporting or restoring a station backup. Restore requires an empty roster. Browser guest history is independent.

The default SQLite database is `~/.neuroreach/clinic.sqlite3`. Set `NEUROREACH_DATA_DIR` to use another local directory. Back up the database or export a backup from the workspace before moving stations.

The bundled model is Google's [MediaPipe Pose Landmarker Lite, float16, version 1](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task), SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`. The build copies the pinned MediaPipe WebAssembly runtime locally.


## Run the paired-screen Electron prototype

The Electron console hosts a separate HTTPS LAN workflow for a patient display. It includes the original developer roster, signal monitor, WebRTC camera processing, and an explicitly simulated signal source by default. The localhost **Staff workspace** above holds the real participant records and automatic reports.

```sh
conda run -n eeg python -m pip install -r signal-engine/requirements.txt
npm run build
npm --prefix clinician-console ci
npm --prefix clinician-console run dev
```

Use `EEG_SOURCE=live` and `UNICORN_STREAM_NAME` to select a physical bridge for this engineering workflow. Use the localhost companion for resting and classifier calibration. For a second device, provision a certificate trusted by the patient browser using your clinic's IT process.

## Build and verification

```sh
npm test
npm run build
npm --prefix clinician-console test
conda run -n eeg python -m pip install pytest
conda run -n eeg python -m pytest signal-engine/tests
npm --prefix patient-web run test:e2e
```

The browser tests use installed Chrome by default. Set `NEUROREACH_BROWSER=chromium` for Playwright's installed Chromium. The optional EEG browser test launches an isolated companion, takes about 80 seconds, and needs `NEUROREACH_TEST_PYTHON` pointing to the EEG environment's Python executable. The positive camera test accepts `NEUROREACH_POSE_FIXTURE`, the path to [MediaPipe's test image](https://storage.googleapis.com/mediapipe-assets/pose.jpg). Both use test signals or images. Physical on-head validation uses `THALIS_LIVE_UNICORN=1` with the existing `signal-engine/tests/test_live_unicorn.py` hardware checks.

See [localhost verification](docs/localhost-validation.md) for the acceptance scenarios, latency definition and physical pilot checks.

The production web build in `patient-web/dist` can be served at the root of an HTTPS site. The service worker caches versioned app, model, and runtime assets after the first load. Guest sessions work offline; EEG and staff features use a running local companion. Publish a complete build atomically and keep the previous version for rollback. The included GitHub Actions workflow builds and tests the web archive and packages a Windows prototype installer. The installer does not bundle g.tec drivers. Deployments for general distribution still require code signing and on-head validation.

To create the Windows prototype installer locally, build the web app, install the companion requirements and PyInstaller 6.16, run `python -m PyInstaller packaging/companion.spec`, then compile `packaging/windows.iss` with Inno Setup 6. User records live outside the application installation and survive replacement of the executable. Download a station backup before upgrading.

The [sample session report](NeuroReach-StarCatcher-Session-Report-Sample.pdf) is a design reference. Generated reports contain the measurements actually recorded for that session.

## Repository layout

```
thalis-rehab-game/
├── docs/
│   ├── specs.md           # full engineering specification (v2 architecture)
│   ├── todos.md           # whole-project status board + test inventory
│   ├── gardengrow.md      # Garden Grow game design
│   ├── reachcollect.md    # Reach & Collect / Star Catcher design + ROM roadmap
│   └── wireframes/        # UI wireframes (C1–C5 console, P1–P6 patient)
├── signal-engine/         # Python real-time service (see subsystems table)
├── clinician-console/     # Electron + React console + LAN server
└── patient-web/           # React + Vite patient game
```

### Pair a separate supervised display

In the localhost staff workspace, select a participant and game, then **Pair a patient display**. The invitation expires in ten minutes and can be claimed once. Open it in a second browser window, press **Pair this display**, then start play from the workstation. Staff can pause, resume, or end the game. The patient screen can also end the session. Its access is scoped to the current game.

By default the invitation points to a second window on the same computer. To host a tablet on the clinic LAN, first provision a TLS certificate trusted by that tablet for the station hostname. Build the web app, then start the companion directly with the LAN listener explicitly enabled:

```sh
conda run --no-capture-output -n eeg python signal-engine/local_companion.py --display-host station.clinic.example --display-port 8443 --cert station-chain.pem --key station-key.pem
```

Substitute the station's real DNS name and certificate files. Open staff tools at the loopback URL and scan the resulting QR code on the tablet. The LAN listener serves the patient app and authorized session controls. Access to staff records stays on loopback.
