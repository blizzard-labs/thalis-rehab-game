import { useSyncExternalStore } from "react";
import type { ScoreStore, StoreState } from "../scoring/scoreStore";

export function useScoreStore(store: ScoreStore): StoreState {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
  );
}
