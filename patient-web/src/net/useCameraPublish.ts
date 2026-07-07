import { useEffect } from "react";
import type { PatientLink } from "./usePatientLink";
import { createCameraPublisher } from "./cameraPublisher";

/**
 * Mounts the camera publisher for paired LAN sessions. Acquires the camera and
 * publishes over the paired socket's signaling channel; tears down on unmount /
 * session end. A denied/absent camera resolves to no publish (EEG-only) without
 * throwing — the session continues.
 */
export function useCameraPublish(link: PatientLink, enabled: boolean): void {
  const { sendSignaling, subscribeSignaling } = link;

  useEffect(() => {
    if (!enabled) return;

    const publisher = createCameraPublisher({
      getStream: () =>
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }),
      createPeer: () => new RTCPeerConnection({ iceServers: [] }), // host candidates only
      send: sendSignaling,
    });

    subscribeSignaling((msg) => {
      void publisher.handleSignaling(msg);
    });

    publisher.start().catch(() => {
      // no camera / permission denied / no RTCPeerConnection -> stay EEG-only
    });

    return () => {
      publisher.stop();
    };
  }, [enabled, sendSignaling, subscribeSignaling]);
}
