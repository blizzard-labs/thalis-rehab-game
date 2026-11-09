import { useEffect, useRef, useState } from "react";
import { Flower } from "../garden/Flower";
import { downloadRecord, gameNames, historyStore, PracticeRound, sourceNames } from "./session";
import type { Game, PracticeRecord, Side, Source } from "./session";
import "./practice.css";

function duration(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function NightSky({ target, scan }: { target: number; scan?: number }) {
  return <div className="night-sky" aria-label={`Star at position ${target + 1}`}>
    {[0, 1, 2].map(slot => <div key={slot} className={`sky-slot slot-${slot}`} data-scan={scan === slot}>
      <span>{slot === target ? "★" : "✧"}</span>
    </div>)}
  </div>;
}

function Garden({ growth, bloom }: { growth: number; bloom: boolean }) {
  return <div className="plant-scene"><div className="garden-sun" /><div className="plant-bed" />
    <Flower growth={growth} bloom={bloom} />
  </div>;
}

function History({ onBack }: { onBack: () => void }) {
  const [records, setRecords] = useState<PracticeRecord[]>([]);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    historyStore<PracticeRecord[]>("readonly", s => s.getAll()).then(rows => setRecords(rows.sort((a,b) => b.started.localeCompare(a.started))))
      .catch(() => setError("Saved sessions could not be opened on this browser."));
  }, []);
  async function clear() {
    try { await historyStore("readwrite", s => s.clear()); setRecords([]); setConfirm(false); }
    catch { setError("Could not delete saved sessions. Please try again."); }
  }
  return <section className="practice-panel"><button onClick={onBack}>← Games</button><h1>Saved sessions</h1>
    <p>Sessions you chose to keep in this browser.</p>
    {!records.length && !error && <p>You haven’t saved a session yet.</p>}
    <ul className="session-list">{records.map(r => <li key={r.id}><span><strong>{gameNames[r.game]}</strong><br/>
      {new Date(r.started).toLocaleString()} · {duration(r.elapsed)} · {r.sources.map(s => sourceNames[s]).join(" → ")}</span>
      <button onClick={() => downloadRecord(r)}>Download</button></li>)}</ul>
    {records.length > 0 && <button onClick={confirm ? clear : () => setConfirm(true)}>
      {confirm ? "Confirm delete all sessions" : "Delete saved sessions"}</button>}
    {confirm && <button onClick={() => setConfirm(false)}>Keep sessions</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

function Summary({ record, onBack }: { record: PracticeRecord; onBack: () => void }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    try { await historyStore("readwrite", s => s.put(record)); setSaved(true); }
    catch { setError("Storage is unavailable. You can still download this session."); }
  }
  return <section className="practice-panel summary-panel"><p>{gameNames[record.game]}</p><h1>Session complete</h1>
    <p>{record.sources.map(s => sourceNames[s]).join(" → ")}</p>
    <dl className="practice-stats">
      <div><dt>Play time</dt><dd>{duration(record.elapsed)}</dd></div>
      <div><dt>Actions</dt><dd>{record.actions}</dd></div>
      <div><dt>{record.game === "garden" ? "Blooms" : "Stars"}</dt><dd>{record.rewards}</dd></div>
    </dl>
    <div className="button-row"><button className="primary" onClick={onBack}>Back to games</button>
      <button onClick={save} disabled={saved}>{saved ? "Saved on this device" : "Save on this device"}</button>
      <button onClick={() => downloadRecord(record)}>Download</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}

function Play({ round, onEnd, observation = () => null, status }: {
  round: PracticeRound; onEnd: () => void; observation?: () => number | null; status?: string;
}) {
  const [, redraw] = useState(0);
  const observe = useRef(observation);
  observe.current = observation;
  const action = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      round.tick((now - last) / 1000, observe.current());
      last = now;
      redraw(n => n + 1);
    }, 80);
    const visibility = () => { if (document.hidden) round.setPaused(true); };
    document.addEventListener("visibilitychange", visibility);
    action.current?.focus();
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [round]);
  const manual = round.source === "button";
  const garden = round.record.game === "garden";
  let instruction = manual
    ? garden ? "Press Water four times to open a flower." : "Press Catch when the ring reaches the filled star."
    : "Reach to your comfortable position, then return to rest.";
  if (round.source === "eeg") instruction = "Follow your imagery cue, then relax between actions.";
  return <section className="practice-panel play-panel">
    <header className="play-title"><h1>{gameNames[round.record.game]}</h1><span>{duration(round.record.elapsed)}</span></header>
    <div className="play-stage">{garden
      ? <Garden growth={0.2 + round.progress * 0.8 + (round.record.rewards && !round.progress ? 0.8 : 0)} bloom={round.record.rewards > 0 && !round.progress} />
      : <NightSky target={round.target} scan={manual ? round.scanSlot : undefined} />}</div>
    <div className="play-controls"><div>
      <p aria-live="polite"><strong>{round.paused ? "Paused" : instruction}</strong></p>
      <p>{sourceNames[round.source]} · {round.record.rewards} {garden ? "blooms" : "stars"}</p>
      {status && <p role="status">{status}</p>}
    </div><div className="button-row">
      {manual && <button ref={action} className="primary" disabled={round.paused}
        onKeyDown={e => { if (e.repeat) e.preventDefault(); }}
        onClick={() => { round.press(); redraw(n => n+1); }}>{garden ? "Water" : "Catch"}</button>}
      <button onClick={() => { round.setPaused(!round.paused); redraw(n => n+1); }}>{round.paused ? "Resume" : "Pause"}</button>
      <button onClick={onEnd}>End session</button>
    </div></div>
  </section>;
}

function GameSetup({ game, onBack, onStart }: { game: Game; onBack: () => void;
  onStart: (source: Source, easy: boolean, side: Side) => void }) {
  const [easy, setEasy] = useState(true);
  return <section className="practice-panel"><button onClick={onBack}>← Games</button>
    <h1>{gameNames[game]}</h1><p>{game === "garden" ? "Water your plant and watch each flower open." : "Catch the star as the selection moves across the sky."}</p>
    <fieldset><legend>Input</legend><label><input type="radio" defaultChecked name="input"/> One button</label></fieldset>
    <p>Use touch, a mouse, or a switch. On a keyboard, press Space or Enter on the game button.</p>
    <fieldset><legend>Pace</legend>{["Gentle", "Standard"].map((label,i) =>
      <label key={label}><input type="radio" name="pace" checked={easy === (i === 0)} onChange={() => setEasy(i === 0)} /> {label}</label>)}</fieldset>
    <button className="primary" onClick={() => onStart("button", easy, "right")}>Start game</button>
  </section>;
}

export function PracticeApp() {
  const [page, setPage] = useState<"home" | "history" | "setup" | "play" | "summary">("home");
  const [game, setGame] = useState<Game>("garden");
  const [round, setRound] = useState<PracticeRound | null>(null);
  const back = () => { setRound(null); setPage("home"); };
  return <div className="practice-app"><header className="practice-nav">
    <span className="brand"><span aria-hidden="true" className="brand-mark">✳</span> NeuroReach</span>
    {page === "home" && <button onClick={() => setPage("history")}>Saved sessions</button>}
  </header><main className="practice-main">
    {page === "home" && <><h1>Choose a game</h1><p className="intro">Practice at your own pace. You can pause or finish at any time.</p>
      <div className="game-cards">{(["garden", "stars"] as const).map(id =>
        <button key={id} className="game-card" onClick={() => { setGame(id); setPage("setup"); }}>
          <div className="card-art" aria-hidden="true">{id === "garden" ? <Garden growth={0.85} bloom /> : <NightSky target={1} />}</div>
          <div className="card-copy"><h2>{gameNames[id]}</h2><p>{id === "garden" ? "Grow a flower, one action at a time." : "Find a star and bring it home."}</p><span aria-hidden="true">↗</span></div>
        </button>)}</div></>}
    {page === "history" && <History onBack={back} />}
    {page === "setup" && <GameSetup game={game} onBack={back} onStart={(source, easy) => { setRound(new PracticeRound(game, source, easy)); setPage("play"); }} />}
    {page === "play" && round && <Play round={round} onEnd={() => setPage("summary")} />}
    {page === "summary" && round && <Summary record={round.record} onBack={back} />}
  </main><footer className="practice-foot">NeuroReach · Wellness &amp; engagement</footer></div>;
}
