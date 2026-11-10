import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { StationHeader, RunPerformance } from "./ClinicalPanels";
import { PairedDisplay } from "./PairedDisplay";
import {
  api,
  errorText,
  playerToken,
  StationError,
  type DisplayState,
  type Participant,
} from "./station";
import { gameNames, sourceNames } from "./session";

function WorkstationPlayer({
  session,
  token,
  onExpired,
}: {
  session: string;
  token: string;
  onExpired: () => void;
}) {
  const [owner, setOwner] = useState(!navigator.locks);
  useEffect(() => {
    if (!navigator.locks) return;
    const abort = new AbortController();
    let release = () => {};
    void navigator.locks
      .request(
        "neuroreach-player-" + session,
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
  }, [session]);
  return owner ? (
    <PairedDisplay local={{ session, token }} onExpired={onExpired} />
  ) : (
    <p className="cl-notice">
      Waiting for the patient game window. Only one window plays this visit at a
      time.
    </p>
  );
}

export function DisplayMonitor({
  initial,
  participant,
  localToken,
  onToken,
  onClose,
  onLock,
}: {
  initial: DisplayState;
  participant?: Participant;
  localToken: string;
  onToken: (token: string) => void;
  onClose: () => void;
  onLock: () => void;
}) {
  const [display, setDisplay] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [qr, setQr] = useState("");
  const [networkError, setNetworkError] = useState(""),
    [expanded, setExpanded] = useState(false);
  const sending = useRef(false),
    requestEpoch = useRef(0),
    close = useRef(onClose),
    lock = useRef(onLock);
  close.current = onClose;
  lock.current = onLock;
  const local = display.target === "workstation";
  useEffect(() => {
    let current = true;
    setQr("");
    if (display.url?.startsWith("https://"))
      void QRCode.toDataURL(display.url, { width: 160 })
        .then((img) => {
          if (current) setQr(img);
        })
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [display.url]);
  useEffect(() => {
    let current = true,
      timer = 0;
    async function poll() {
      const epoch = requestEpoch.current;
      try {
        const next = await api<DisplayState | null>("display");
        if (!current) return;
        if (!next || next.session !== initial.session) {
          close.current();
          return;
        }
        if (!sending.current && epoch === requestEpoch.current) {
          setDisplay(next);
          setNetworkError("");
          if (next.state === "complete" && local) {
            playerToken(next.session, null);
            close.current();
            return;
          }
        }
      } catch (err) {
        if (!current) return;
        if (err instanceof StationError && err.status === 401) {
          lock.current();
          return;
        }
        setNetworkError(errorText(err));
      }
      if (current) timer = window.setTimeout(poll, 750);
    }
    void poll();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [initial.session, local]);
  async function control(command: string) {
    if (sending.current) return;
    sending.current = true;
    requestEpoch.current++;
    setBusy(true);
    setError("");
    try {
      if (command === "lock") {
        if (display.state === "playing")
          await api("display/control", "POST", {
            session: display.session,
            command: "pause",
          });
        await api("logout", "POST");
        onLock();
        return;
      }
      if (command === "recover") {
        const r = await api<{ token: string }>("display/recover", "POST", {
          session: display.session,
        });
        onToken(r.token);
      } else {
        setDisplay(
          await api<DisplayState>("display/control", "POST", {
            session: display.session,
            command,
          }),
        );
      }
    } catch (err) {
      if (err instanceof StationError && err.status === 401) lock.current();
      else setError(errorText(err));
    } finally {
      sending.current = false;
      requestEpoch.current++;
      setBusy(false);
    }
  }
  const waiting = display.state === "waiting",
    done = display.state === "complete",
    ending = display.state === "ending";
  const resting = display.patientPaused || display.state === "paused";
  const source = display.record?.sources.slice(-1)[0] ?? display.source;
  const stateText = networkError
    ? "Monitor disconnected"
    : done
      ? display.outcome === "cancelled"
        ? "Invitation cancelled"
        : display.outcome === "interrupted"
          ? "Session interrupted"
          : "Session complete"
      : display.expired
        ? "Invitation expired"
        : !display.paired
          ? "Awaiting patient"
          : ending
            ? "Saving final record"
            : !display.connected
              ? "Display disconnected"
              : waiting
                ? "Ready to start"
                : resting
                  ? "Patient resting"
                  : display.telemetry?.phase === "setup"
                    ? "Input setup"
                    : source !== "button" && display.telemetry?.input == null
                      ? "Awaiting valid input"
                      : "Session active";
  return (
    <section
      className={"cl-shell cl-monitor" + (expanded ? " cl-expanded" : "")}
    >
      <StationHeader live>
        <button disabled={busy} onClick={() => control("lock")}>
          Lock workstation
        </button>
      </StationHeader>
      <div className="cl-monitor-content">
        <div className="cl-patient-heading">
          <div>
            <p className="cl-overline">
              {local ? "Workstation run" : "Patient display"}
            </p>
            <h1>{participant?.name ?? "Supervised session"}</h1>
            <p className="cl-meta">
              {gameNames[display.game]} <span>·</span> {sourceNames[source]}{" "}
              <span>·</span> {display.side} practice arm
            </p>
          </div>
          <strong
            role="status"
            className={
              "cl-state " + (display.connected && !done ? "is-connected" : "")
            }
          >
            {stateText}
          </strong>
        </div>
        {(error || networkError) && (
          <p className="cl-alert" role="alert">
            {error || networkError}
          </p>
        )}
        <section className="cl-controls" aria-label="Staff session controls">
          <h2>Session controls</h2>
          <div className="cl-actions">
            {waiting && !display.expired && (
              <button
                className="cl-primary"
                disabled={busy || !display.connected || !!networkError}
                onClick={() => control("start")}
              >
                Start patient game
              </button>
            )}
            {display.expired && waiting && (
              <button
                className="cl-primary"
                disabled={busy}
                onClick={() => control("renew")}
              >
                Renew invitation
              </button>
            )}
            {display.state === "playing" && !resting && (
              <button disabled={busy} onClick={() => control("pause")}>
                Pause patient game
              </button>
            )}
            {resting && !done && !ending && (
              <button
                className="cl-primary"
                disabled={busy || !display.connected}
                onClick={() => control("resume")}
              >
                Resume patient game
              </button>
            )}
            {!waiting && !done && !ending && source !== "button" && (
              <button
                disabled={busy || display.manualRequested}
                onClick={() => control("use-button")}
              >
                {display.manualRequested
                  ? "Switching input…"
                  : "Switch patient to one button"}
              </button>
            )}
            {!done && (
              <button
                className="cl-end"
                disabled={busy || (ending && !display.canFinishSaved)}
                onClick={() => control(ending ? "finish-saved" : "end")}
              >
                {ending
                  ? "Finish with last saved record"
                  : waiting
                    ? "Cancel invitation"
                    : local
                      ? "End supervised run"
                      : "End display session"}
              </button>
            )}
            {local && !localToken && !display.connected && !done && !ending && (
              <button disabled={busy} onClick={() => control("recover")}>
                Recover patient game here
              </button>
            )}
            {done && <button onClick={onClose}>Return to roster</button>}
          </div>
        </section>
        {display.url && (
          <section className="cl-card cl-invite">
            {qr && <img src={qr} alt="Patient pairing QR code" />}
            <div>
              <h2>Connect the patient screen</h2>
              <p>
                {display.url.startsWith("https://")
                  ? "Scan on the patient device using the clinic network."
                  : "Open a second window on this computer and select Pair this display."}
              </p>
              <a href={display.url} target="_blank" rel="noreferrer">
                Open patient display
              </a>
            </div>
          </section>
        )}
        {!local && waiting && display.paired && (
          <p className="cl-notice">
            Patient screen connected. Start the game when the patient is ready.
          </p>
        )}
        {local && !localToken && display.connected && (
          <p className="cl-notice">
            The patient game is open in another workstation window.
          </p>
        )}
        <RunPerformance
          display={
            networkError
              ? { ...display, connected: false, telemetry: null, trace: [] }
              : display
          }
          player={
            local && localToken && !done ? (
              <section className="cl-patient-screen">
                <div className="cl-screen-heading">
                  <h2>Patient game</h2>
                  <button
                    aria-expanded={expanded}
                    onClick={() => setExpanded((v) => !v)}
                  >
                    {expanded ? "Return to monitor" : "Expand patient game"}
                  </button>
                </div>
                <WorkstationPlayer
                  key={localToken}
                  session={display.session}
                  token={localToken}
                  onExpired={() => onToken("")}
                />
              </section>
            ) : undefined
          }
        />
      </div>
    </section>
  );
}
