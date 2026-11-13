# Existing-game library and controller

Reviewed 2026-11-12.

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

Favorites currently link to Fruit Ninja, Angry Birds Friends, 2048, Subway Surfers, Crossy Road and Jetpack Joyride. The profiles shown are suggested mappings, not certification that every title/menu is fully accessible. Red’s Club uses `/ab-friends/play/`; its homepage is a storefront.

## Control pipeline

`local camera / companion EEG → input mapping → localhost extension bridge → selected game tab`

The library's extension status is read-only. Only the owning `#game-controller` page can send commands. Sensor recordings, patient identifiers, calibration models and report data are absent from the bridge. The selected game receives normal keyboard/mouse input. It retains its own privacy policy and can observe gameplay as usual.

| Input | Arrow preset | Pointer presets |
|---|---|---|
| On-screen buttons / Space switch | Select a direction or the scanning choice | Pointer steps, click, hold/release or horizontal swipe |
| Camera | Dominant direction relative to calibrated neutral; one arrow per reach/rest cycle | Aim across the selected area; dwell-click, dwell-drag, continuous slicing or effort-to-hold |
| EEG | Scanning choice freezes during effort; sustained intent selects once until rest | Scanning pointer steps and actions; not free continuous two-axis aiming |
| Camera + EEG | Hand chooses direction; EEG selects | Hand aims; EEG clicks or toggles the hold |

Camera smoothing and dwell tolerance reduce jitter. The EEG gate requires fresh samples, rest and a sustained effort. Missing camera/EEG input disarms forwarding. The extension independently requires a heartbeat and releases held input on stop. Changing tabs, game navigation, resize/scroll, controller closure and leaving the game/controller windows stop forwarding. The game may need its own pause action. A second controller shows that another window owns the connection; it can take over after the owner closes.

## Installation and distribution

The home library contains a downloadable ZIP and instructions. The user must install it unpacked in desktop Chrome/Edge, reload the NeuroReach library, then select the game's playable area. Keep both windows visible. The controller uses the localhost origin of the last opened NeuroReach library, supporting Vite on 5173 or the packaged companion on 8766. A running local app is required.

The source manifest requests `activeTab`, `scripting` and `debugger`; it does not grant blanket external-site host access. The content bridge matches loopback HTTP only. Automated fixture tests add a narrow intercepted-host permission to a temporary copy to emulate the toolbar's active-tab grant. That permission is absent from the downloadable build. See the [extension instructions](../game-controller-extension/README.md).

Phone/tablet visitors can open providers' ordinary touch games. Camera/EEG forwarding requires the desktop extension. Public external games are online-only; the offline player still supports the built-in games. Store publication, managed deployment and automatic extension updates are future work.

## Verification

- Unit tests cover fresh-sample/rest/effort gating and mirrored pointer calibration with all four directions.
- Browser checks cover mobile library layout, official links, download availability, accessibility, missing extension, and camera-denial fallback.
- An isolated installed extension drives a game in a cross-origin iframe with trusted keyboard and mouse events. Checks cover library-page command rejection, duplicate controllers, tab switches, held-button release and closing the controller.
- Recorded pose input passes through MediaPipe, corner calibration and slicing. Protocol EEG fixtures test one selection per effort and stopping on loss. The optional synthetic LSL test exercises the full clean-rest calibration and companion-to-external-game path.
- A separate public-site check played the current original 2048 at play2048.co with extension arrow commands: the canvas changed and the score increased. This used an isolated browser and the real provider page, without rewriting its controls. Other named favorites have verified official links and suggested mappings; their complete gameplay has not been certified.
- Existing staff and patient browser checks confirm the external library is unavailable in supervised screens. Existing clinical EEG checks exercise the shared headset setup.

No physical headset or participant usability validation has been performed for this mode. The new external-game fixtures are deliberately separate from claims about provider-specific playability. Public game layouts and control behavior can change.
