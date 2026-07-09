import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { WaitingSpinner } from "./WaitingSpinner";

type Props = {
  code: string | null;
  url: string | null;
  connected: boolean;
  bridgeReady: boolean;
  waitingForPatient: boolean;
  onOpen: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
};

// Step 2 — Pair the patient device. The LAN code + QR are minted automatically
// on entry (no button); the patient scans it (or, in dev, auto-connects on
// localhost). Minting only opens pairing — it does not start EEG streaming, which
// begins later in the Live step. Never hard-gated: Continue advances whether or
// not a patient has paired yet.
export function PairDeviceStep({ code, url, connected, bridgeReady, waitingForPatient, onOpen, onNext, onBack }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (url) QRCode.toDataURL(url).then(setQr);
    else setQr(null);
  }, [url]);

  // Mint the pairing code as soon as the bridge is ready and none exists yet.
  useEffect(() => {
    if (bridgeReady && !code) void onOpen();
  }, [bridgeReady, code, onOpen]);

  return (
    <div className="content">
      <div className="panel-title">Pair patient device</div>
      {!bridgeReady && (
        <div className="alert">Session control needs the desktop app (run <code>npm run dev</code> in clinician-console).</div>
      )}

      {bridgeReady && !code && (
        <p className="pairing-status">Preparing pairing code…</p>
      )}

      {code && (
        <div className="pairing-active">
          {qr && <img className="pairing-qr" src={qr} alt="Session pairing QR code" width={180} height={180} />}
          <div className="pairing-detail">
            <p className="pairing-code">{code}</p>
            {connected
              ? <p className="pairing-status pairing-status--ok">✓ Patient connected</p>
              : <p className="pairing-status">Waiting for patient to scan…</p>}
            <p className="ws-sub">Dev: a patient tab on this machine auto-connects over localhost.</p>
          </div>
        </div>
      )}

      {code && (
        <div className="pairing-instructions">
          <div className="pairing-instructions-title">Start on the patient's computer</div>
          <ol className="pairing-steps">
            <li>Open a web browser on the patient's computer (same clinic Wi-Fi).</li>
            <li>Scan the QR code with the tablet camera, or go to:{" "}
              {url && <code className="pairing-url">{url}</code>}</li>
            <li>If prompted, enter the session code <strong>{code}</strong>.</li>
            <li>The game loads and shows “Waiting to begin”. Return here and press <strong>Continue ▶</strong>, then start the session in the Live step.</li>
          </ol>
        </div>
      )}

      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Signal check</button>
        <span className="spacer" style={{ flex: 1 }} />
        <div className="gate-col">
          <button className="btn btn-primary" onClick={onNext} disabled={waitingForPatient}>Continue ▶</button>
          {waitingForPatient && <WaitingSpinner label="Waiting for patient…" />}
        </div>
      </div>
    </div>
  );
}
