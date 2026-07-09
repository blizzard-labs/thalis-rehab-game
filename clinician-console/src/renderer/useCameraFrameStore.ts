import { useSyncExternalStore } from "react";
import type { CameraFrameStore, CameraFrameState } from "../scoring/cameraFrameStore";

export function useCameraFrameStore(store: CameraFrameStore): CameraFrameState {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
  );
}
