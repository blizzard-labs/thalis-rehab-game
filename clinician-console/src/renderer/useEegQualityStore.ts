import { useSyncExternalStore } from "react";
import type { EegQualityStore, QualityState } from "../scoring/eegQualityStore";

export function useEegQualityStore(store: EegQualityStore): QualityState {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
  );
}
