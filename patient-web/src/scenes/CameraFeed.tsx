import { useEffect, useRef, useState } from "react";

import { acquireCamera } from "../net/sharedCamera";

const MIN_LUMA = 40; // 0..255 average; below this the frame is too dark

/**
 * Live webcam sidecar for the warm-up / calibration. Requests the patient-device
 * camera via getUserMedia and mirrors it (selfie view). Degrades gracefully to a
 * text placeholder when the camera is unavailable or permission is denied — and
 * when getUserMedia is absent entirely (e.g. jsdom under test).
 *
 * On hover the feed expands into a large, top-layer overlay that shows the WHOLE
 * captured frame (object-fit: contain) rather than the cropped sidecar view —
 * driven by a second <video> sharing the same MediaStream so the cover→contain
 * swap animates cleanly and escapes the sidecar's overflow clip.
 *
 * When `framing` is set (calibration pre-flight), it also runs a lightweight,
 * browser-local framing heuristic — stream live + usable dimensions + adequate
 * luminance sampled from a hidden canvas — and reports the pass/fail through
 * `onFramingReady` so the caller can gate its "I'm in frame" control.
 */
export function CameraFeed({
  recording = false,
  framing = false,
  onFramingReady,
}: {
  recording?: boolean;
  /** Enable the framing-readiness heuristic and report it via onFramingReady. */
  framing?: boolean;
  onFramingReady?: (ready: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const expandRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Latest onFramingReady in a ref so the sampler effect need not depend on an
  // unstable inline callback (which would restart the loop each render).
  const readyCb = useRef(onFramingReady);
  readyCb.current = onFramingReady;

  // Acquire the camera ONCE and hold it for the component's life. Toggling
  // `framing` must not touch this effect — re-requesting getUserMedia mid-block
  // would flash/restart the feed.
  useEffect(() => {
    let release: (() => void) | undefined;
    let cancelled = false;
    acquireCamera().then(lease => {
      if (cancelled) { lease.release(); return; }
      release = lease.release;
      setStream(lease.stream);
    }).catch(() => { if (!cancelled) setError("Camera unavailable"); });
    return () => { cancelled = true; release?.(); };
  }, []);

  // Bind the shared stream to both the inline (cover) and hover-expand (contain)
  // videos whenever it (re)appears.
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
    if (expandRef.current) expandRef.current.srcObject = stream;
  }, [stream]);

  // Framing heuristic: while `framing`, sample average luminance from a tiny
  // hidden canvas and require a live track plus adequate brightness. Reports the
  // absence of a camera as "not ready" so the caller can fall back to skip.
  useEffect(() => {
    if (!framing) return;
    if (error) { readyCb.current?.(false); return; }
    if (!stream) return;
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
          const isLive = stream.getVideoTracks()[0]?.readyState === "live";
          readyCb.current?.(Boolean(isLive) && luma >= MIN_LUMA);
        }
      }
      raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf);
  }, [framing, stream, error]);

  return (
    <div className="cal-camera" data-testid="camera-feed">
      {error ? (
        <div className="cal-camera__placeholder">{error}</div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted />
          {/* Hover-expand overlay: same stream, whole frame, top layer. */}
          <div className="cal-camera__expand" aria-hidden="true">
            <video ref={expandRef} autoPlay playsInline muted />
          </div>
        </>
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {recording && (
        <div className="cal-rec" data-testid="rec-indicator" aria-label="Live camera preview">
          <span className="cal-rec__dot" />
          LIVE
        </div>
      )}
    </div>
  );
}

export default CameraFeed;
