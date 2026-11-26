# Privacy and permission answers

Use with the [public policy](https://blizzard-labs.github.io/thalis-rehab-game/extension-privacy.html). These answers include the hosted NeuroReach controller; local processing is still data handling. Reconcile the publisher dashboard's exact wording with this inventory before certifying it.

## Permission justifications

| Permission | Justification for reviewers |
| --- | --- |
| `activeTab` | Grants temporary access to the supported game selected by the user when they click the toolbar. It allows the extension to place a play-area selector without requesting permanent access to all game websites. |
| `scripting` | Injects the bundled rectangle selector and pointer indicator into that user-selected game's top frame. It never fetches script code or accepts script strings from the website. |
| `debugger` | Sends fixed Chrome DevTools Protocol Input commands so real keyboard and pointer input reaches games, including nested cross-origin frames. Script-dispatched DOM events are untrusted and many games ignore them. Packaged focus helpers use Runtime/DOM calls only to focus the selected game. No cookies, network requests, screenshots, passwords, browsing history, or arbitrary remote code are read/executed with this permission. |
| `sidePanel` | Keeps the input controller visible beside the selected game without moving focus away from gameplay. |
| `storage` | Saves only the preferred sidebar/pop-up layout in local extension storage and the selected NeuroReach station origin/path in session storage. No Chrome Sync is used. |
| `http://127.0.0.1/*`, `http://localhost/*` | Connects the web controller served by the user's local NeuroReach companion, including EEG input. It does not scan the network or contact other devices. Runtime checks accept only root/index controller entry pages and their library/controller routes. |
| `https://blizzard-labs.github.io/thalis-rehab-game/*` | Connects the hosted NeuroReach library/controller for camera and button use without a companion. Chrome host grants are origin-wide despite the manifest path; content-script matching and the runtime allowlist restrict accepted pages to this project. Sibling projects cannot send controls. |

## Remote code disclosure

**Disclose the hosted controller.** The packaged extension runs only bundled scripts, has no eval/Function or script-download mechanism, and uses a restrictive extension CSP. The sidebar embeds the cross-origin NeuroReach web app; pop-up mode opens that same app in a web window. Camera processing and optional companion EEG processing happen there.

The hosted page has no direct extension API access. It sends data-only commands through a validated bridge: normalized coordinates, arrow/Space keys, fixed mouse actions, heartbeat, explicit arm/stop, and bounded setup-transfer acknowledgments. No script, selector, URL, arbitrary key, or arbitrary debugger method is accepted. The extension restricts commands to one user-selected supported tab and rectangle, validates ownership and origin/path, caps queued input, and invalidates stale work on stop/navigation/ownership changes. Full operation is documented in `protocol.js`, `sites.js`, `sidebar.js`, `bridge.js`, and `background.js`.

This uses the policy's isolated-frame/external communication model, not a claim that remote frames are automatically approved. Reviewers can inspect the complete [controller source](https://github.com/blizzard-labs/thalis-rehab-game/tree/main/patient-web/src/library) and [camera source](https://github.com/blizzard-labs/thalis-rehab-game/tree/main/patient-web/src/practice). Google's review decides whether the submitted integration meets its requirements. [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements).

## Data inventory for the disclosure checkboxes

Do **not** certify that no user data is handled merely because it stays on the device. The dashboard categories that apply conservatively across the extension and hosted controller are:

| Category | Scope and handling |
| --- | --- |
| Health information | Optional EEG-derived control signals and movement/calibration information used locally in the NeuroReach controller. No patient records, diagnoses, or clinical reports are requested by the extension. Raw EEG does not cross the extension bridge. |
| User activity | User-selected pointer/key actions, controller settings, and current focus/layout state, used to provide and stop controls. No input history or analytics is uploaded. |
| Web history | Only the currently selected supported game address and selected NeuroReach station are used. The extension does not use the history API or collect a list of unrelated browsing. |
| Website content | Selected game's title and play-area geometry; minimal DOM/frame information for focusing that game. No game-score extraction, page-content scraping, screenshots, or credential collection. |

Camera frames remain in the hosted controller's browser memory. They are not recorded or uploaded. Hosting still receives ordinary HTTP requests and IP information under GitHub's policy. Optional support email is handled by the maintainer to answer the user's request; do not request sensitive attachments.

The extension does not request identity, authentication credentials, financial/payment data, personal communications, or precise location. No ads, monetization, sale of data, credit decisions, or human review of sensor recordings is part of its operation. Provider games are separate services receiving ordinary game input under their own policies.

The publisher can certify the Limited Use declarations for this implementation: no sale to third parties, no use unrelated to the single purpose, and no credit/lending use. Do not certify future or unrelated deployments. [Local processing still requires disclosure](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
