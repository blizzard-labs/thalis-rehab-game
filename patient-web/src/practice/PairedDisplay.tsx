import { Brand } from "../brand/Brand";
import { useEffect, useRef, useState } from "react";
import "./practice.css";
import type { LiveInput } from "./station";
import { SensorSession } from "./SensorSession";
import { useScreenPublisher } from "./screenMirror";
import { gameNames, PracticeRound } from "./session";
import type { Game, Side, Source, PracticeRecord } from "./session";

type Snapshot = {
  session: string;
  harborBase?: number;
  state: string;
  revision: number;
  patientPaused: boolean;
  manualRequested?: boolean;
  outcome?: string;
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

export function PairedDisplay({
  local,
  onExpired,
}: {
  local?: { session: string; token: string };
  onExpired?: () => void;
} = {}) {
  const expire = useRef(onExpired);
  expire.current = onExpired;
  const telemetry = useRef<LiveInput | null>(null);

  const code = location.hash.slice("#display=".length);
  const key = local ? "nr-workstation-" + local.session : "nr-display-" + code;
  const [token, setToken] = useState(() => {
    if (local) return local.token;
    try {
      return sessionStorage.getItem(key) || "";
    } catch {
      return "";
    }
  });
  const [expired, setExpired] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [round, setRound] = useState<PracticeRound | null>(null);
  const live = useRef<PracticeRound | null>(null);
  const ending = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const revision = useRef<number | null>(null);
  const [owner, setOwner] = useState(!navigator.locks);
  useEffect(() => {
    if (!token || !navigator.locks) return;
    const abort = new AbortController();
    let release = () => {};
    void navigator.locks
      .request(
        "neuroreach-patient-" + key,
        { signal: abort.signal },
        async () => {
          if (abort.signal.aborted) return;
          setOwner(true);
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        },
      )
      .catch(() => {});
    return () => {
      abort.abort();
      release();
    };
  }, [token, key]);
  useEffect(() => {
    if (!token || !owner) return;
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
            telemetry: telemetry.current,
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
        const recovering =
          !live.current &&
          !!d.record &&
          (d.record.elapsed > 0 || d.record.events.length > 0);
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
          expire.current?.();
          return;
        }
        setError(
          "Display disconnected. Play is paused. " +
            (err instanceof Error ? err.message : ""),
        );
        timer = window.setTimeout(sync, 1500);
      }
    }
    const checkpoint = () => {
      const round = live.current;
      if (!round || closed) return;
      round.setPaused(true);
      const body = JSON.stringify({
        record: round.record,
        paused: true,
        revision: revision.current,
        finished: ending.current,
      });
      void fetch("/api/display/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body,
        keepalive: new Blob([body]).size < 60000,
        cache: "no-store",
      }).catch(() => {});
    };
    window.addEventListener("pagehide", checkpoint);
    void sync();
    return () => {
      window.removeEventListener("pagehide", checkpoint);
      if (local && !ending.current) checkpoint();
      closed = true;
      clearTimeout(timer);
    };
  }, [token, key, owner]);
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
  useScreenPublisher(screen, token, owner && !expired && !done);
  return (
    <div ref={screen} className={local ? "station-player" : "practice-app"}>
      {!local && (
        <header className="practice-nav">
          <Brand />
          <span>Shared with your clinician</span>
        </header>
      )}
      <div className={local ? "station-game-body" : "practice-main"}>
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
            <p>
              Your game screen, including its camera preview when enabled, will
              be visible to your clinician during this session.
            </p>
            <button className="primary" disabled={busy} onClick={pair}>
              Pair this display
            </button>
          </section>
        ) : !owner ? (
          <section className="practice-panel">
            <h1>Game open in another tab</h1>
            <p>Close the other patient tab to continue this session here.</p>
          </section>
        ) : done ? (
          <section className="practice-panel">
            <h1>
              {snapshot?.outcome === "cancelled"
                ? "Invitation cancelled"
                : snapshot?.outcome === "interrupted"
                  ? "Session interrupted"
                  : "Session complete"}
            </h1>
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
            forceButton={snapshot.manualRequested}
            displayInput
            monitor={telemetry}
            end={finish}
            lockedPause={snapshot.state === "paused" || !!error}
          />
        )}
      </div>
    </div>
  );
}
