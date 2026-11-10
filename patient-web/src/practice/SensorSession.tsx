import { useEffect, useState } from "react";
import { Play } from "./GameView";
import { ReachSetup, type ReachCalibration } from "./ReachSetup";
import { cameraStarTrial, reachProgress } from "./motion";
import { useHeadset } from "./useHeadset";
import { useMotionCamera } from "./useMotionCamera";
import type { PracticeRound, Side } from "./session";

export function SensorSession({
  round,
  side,
  end,
  lockedPause,
  participant,
}: {
  round: PracticeRound;
  side: Side;
  participant?: string;
  end: () => void;
  lockedPause?: boolean;
}) {
  const [source, setSource] = useState(round.source);
  const [calibration, setCalibration] = useState<ReachCalibration | null>(null);
  const cameraNeeded = source === "camera" || source === "blended";
  const eegNeeded = source === "eeg" || source === "blended";
  const [train, setTrain] = useState(false);
  const [remember, setRemember] = useState(false);
  const [chosen, setChosen] = useState("");
  const [played, setPlayed] = useState(false);
  const eeg = useHeadset(
    eegNeeded && (!cameraNeeded || !!calibration),
    side,
    participant,
  );
  useEffect(() => {
    if (eeg.calibration) round.record.calibration = eeg.calibration;
  }, [round, eeg.calibration]);
  const camera = useMotionCamera(cameraNeeded, side);
  function switchInput(next: "button" | "camera" | "eeg") {
    round.switchInput(next);
    setSource(round.source);
  }
  if (cameraNeeded && !calibration)
    return (
      <ReachSetup
        camera={camera}
        side={side}
        stars={round.record.game === "stars"}
        onReady={setCalibration}
      >
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
    const point = camera.latest();
    const trial =
      cameraNeeded && rest && directions && round.record.game === "stars"
        ? cameraStarTrial(rest, directions, point, round.starIndex)
        : null;
    const movement = trial
      ? trial.level
      : rest && reach && point
        ? reachProgress(rest, reach, point)
        : null;
    const aim = trial?.aim ?? null;
    const onTarget = trial?.onTarget ?? true;
    const atRest = trial?.atRest ?? true;
    if (source === "camera") return { level: movement, aim, onTarget, atRest };
    const neural = eeg.latest();
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
    return { level, aim, onTarget, atRest };
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
