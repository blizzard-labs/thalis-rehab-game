import { useState, type ReactNode } from "react";
import type { useHeadset } from "./useHeadset";

export function HeadsetSetup({
  eeg,
  begin,
  children,
}: {
  eeg: ReturnType<typeof useHeadset>;
  begin: () => void;
  children: ReactNode;
}) {
  const [train, setTrain] = useState(false);
  const [remember, setRemember] = useState(false);
  const [chosen, setChosen] = useState("");
  return (
    <section className="practice-panel">
      <h1>Connect your EEG</h1>
      <p>
        Open the Unicorn Suite LSL bridge on this computer and start streaming.
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
              aria-label="Headset"
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
          <button className="primary" onClick={begin}>
            Begin play
          </button>
        )}
        {(eeg.phase === "error" || eeg.phase === "choose") && (
          <button onClick={eeg.retry}>Scan again</button>
        )}
        {children}
      </div>
    </section>
  );
}
