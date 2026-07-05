import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  code: string | null;
  url: string | null;
  connected: boolean;
  bridgeReady: boolean;
  onOpen: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
};

// Step 2 — Pair the patient device. Start Session mints the LAN code + QR; the
// patient scans it (or, in dev, auto-connects on localhost). Never hard-gated:
// Continue advances whether or not a patient has paired yet.
export function PairDeviceStep({ code, url, connected, bridgeReady, onOpen, onNext, onBack }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (url) QRCode.toDataURL(url).then(setQr);
    else setQr(null);
  }, [url]);

  return (
    <div className="content">
      <div className="panel-title">Pair patient device</div>
      {!bridgeReady && (
        <div className="alert">Session control needs the desktop app (run <code>npm run dev</code> in clinician-console).</div>
      )}

      {!code ? (
        <button className="btn btn-primary" disabled={!bridgeReady} onClick={onOpen}>Start Session</button>
      ) : (
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

      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Signal check</button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onNext}>Continue ▶</button>
      </div>
    </div>
  );
}
