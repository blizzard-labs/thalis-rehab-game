import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Point } from "./motion";
import { reachProgress } from "./motion";
import { useMotionCamera } from "./useMotionCamera";
import type { PracticeRound, Side } from "./session";

export function SensorSession({ round, side, end, play }: {
  round: PracticeRound; side: Side; end: () => void;
  play: (observation: () => number | null, status?: string) => ReactNode;
}) {
  const [source, setSource] = useState(round.source);
  const [rest, setRest] = useState<Point | null>(null);
  const [reach, setReach] = useState<Point | null>(null);
  const [hint, setHint] = useState("");
  const cameraNeeded = source === "camera" || source === "blended";
  const camera = useMotionCamera(cameraNeeded, side);
  const preview = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (preview.current) preview.current.srcObject = camera.stream; }, [camera.stream]);
  function capture() {
    const point = camera.latest();
    if (!point) { setHint("Wait until your arm is in view, then try again."); return; }
    if (!rest) { setRest(point); setHint(""); return; }
    if (reachProgress(rest, point, point) === null) {
      setHint("The two positions are too close for the camera to distinguish. Try a different comfortable movement or use one button."); return;
    }
    setReach(point); setHint("");
  }
  function manual() { round.switchToButton(); setSource("button"); }
  if (cameraNeeded && !reach) return <section className="practice-panel"><h1>Set your reach</h1>
    <p>Keep your {side} shoulder, wrist, and hip in view. Choose a movement that feels comfortable.</p>
    <video ref={preview} autoPlay playsInline muted className="practice-preview" aria-label="Mirrored camera preview" />
    <p role="status">{camera.status}</p>
    <p>{rest ? "Move your hand to a comfortable reach and hold it there." : "Let your arm rest in its starting position."}</p>
    <div className="button-row"><button className="primary" onClick={capture}>{rest ? "Set comfortable reach" : "Set resting position"}</button>
      <button onClick={manual}>Use one button</button><button onClick={end}>End session</button></div>
    {hint && <p role="alert">{hint}</p>}
  </section>;
  const observation = () => {
    const point = camera.latest();
    return rest && reach && point ? reachProgress(rest, reach, point) : null;
  };
  return <>{play(observation, cameraNeeded ? camera.status : undefined)}
    {source !== "button" && <div className="input-switch"><button onClick={manual}>Continue with one button</button></div>}</>;
}
