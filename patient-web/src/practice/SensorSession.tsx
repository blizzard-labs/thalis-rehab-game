import { useEffect, useState } from "react";
import { shoulder, withinNet } from "../reach/starGeometry";
import { Play } from "./GameView";
import { ReachSetup, type ReachCalibration } from "./ReachSetup";
import { cameraStarTrial, reachProgress } from "./motion";
import { useHeadset, type ModelProfile } from "./useHeadset";
import { useMotionCamera } from "./useMotionCamera";
import type { PracticeRound, Side } from "./session";

export function SensorSession({
  round,
  side,
  end,
  lockedPause,
  modelProfile,
}: {
  round: PracticeRound;
  side: Side;
  modelProfile?: ModelProfile;
  end: () => void;
  lockedPause?: boolean;
}) {
  const [source, setSource] = useState(round.source);
  const [calibration, setCalibration] = useState<ReachCalibration | null>(null);
  const [rowing, setRowing] = useState(round.record.rowing);
  const [otherReach, setOtherReach] = useState<ReachCalibration | null>(null);
  const pairedOars = round.record.game === "river" && rowing === "paired";
  const directional =
    round.record.game === "stars" || round.record.game === "fruit";
  const cameraNeeded = source === "camera" || source === "blended";
  const eegNeeded = source === "eeg" || source === "blended";
  const [train, setTrain] = useState(false);
  const [remember, setRemember] = useState(false);
  const [chosen, setChosen] = useState("");
  const [played, setPlayed] = useState(false);
  const eeg = useHeadset(
    eegNeeded &&
      (!cameraNeeded || (!!calibration && (!pairedOars || !!otherReach))),
    side,
    modelProfile,
  );
  useEffect(() => {
    round.record.arm = side;
    if (eeg.calibration) {
      round.record.calibration = eeg.calibration;
      if (eeg.calibration.synthetic) round.record.usedSyntheticEeg = true;
    }
  }, [round, side, eeg.calibration]);
  const camera = useMotionCamera(
    cameraNeeded && (round.record.game !== "river" || !!rowing),
    side,
    pairedOars,
  );
  function switchInput(next: "button" | "camera" | "eeg") {
    round.switchInput(next);
    setSource(round.source);
  }
  if (cameraNeeded && round.record.game === "river" && !rowing)
    return (
      <section className="practice-panel">
        <h1>Choose your oars</h1>
        <p>
          Row with your selected arm, or calibrate both arms for a coordinated
          stroke.
        </p>
        <div className="button-row">
          {(["single", "paired"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                round.record.rowing = mode;
                setRowing(mode);
              }}
            >
              {mode === "single" ? "One arm" : "Both arms"}
            </button>
          ))}
          <button onClick={() => switchInput("button")}>Use one button</button>
          <button onClick={end}>End session</button>
        </div>
      </section>
    );
  const secondArm = !!calibration && pairedOars && !otherReach;
  if (cameraNeeded && (!calibration || secondArm))
    return (
      <ReachSetup
        key={secondArm ? "other" : "selected"}
        camera={secondArm ? { ...camera, latest: camera.otherWrist } : camera}
        side={secondArm ? (side === "left" ? "right" : "left") : side}
        stars={directional}
        onReady={secondArm ? setOtherReach : setCalibration}
      >
        {pairedOars && (
          <button
            onClick={() => {
              round.record.rowing = "single";
              setRowing("single");
            }}
          >
            Continue with one arm
          </button>
        )}
        {source === "blended" && (
          <button onClick={() => switchInput("eeg")}>
            Continue with EEG only
          </button>
        )}
        <button onClick={() => switchInput("button")}>Use one button</button>
        <button onClick={end}>End session</button>
      </ReachSetup>
    );
  if (eegNeeded && !played)
    return (
      <section className="practice-panel">
        <h1>Connect your EEG</h1>
        <p>
          Open the Unicorn Suite LSL bridge on this computer and start
          streaming.
        </p>
        <p role="status">{eeg.message}</p>
        {eeg.calibration && eeg.phase === "ready" && (
          <p>Scoring with {eeg.calibration.method}.</p>
        )}
        {eeg.phase === "choose" && eeg.devices.length > 0 && (
          <>
            <label>
              Headset{" "}
              <select
                value={chosen || eeg.devices[0]?.id}
                onChange={(e) => setChosen(e.target.value)}
              >
                {eeg.devices.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              First, rest quietly for 60 seconds of clean signal. You can also
              train an imagery classifier with 20 cued trials.
            </p>
            <fieldset>
              <legend>Calibration</legend>
              <label>
                <input
                  type="checkbox"
                  checked={train}
                  onChange={(e) => setTrain(e.target.checked)}
                />{" "}
                Train imagery classifier
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />{" "}
                Save or reuse my model on this computer
              </label>
            </fieldset>
            <button
              className="primary"
              onClick={() =>
                eeg.start(chosen || eeg.devices[0].id, train, remember)
              }
            >
              Begin resting calibration
            </button>
          </>
        )}
        <div className="button-row">
          {eeg.phase === "ready" && (
            <button className="primary" onClick={() => setPlayed(true)}>
              Begin play
            </button>
          )}
          {(eeg.phase === "error" || eeg.phase === "choose") && (
            <button onClick={eeg.retry}>Scan again</button>
          )}
          {source === "blended" && (
            <button onClick={() => switchInput("camera")}>
              Continue with camera
            </button>
          )}
          <button onClick={() => switchInput("button")}>Use one button</button>
          <button onClick={end}>End session</button>
        </div>
      </section>
    );
  const observation = () => {
    const rest = calibration?.rest;
    const directions = calibration?.directions;
    const reach = directions?.[0];
    const cameraStroke =
      cameraNeeded &&
      (round.record.game === "river" || round.record.game === "keeper");
    const frame =
      cameraNeeded && (directional || cameraStroke) ? camera.tracked() : null;
    const trial =
      cameraNeeded && rest && directions && directional
        ? cameraStarTrial(
            rest,
            directions,
            frame?.point ?? null,
            round.record.game === "fruit"
              ? round.record.rewards
              : round.starIndex,
            round.record.game === "fruit" ? -1 : round.record.rewards - 1,
          )
        : null;
    const point = cameraStroke ? (frame?.point ?? null) : camera.latest();
    let movement = trial
      ? trial.level
      : rest && reach && point
        ? reachProgress(rest, reach, point)
        : null;
    if (pairedOars && cameraNeeded && otherReach) {
      const other = camera.otherWrist();
      const otherLevel =
        other &&
        reachProgress(otherReach.rest, otherReach.directions[0], other);
      movement =
        movement === null || otherLevel === null
          ? null
          : round.needsRest
            ? Math.max(movement, otherLevel)
            : Math.min(movement, otherLevel);
    }
    const aim = trial?.aim ?? null;
    const reached = movement !== null && movement >= round.activationThreshold;
    const onTarget = trial?.onTarget ?? (!cameraStroke || reached);
    const neural = eegNeeded ? eeg.latest() : null;
    const cameraHold =
      trial || cameraStroke
        ? {
            time: frame?.time ?? null,
            cleared:
              trial?.cleared ??
              (movement !== null &&
                movement < round.activationThreshold * 0.65),
            nearTarget: trial?.nearTarget ?? reached,
            atBasket: !!aim?.wrist && withinNet(aim.wrist, shoulder),
            neural,
          }
        : null;
    const readings = {
      ...(cameraNeeded ? camera.angles() : {}),
      ...(cameraNeeded && movement !== null ? { reach: movement * 100 } : {}),
      ...(eegNeeded && neural !== null ? eeg.features() : {}),
    };
    if (source === "camera")
      return { level: movement, aim, onTarget, cameraHold, readings };
    round.inputSampleMs =
      neural !== null && (source !== "blended" || movement !== null)
        ? eeg.sampleMs()
        : null;
    const level =
      source === "blended"
        ? neural === null || movement === null
          ? null
          : 0.6 * neural + 0.4 * movement
        : neural;
    return { level, aim, onTarget, cameraHold, readings };
  };
  const status = [cameraNeeded && camera.status, eegNeeded && eeg.message]
    .filter(Boolean)
    .join(" · ");
  return (
    <Play
      round={round}
      side={side}
      observation={observation}
      status={status}
      onEnd={end}
      stream={cameraNeeded ? camera.stream : null}
      lockedPause={lockedPause}
    >
      {source !== "button" && (
        <div className="input-switch button-row">
          {source === "blended" && (
            <>
              <button onClick={() => switchInput("camera")}>
                Continue with camera
              </button>
              <button onClick={() => switchInput("eeg")}>
                Continue with EEG only
              </button>
            </>
          )}
          <button onClick={() => switchInput("button")}>
            Continue with one button
          </button>
          {eegNeeded && eeg.phase === "error" && (
            <button
              onClick={() => {
                round.setPaused(true);
                setPlayed(false);
                eeg.retry();
              }}
            >
              Reconnect EEG
            </button>
          )}
        </div>
      )}
    </Play>
  );
}
