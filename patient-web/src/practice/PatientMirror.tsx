import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mirrorDocument, mirrorSocket, type ScreenFrame } from "./screenMirror";

export function PatientMirror({
  session,
  done,
  expanded,
  expand,
}: {
  session: string;
  done: boolean;
  expanded: boolean;
  expand: () => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef<ScreenFrame | null>(null);
  const [size, setSize] = useState({ width: 1024, height: 768 });
  const [scale, setScale] = useState(1);
  const [status, setStatus] = useState("Waiting for the patient screen");
  const [live, setLive] = useState(false);
  function render(frame: ScreenFrame) {
    const doc = iframe.current?.contentDocument;
    const target = doc?.getElementById("patient-screen");
    if (!doc || !target) return;
    if (frame.css !== undefined)
      doc.getElementById("patient-styles")!.textContent = frame.css;
    // This document has scripts and forms disabled, with all network requests blocked.
    const template = doc.createElement("template");
    template.innerHTML = frame.html;
    template.content
      .querySelectorAll("script, iframe, object, embed, link, base, meta")
      .forEach((el) => el.remove());
    target.replaceChildren(template.content);
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
    if (done) {
      setLive(false);
      setStatus("Session ended");
      return;
    }
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry = 0;
    let stale = 0;
    function connect() {
      if (stopped) return;
      socket = mirrorSocket(
        "/api/staff/display/mirror?session=" + encodeURIComponent(session),
      );
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "frame") {
          latest.current = {
            ...message,
            css: message.css ?? latest.current?.css,
          };
          setSize({ width: message.width, height: message.height });
          render(latest.current!);
          setLive(true);
          setStatus("Live patient screen");
          clearTimeout(stale);
          stale = window.setTimeout(() => {
            setLive(false);
            setStatus("Waiting for the patient connection");
          }, 2500);
        } else {
          setLive(false);
          setStatus("Waiting for the patient screen");
        }
      };
      socket.onclose = () => {
        setLive(false);
        setStatus("Reconnecting screen preview");
        if (!stopped) retry = window.setTimeout(connect, 1200);
      };
      socket.onerror = () => socket?.close();
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(stale);
      if (socket) socket.onclose = null;
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
