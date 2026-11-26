# NeuroReach Game Controller

Use camera movement, an EEG switch, or on-screen controls with an existing web game. This is an unpacked desktop Chrome/Edge extension for independent play. It is not part of supervised sessions.

## Install and play

1. Start NeuroReach and open its **Play familiar games** library in desktop Chrome or Edge (version 125 or later).
2. Download the extension from that page and unzip it. Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the `neuroreach-game-controller` folder containing `manifest.json`. Pin the extension to the toolbar.
3. **Reload the NeuroReach library after installing.** It should say **Game Controller extension connected**. The published GitHub Pages website supports camera/button controls without a local server. For EEG controls, use the companion’s local library and keep it running.
4. Open a game from the library. Let it finish loading and use its ordinary controls to dismiss menus or advertisements. Click the NeuroReach toolbar button. Under **Controller view**, leave **Sidebar** selected to keep controls beside the game, or select **Pop-up window** for a separate window. Your browser remembers the choice. Click **Choose game area**, wait for the selection overlay after Chrome’s notice appears, and drag a rectangle around the playable game, excluding advertisements and site navigation. Press Escape to cancel selection.
5. Familiar favorites preselect their control preset. Choose an input, adjust the preset if needed, complete setup, then choose **Enable controls**. Camera and Camera + EEG bring the game to the front. Keep the sidebar or pop-up open. If the game shows a pause menu, select Resume in the game. For on-screen buttons or EEG-only scanning, keep the controller in view.
6. Use **Stop controls**, Escape in the controller, or **Alt+Shift+S** to stop. Stop before using game menus or changing the page layout. To switch views during play, open the toolbar on the game tab, change **Controller view**, then click **Switch view and choose game area**. Draw the area again in the resized game and choose **Enable controls** when ready. The same guest’s input settings and completed camera range carry over. EEG reconnects through headset setup. Redraw the area after scrolling, resizing or navigating.

Camera uses a comfortable neutral position and two opposite corners. Small movements map across the selected game area. EEG needs the local companion, a supported Unicorn LSL stream and resting calibration. With EEG alone, wait for a highlighted control, sustain an effort, then return to rest. Camera + EEG uses the hand to aim and EEG to select. On-screen buttons are always available as a fallback.

## Allow the camera in the sidebar

1. Choose **Camera → Set up input → Open camera setup**.
2. In the new tab, choose **Allow camera**, then allow it in Chrome or Edge’s prompt.
3. Choose **Return to game**. Set your resting position and two comfortable corners, then **Enable controls**.

The separate tab is needed because the browser cannot show a camera permission prompt inside its sidebar. The permission check releases the camera immediately; your controller starts its preview when you return. Game controls stay stopped during setup.

If no prompt appears, expand **No permission prompt?** in the setup tab. Allow camera access using the camera/site icon beside that tab’s address, check the computer’s camera privacy settings for your browser, and choose **Try camera again**. You can always return and use on-screen controls.

Updating an older manual installation: download and unzip the new extension, replace the contents of the folder you originally loaded, click **Reload** on its card at `chrome://extensions`, then close and reopen the controller. Confirm version **0.5.1** or later. Local-companion users also need a companion build containing the camera setup page; camera play on the public NeuroReach website does not need the companion.

## Presets

In camera pointer games, a ring in the game window follows your hand and fills while you hold a drag or slice. Adjust **Hold still to select** in the controller if you want more time to place a piece or a shot.

- **Arrow keys:** four directions and Space; suitable for 2048 and some runners.
- **Hold arrow keys** keeps an arrow down while the camera tracks a reach. Return to rest to release or reach another way to change direction. Use this for Moto X3M, Drive Mad and Doodle Jump.
- **Pointer + click:** camera aim and dwell selection, or scanning pointer steps.
- **Drag + release:** dwell to grab, move, dwell to release; EEG can toggle the hold.
- **Cast and steer** clicks when you dwell in the middle of the play area. A sideways reach holds the mouse button underwater in Tiny Fishing.
- **Slice** with the camera by sweeping your hand. A short pause lifts the blade. Hold the ring still over the start watermelon or Retry to tap once. The **Hold still to select** setting adjusts the tap delay. EEG-only play offers a horizontal swipe.
- **Hold + release:** camera effort holds, returning to rest releases; EEG can toggle.

These are input mappings, not a guarantee that every game works. Menus, embedded frames, browser permissions and timing vary. A scanning EEG switch cannot provide the speed or precise continuous two-dimensional movement of a mouse in every action game. Use ordinary controls when needed. Public games require internet and may have their own ads, accounts and purchases.

## Permissions and stopping

`sidePanel` opens the browser sidebar and `storage` remembers your controller view. Host access covers the published NeuroReach project on GitHub Pages and local companions, so the sidebar can use the same app and guest profile. `activeTab` and `scripting` place the selection overlay only after clicking the toolbar. `debugger` sends browser keyboard/mouse events to the selected game tab, including an embedded game. Chrome displays its debugging permission warning. The extension does not capture screenshots, read game scores, or collect EEG. Its camera setup tab lets the embedded NeuroReach page request browser permission; no video crosses the extension bridge. NeuroReach computes input locally and sends only movement/key/click commands. No clinical records or sensor recordings are sent to game sites.

Chrome's host grant covers the GitHub Pages origin, but only the NeuroReach project's library/controller entry pages and local companion entry pages can connect to the bridge. Other project paths on that shared host are rejected. Only one controller can send inputs. Keyboard actions go to the selected game tab; pointer actions stay in its selected rectangle. Navigation, layout changes, switching away from the game tab, closing the controller, lost input/heartbeat, or leaving the game/controller windows stops control. Stopping releases the held mouse button or steering key and hides the aiming ring. Games themselves may continue running; use their pause button too.

Supported sites: Poki, Coolmath Games, Playgama, GamePix, CrazyGames, play2048.co, Red’s Club and the Play.Works game service. This extension is not affiliated with those services or their game publishers. It does not bypass advertisements, paywalls, site restrictions, or game accounts.

## Development and updates

Source: `game-controller-extension/` in the NeuroReach repository. `npm run package:extension` creates the manual-install ZIP and a separate store ZIP with its manifest at the root; the app's start/build commands also run it. After source updates, click **Reload** on the extension card and reload NeuroReach. A store submission package and review materials are prepared in [the publication guide](../docs/extension-store/listing.md). Store approval and automatic store updates are not active until publication.

[Privacy policy](https://blizzard-labs.github.io/thalis-rehab-game/extension-privacy.html) · [Permissions and data flow](../docs/extension-store/privacy-fields.md)
