import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { StationHeader, RunPerformance } from "./ClinicalPanels";
import { PatientMirror } from "./PatientMirror";
import {
  api,
  errorText,
  StationError,
  type DisplayState,
  type Participant,
} from "./station";
import { gameNames, sourceNames } from "./session";

export function DisplayMonitor({
  initial,
  participant,
  onClose,
  onLock,
}: {
  initial: DisplayState;
  participant?: Participant;
  onClose: () => void;
  onLock: () => void;
}) {
  const [display, setDisplay] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [networkError, setNetworkError] = useState(""),
    [expanded, setExpanded] = useState(false);
  const sending = useRef(false),
    requestEpoch = useRef(0),
    close = useRef(onClose),
    lock = useRef(onLock);
  close.current = onClose;
  lock.current = onLock;
  useEffect(() => {
    let current = true;
    setQr("");
    setCopied(false);
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
          setNetworkError("");
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
  }, [initial.session]);
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
      setDisplay(
        await api<DisplayState>("display/control", "POST", {
          session: display.session,
          command,
        }),
      );
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
            <p className="cl-overline">Supervised session</p>
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
            {display.expired && !display.paired && (
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
                    : "End supervised run"}
              </button>
            )}
            {!display.connected && display.paired && !done && !ending && (
              <button disabled={busy} onClick={() => control("reinvite")}>
                Reconnect patient device
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
                Scan the QR code on the patient's device using the same Wi-Fi,
                or send the session link.
              </p>
              <label className="cl-session-link">
                Patient session link
                <input
                  readOnly
                  value={display.url}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <div className="cl-actions">
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(display.url!);
                      setCopied(true);
                    } catch {
                      setError(
                        "Select the session link and copy it from the text field.",
                      );
                    }
                  }}
                >
                  {copied ? "Link copied" : "Copy session link"}
                </button>
                <a href={display.url} target="_blank" rel="noreferrer">
                  Open patient display
                </a>
                {display.localUrl && display.url.startsWith("https://") && (
                  <a href={display.localUrl} target="_blank" rel="noreferrer">
                    Open on this computer
                  </a>
                )}
              </div>
              {display.stationCertificate && (
                <details className="cl-device-help">
                  <summary>First-time device connection</summary>
                  <p>
                    This local station uses its own certificate. Trust the
                    station certificate on the patient device when prompted.
                    Camera access may require installing it in the device's
                    trusted certificates.
                  </p>
                  <a href="/api/staff/display/certificate" download>
                    Download station certificate
                  </a>
                </details>
              )}
            </div>
          </section>
        )}
        {waiting && display.paired && (
          <p className="cl-notice">
            Patient screen connected. Start the game when the patient is ready.
          </p>
        )}
        <RunPerformance
          display={
            networkError
              ? { ...display, connected: false, telemetry: null, trace: [] }
              : display
          }
          player={
            <PatientMirror
              session={display.session}
              done={done}
              expanded={expanded}
              expand={() => setExpanded((value) => !value)}
            />
          }
        />
      </div>
    </section>
  );
}
