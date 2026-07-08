import { useSyncExternalStore } from "react";
import type { VisionHealthStore, VisionHealthState } from "../scoring/visionHealthStore";

export function useVisionHealthStore(store: VisionHealthStore): VisionHealthState {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
  );
}
