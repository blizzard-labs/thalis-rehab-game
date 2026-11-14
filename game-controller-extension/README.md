# NeuroReach Game Controller

Use camera movement, an EEG switch, or on-screen controls with an existing web game. This is an unpacked desktop Chrome/Edge extension for independent play. It is not part of supervised sessions.

## Install and play

1. Start NeuroReach and open its **Play familiar games** library in desktop Chrome or Edge (version 125 or later).
2. Download the extension from that page and unzip it. Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the `neuroreach-game-controller` folder containing `manifest.json`. Pin the extension to the toolbar.
3. **Reload the NeuroReach library after installing.** It should say **Game Controller extension connected**. Keep the local NeuroReach server running.
4. Open a game from the library. Let it finish loading and use its ordinary controls to dismiss menus or advertisements. Click the NeuroReach toolbar button, choose **Choose game area**, wait for the selection overlay after Chrome’s notice appears, and drag a rectangle around the playable game, excluding advertisements and site navigation. Press Escape to cancel selection.
5. The controller opens in a separate window. Choose a preset and input, complete setup, then choose **Enable controls**. Camera and Camera + EEG bring the game to the front. Leave the controller open behind it. If the game shows a pause menu, select Resume in the game. For on-screen buttons or EEG-only scanning, keep the controller in view.
6. Use **Stop controls**, Escape in the controller, or **Alt+Shift+S** to stop. Stop before using game menus or changing the page layout. Reconnect the area after scrolling, resizing or navigating.

Camera uses a comfortable neutral position and two opposite corners. Small movements map across the selected game area. EEG needs the local companion, a supported Unicorn LSL stream and resting calibration. With EEG alone, wait for a highlighted control, sustain an effort, then return to rest. Camera + EEG uses the hand to aim and EEG to select. On-screen buttons are always available as a fallback.

## Presets

- **Arrow keys:** four directions and Space; suitable for 2048 and some runners.
- **Pointer + click:** camera aim and dwell selection, or scanning pointer steps.
- **Drag + release:** dwell to grab, move, dwell to release; EEG can toggle the hold.
- **Slice:** camera movement with the mouse held; EEG-only offers a horizontal swipe.
- **Hold + release:** camera effort holds, returning to rest releases; EEG can toggle.

These are input mappings, not a guarantee that every game works. Menus, embedded frames, browser permissions and timing vary. A scanning EEG switch cannot provide the speed or precise continuous two-dimensional movement of a mouse in every action game. Use ordinary controls when needed. Public games require internet and may have their own ads, accounts and purchases.

## Permissions and stopping

`activeTab` and `scripting` place the selection overlay only after clicking the toolbar. `debugger` sends browser keyboard/mouse events to the selected game tab, including an embedded game. Chrome displays its debugging permission warning. The extension does not capture screenshots, read game scores, request camera access, or collect EEG. NeuroReach computes input locally and sends only movement/key/click commands. No clinical records or sensor recordings are sent to game sites.

Only localhost NeuroReach library/controller pages can connect to the bridge. Only one controller can send inputs. Commands target supported game sites and the selected rectangle. Navigation, layout changes, switching away from the game tab, closing the controller, lost input/heartbeat, or leaving the game/controller windows stops control. Stopping releases a held mouse button. Games themselves may continue running; use their pause button too.

Supported sites: Poki, Coolmath Games, Playgama, GamePix, CrazyGames, play2048.co and Red’s Club. This extension is not affiliated with those services or their game publishers. It does not bypass advertisements, paywalls, site restrictions, or game accounts.

## Development and updates

Source: `game-controller-extension/` in the NeuroReach repository. `node patient-web/scripts/package-controller.mjs` creates the distributable ZIP; the app's start/build commands also run it. After source updates, click **Reload** on the extension card and reload NeuroReach. Browser store publication and automatic updates are not configured.
