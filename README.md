<div align="center">

<a href="https://blizzard-labs.github.io/thalis-rehab-game/">
  <img src="patient-web/img/logo-small.png" alt="NeuroReach logo" width="420">
</a>

# NeuroReach

**EEG-Assisted Rehab**

Accessible games for upper-limb practice—with or without an EEG headset.

<p>
  <a href="https://github.com/blizzard-labs/thalis-rehab-game/actions/workflows/verify.yml"><img src="https://github.com/blizzard-labs/thalis-rehab-game/actions/workflows/verify.yml/badge.svg?branch=main" alt="Build and test status"></a>
  <a href="https://github.com/blizzard-labs/thalis-rehab-game/releases/latest"><img src="https://img.shields.io/github/v/release/blizzard-labs/thalis-rehab-game?label=release&amp;color=725382" alt="Latest companion release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-526d89" alt="MIT license"></a>
</p>

<p>
  <a href="https://blizzard-labs.github.io/thalis-rehab-game/"><strong>Play NeuroReach →</strong></a>
  &nbsp; · &nbsp;
  <a href="https://github.com/blizzard-labs/thalis-rehab-game/releases/latest"><strong>Download the companion</strong></a>
</p>

[Getting started](#start-playing) · [Companion setup](#companion-setup) · [Developer guide](docs/development.md) · [Get involved](#get-involved)

<sub>Open source · Powered by <a href="https://krishna-bhatt.com">THALis</a></sub>

</div>

---

## Make practice something to look forward to

Grow a garden, catch stars, explore an orchard, travel downriver, or keep a lighthouse shining. NeuroReach brings seated movement practice into five interactive games, with controls that adapt to how you want to play.

| Play your way | Guide a session | Follow your progress |
| :--- | :--- | :--- |
| Buttons, touch, camera, or supported EEG input. Start in your browser without a headset. | Invite a patient with a private link or QR code. Monitor their game and camera from the companion. | Review session details and trends over time. Export PDF reports and CSV data. |

**New here?** [Try a game in your browser](https://blizzard-labs.github.io/thalis-rehab-game/) or [set up the companion](#companion-setup) for supervised sessions. No Python or terminal commands needed.

## Choose how to play

| I want to… | What I need |
| --- | --- |
| Play independently with buttons, touch, or a camera | [Open the website](https://blizzard-labs.github.io/thalis-rehab-game/). No installation or EEG headset needed. |
| Start and monitor a supervised patient session | Set up the [companion](#companion-setup) on the clinician's computer. |
| Play with a Unicorn EEG headset | Set up the [companion](#companion-setup), then follow [EEG setup](#play-with-an-eeg-headset). |
| Use camera controls with familiar outside games | Install the [Game Controller extension](#play-familiar-games) in desktop Chrome or Edge. |

**Current availability:** the public website supports independent play. Hosted staff sessions are not available yet; supervised sessions currently use the companion.

## Start playing

1. Open the website and choose **Garden Grow**, **Star Catcher**, **River Rowing**, **Fruit Picking**, or **Lighthouse Keeper**.
2. Choose **One button** or **Camera**, then **Start game**.
3. Read the first-use notice. For camera play, allow camera access and follow the on-screen steps to set comfortable resting and reaching positions.
4. Use **Pause** or **End session** whenever you need to.
5. At the end, choose **Session report** to view your results. Choose **Save on this device** if you want them included in future progress reports.

You can switch to one-button controls if camera setup is difficult. On a shared device, use **Next guest** before another person plays; it clears that browser's saved guest history and starts a fresh player.

<a id="local-eeg-companion"></a>

## Companion setup

The companion runs on your computer and provides the staff workspace, supervised session connections, and EEG access. **You do not need a headset for supervised button or camera games.**

### 1. Download for your computer

| Computer | Download |
| --- | --- |
| Windows 10/11 · 64-bit Intel/AMD | **[Windows installer](https://github.com/blizzard-labs/thalis-rehab-game/releases/latest/download/NeuroReach-Windows-Setup.exe)** |
| Mac with Apple silicon (M1 or newer) · macOS 15+ | **[Mac — Apple silicon](https://github.com/blizzard-labs/thalis-rehab-game/releases/latest/download/NeuroReach-macOS-Apple-Silicon.dmg)** |
| Intel Mac · macOS 15+ | **[Mac — Intel](https://github.com/blizzard-labs/thalis-rehab-game/releases/latest/download/NeuroReach-macOS-Intel.dmg)** |

**No Python, Node.js or terminal commands needed.** On a Mac, choose **Apple menu → About This Mac** to see your chip/processor. Phone and tablet users join from their browser; install the companion on the clinician's computer.

### 2. Install — once

- **Windows:** open the downloaded installer, choose **Install**, then **Finish**. It installs for your user account.
- **Mac:** open the downloaded disk image, drag **NeuroReach** onto **Applications**, then open NeuroReach from Applications.

**First-release approval:** these downloads are not yet publisher-signed, and the Mac app is not Apple-notarized. Your computer may show an unknown-developer warning. Use only the downloads linked here. On a managed computer, ask your IT team to approve the app.

If your Mac cannot verify the developer, follow [Apple's app-specific approval steps](https://support.apple.com/en-us/102445): after attempting to open it, use **System Settings → Privacy & Security → Open Anyway** if you trust this download. Do not disable system-wide protection. [Release details and checksums](https://github.com/blizzard-labs/thalis-rehab-game/releases/latest) are available for IT.

### 3. Open NeuroReach — each time you use it

1. Open **NeuroReach** from the Windows Start menu or Mac Applications folder.
2. Wait for **Ready to use**. The staff workspace opens automatically in your browser.
3. Use **Open staff workspace** or **Open games** in the companion window whenever needed.
4. Keep that window open during sessions. Finish sessions before choosing **Quit**.

Opening the app again reuses an already-running companion. Your saved station records stay on this computer when you quit.

### Update or remove it

Export a station backup, finish sessions, and quit NeuroReach before updating. Download the new installer; on Mac, replace the existing app in Applications. Updates and uninstalling the app do not erase saved station records. Use the staff workspace's record controls to remove records intentionally.

Linux and developer setup are in the [developer guide](docs/development.md#local-development). Physical Unicorn EEG currently requires Windows and the manufacturer's software; Mac supports camera and button sessions.

## Start a supervised session

**On the clinician's computer:**

1. Open **NeuroReach**, wait for **Ready to use**, then choose **Open staff workspace**.
2. On first use, create a staff password of at least 10 characters. Keep it somewhere secure; it protects this computer's records.
3. Add a participant label and confirm their agreement to the session.
4. Choose the game, practice arm, input, pace, and session length.
5. Select **Start supervised session** to display a QR code and private patient link.

**On the patient's device:**

1. Connect to the **same Wi-Fi/network** as the clinician's computer.
2. Scan the QR code or open the patient link. Select **Pair this display**.
3. Wait for the clinician to select **Start patient game**. For camera play, allow camera access and complete the movement setup.

The clinician sees the game and, when enabled, the live camera preview. They can pause, resume, switch to button input, and end the session. One companion supports one active supervised session at a time.

**Trying it on one computer?** Select **Open on this computer** in the invitation panel to open a separate patient window.

**First connection on another device:** your clinic may need to trust the station's security certificate before the game or camera works. Use **First-time device connection** in the invitation panel and ask IT to complete certificate setup. See the [network setup guide](docs/development.md#patient-device-network-and-certificates) for technical details.

## Play with an EEG headset

Supported device: **g.tec Unicorn Hybrid Black**, using the [manufacturer's software and setup guidance](https://www.gtec.at/unicorn-faq/) and LSL bridge. Other EEG headsets are not currently supported.

1. Complete [companion setup](#companion-setup) on the headset computer. For the current Unicorn setup, use Windows with g.tec's software installed.
2. Connect the headset and start its stream in the **Unicorn Suite LSL bridge**.
3. Open the **local** NeuroReach player, choose a game, and select **EEG headset** or **Camera + EEG**.
4. Select the device and practice arm. Follow the resting calibration, which requires **60 seconds of clean signal**.
5. Complete any additional on-screen setup, then begin. You can fall back to button input if needed.

For platform-specific LSL installation and technical checks, see [EEG developer notes](docs/development.md#eeg-runtime-and-calibration).

## Play familiar games

Choose **Play familiar games** on the website to explore titles such as Fruit Ninja and 2048. Ordinary touch or keyboard play does not need an extension.

For camera controls in **desktop Chrome or Edge**:

1. Download the **NeuroReach Game Controller** from the library and unzip it.
2. Open your browser's Extensions page, turn on **Developer mode**, and select **Load unpacked**. Choose the extracted `neuroreach-game-controller` folder containing `manifest.json`.
3. Reload the NeuroReach library, open a game, then use the extension's toolbar button to choose the playable area.
4. Keep the default **Sidebar**, choose your input, complete setup, and select **Enable controls**.

**Alt+Shift+S** stops game input. Keep the controller open while using camera controls. After downloading an updated extension, replace its files and select **Reload** on the browser's Extensions page.

Outside games are for independent play, need internet, and use their providers' terms. They do not generate NeuroReach session reports. EEG controls require the local companion's library. See the [full extension instructions](game-controller-extension/README.md).

## Reports and saved information

| To… | Choose… |
| --- | --- |
| Review one round | **Session report** after play or in session history. |
| Review changes over time | **Saved sessions → Progress report**, or select a participant in Staff workspace. |
| Keep a copy | **Download PDF** or **Export CSV** in the report. |
| Include a guest round in future trends | **Save on this device** after that round. |

Guest history stays in the browser where it was saved. Supervised records stay on the companion computer. Export a station backup before moving or updating that computer; exported files are separate copies.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| “The local companion is unavailable” or a local page will not open | Open **NeuroReach** on **this computer** and wait for **Ready to use**. Keep its window open. The public website cannot start it for you. |
| An unknown-developer warning appears | See **First-release approval** above. On a managed computer, ask IT to approve the download. |
| The Mac app will not open | Check that you downloaded the right chip version and use macOS 15 or later. Use the app from Applications after installation. |
| The companion says “Could not start” | Choose **Try again**. If another program is using its address, close that program first or ask IT for help. Diagnostic logs are under your user folder in `.neuroreach/logs`. |
| Camera is blocked | Allow camera access in browser settings and close other apps using it. On a paired device, complete the station certificate setup with IT. |
| The patient link will not connect | Check that both devices use the same network. Use the QR/session link, not the clinician's `127.0.0.1` address. Ask IT about firewall access or guest Wi-Fi device isolation. |
| The invitation expired or was already used | Create a fresh invitation using the session controls. For an interrupted active visit, use **Reconnect patient device**. |
| No EEG device appears | Confirm that the Unicorn LSL bridge is streaming on the companion computer. Use button or camera play while resolving headset setup. |

## About NeuroReach

NeuroReach is an experimental wellness and engagement tool. It does not replace therapy or diagnose a condition. Reports describe practice, not proven recovery. Read **Safety & privacy** in the app and use comfortable movements within your clinician's guidance.

[Introduction video](https://youtu.be/hHVyAqoD-6w) · [System walkthrough](https://youtu.be/Uo2iDNLLS2w) · [Project resources](https://neuroreach.notion.site/NeuroReach-EEG-Assisted-Motor-Rehabilitation-RESOURCES-3ac0b3bfcc1381189586e200abe4d8cd)

## Get involved

NeuroReach is open source under the [MIT license](LICENSE). Contributions from players, clinicians, designers, researchers, and developers are welcome.

- **Share feedback:** [report a bug or suggest an improvement](https://github.com/blizzard-labs/thalis-rehab-game/issues). Tell us what you tried, what happened, and your device/browser. Keep patient information out of public issues and screenshots.
- **Improve the project:** help with accessible interactions, game design, documentation, or code. The [developer guide](docs/development.md) covers setup, architecture, and checks to run before submitting a pull request.
- **Explore the work:** watch the [introduction](https://youtu.be/hHVyAqoD-6w), browse the [project resources](https://neuroreach.notion.site/NeuroReach-EEG-Assisted-Motor-Rehabilitation-RESOURCES-3ac0b3bfcc1381189586e200abe4d8cd), or read the [latest release notes](https://github.com/blizzard-labs/thalis-rehab-game/releases/latest).

---

<p align="center">
  <a href="https://blizzard-labs.github.io/thalis-rehab-game/">Play NeuroReach</a> ·
  <a href="#companion-setup">Companion setup</a> ·
  <a href="#troubleshooting">Help</a> ·
  <a href="LICENSE">MIT license</a>
</p>
