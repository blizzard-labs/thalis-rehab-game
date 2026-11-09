import { useEffect, useRef, useState } from "react";
import "./practice.css";
import { Play } from "./GameView";
import { SensorSession } from "./SensorSession";
import { gameNames, PracticeRound } from "./session";
import type { Game, Side, Source, PracticeRecord } from "./session";

type Snapshot = {
  session: string;
  state: string;
  game: Game;
  side: Side;
  source: Source;
  easy: boolean;
  schedule: PracticeRecord["schedule"];
  record: PracticeRecord | null;
};

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch("/api/display/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function PairedDisplay() {
  const code = location.hash.slice("#display=".length);
  const key = "nr-display-" + code;
  const [token, setToken] = useState(() => sessionStorage.getItem(key) || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [round, setRound] = useState<PracticeRound | null>(null);
  const live = useRef<PracticeRound | null>(null);
  const ending = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const latestState = useRef("");
  useEffect(() => {
    if (!token) return;
    let closed = false,
      timer = 0;
    async function sync() {
      try {
        const d: Snapshot = await post(
          "sync",
          { record: live.current?.record, finished: ending.current },
          token,
        );
        if (closed) return;
        setError("");
        setSnapshot(d);
        if (d.state === "complete") {
          sessionStorage.removeItem(key);
          live.current = null;
          setRound(null);
          return;
        }
        if (d.state === "ending") {
          ending.current = true;
          setFinishing(true);
        }
        if (d.state !== "waiting" && !live.current) {
          const r = new PracticeRound(d.game, d.source, d.easy, d.schedule);
          if (d.record) {
            Object.assign(r.record, d.record);
            r.source = r.record.sources[r.record.sources.length - 1];
            r.progress = d.game === "garden" ? (r.record.actions % 4) / 4 : 0;
          }
          r.record.id = d.session;
          live.current = r;
          setRound(r);
        }
        if (d.state !== latestState.current)
          live.current?.setPaused(d.state === "paused" || d.state === "ending");
        latestState.current = d.state;
        timer = window.setTimeout(sync, 750);
      } catch (err) {
        if (closed) return;
        live.current?.setPaused(true);
        latestState.current = "";
        setError(
          "Display disconnected. Play is paused. " +
            (err instanceof Error ? err.message : ""),
        );
        timer = window.setTimeout(sync, 1500);
      }
    }
    void sync();
    return () => {
      closed = true;
      clearTimeout(timer);
    };
  }, [token, key]);
  async function pair() {
    setBusy(true);
    try {
      const r = await post("claim", { code });
      sessionStorage.setItem(key, r.token);
      setToken(r.token);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pair display.");
    } finally {
      setBusy(false);
    }
  }
  const finish = () => {
    round?.setPaused(true);
    ending.current = true;
    setFinishing(true);
  };
  const done = snapshot?.state === "complete";
  return (
    <div className="practice-app">
      <header className="practice-nav">
        <span className="brand">NeuroReach</span>
        <span>Patient display</span>
      </header>
      <main className="practice-main">
        {error && <p role="alert">{error}</p>}
        {!token ? (
          <section className="practice-panel">
            <h1>Join your session</h1>
            <p>Pair this screen with the staff workstation.</p>
            <button className="primary" disabled={busy} onClick={pair}>
              Pair this display
            </button>
          </section>
        ) : done ? (
          <section className="practice-panel">
            <h1>Session complete</h1>
            <p>You can close this window.</p>
          </section>
        ) : finishing ? (
          <section className="practice-panel">
            <h1>Finishing session</h1>
            <p>Sending the final record to the workstation.</p>
          </section>
        ) : !round || !snapshot ? (
          <section className="practice-panel">
            <h1>Waiting for staff</h1>
            <p>{snapshot && gameNames[snapshot.game]}</p>
          </section>
        ) : (
          <SensorSession
            round={round}
            side={snapshot.side}
            end={finish}
            play={(observe, status) => (
              <Play
                round={round}
                observation={observe}
                status={status}
                onEnd={finish}
                lockedPause={snapshot.state === "paused" || !!error}
              />
            )}
          />
        )}
      </main>
    </div>
  );
}
