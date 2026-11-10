import { ReportButton } from "../reports/ReportReader";
import { useCallback, useEffect, useRef, useState } from "react";
import { games, gameDetails } from "./catalog";
import { LighthouseArt } from "../adventures/Lighthouse";
import { keeperStory, keeperWork } from "../adventures/keeperStory";
import { OrchardArt } from "../adventures/Orchard";
import { RiverArt } from "../adventures/River";
import { duration, Garden, NightSky } from "./GameView";
import {
  downloadRecord,
  gameNames,
  PracticeRound,
  sourceNames,
} from "./session";
import type { Game, PracticeRecord, Side, Source } from "./session";
import {
  GuestChanged,
  clearGuestRecords,
  currentGuest,
  guestRecords,
  nextGuest,
  saveGuestRecord,
} from "./guestHistory";
import { StaffWorkspace } from "./StaffWorkspace";
import { SensorSession } from "./SensorSession";
import "./practice.css";

function History({
  guest,
  onBack,
}: {
  guest: string | null | undefined;
  onBack: () => void;
}) {
  const [records, setRecords] = useState<PracticeRecord[] | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!guest) return;
    let active = true;
    guestRecords(guest)
      .then((rows) => {
        if (active)
          setRecords(rows.sort((a, b) => b.started.localeCompare(a.started)));
      })
      .catch(() => {
        if (active)
          setError("Saved sessions could not be opened on this browser.");
      });
    return () => {
      active = false;
    };
  }, [guest]);
  async function clear() {
    if (!guest) return;
    try {
      await clearGuestRecords(guest);
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
      {guest === null && (
        <p role="alert">Saved sessions could not be opened on this browser.</p>
      )}
      {guest !== null && !records && !error && (
        <p role="status">Opening saved sessions…</p>
      )}
      {records?.length === 0 && <p>You haven’t saved a session yet.</p>}
      {records && records.length > 0 && (
        <ReportButton
          reader={{ name: "Guest practice" }}
          visits={records.map((record) => ({ record, status: "complete" }))}
          authorize={
            guest
              ? async () => {
                  await currentGuest(guest);
                }
              : undefined
          }
        />
      )}
      <ul className="session-list">
        {records?.map((r) => (
          <li key={r.id}>
            <span>
              <strong>{gameNames[r.game]}</strong>
              <br />
              {new Date(r.started).toLocaleString()} · {duration(r.elapsed)} ·{" "}
              {r.sources.map((s) => sourceNames[s]).join(" → ")}
            </span>
            <span className="button-row">
              <ReportButton
                reader={{ name: "Guest practice" }}
                visit={{ record: r, status: "complete" }}
                visits={records.map((record) => ({
                  record,
                  status: "complete",
                }))}
                authorize={
                  guest
                    ? async () => {
                        await currentGuest(guest);
                      }
                    : undefined
                }
              />
              <button onClick={() => downloadRecord(r)}>Download</button>
            </span>
          </li>
        ))}
      </ul>
      {records && records.length > 0 && (
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
  guest,
  record,
  onBack,
}: {
  guest?: string;
  record: PracticeRecord;
  onBack: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    try {
      if (!guest) throw new Error("Storage unavailable");
      await saveGuestRecord(guest, record);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof GuestChanged
          ? err.message
          : "Storage is unavailable. You can still download this session.",
      );
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
          <dt>
            {gameDetails[record.game].units[0].toUpperCase() +
              gameDetails[record.game].units.slice(1)}
          </dt>
          <dd>{record.rewards}</dd>
        </div>
      </dl>
      {record.garden?.goal && (
        <p>
          Bloom goal · {record.rewards} of {record.garden.goal}
          {record.rewards >= record.garden.goal ? " · Reached" : ""}
        </p>
      )}
      {record.game === "keeper" && (
        <p>
          Keeper’s log ·{" "}
          {keeperStory((record.harborBase ?? 0) + record.rewards).title}. Save
          this session to continue your story on this browser.
        </p>
      )}
      <div className="button-row">
        <button className="primary" onClick={onBack}>
          Back to games
        </button>
        <button onClick={save} disabled={saved}>
          {saved ? "Saved on this device" : "Save on this device"}
        </button>
        <ReportButton
          reader={{ name: "Guest practice" }}
          visit={{ record, status: "complete" }}
          authorize={
            guest
              ? async () => {
                  await currentGuest(guest);
                }
              : undefined
          }
        />
        <button onClick={() => downloadRecord(record)}>Download</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function GameSetup({
  game,
  guest,
  onBack,
  onStart,
}: {
  game: Game;
  guest: string | null | undefined;
  onBack: () => void;
  onStart: (
    source: Source,
    easy: boolean,
    side: Side,
    harborBase: number,
  ) => void;
}) {
  const [easy, setEasy] = useState(true);
  const [source, setSource] = useState<Source>("button");
  const [side, setSide] = useState<Side>("right");
  const [base, setBase] = useState<number | null>(null);
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    if (game !== "keeper" || guest === undefined) return;
    if (guest === null) {
      setHistoryError(true);
      setBase(0);
      return;
    }
    let active = true;
    guestRecords(guest)
      .then((records) => {
        if (active) setBase(keeperWork(records));
      })
      .catch(() => {
        if (active) {
          setHistoryError(true);
          setBase(0);
        }
      });
    return () => {
      active = false;
    };
  }, [game, guest]);
  return (
    <section className="practice-panel">
      <button onClick={onBack}>← Games</button>
      <h1>{gameNames[game]}</h1>
      <p>{gameDetails[game].description}</p>
      {game === "keeper" && (
        <p role="status">
          {base === null
            ? "Opening your keeper’s log…"
            : historyError
              ? "Saved progress is unavailable. You can play a new harbor story."
              : `${keeperStory(base).title} · ${base} saved tasks and supplies. Each saved outing brings up to three supplies, and every saved keeper task carries forward.`}
        </p>
      )}
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
      <button
        className="primary"
        disabled={game === "keeper" && base === null}
        onClick={() => onStart(source, easy, side, base ?? 0)}
      >
        Start game
      </button>
    </section>
  );
}

export function PracticeApp() {
  const [page, setPage] = useState<
    "home" | "history" | "setup" | "play" | "summary" | "staff" | "handoff"
  >("home");
  const [game, setGame] = useState<Game>("garden");
  const [side, setSide] = useState<Side>("right");
  const [round, setRound] = useState<PracticeRound | null>(null);
  const [guest, setGuest] = useState<string | null>();
  const activeGuest = useRef<string>();
  const channel = useRef<BroadcastChannel | null>(null);
  const [resetting, setResetting] = useState(false);
  const [handoffError, setHandoffError] = useState("");
  const [handoffComplete, setHandoffComplete] = useState(false);

  const showGuest = useCallback((id: string) => {
    if (activeGuest.current && activeGuest.current !== id) {
      setRound(null);
      setPage((current) => (current === "staff" ? current : "home"));
      setHandoffError("");
      setHandoffComplete(true);
    }
    activeGuest.current = id;
    setGuest(id);
  }, []);
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void currentGuest()
        .then((id) => {
          if (mounted) showGuest(id);
        })
        .catch(() => {
          if (mounted && !activeGuest.current) setGuest(null);
        });
    };
    refresh();
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("neuroreach-guest-handoff");
      channel.current.onmessage = refresh;
    }
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      mounted = false;
      channel.current?.close();
      channel.current = null;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [showGuest]);
  async function handOff() {
    if (!guest || resetting) return;
    setResetting(true);
    try {
      const id = await nextGuest(guest);
      showGuest(id);
      channel.current?.postMessage("changed");
    } catch {
      setHandoffError("Could not finish the handoff. Please try again.");
    } finally {
      setResetting(false);
    }
  }
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
            {handoffComplete && <p role="status">Ready for the next guest.</p>}
            <p className="intro">
              Practice at your own pace. You can pause or finish at any time.
            </p>
            <div className="game-cards">
              {games.map((id) => (
                <button
                  key={id}
                  className="game-card"
                  onClick={() => {
                    setHandoffComplete(false);
                    setGame(id);
                    setPage("setup");
                  }}
                >
                  <div className={`card-art ${id}-preview`} aria-hidden="true">
                    {id === "garden" ? (
                      <Garden growth={0.85} bloom />
                    ) : id === "stars" ? (
                      <NightSky target={1} />
                    ) : id === "river" ? (
                      <RiverArt />
                    ) : id === "fruit" ? (
                      <OrchardArt />
                    ) : (
                      <LighthouseArt />
                    )}
                  </div>
                  <div className="card-copy">
                    <h2>{gameNames[id]}</h2>
                    <p>{gameDetails[id].description}</p>
                    <span aria-hidden="true">↗</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {page === "staff" && <StaffWorkspace onExit={back} />}
        {page === "history" && <History guest={guest} onBack={back} />}
        {page === "handoff" && (
          <section className="practice-panel">
            <h1>Start the next guest’s turn?</h1>
            <p>
              This clears this browser’s saved guest sessions and lighthouse
              progress, and disconnects the guest’s saved EEG calibration.
              Download any sessions you want to keep first.
            </p>
            <div className="button-row">
              <button
                autoFocus
                disabled={resetting}
                onClick={() => setPage(round ? "summary" : "home")}
              >
                Keep this guest
              </button>
              <button
                className="primary"
                disabled={resetting || !guest}
                onClick={handOff}
              >
                Clear and start next guest
              </button>
            </div>
            {guest === null && (
              <p role="alert">
                Browser storage is unavailable. Open a new private window for
                the next guest.
              </p>
            )}
            {handoffError && <p role="alert">{handoffError}</p>}
          </section>
        )}
        {page === "setup" && (
          <GameSetup
            game={game}
            guest={guest}
            onBack={back}
            onStart={(source, easy, arm, harborBase) => {
              setSide(arm);
              const next = new PracticeRound(game, source, easy);
              if (game === "keeper") next.record.harborBase = harborBase;
              setRound(next);
              setPage("play");
            }}
          />
        )}
        {page === "play" && round && (
          <SensorSession
            round={round}
            side={side}
            modelProfile={guest ? () => currentGuest(guest) : undefined}
            end={() => setPage("summary")}
          />
        )}
        {(page === "summary" || page === "handoff") && round && (
          <div hidden={page === "handoff"}>
            <Summary
              guest={guest ?? undefined}
              record={round.record}
              onBack={back}
            />
          </div>
        )}
      </main>
      <footer className="practice-foot">
        NeuroReach · Wellness &amp; engagement
        {(page === "home" || page === "summary") && (
          <button
            onClick={() => {
              setHandoffError("");
              setPage("handoff");
            }}
          >
            Next guest
          </button>
        )}
        {page === "home" &&
          ["127.0.0.1", "localhost"].includes(location.hostname) && (
            <button onClick={() => setPage("staff")}>Staff workspace</button>
          )}
      </footer>
    </div>
  );
}
