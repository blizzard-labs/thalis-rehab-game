import { useEffect } from "react";
import type { PatientLink } from "./usePatientLink";
import { acquireCamera } from "./sharedCamera";
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

    let release: (() => void) | undefined;
    const publisher = createCameraPublisher({
      getStream: async () => {
        const lease = await acquireCamera();
        release = lease.release;
        return lease.stream;
      },
      releaseStream: () => release?.(),
      createPeer: () => new RTCPeerConnection({ iceServers: [] }), // host candidates only
      send: sendSignaling,
    });

    subscribeSignaling((msg) => {
      void publisher.handleSignaling(msg);
    });

    publisher.start().catch((err) => {
      // no camera / permission denied / no RTCPeerConnection -> stay EEG-only
      publisher.stop();
      console.warn("camera publish failed; continuing EEG-only:", err);
    });

    return () => {
      publisher.stop();
    };
  }, [enabled, sendSignaling, subscribeSignaling]);
}
