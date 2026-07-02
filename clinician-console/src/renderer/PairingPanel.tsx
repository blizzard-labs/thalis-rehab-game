import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { SessionInfo } from "../main/lan/pairing";

export type { SessionInfo };

export type PairingApi = {
  startSession: (s: SessionInfo) => Promise<{ code: string; url: string }>;
  endSession: () => Promise<void>;
  onPatientConnected: (cb: () => void) => void;
  onPatientDisconnected: (cb: () => void) => void;
};

export function PairingPanel({ api, session }: { api: PairingApi; session: SessionInfo }) {
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    api.onPatientConnected(() => setConnected(true));
    api.onPatientDisconnected(() => setConnected(false));
  }, [api]);

  async function start() {
    const { code, url } = await api.startSession(session);
    setCode(code);
    setQr(await QRCode.toDataURL(url));
  }

  async function end() {
    await api.endSession();
    setCode(null);
    setQr(null);
    setConnected(false);
  }

  return (
    <section className="pairing-panel">
      {!code ? (
        <button onClick={start}>Start Session</button>
      ) : (
        <div className="pairing-active">
          {qr && <img src={qr} alt="Session pairing QR code" width={180} height={180} />}
          <p className="pairing-code">{code}</p>
          {!connected && <p className="pairing-status">Waiting for patient to scan…</p>}
          <button onClick={end}>End Session</button>
        </div>
      )}
      {connected && <p className="pairing-status">✓ Patient connected</p>}
    </section>
  );
}
