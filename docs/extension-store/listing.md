# Chrome Web Store submission — NeuroReach Game Controller 0.5.0

This is a prepared submission, not a claim of Chrome Web Store approval. Upload the verified ZIP; do not upload the manual-install download.

## Files and links

| Field | Value |
| --- | --- |
| Package | `dist/extension/NeuroReach-Game-Controller-0.5.0.zip` |
| Checksum | `dist/extension/SHA256SUMS.txt` |
| Name | NeuroReach Game Controller |
| Language | English |
| Homepage | https://blizzard-labs.github.io/thalis-rehab-game/#library |
| Support | https://github.com/blizzard-labs/thalis-rehab-game/tree/main/game-controller-extension#readme |
| Privacy policy | https://blizzard-labs.github.io/thalis-rehab-game/extension-privacy.html |
| Store icon | `game-controller-extension/icons/icon128.png` |
| Screenshot | `docs/extension-store/controller-1280x800.png` |
| Review instructions | [reviewer-instructions.md](reviewer-instructions.md) |
| Privacy fields | [privacy-fields.md](privacy-fields.md) |
| Verification evidence | [verification.md](verification.md) |

## Short description

Use NeuroReach camera and EEG controls with a game you choose on supported game websites.

## Detailed description

Play supported web games with camera movements, optional EEG input, or NeuroReach's on-screen controls.

NeuroReach Game Controller connects the NeuroReach website to a game tab you choose. Select the playable area, set up a comfortable movement range, and enable controls. The controller opens beside your game in a sidebar, with a separate pop-up window available if you prefer.

• Choose arrow keys, held steering, pointer and click, drag and release, slicing, or hold-and-release controls.
• Adjust camera reach and dwell selection to suit your setup.
• Keep the game in focus while using camera controls.
• Stop input with Alt+Shift+S or the Stop controls button.
• Use on-screen buttons when camera or EEG input is unavailable.

Camera and on-screen controls work with the public NeuroReach website. No headset or companion installation is needed for those modes. EEG requires the separate NeuroReach Companion, a supported g.tec Unicorn headset, the manufacturer's software, and calibration. Physical headset compatibility is not established by automated software tests.

The extension works on supported providers including Poki, Coolmath Games, Playgama, GamePix, CrazyGames, and play2048.co. Compatibility and required controls vary by game; menus may still need ordinary mouse or keyboard input. Games are provided by their original publishers and may have ads, accounts, or purchases. NeuroReach is not affiliated with those providers.

The extension requests Chrome's debugger permission to send keyboard and pointer actions to the selected game, including embedded game frames. Chrome displays a debugging notice while connected. Only fixed game-input commands are accepted; the extension does not read passwords, cookies, network traffic, or game scores.

Camera processing happens locally in the NeuroReach web controller. Raw camera video and raw EEG are not sent to game providers through the extension. Stop controls stops game input; close the controller to stop sensor capture. Game providers and the website host have their own privacy practices, explained in the privacy policy.

For independent play only. This extension does not provide supervised sessions or clinical reports, and it does not diagnose, treat, or promise recovery from a condition. NeuroReach's five built-in games do not require this extension.

## Single purpose

Translate a user's explicitly enabled NeuroReach camera, optional EEG, or on-screen inputs into a fixed set of keyboard and pointer actions for one selected supported game tab.

## Submission steps

1. Use the publisher's Chrome Web Store developer account with two-step verification. Complete registration and any required publisher/trader declarations personally; no account or payment has been created by this preparation.
2. Upload the store ZIP above. Verify its checksum against the included file.
3. Use the text, icon, and screenshot above. Select the closest available Accessibility category/tag and English; do not describe the extension as clinically validated.
4. Complete privacy fields using the prepared data-flow inventory. Disclose the isolated hosted controller rather than selecting “no remote code” without explanation.
5. Paste the reviewer instructions, including the public website and no-headset test path.
6. Confirm the live privacy URL opens, then submit for review. Deferred publication is appropriate for checking Google's decision before making the listing public.
7. After approval, record the store ID/URL in the README and website. The store will manage updates; no store ID or approval is assumed here.

Sources checked November 25, 2026: [package preparation](https://developer.chrome.com/docs/webstore/prepare), [listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [Manifest V3 policy](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements).
