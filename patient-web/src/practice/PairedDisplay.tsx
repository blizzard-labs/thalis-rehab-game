import { useEffect, useRef, useState } from "react";
import "./practice.css";
import { SensorSession } from "./SensorSession";
import { gameNames, PracticeRound } from "./session";
import type { Game, Side, Source, PracticeRecord } from "./session";

type Snapshot = {
  session: string;
  harborBase?: number;
  state: string;
  revision: number;
  patientPaused: boolean;
  game: Game;
  side: Side;
  source: Source;
  easy: boolean;
  schedule: PracticeRecord["schedule"];
  record: PracticeRecord | null;
};

class DisplayExpired extends Error {}

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
  if (res.status === 403) throw new DisplayExpired(await res.text());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function PairedDisplay() {
  const code = location.hash.slice("#display=".length);
  const key = "nr-display-" + code;
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem(key) || "";
    } catch {
      return "";
    }
  });
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [round, setRound] = useState<PracticeRound | null>(null);
  const live = useRef<PracticeRound | null>(null);
  const ending = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const revision = useRef<number | null>(null);
  useEffect(() => {
    if (!token) return;
    let closed = false,
      timer = 0;
    async function sync() {
      try {
        const d: Snapshot = await post(
          "sync",
          {
            record: live.current?.record,
            paused: live.current?.paused,
            revision: revision.current,
            finished: ending.current,
          },
          token,
        );
        if (closed) return;
        setError("");
        setSnapshot(d);
        if (d.state === "complete") {
          try {
            sessionStorage.removeItem(key);
          } catch {
            /* Storage unavailable. */
          }
          live.current = null;
          setRound(null);
          return;
        }
        if (d.state === "ending") {
          ending.current = true;
          setFinishing(true);
        }
        const recovering = !live.current && !!d.record;
        if (d.state !== "waiting" && !live.current) {
          const r = d.record
            ? PracticeRound.restore(d.record, d.easy)
            : new PracticeRound(d.game, d.source, d.easy, d.schedule);
          if (!d.record && d.game === "keeper")
            r.record.harborBase = d.harborBase ?? 0;
          r.record.id = d.session;
          live.current = r;
          setRound(r);
        }
        if (d.revision !== revision.current) {
          live.current?.setPaused(
            d.state === "paused" ||
              d.state === "ending" ||
              d.patientPaused ||
              recovering,
          );
        }
        revision.current = d.revision;
        timer = window.setTimeout(sync, 750);
      } catch (err) {
        if (closed) return;
        live.current?.setPaused(true);
        if (err instanceof DisplayExpired) {
          try {
            sessionStorage.removeItem(key);
          } catch {
            /* Storage unavailable. */
          }
          live.current = null;
          setRound(null);
          setExpired(true);
          return;
        }
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
      try {
        sessionStorage.setItem(key, r.token);
      } catch {
        /* Keep the active tab paired in memory. */
      }
      setToken(r.token);
      setError("");
    } catch (err) {
      if (err instanceof DisplayExpired) setExpired(true);
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
        {expired ? (
          <section className="practice-panel">
            <h1>Display session unavailable</h1>
            <p>
              Ask staff for a new invitation. This screen has stopped tracking.
            </p>
          </section>
        ) : !token ? (
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
            modelProfile={snapshot.session}
            end={finish}
            lockedPause={snapshot.state === "paused" || !!error}
          />
        )}
      </main>
    </div>
  );
}
