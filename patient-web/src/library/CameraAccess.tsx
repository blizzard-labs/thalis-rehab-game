import { useEffect, useState } from "react";
import type { useMotionCamera } from "../practice/useMotionCamera";
import { onExtensionMessage, sendControl } from "./bridge";

export function CameraAccess({ camera }: { camera: ReturnType<typeof useMotionCamera> }) {
  const [opening, setOpening] = useState(false);
  useEffect(() => onExtensionMessage((message) => {
    if (message.type !== "camera-permission-result") return;
    setOpening(false);
    camera.retry();
  }), [camera.retry]);
  if (!camera.problem) return null;
  return <div>
    {opening && <p role="status">Finish camera setup in the new tab, then choose Return to game.</p>}
    <button className="primary" onClick={() => {
      if (camera.inExtensionPanel) {
        setOpening(true);
        sendControl("camera-permission");
      } else camera.retry();
    }}>{camera.inExtensionPanel ? "Open camera setup" : "Try camera again"}</button>
  </div>;
}
