import { useEffect, useRef, useState } from "react";

/**
 * V2-2c framing-check. Browser-local, no ML: shows the patient's own camera with
 * a framing-guide overlay and gates the confirm button on a lightweight heuristic
 * (stream live + usable dimensions + adequate luminance sampled from a hidden
 * canvas). A skip path always advances so a denied/absent camera falls back to
 * EEG-only without blocking the session.
 */
const MIN_LUMA = 40; // 0..255 average; below this the frame is too dark

export function FramingCheckScene({ onConfirm }: { onConfirm: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      setError("Camera unavailable");
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    let raf = 0;

    const sample = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.videoWidth > 0 && v.videoHeight > 0) {
        const ctx = c.getContext("2d");
        if (ctx) {
          c.width = 32; c.height = 24;
          ctx.drawImage(v, 0, 0, 32, 24);
          const { data } = ctx.getImageData(0, 0, 32, 24);
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
          const luma = sum / (data.length / 4);
          const live = stream?.getVideoTracks()[0]?.readyState === "live";
          setReady(Boolean(live) && luma >= MIN_LUMA);
        }
      }
      raf = requestAnimationFrame(sample);
    };

    md.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        raf = requestAnimationFrame(sample);
      })
      .catch(() => setError("Camera unavailable"));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <main className="scene scene--framing">
      <h1 className="framing-title">Let's get you in frame</h1>
      <p className="framing-hint">Sit so your head, shoulders, and reaching arm fit inside the box.</p>
      <div className="framing-stage">
        {error ? (
          <div className="framing-placeholder">{error}</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="framing-video" />
        )}
        <div className="framing-guide" data-testid="framing-guide" aria-hidden="true" />
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
      <div className="framing-actions">
        <button
          type="button"
          className="btn"
          data-testid="framing-skip"
          onClick={onConfirm}
        >
          Skip (no camera)
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="framing-confirm"
          disabled={!ready}
          onClick={onConfirm}
        >
          I'm in frame ▶
        </button>
      </div>
    </main>
  );
}

export default FramingCheckScene;
