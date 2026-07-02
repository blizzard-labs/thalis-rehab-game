import { useEffect, useState } from "react";
import { createLanClient, type PairedSession } from "../net/lanClient";
import type { WsLike } from "../net/scoreClient";

export function PairingScene({
  code,
  wssUrl,
  onPaired,
  createSocket = (url) => new WebSocket(url) as unknown as WsLike,
}: {
  code: string;
  wssUrl: string;
  onPaired: (s: PairedSession) => void;
  createSocket?: (url: string) => WsLike;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = createLanClient({
      code,
      wssUrl,
      localhostUrl: wssUrl,
      createSocket,
      onScoreFrame: () => {},
      onPaired,
      onError: (r) => setError(r),
    });
    client.connect();
    return () => client.stop();
  }, [code, wssUrl, onPaired, createSocket]);

  return (
    <div className="pairing-scene">
      {error ? (
        <p role="alert">We couldn't connect ({error}). Ask your clinician to start a new session.</p>
      ) : (
        <p>Connecting to your session…</p>
      )}
    </div>
  );
}
