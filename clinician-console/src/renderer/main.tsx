import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { LiveMonitor } from "./LiveMonitor";
import { ScoreStore } from "../scoring/scoreStore";
import { createScoreClient, type ConnectionState, type WsLike } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";

declare global {
  interface Window {
    neuroreach?: { sidecarWsUrl: string; onSidecarStatus: (cb: (s: { state: SidecarState }) => void) => void };
  }
}

const store = new ScoreStore();
const wsUrl = window.neuroreach?.sidecarWsUrl ?? "ws://localhost:8765";

function App() {
  const [conn, setConn] = useState<ConnectionState>("connecting");
  const [sidecar, setSidecar] = useState<SidecarState>("starting");

  useEffect(() => {
    window.neuroreach?.onSidecarStatus((s) => setSidecar(s.state));
    const client = createScoreClient({
      url: wsUrl,
      createSocket: (url) => new WebSocket(url) as unknown as WsLike,
      onFrame: (f) => store.push(f),
      onState: setConn,
    });
    client.connect();
    return () => client.stop();
  }, []);

  return <LiveMonitor store={store} connectionState={conn} sidecarState={sidecar} />;
}

createRoot(document.getElementById("root")!).render(<App />);
