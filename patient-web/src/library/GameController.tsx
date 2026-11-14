import { useEffect, useRef, useState } from "react";
import { Brand } from "../brand/Brand";
import { HeadsetSetup } from "../practice/HeadsetSetup";
import { useHeadset } from "../practice/useHeadset";
import { useMotionCamera } from "../practice/useMotionCamera";
import { currentGuest } from "../practice/guestHistory";
import type { Side, Source } from "../practice/session";
import { IntentSwitch } from "./intentSwitch";
import {
  PointerSetup,
  pointerPosition,
  cameraDirection,
  type PointerRange,
} from "./PointerSetup";
import { sendControl, useGameController } from "./bridge";
import { findFavorite, type ControlPreset } from "./catalog";
import { ExtensionHelp } from "./GameLibrary";
import "./library.css";
import "../practice/practice.css";

const usesArrows = (preset: ControlPreset) =>
  preset === "arrows" || preset === "steer";
const keys = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "Space"];
const keyLabels = ["↑ Up", "→ Right", "↓ Down", "← Left", "Space"];
const pointerLabels = [
  "← Left",
  "→ Right",
  "↑ Up",
  "↓ Down",
  "Click",
  "Hold / release",
  "Swipe across",
];

export function GameController() {
  const status = useGameController();
  const favorite = findFavorite(status.gameUrl);
  const [source, setSource] = useState<Source>("button");
  const [side, setSide] = useState<Side>("right");
  const [preset, setPreset] = useState<ControlPreset>("arrows");
  const [range, setRange] = useState<PointerRange | null>(null);
  const [configured, setConfigured] = useState(false);
  const [played, setPlayed] = useState(false);
  const [scanSeconds, setScanSeconds] = useState(3);
  const [dwellMs, setDwellMs] = useState(1200);
  const [step, setStep] = useState(0.08);
  const [state, setState] = useState({
    choice: 0,
    level: null as number | null,
    progress: 0,
    armed: false,
    point: { x: 0.5, y: 0.5 },
  });
  const cameraNeeded =
    configured && (source === "camera" || source === "blended");
  const eegNeeded = configured && (source === "eeg" || source === "blended");
  // A new selected game gets its own mapping. A player can override it in setup.
  useEffect(() => {
    if (status.connectionId) setPreset(favorite?.preset ?? "arrows");
  }, [status.connectionId, favorite]);
  const cameraTick = useRef<(() => void) | null>(null);
  const camera = useMotionCamera(cameraNeeded, side, false, {
    armed: status.armed,
    onSample: () => cameraTick.current?.(),
  });
  const eeg = useHeadset(
    eegNeeded && (!cameraNeeded || !!range),
    side,
    currentGuest,
  );
  const setup = (cameraNeeded && !range) || (eegNeeded && !played);
  const video = useRef<HTMLVideoElement>(null);
  const live = useRef({
    status,
    camera,
    eeg,
    source,
    preset,
    range,
    configured,
    setup,
    scanSeconds,
    dwellMs,
    step,
  });
  live.current = {
    status,
    camera,
    eeg,
    source,
    preset,
    range,
    configured,
    setup,
    scanSeconds,
    dwellMs,
    step,
  };
  const gate = useRef(new IntentSwitch());
  const choice = useRef(0);
  const point = useRef({ x: 0.5, y: 0.5 });
  useEffect(() => {
    choice.current = 0;
  }, [preset, source, configured]);
  useEffect(() => {
    point.current = { x: 0.5, y: 0.5 };
  }, [status.connectionId]);
  const gesture = useRef<{
    x: number;
    y: number;
    at: number;
    fired: boolean;
  } | null>(null);
  const swipe = useRef<number | null>(null);
  const stop = () => {
    swipe.current = null;
    sendControl("stop");
    gate.current.reset();
    gesture.current = null;
  };
  useEffect(() => {
    if (video.current) video.current.srcObject = camera.stream;
  }, [camera.stream, setup]);
  useEffect(() => {
    const visibility = () => {
      const { source } = live.current;
      if (document.hidden && source !== "camera" && source !== "blended")
        stop();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") stop();
      const element = event.target as HTMLElement;
      if (
        event.code === "Space" &&
        !event.repeat &&
        live.current.source === "button" &&
        !["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(
          element.tagName,
        )
      ) {
        event.preventDefault();
        selectRef.current(choice.current);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", key);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    let guest: string | null = null,
      disposed = false;
    void currentGuest()
      .then((id) => {
        if (!disposed) guest = id;
      })
      .catch(() => {});
    const channel = new BroadcastChannel("neuroreach-guest-handoff");
    channel.onmessage = () => {
      stop();
      setConfigured(false);
      setRange(null);
      setPlayed(false);
      setSource("button");
    };
    const check = () => {
      if (guest)
        void currentGuest(guest).catch(() => {
          stop();
          setConfigured(false);
          setRange(null);
          setPlayed(false);
          setSource("button");
        });
    };
    window.addEventListener("focus", check);
    return () => {
      disposed = true;
      channel.close();
      window.removeEventListener("focus", check);
    };
  }, []);
  function select(index: number) {
    const current = live.current;
    if (!current.status.armed) return;
    if (usesArrows(current.preset)) {
      sendControl("key", { key: keys[index] });
      return;
    }
    if (index < 4) {
      point.current = {
        x: Math.max(
          0.01,
          Math.min(
            0.99,
            point.current.x +
              (index === 0 ? -current.step : index === 1 ? current.step : 0),
          ),
        ),
        y: Math.max(
          0.01,
          Math.min(
            0.99,
            point.current.y +
              (index === 2 ? -current.step : index === 3 ? current.step : 0),
          ),
        ),
      };
      sendControl("move", point.current);
    } else if (index === 4) sendControl("click");
    else if (index === 5) sendControl(current.status.held ? "release" : "hold");
    else {
      sendControl("release");
      point.current.x = 0.05;
      sendControl("move", point.current);
      sendControl("hold");
      swipe.current = performance.now();
    }
  }
  const selectRef = useRef(select);
  selectRef.current = select;
  useEffect(() => {
    let last = performance.now(),
      scanAt = last,
      wasArmed = false;
    let steeringKey: string | null = null;
    const tick = () => {
      const now = performance.now();
      const current = live.current;
      const isCamera =
        current.source === "camera" || current.source === "blended";
      const isEeg = current.source === "eeg" || current.source === "blended";
      const frame = isCamera ? current.camera.tracked() : null;
      const neural = isEeg ? current.eeg.latest() : null;
      const directed =
        frame && current.range
          ? cameraDirection(current.range, frame.point)
          : null;
      const level = isEeg ? neural : (directed?.level ?? null);
      const valid =
        (!isCamera || (!!frame && !!current.range)) &&
        (!isEeg || (neural !== null && current.eeg.phase === "ready"));
      const enabled =
        current.status.armed &&
        current.configured &&
        !current.setup &&
        (isCamera || !document.hidden);
      if (enabled && !valid) stop();
      if (enabled && valid) sendControl("heartbeat");
      if (enabled !== wasArmed) {
        gate.current.reset();
        gesture.current = null;
        scanAt = now;
        swipe.current = null;
        wasArmed = enabled;
        steeringKey = null;
      }
      if (enabled && valid) {
        if (isCamera && !usesArrows(current.preset) && frame && current.range) {
          const p = pointerPosition(current.range, frame.point);
          const precision = ["pointer", "drag", "cast"].includes(
            current.preset,
          );
          const alpha = Math.min(1, (now - last) / (precision ? 220 : 100));
          point.current = {
            x: point.current.x + (p.x - point.current.x) * alpha,
            y: point.current.y + (p.y - point.current.y) * alpha,
          };
          sendControl("move", point.current);
          if (current.preset === "slice" && !isEeg && !current.status.held)
            sendControl("hold");
          else if (current.preset === "hold" && !isEeg) {
            if (directed!.level > 0.65 && !current.status.held)
              sendControl("hold");
            if (directed!.level < 0.3 && current.status.held)
              sendControl("release");
          } else if (!isEeg && precision) {
            const width = current.status.area?.width ?? 800,
              height = current.status.area?.height ?? 600;
            // Scale the movement needed to rearm with the selected play area.
            // A neighboring square on a small chessboard can be less than 36px away.
            const radius = Math.min(24, Math.min(width, height) / 24);
            // Tiny Fishing reads a click at the central Play button, then mouse
            // drags underwater. A sideways reach holds the button to steer.
            const offset = Math.abs(point.current.x - 0.5);
            const steering =
              current.preset === "cast" &&
              offset > (current.status.held ? 0.08 : 0.14);
            if (steering) {
              if (!current.status.held) sendControl("hold");
              gesture.current = null;
            } else if (current.preset === "cast" && current.status.held) {
              sendControl("release");
              gesture.current = null;
            } else if (
              !gesture.current ||
              Math.hypot(
                (gesture.current.x - point.current.x) * width,
                (gesture.current.y - point.current.y) * height,
              ) >
                radius * (gesture.current.fired ? 1.5 : 1)
            )
              gesture.current = { ...point.current, at: now, fired: false };
            if (
              gesture.current &&
              !gesture.current.fired &&
              now - gesture.current.at >= current.dwellMs
            ) {
              gesture.current.fired = true;
              sendControl(
                current.preset === "drag"
                  ? current.status.held
                    ? "release"
                    : "hold"
                  : "click",
              );
            }
          }
        }
        const stamp = isEeg ? current.eeg.sampleMs() : (frame?.time ?? null);
        const fired =
          current.source !== "button" && gate.current.update(level, stamp);
        if (isCamera && usesArrows(current.preset) && directed) {
          if (current.preset === "steer" && !isEeg) {
            const key =
              directed.level >= 0.5
                ? directed.key
                : directed.level < 0.3
                  ? null
                  : steeringKey;
            if (key !== steeringKey) {
              sendControl("steer", { key });
              steeringKey = key;
            }
          } else if (fired && directed.level >= 0.3)
            sendControl("key", { key: directed.key });
        } else if (isCamera && isEeg && !usesArrows(current.preset)) {
          if (fired)
            sendControl(
              current.preset === "drag" ||
                current.preset === "cast" ||
                current.preset === "hold" ||
                current.preset === "slice"
                ? current.status.held
                  ? "release"
                  : "hold"
                : "click",
            );
        } else if (!isCamera) {
          if (
            (level ?? 0) < 0.3 &&
            now - scanAt >= current.scanSeconds * 1000 &&
            swipe.current === null
          ) {
            choice.current =
              (choice.current + 1) %
              (usesArrows(current.preset) ? keys.length : pointerLabels.length);
            scanAt = now;
          }
          if (fired) {
            selectRef.current(choice.current);
            scanAt = now;
          }
        }
        if (swipe.current !== null) {
          const progress = Math.min(1, (now - swipe.current) / 650);
          point.current.x = 0.05 + progress * 0.9;
          sendControl("move", point.current);
          if (progress === 1) {
            sendControl("release");
            swipe.current = null;
          }
        }
      }
      setState({
        choice: choice.current,
        level,
        progress: gate.current.progress,
        armed: gate.current.armed,
        point: { ...point.current },
      });
      last = now;
    };
    cameraTick.current = tick;
    // Fresh pose results drive camera input. The timer serves scanning and
    // detects missing samples when the camera stops delivering frames.
    const timer = window.setInterval(() => {
      if (performance.now() - last >= 75) tick();
    }, 80);
    return () => {
      cameraTick.current = null;
      clearInterval(timer);
      stop();
    };
  }, []);
  function changeSource(next: Source) {
    stop();
    setSource(next);
    setPlayed(false);
    setRange(null);
  }
  const options = usesArrows(preset) ? keyLabels : pointerLabels;
  return (
    <div className="practice-app game-controller">
      <main className="controller-main">
        <Brand />
        <p className="library-eyebrow">Independent play</p>
        <h1>Game controller</h1>
        <div className="controller-game">
          <strong>{status.game || "No game connected"}</strong>
          <p role="status">{status.reason}</p>
          {source === "camera" &&
            preset === favorite?.preset &&
            favorite.tip && <p>{favorite.tip}</p>}
        </div>
        {!status.installed && <ExtensionHelp />}
        <div className="controller-stop">
          <button
            className="primary"
            disabled={
              status.armed ||
              !status.canControl ||
              !configured ||
              setup ||
              !status.connected ||
              (source !== "button" && state.level === null)
            }
            onClick={() => {
              gate.current.reset();
              sendControl("arm", {
                focusGame: cameraNeeded,
                showAim:
                  cameraNeeded && !usesArrows(preset) && preset !== "hold",
              });
            }}
          >
            Enable controls
          </button>
          <button onClick={stop}>Stop controls</button>
        </div>
        <p className="controller-indicator" role="status">
          {status.armed
            ? "● Controls enabled · Alt+Shift+S to stop"
            : "○ Controls stopped"}
        </p>
        {!configured ? (
          <section className="practice-panel controller-setup">
            <h2>Choose your controls</h2>
            <fieldset>
              <legend>Input</legend>
              {(
                [
                  ["button", "On-screen buttons / switch"],
                  ["camera", "Camera"],
                  ["eeg", "EEG headset"],
                  ["blended", "Camera + EEG"],
                ] as const
              ).map(([value, title]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="controller-source"
                    checked={source === value}
                    onChange={() => changeSource(value)}
                  />
                  {title}
                </label>
              ))}
            </fieldset>
            {source !== "button" && (
              <label>
                Practice arm{" "}
                <select
                  value={side}
                  onChange={(event) => setSide(event.target.value as Side)}
                >
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </label>
            )}
            <label>
              Control preset{" "}
              <select
                value={preset}
                onChange={(event) =>
                  setPreset(event.target.value as ControlPreset)
                }
              >
                <option value="arrows">Arrow keys · 2048, Crossy Road</option>
                <option value="steer">
                  Hold arrow keys · driving and steering
                </option>
                <option value="pointer">Pointer + click · puzzles</option>
                <option value="drag">Drag + release · Angry Birds</option>
                <option value="cast">Cast and steer · Tiny Fishing</option>
                <option value="slice">Slice · Fruit Ninja</option>
                <option value="hold">Hold + release · Jetpack Joyride</option>
              </select>
            </label>
            <button
              className="primary"
              onClick={() => {
                setConfigured(true);
                setPlayed(false);
              }}
            >
              Set up input
            </button>
          </section>
        ) : setup ? (
          cameraNeeded && !range ? (
            <PointerSetup camera={camera} ready={setRange}>
              <button onClick={() => changeSource("button")}>
                Use on-screen controls
              </button>
            </PointerSetup>
          ) : (
            <HeadsetSetup eeg={eeg} begin={() => setPlayed(true)}>
              <button onClick={() => changeSource("button")}>
                Use on-screen controls
              </button>
            </HeadsetSetup>
          )
        ) : (
          <>
            <div className="controller-live">
              {cameraNeeded && (
                <video
                  ref={video}
                  autoPlay
                  playsInline
                  muted
                  className="practice-preview"
                  aria-label="Camera control preview"
                />
              )}
              {source !== "button" && (
                <>
                  <p role="status">
                    {[cameraNeeded && camera.status, eegNeeded && eeg.message]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <label className="controller-meter">
                    Input strength{" "}
                    <meter min="0" max="1" value={state.level ?? 0} />
                  </label>
                </>
              )}
              {eeg.calibration?.synthetic && eegNeeded && (
                <p>Synthetic EEG test stream</p>
              )}
              <p>
                {cameraNeeded
                  ? usesArrows(preset)
                    ? source === "blended"
                      ? "Aim your hand up, right, down or left. Imagine moving it to send that arrow, then relax."
                      : preset === "steer"
                        ? "Reach to hold an arrow. Change direction to steer, or return to rest to release."
                        : "Reach up, right, down or left for an arrow key. Return to rest between moves."
                    : source === "blended"
                      ? "Move your hand to aim. Imagine moving your hand, then relax to click or toggle the hold."
                      : preset === "slice"
                        ? "Move your hand to slice. Stop controls before using game menus."
                        : preset === "hold"
                          ? "Reach away from rest to hold. Return to rest to release."
                          : preset === "drag"
                            ? "Aim the ring and hold still to grab. Move it to the destination and hold still again to release."
                            : preset === "cast"
                              ? "Reach sideways to drag the hook. Return to the middle to release."
                              : "Aim the ring and hold still to click. Move away before the next click."
                  : source === "eeg"
                    ? "Wait for the highlighted control. Imagine moving your hand to select it, then relax."
                    : "Use the buttons below, or press Space to choose the highlighted control."}
              </p>
              {!usesArrows(preset) && (
                <div
                  className="controller-map"
                  aria-label="Pointer position in the game"
                >
                  <span
                    style={{
                      left: `${state.point.x * 100}%`,
                      top: `${state.point.y * 100}%`,
                    }}
                  >
                    +
                  </span>
                </div>
              )}
              <div className="controller-keys">
                {options.map((label, i) => (
                  <button
                    key={label}
                    disabled={!status.armed}
                    className={
                      state.choice === i && !cameraNeeded ? "is-scanning" : ""
                    }
                    onClick={() => select(i)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!cameraNeeded && (
                <button
                  className="controller-select"
                  disabled={!status.armed}
                  onClick={() => select(state.choice)}
                >
                  Select highlighted control
                </button>
              )}
              {!cameraNeeded && (
                <label>
                  Time per choice{" "}
                  <select
                    value={scanSeconds}
                    onChange={(event) =>
                      setScanSeconds(Number(event.target.value))
                    }
                  >
                    <option value={2}>2 seconds</option>
                    <option value={3}>3 seconds</option>
                    <option value={5}>5 seconds</option>
                  </select>
                </label>
              )}
              {source === "camera" &&
                ["pointer", "drag", "cast"].includes(preset) && (
                  <label>
                    Hold still to select{" "}
                    <select
                      value={dwellMs}
                      onChange={(event) =>
                        setDwellMs(Number(event.target.value))
                      }
                    >
                      <option value={900}>0.9 seconds</option>
                      <option value={1200}>1.2 seconds</option>
                      <option value={1800}>1.8 seconds</option>
                    </select>
                  </label>
                )}
              {!usesArrows(preset) && !cameraNeeded && (
                <label>
                  Pointer step{" "}
                  <select
                    value={step}
                    onChange={(event) => setStep(Number(event.target.value))}
                  >
                    <option value={0.04}>Fine</option>
                    <option value={0.08}>Medium</option>
                    <option value={0.16}>Large</option>
                  </select>
                </label>
              )}
            </div>
            <div className="button-row">
              <button
                onClick={() => {
                  stop();
                  setConfigured(false);
                  setRange(null);
                  setPlayed(false);
                }}
              >
                Change controls
              </button>
              {source !== "button" && (
                <button onClick={() => changeSource("button")}>
                  Use on-screen controls
                </button>
              )}
              {eegNeeded && eeg.phase === "error" && (
                <button
                  onClick={() => {
                    stop();
                    setPlayed(false);
                    eeg.retry();
                  }}
                >
                  Reconnect EEG
                </button>
              )}
            </div>
          </>
        )}
        <p className="library-note">
          {cameraNeeded
            ? "Enabling camera controls brings the game to the front. Leave this controller open behind it. If the game shows a pause screen, use its Resume button."
            : "Keep the controller visible to use the buttons or follow the highlighted choice."}{" "}
          Alt+Shift+S stops controls from the game. Controls also stop if input
          is lost, you switch tabs, leave both windows, or the game area moves.
        </p>
      </main>
    </div>
  );
}
