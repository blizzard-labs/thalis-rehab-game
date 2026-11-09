import { useEffect, useRef, useState } from "react";
import type { MotionSample } from "./motion";
import type { Side } from "./session";

export function useMotionCamera(enabled: boolean, side: Side) {
  const [status, setStatus] = useState("Opening camera…");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const sample = useRef<MotionSample | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let media: MediaStream | undefined;
    let worker: Worker | undefined;
    let timer = 0;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const release = () => {
      stopped = true;
      window.clearInterval(timer);
      worker?.terminate();
      media?.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      sample.current = null;
    };
    const fail = (message: string) => {
      if (!stopped) { release(); setStream(null); setStatus(message); }
    };
    async function start() {
      setStatus("Opening camera…");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs localhost or HTTPS.");
      media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
      if (stopped) { media.getTracks().forEach(t => t.stop()); return; }
      media.getVideoTracks()[0].onended = () => fail("Camera disconnected. Reconnect it or continue with one button.");
      video.srcObject = media;
      await video.play();
      if (stopped) return;
      setStream(media);
      setStatus("Loading local pose tracking…");
      worker = new Worker("/vision-wasm/pose-worker.js");
      let busy = false, ready = false, lastVideoTime = -1;
      worker.onerror = () => fail("Pose tracking is unavailable. Try one-button play.");
      worker.onmessage = ({ data }) => {
        if (stopped) return;
        if (data.kind === "error") { fail(data.message); return; }
        if (data.kind === "ready") { ready = true; setStatus("Place your shoulder, wrist, and hip in view."); }
        if (data.kind === "sample") {
          busy = false;
          sample.current = data.point ? { point: data.point, time: data.time } : null;
          setStatus(data.point ? "Arm in view" : "Move your shoulder, wrist, and hip into view.");
        }
      };
      worker.postMessage({ kind: "open" });
      timer = window.setInterval(async () => {
        if (!ready || busy || video.readyState < 2 || video.currentTime === lastVideoTime || document.hidden) return;
        lastVideoTime = video.currentTime;
        busy = true;
        try {
          const time = performance.now();
          const frame = await createImageBitmap(video);
          if (stopped) { frame.close(); return; }
          worker?.postMessage({ kind: "frame", frame, time, side }, [frame]);
        } catch { fail("Camera frames could not be read. Try one-button play."); }
      }, 80);
    }
    void start().catch(error => fail(error?.name === "NotAllowedError"
      ? "Camera permission was declined. You can play with one button."
      : "Camera unavailable. Check that a webcam is connected and available to this browser."));
    return () => { release(); setStream(null); };
  }, [enabled, side]);
  function latest() {
    const value = sample.current;
    return value && performance.now() - value.time < 650 ? value.point : null;
  }
  return { status, stream, latest };
}
