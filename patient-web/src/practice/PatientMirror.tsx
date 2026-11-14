import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  applyScreenEdits,
  indexScreen,
  mirrorDocument,
  mirrorSocket,
  type ScreenFrame,
} from "./screenMirror";
import type { LiveInput } from "./station";

export function PatientMirror({
  session,
  done,
  expanded,
  expand,
  onInput,
}: {
  session: string;
  done: boolean;
  expanded: boolean;
  expand: () => void;
  onInput: (input: LiveInput | null | undefined) => void;
}) {
  const reportInput = useRef(onInput);
  reportInput.current = onInput;
  const iframe = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef<ScreenFrame | null>(null);
  const nodes = useRef(new Map<string, Element>());
  const painted = useRef<{ doc: Document; base: ScreenFrame } | null>(null);
  const base = useRef<ScreenFrame | null>(null);
  const [size, setSize] = useState({ width: 1024, height: 768 });
  const [scale, setScale] = useState(1);
  const [status, setStatus] = useState("Waiting for the patient screen");
  const [live, setLive] = useState(false);
  function render(frame: ScreenFrame) {
    const doc = iframe.current?.contentDocument;
    const target = doc?.getElementById("patient-screen");
    if (!doc || !target) return;
    const scene = base.current;
    if (!scene || scene.html === undefined) return;
    if (painted.current?.doc !== doc || painted.current.base !== scene) {
      const styles = doc.getElementById("patient-styles")!;
      if (scene.css !== undefined && styles.textContent !== scene.css)
        styles.textContent = scene.css;
      // Parse exclusively inside the inert, network-isolated preview.
      const template = doc.createElement("template");
      template.innerHTML = scene.html;
      template.content
        .querySelectorAll("script, iframe, object, embed, link, base, meta")
        .forEach((el) => el.remove());
      target.replaceChildren(template.content);
      nodes.current = indexScreen(target);
      painted.current = { doc, base: scene };
    }
    if (frame.edits) applyScreenEdits(nodes.current, frame.edits);
    reportInput.current(frame.live);
  }
  useLayoutEffect(() => {
    const fit = () => {
      const width = container.current?.clientWidth ?? size.width;
      setScale(
        Math.min(
          width / size.width,
          expanded ? (innerHeight - 72) / size.height : Infinity,
        ),
      );
    };
    const resize = new ResizeObserver(fit);
    if (container.current) resize.observe(container.current);
    window.addEventListener("resize", fit);
    fit();
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [size.width, size.height, expanded]);
  useEffect(() => {
    function clearScreen() {
      reportInput.current(null);
      base.current = latest.current = painted.current = null;
      nodes.current.clear();
      iframe.current?.contentDocument
        ?.getElementById("patient-screen")
        ?.replaceChildren();
    }
    clearScreen();
    if (done) {
      setLive(false);
      setStatus("Session ended");
      return;
    }
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry = 0;
    let stale = 0;
    let missedPaint = false;
    let fresh = false;
    function paint(frame: ScreenFrame | null) {
      if (!fresh) return;
      if (document.hidden) {
        missedPaint = true;
        return;
      }
      if (missedPaint) frame = latest.current;
      missedPaint = false;
      if (!frame) return;
      render(frame);
      setSize((old) =>
        old.width === frame.width && old.height === frame.height
          ? old
          : { width: frame.width, height: frame.height },
      );
    }
    const paintLatest = () => paint(latest.current);
    function connect() {
      if (stopped) return;
      socket = mirrorSocket(
        "/api/staff/display/mirror?updates=1&patches=1&session=" +
          encodeURIComponent(session),
      );
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "frame") {
          fresh = true;
          if (typeof message.html === "string") {
            base.current = {
              ...message,
              css: message.css ?? base.current?.css,
            };
          } else if (!base.current || message.scene !== base.current.scene) {
            socket?.close();
            return;
          }
          // The relay sends cumulative state after a skipped update or reconnect.
          // Keep that state locally so a hidden or reloaded iframe can catch up in one paint.
          latest.current = message.patch
            ? {
                ...message,
                edits: { ...latest.current?.edits, ...message.edits },
              }
            : message;
          paint(
            painted.current?.base === base.current ? message : latest.current,
          );
          setLive(true);
          setStatus("Live patient screen");
          clearTimeout(stale);
          stale = window.setTimeout(() => {
            fresh = false;
            reportInput.current(null);
            setLive(false);
            setStatus("Waiting for the patient connection");
          }, 2500);
        } else {
          fresh = false;
          clearTimeout(stale);
          clearScreen();
          setLive(false);
          setStatus("Waiting for the patient screen");
        }
      };
      socket.onclose = () => {
        fresh = false;
        clearTimeout(stale);
        clearScreen();
        setLive(false);
        setStatus("Reconnecting screen preview");
        if (!stopped) retry = window.setTimeout(connect, 1200);
      };
      socket.onerror = () => socket?.close();
    }
    document.addEventListener("visibilitychange", paintLatest);
    connect();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", paintLatest);
      clearScreen();
      clearTimeout(retry);
      clearTimeout(stale);
      if (socket) socket.onmessage = socket.onclose = null;
      socket?.close();
    };
  }, [session, done]);
  return (
    <section className="cl-patient-screen">
      <div className="cl-screen-heading">
        <h2>Patient screen</h2>
        <span
          className={"cl-mirror-state" + (live ? " is-live" : "")}
          role="status"
        >
          {status}
        </span>
        <button aria-expanded={expanded} onClick={expand}>
          {expanded ? "Return to monitor" : "Expand patient screen"}
        </button>
      </div>
      <div
        ref={container}
        className="cl-mirror-viewport"
        style={{ height: size.height * scale }}
      >
        <iframe
          ref={iframe}
          title="Live patient screen"
          sandbox="allow-same-origin"
          tabIndex={-1}
          srcDoc={mirrorDocument}
          onLoad={() => {
            if (latest.current) render(latest.current);
          }}
          style={{
            width: size.width,
            height: size.height,
            transform: "scale(" + scale + ")",
            left: "calc(50% - " + (size.width * scale) / 2 + "px)",
          }}
        />
        {!live && <div className="cl-mirror-cover">{status}</div>}
      </div>
    </section>
  );
}
