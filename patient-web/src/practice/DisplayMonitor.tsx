import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { PairedDisplay } from "./PairedDisplay";
import {
  api,
  errorText,
  playerToken,
  StationError,
  type DisplayState,
  type Participant,
} from "./station";
import { gameNames } from "./session";

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
    if (display.url)
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
        setError(errorText(err));
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
  return (
    <section className="station-monitor">
      <h1>{local ? "Live session" : "Patient display"}</h1>
      <p>
        {participant?.name} · {gameNames[display.game]}
      </p>
      <p role="status">
        {done
          ? display.outcome === "cancelled"
            ? "Invitation cancelled"
            : "Session complete"
          : display.expired
            ? "Invitation expired"
            : !display.paired
              ? "Waiting for the patient to pair…"
              : display.connected
                ? resting
                  ? "Patient resting"
                  : "Display connected"
                : "Waiting for the display to reconnect…"}
      </p>
      {display.url && (
        <div className="display-invite">
          {qr && <img src={qr} alt="Patient pairing QR code" />}
          <a href={display.url} target="_blank" rel="noreferrer">
            Open patient display
          </a>
        </div>
      )}
      {display.record && (
        <p>
          {Math.floor(display.record.elapsed)} s · {display.record.actions}{" "}
          actions · {display.record.rewards} rewards
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        {waiting && (
          <button
            disabled={busy || !display.connected}
            onClick={() => control("start")}
          >
            Start patient game
          </button>
        )}
        {display.state === "playing" && !resting && (
          <button disabled={busy} onClick={() => control("pause")}>
            Pause patient game
          </button>
        )}
        {resting && !done && !ending && (
          <button
            disabled={busy || !display.connected}
            onClick={() => control("resume")}
          >
            Resume patient game
          </button>
        )}
        {!done && (
          <button
            disabled={busy || (ending && display.connected)}
            onClick={() => control(ending ? "finish-saved" : "end")}
          >
            {ending ? "Finish with last saved record" : "End display session"}
          </button>
        )}
        {local && !localToken && !display.connected && !done && !ending && (
          <button disabled={busy} onClick={() => control("recover")}>
            Recover patient game here
          </button>
        )}
        {(done || error) && <button onClick={onClose}>Return to roster</button>}
      </div>
      {local && localToken && !done && (
        <PairedDisplay
          key={localToken}
          local={{ session: display.session, token: localToken }}
        />
      )}
    </section>
  );
}
