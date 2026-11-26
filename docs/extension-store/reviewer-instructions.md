# Reviewer instructions

No NeuroReach login, payment, headset, companion, or patient information is required to test the primary camera/on-screen functionality. Use desktop Chrome 125+.

## On-screen controls — no additional hardware

1. Install the submitted ZIP through the review environment. Pin NeuroReach Game Controller.
2. Open https://blizzard-labs.github.io/thalis-rehab-game/#library and acknowledge the outside-game notice.
3. Open 2048 at https://play2048.co/. Use ordinary input to dismiss any provider menu. Keep this game active.
4. Click the extension toolbar icon. Leave **Sidebar** selected, then click **Choose game area**. Chrome displays its debugger notice. Drag around the game board; do not include ads or navigation.
5. In the controller, acknowledge its notice, select **On-screen buttons / switch**, choose **Arrow keys**, then **Set up input → Enable controls**. Click direction buttons. The game should respond.
6. Choose **Stop controls**; further input must not be sent. Try **Alt+Shift+S** while playing and verify the same behavior.
7. Re-enable and change to another browser tab. Input must stop. Resize/scroll the game: the extension must require a new rectangle.
8. Open the toolbar, choose **Pop-up window**, and **Switch view and choose game area**. Reselect the board. The view changes without carrying enabled controls into the new view; input settings should remain for the same guest. Switch back to Sidebar.
9. Close the controller or disable the extension. Held input should end. The game itself may need its own pause button.

## Camera mode

1. With a selected game, choose **Camera → Set up input → Open camera setup**. In the normal browser tab that opens, choose **Allow camera**, allow the browser prompt, then **Return to game**. The sidebar cannot display that prompt itself. Also test denial and closing the setup tab: retry and on-screen controls must remain available. The camera check releases its temporary stream; the sidebar starts its own stream on return.
2. Follow the comfortable resting position and two opposite reach positions. Choose an appropriate preset (Arrow keys for 2048; Slice for a supported slicing game).
3. Enable controls and make small reaches. Camera input should continue with the game in focus and the sidebar open; pop-up mode may be covered while the camera track remains live.
4. Cover the camera or revoke access. Input should stop rather than retain a held action. Closing the controller ends camera capture. Stop controls alone stops forwarding but leaves camera setup active.

## Optional EEG

EEG is an optional input supplied by the separately installed local companion and supported manufacturer stream. It is not required to review the primary function. The companion's local library must be opened before selecting a game; that selects the local station for the extension. Complete the 60-clean-second calibration. Software validation uses a clearly labeled synthetic LSL stream; no physical headset or clinical effectiveness is claimed by those tests.

## Permissions and architecture

The debugger warning is intentional: many embedded games ignore synthetic DOM events. `debugger` delivers fixed Input commands and packaged focus helpers to the user-selected tab. There is no arbitrary debugger-command or script-execution bridge. See [privacy-fields.md](privacy-fields.md) for each permission and the hosted-controller disclosure.

Packaged code is readable. Camera models and web code are served by the NeuroReach project (or user's companion); provider games remain on their original sites. The public source and privacy policy require no login.

## Reproduction / automated checks

From the repository root, run `npm run package:extension`, `python3 packaging/verify-extension.py`, and `node --test scripts/controller-security.test.mjs`. The verifier extracts the exact ZIP to `dist/extension/unpacked`. Browser tests can point `NEUROREACH_EXTENSION_DIR` there.

The isolated browser fixture adds only its intercepted game host permission to emulate Chrome's toolbar activeTab grant. That grant is not in the submission ZIP. Recorded camera and synthetic EEG tests are labeled simulations, not physical-patient checks. The final verification record distinguishes fixture, published-site, and actual-provider checks.
