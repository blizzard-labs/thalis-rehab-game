# Existing-game library and controller

Reviewed 2026-11-14.

## Product decision

The independent home screen opens complete provider libraries plus shortcuts to original games. NeuroReach does not rebuild, copy or rehost their games. The desktop Chrome/Edge extension maps local camera/EEG input to the chosen game's usual keyboard or mouse controls. The built-in five rehabilitation games, clinical reports and paired patient displays keep their existing workflow. External play does not create a clinical visit, report, screen mirror or game-performance record.

A large catalog and universal adaptive controls are separate problems. Provider libraries supply existing content; the extension supplies reusable input presets. Compatibility is per game and is not implied by a catalog link. EEG scanning is appropriate for discrete choices and slower play. Fast aiming games may require camera or ordinary controls.

## Research and alternatives

| Route | Finding | Decision |
|---|---|---|
| Original public game sites | [Poki hosts Fruit Ninja](https://poki.com/en/g/fruit-ninja) with mouse/swipe controls. [Rovio links to Angry Birds Friends Web](https://roviosupport.helpshift.com/hc/en/12-angry-birds-friends/faq/3101-where-can-i-play-angry-birds-friends-web/), recommending desktop play. | Link to the real titles, preserving provider menus and accounts. Add full Poki, Coolmath, Playgama and CrazyGames catalog launchers. |
| Authorized publisher catalog | [Playgama's partner setup](https://wiki.playgama.com/playgama/for-partners/getting-started) provides 1,000+ games and JSON/iframe options after registration and a partner ID. [GameDistribution](https://gamedistribution.com/publishers/embedded-links/) and [GamePix](https://games.gamepix.com/gameinfo/) offer publisher integrations. | Good future route for an in-app catalog if a provider agreement is established. No account, credentials or distribution rights were assumed. A provider feed alone does not expose arbitrary game inputs. |
| Arbitrary embedded websites | [Same-origin isolation](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy) prevents the app from controlling an unrelated iframe's DOM. | Do not pretend an iframe is a camera/EEG integration. |
| Desktop extension | Chrome's documented [debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger) supports targeted [Input commands](https://chromedevtools.github.io/devtools-protocol/tot/Input/). | Use explicit tab selection, a bounded play area, one controller, and normal browser input. No per-game code rewriting is required. |

Each of the sixteen favorites selects its preset by the game page’s origin and path. Players can change it in the controller. Doodle Jump opens the Play.Works guest game after CrazyGames retired its listing. Red’s Club uses `/ab-friends/play/`; its homepage is a storefront.

## Control pipeline

`local camera / companion EEG → input mapping → localhost extension bridge → selected game tab`

The library's extension status is read-only. Only the owning `#game-controller` page can send commands. Sensor recordings, patient identifiers, calibration models and report data are absent from the bridge. The selected game receives normal keyboard/mouse input. It retains its own privacy policy and can observe gameplay as usual.

| Input | Arrow preset | Pointer presets |
|---|---|---|
| On-screen buttons / Space switch | Select a direction or the scanning choice | Pointer steps, click, hold/release or horizontal swipe |
| Camera | Tap an arrow per reach/rest cycle, or hold an arrow through a sustained reach for driving and steering | Aim across the selected area; dwell-click, dwell-drag, continuous slicing, effort-to-hold or cast and steer |
| EEG | Scanning choice freezes during effort; sustained intent selects once until rest | Scanning pointer steps and actions; not free continuous two-axis aiming |
| Camera + EEG | Hand chooses direction; EEG selects | Hand aims; EEG clicks or toggles the hold |

Camera smoothing and dwell tolerance reduce jitter. The EEG gate requires fresh samples, rest and a sustained effort. Missing camera/EEG input disarms forwarding. The extension independently requires a heartbeat and releases held input on stop. Changing tabs, game navigation, resize/scroll, controller closure and leaving the game/controller windows stop forwarding. The game may need its own pause action. A second controller shows that another window owns the connection; it can take over after the owner closes.

## Installation and distribution

The home library contains a downloadable ZIP and instructions. The user must install it unpacked in desktop Chrome/Edge, reload the NeuroReach library, then select the game's playable area. With camera or blended input, enabling controls focuses the game. Keep the controller open. It reads fresh camera frames even when the game covers its preview. For on-screen buttons or EEG-only scanning, keep the controller in view. The controller uses the localhost origin of the last opened NeuroReach library, supporting Vite on 5173 or the packaged companion on 8766. A running local app is required.

The source manifest requests `activeTab`, `scripting` and `debugger`; it does not grant blanket external-site host access. The content bridge matches loopback HTTP only. Automated fixture tests add a narrow intercepted-host permission to a temporary copy to emulate the toolbar's active-tab grant. That permission is absent from the downloadable build. See the [extension instructions](../game-controller-extension/README.md).

Phone/tablet visitors can open providers' ordinary touch games. Camera/EEG forwarding requires the desktop extension. Public external games are online-only; the offline player still supports the built-in games. Store publication, managed deployment and automatic extension updates are future work.

## Catalog artwork

The library serves the card images locally from `patient-web/public/library-logos/`. Each image uses the brand's original proportions and colors. The card title supplies the accessible name for the game or provider.

- Provider marks come from the home-screen icons published by [Poki](https://poki.com/), [Coolmath Games](https://www.coolmathgames.com/), [Playgama](https://playgama.com/) and [CrazyGames](https://www.crazygames.com/).
- Poki cards use the square artwork from each game's linked Poki listing. Cut the Rope uses the square cover from its [CrazyGames listing](https://www.crazygames.com/game/cut-the-rope-ebx). Doodle Jump uses [Lima Sky’s app icon](https://apps.apple.com/us/app/doodle-jump/id307727765).
- Angry Birds Friends uses Rovio's app icon. 2048 uses the original game's home-screen icon. [Angry Birds Friends on the App Store](https://apps.apple.com/us/app/angry-birds-friends/id555936735), [2048 icon](https://play2048.co/favicon180.png).

## Verification

- Unit tests cover fresh-sample/rest/effort gating and mirrored pointer calibration with all four directions.
- Browser checks cover mobile library layout, official links, download availability, accessibility, missing extension, and camera-denial fallback.
- An isolated installed extension drives a game in a cross-origin iframe with trusted keyboard and mouse events. Checks cover library-page command rejection, duplicate controllers, tab switches, held-button release and closing the controller. Native-window checks cover the browser debugging notice, 200%/400% zoom, keyboard access, resize invalidation, Escape cancellation from game-frame focus, attachment release and reselection. The area is measured after the browser notice settles.
- Recorded pose input passes through MediaPipe and corner calibration. A covered-controller check pauses the preview and its polling timer, moves the pointer between opposite corners, and verifies that camera loss releases the held button. Protocol EEG fixtures test one selection per effort and stopping on loss. The optional synthetic LSL test exercises the full clean-rest calibration and companion-to-external-game path.
- Existing staff and patient browser checks confirm the external library is unavailable in supervised screens. Existing clinical EEG checks exercise the shared headset setup.

## Live camera results for Familiar Favorites

The November 2026 replay opened all fifteen remaining titles on their public game pages in desktop Chromium. Each run used a disposable browser profile, the installed extension and the controller’s normal camera calibration. A transformed pose image supplied repeatable camera movement through MediaPipe. Ordinary mouse or keyboard input opened publisher menus and started rounds where needed. The observations below describe what happened inside the game after the camera took over. Crossy Road is included from its earlier check. [Pose fixture and browser test setup](localhost-validation.md).

| Game | Camera action | Observed in the published game |
|---|---|---|
| 2048 | Reach and return to rest for each arrow | Merged tiles, formed an 8 and scored 20. |
| Angry Birds Friends | Dwell on the bird, pull the sling back and dwell to release | A guest shot hit the first Piggy Tower structure and scored 2,100. |
| Blocky Blast Puzzle | Dwell to pick up the tray piece and again to drop it over the gap | The blue piece filled the horizontal gap and the tutorial advanced to a green piece. The game lifts a held piece above the pointer. |
| Bubbleshooter | Aim and dwell to shoot | Four shots reached the board and added bubbles to the cluster. |
| Crossy Road | Reach and return to rest | Three recorded reaches delivered arrows to the focused game while its controller was covered. |
| Cut the Rope | Sweep across the rope | The first rope broke and its candy fell to Om Nom. |
| Doodle Jump | Press Enter on Play, then hold left or right reaches | The jumper changed horizontal position, landed on a platform and reached a score of 18 on Play.Works. |
| Drive Mad | Hold a rightward reach, then rest to release the accelerator | The truck completed level one. Short arrow taps had left it at the start. |
| Fruit Ninja | Sweep through airborne fruit | Sliced fruit for a score of 3 in a live round. |
| Jetpack Joyride | Reach to thrust and rest to drop | The jetpack lifted Barry above the floor. The game received repeated hold and release pairs. |
| Master Chess | Dwell on a pawn, then its destination | White advanced a pawn and the computer replied. |
| Moto X3M | Hold an upward reach to accelerate | The bike left the start and rode up the first ramp. |
| Stickman Hook | Reach to hook and rest to release | Repeated swings cleared a level. |
| Subway Surfers | Send separate directional reaches | The runner advanced through the tutorial to “You rock! Now GO!” with a score of 271. |
| Temple Run 2 | Press Space to start, then use directional reaches | The focused game received up, right and down arrows during an active run. |
| Tiny Fishing | Dwell on Play to cast, then steer sideways | The submerged hook moved across the water and caught a fish. |

The on-game ring shows the camera’s aim over pointer games and fills while holding a drag or slice. For chess, select the board itself to give each square more of your comfortable reach. For Blocky Blast, include the tray in the rectangle. Players can adjust dwell time in the controller.

These checks cover the listed actions in desktop Chromium with repeatable camera input. Comfortable movement ranges, fatigue and sustained play with patients still need hands-on testing. The public-site results do not measure EEG or Edge-specific behavior.
