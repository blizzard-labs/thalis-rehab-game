import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { App } from "./App";
import { ScoreStore } from "../scoring/scoreStore";
import { EegQualityStore } from "../scoring/eegQualityStore";
import { patientStore } from "../data/store";
import { createScoreClient, type ConnectionState, type WsLike } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import "./console.css";

declare global {
  interface Window {
    neuroreach?: { sidecarWsUrl: string; onSidecarStatus: (cb: (s: { state: SidecarState }) => void) => void };
  }
}

const scoreStore = new ScoreStore();
const qualityStore = new EegQualityStore();
const wsUrl = window.neuroreach?.sidecarWsUrl ?? "ws://localhost:8765";

function Root() {
  const [conn, setConn] = useState<ConnectionState>("connecting");
  const [sidecar, setSidecar] = useState<SidecarState>("starting");

  useEffect(() => {
    window.neuroreach?.onSidecarStatus((s) => setSidecar(s.state));
    const client = createScoreClient({
      url: wsUrl,
      createSocket: (url) => new WebSocket(url) as unknown as WsLike,
      onFrame: (f) => scoreStore.push(f),
      onQuality: (q) => qualityStore.push(q),
      onState: setConn,
    });
    client.connect();
    return () => client.stop();
  }, []);

  return (
    <App
      patientStore={patientStore}
      scoreStore={scoreStore}
      qualityStore={qualityStore}
      connectionState={conn}
      sidecarState={sidecar}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
