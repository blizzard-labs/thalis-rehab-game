import { useEffect, useRef, useState } from "react";

/**
 * Live webcam sidecar for the warm-up. Requests the patient-device camera via
 * getUserMedia and mirrors it (selfie view). Degrades gracefully to a text
 * placeholder when the camera is unavailable or permission is denied — and when
 * getUserMedia is absent entirely (e.g. jsdom under test).
 */
export function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      setError("Camera unavailable");
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;

    md.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setError("Camera unavailable"));

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="cal-camera" data-testid="camera-feed">
      {error ? (
        <div className="cal-camera__placeholder">{error}</div>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted />
      )}
    </div>
  );
}

export default CameraFeed;
