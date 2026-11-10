import { useEffect, useRef, useState } from "react";
import { medianWrist, type MotionSample } from "./motion";
import type { Side } from "./session";

export function useMotionCamera(enabled: boolean, side: Side, both = false) {
  const [status, setStatus] = useState("Opening camera…");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const other = useRef<MotionSample | null>(null);
  const bothArms = useRef(both);
  bothArms.current = both;
  const samples = useRef<MotionSample[]>([]);
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
      media?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      samples.current = [];
      other.current = null;
    };
    const fail = (message: string) => {
      if (!stopped) {
        release();
        setStream(null);
        setStatus(message);
      }
    };
    async function start() {
      setStatus("Opening camera…");
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera access needs localhost or HTTPS.");
      media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      if (stopped) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      media.getVideoTracks()[0].onended = () =>
        fail("Camera disconnected. Reconnect it or continue with one button.");
      video.srcObject = media;
      await video.play();
      if (stopped) return;
      setStream(media);
      setStatus("Loading local pose tracking…");
      worker = new Worker("/vision-wasm/pose-worker.js");
      let busy = false,
        ready = false,
        lastVideoTime = -1;
      worker.onerror = () =>
        fail("Pose tracking is unavailable. Try one-button play.");
      worker.onmessage = ({ data }) => {
        if (stopped) return;
        if (data.kind === "error") {
          fail(data.message);
          return;
        }
        if (data.kind === "ready") {
          ready = true;
          setStatus("Place your shoulder, wrist, and hip in view.");
        }
        if (data.kind === "sample") {
          busy = false;
          other.current = data.otherPoint
            ? { point: data.otherPoint, time: data.time }
            : null;
          if (data.point) {
            const previous = samples.current[samples.current.length - 1];
            if (previous && data.time - previous.time > 500)
              samples.current = [];
            samples.current.push({ point: data.point, time: data.time });
            if (samples.current.length > 5) samples.current.shift();
          } else {
            samples.current = [];
          }
          setStatus(
            bothArms.current
              ? data.point && data.otherPoint
                ? "Both arms in view"
                : "Keep both shoulders, wrists and hips in view."
              : data.point
                ? "Arm in view"
                : "Move your shoulder, wrist, and hip into view.",
          );
        }
      };
      worker.postMessage({ kind: "open" });
      timer = window.setInterval(async () => {
        if (
          !ready ||
          busy ||
          video.readyState < 2 ||
          video.currentTime === lastVideoTime ||
          document.hidden
        )
          return;
        lastVideoTime = video.currentTime;
        busy = true;
        try {
          const time = performance.now();
          const frame = await createImageBitmap(video);
          if (stopped) {
            frame.close();
            return;
          }
          worker?.postMessage({ kind: "frame", frame, time, side }, [frame]);
        } catch {
          fail("Camera frames could not be read. Try one-button play.");
        }
      }, 80);
    }
    void start().catch((error) =>
      fail(
        error?.name === "NotAllowedError"
          ? "Camera permission was declined. You can play with one button."
          : "Camera unavailable. Check that a webcam is connected and available to this browser.",
      ),
    );
    return () => {
      release();
      setStream(null);
    };
  }, [enabled, side]);
  function latest() {
    const value = samples.current[samples.current.length - 1];
    return value && performance.now() - value.time < 650 ? value.point : null;
  }
  const steady = () => medianWrist(samples.current, performance.now());
  // A shorter median in play keeps the net responsive. With fewer frames the
  // newest observation can aim the net, but one frame alone cannot complete a hold.
  function tracked() {
    const recent = samples.current.slice(-3);
    const newest = recent[recent.length - 1];
    const now = performance.now();
    if (!newest || now - newest.time > 500) return null;
    return medianWrist(recent, now) ?? newest;
  }
  const otherWrist = () =>
    other.current && performance.now() - other.current.time < 650
      ? other.current.point
      : null;
  return { status, stream, latest, steady, tracked, otherWrist };
}
