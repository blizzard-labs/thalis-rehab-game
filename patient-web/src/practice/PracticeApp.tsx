import { useEffect, useState } from "react";
import { games, gameDetails } from "./catalog";
import { RiverArt } from "../adventures/River";
import { duration, Garden, NightSky } from "./GameView";
import {
  downloadRecord,
  gameNames,
  historyStore,
  PracticeRound,
  sourceNames,
} from "./session";
import type { Game, PracticeRecord, Side, Source } from "./session";
import { StaffWorkspace } from "./StaffWorkspace";
import { SensorSession } from "./SensorSession";
import "./practice.css";

function History({ onBack }: { onBack: () => void }) {
  const [records, setRecords] = useState<PracticeRecord[]>([]);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    historyStore<PracticeRecord[]>("readonly", (s) => s.getAll())
      .then((rows) =>
        setRecords(rows.sort((a, b) => b.started.localeCompare(a.started))),
      )
      .catch(() =>
        setError("Saved sessions could not be opened on this browser."),
      );
  }, []);
  async function clear() {
    try {
      await historyStore("readwrite", (s) => s.clear());
      setRecords([]);
      setConfirm(false);
    } catch {
      setError("Could not delete saved sessions. Please try again.");
    }
  }
  return (
    <section className="practice-panel">
      <button onClick={onBack}>← Games</button>
      <h1>Saved sessions</h1>
      <p>Sessions you chose to keep in this browser.</p>
      {!records.length && !error && <p>You haven’t saved a session yet.</p>}
      <ul className="session-list">
        {records.map((r) => (
          <li key={r.id}>
            <span>
              <strong>{gameNames[r.game]}</strong>
              <br />
              {new Date(r.started).toLocaleString()} · {duration(r.elapsed)} ·{" "}
              {r.sources.map((s) => sourceNames[s]).join(" → ")}
            </span>
            <button onClick={() => downloadRecord(r)}>Download</button>
          </li>
        ))}
      </ul>
      {records.length > 0 && (
        <button onClick={confirm ? clear : () => setConfirm(true)}>
          {confirm ? "Confirm delete all sessions" : "Delete saved sessions"}
        </button>
      )}
      {confirm && (
        <button onClick={() => setConfirm(false)}>Keep sessions</button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function Summary({
  record,
  onBack,
}: {
  record: PracticeRecord;
  onBack: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    try {
      await historyStore("readwrite", (s) => s.put(record));
      setSaved(true);
    } catch {
      setError("Storage is unavailable. You can still download this session.");
    }
  }
  return (
    <section className="practice-panel summary-panel">
      <p>{gameNames[record.game]}</p>
      <h1>Session complete</h1>
      <p>{record.sources.map((s) => sourceNames[s]).join(" → ")}</p>
      {record.calibration?.synthetic && (
        <p>Session used a synthetic EEG test stream.</p>
      )}
      <dl className="practice-stats">
        <div>
          <dt>Play time</dt>
          <dd>{duration(record.elapsed)}</dd>
        </div>
        <div>
          <dt>Actions</dt>
          <dd>{record.actions}</dd>
        </div>
        <div>
          <dt>{gameDetails[record.game].units[0].toUpperCase() + gameDetails[record.game].units.slice(1)}</dt>
          <dd>{record.rewards}</dd>
        </div>
      </dl>
      {record.garden?.goal && <p>Bloom goal · {record.rewards} of {record.garden.goal}{record.rewards >= record.garden.goal ? " · Reached" : ""}</p>}
      <div className="button-row">
        <button className="primary" onClick={onBack}>
          Back to games
        </button>
        <button onClick={save} disabled={saved}>
          {saved ? "Saved on this device" : "Save on this device"}
        </button>
        <button onClick={() => downloadRecord(record)}>Download</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function GameSetup({
  game,
  onBack,
  onStart,
}: {
  game: Game;
  onBack: () => void;
  onStart: (source: Source, easy: boolean, side: Side) => void;
}) {
  const [easy, setEasy] = useState(true);
  const [source, setSource] = useState<Source>("button");
  const [side, setSide] = useState<Side>("right");
  return (
    <section className="practice-panel">
      <button onClick={onBack}>← Games</button>
      <h1>{gameNames[game]}</h1>
      <p>
        {gameDetails[game].description}
      </p>
      <fieldset>
        <legend>Input</legend>
        {(["button", "camera", "eeg", "blended"] as const).map((input) => (
          <label key={input}>
            <input
              type="radio"
              name="input"
              checked={source === input}
              onChange={() => setSource(input)}
            />{" "}
            {sourceNames[input]}
          </label>
        ))}
      </fieldset>
      {source === "button" ? (
        <p>
          Use touch, a mouse, or a switch. On a keyboard, press Space or Enter
          on the game button.
        </p>
      ) : (
        <>
          <p>
            {source === "eeg"
              ? "Imagine moving the selected hand. EEG play does not require a camera."
              : source === "blended"
                ? "EEG contributes 60% and camera reach contributes 40%. Both signals must be available. Set your comfortable reach first."
                : "Your webcam tracks your reach on this device. Video is never saved."}
          </p>
          <fieldset>
            <legend>Which arm?</legend>
            {(["left", "right"] as const).map((s) => (
              <label key={s}>
                <input
                  type="radio"
                  name="side"
                  checked={side === s}
                  onChange={() => setSide(s)}
                />{" "}
                {s === "left" ? "Left" : "Right"}
              </label>
            ))}
          </fieldset>
        </>
      )}
      <fieldset>
        <legend>Pace</legend>
        {["Gentle", "Standard"].map((label, i) => (
          <label key={label}>
            <input
              type="radio"
              name="pace"
              checked={easy === (i === 0)}
              onChange={() => setEasy(i === 0)}
            />{" "}
            {label}
          </label>
        ))}
      </fieldset>
      <button className="primary" onClick={() => onStart(source, easy, side)}>
        Start game
      </button>
    </section>
  );
}

export function PracticeApp() {
  const [page, setPage] = useState<
    "home" | "history" | "setup" | "play" | "summary" | "staff"
  >("home");
  const [game, setGame] = useState<Game>("garden");
  const [side, setSide] = useState<Side>("right");
  const [round, setRound] = useState<PracticeRound | null>(null);
  const back = () => {
    setRound(null);
    setPage("home");
  };
  return (
    <div className="practice-app">
      <header className="practice-nav">
        <span className="brand">
          <span aria-hidden="true" className="brand-mark">
            ✳
          </span>{" "}
          NeuroReach
        </span>
        {page === "home" && (
          <button onClick={() => setPage("history")}>Saved sessions</button>
        )}
      </header>
      <main className="practice-main">
        {page === "home" && (
          <>
            <h1>Choose a game</h1>
            <p className="intro">
              Practice at your own pace. You can pause or finish at any time.
            </p>
            <div className="game-cards">
              {games.map((id) => (
                <button
                  key={id}
                  className="game-card"
                  onClick={() => {
                    setGame(id);
                    setPage("setup");
                  }}
                >
                  <div className={`card-art ${id}-preview`} aria-hidden="true">
                    {id === "garden" ? (
                      <Garden growth={0.85} bloom />
                    ) : id === "stars" ? <NightSky target={1} /> : <RiverArt/>}
                  </div>
                  <div className="card-copy">
                    <h2>{gameNames[id]}</h2>
                    <p>
                      {gameDetails[id].description}
                    </p>
                    <span aria-hidden="true">↗</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {page === "staff" && <StaffWorkspace onExit={back} />}
        {page === "history" && <History onBack={back} />}
        {page === "setup" && (
          <GameSetup
            game={game}
            onBack={back}
            onStart={(source, easy, arm) => {
              setSide(arm);
              setRound(new PracticeRound(game, source, easy));
              setPage("play");
            }}
          />
        )}
        {page === "play" && round && (
          <SensorSession
            round={round}
            side={side}
            end={() => setPage("summary")}
          />
        )}
        {page === "summary" && round && (
          <Summary record={round.record} onBack={back} />
        )}
      </main>
      <footer className="practice-foot">
        NeuroReach · Wellness &amp; engagement
        {page === "home" &&
          ["127.0.0.1", "localhost"].includes(location.hostname) && (
            <button onClick={() => setPage("staff")}>Staff workspace</button>
          )}
      </footer>
    </div>
  );
}
