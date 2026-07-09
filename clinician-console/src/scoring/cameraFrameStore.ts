import type { CameraFrame } from "./cameraFrameMessage";

// Latest-only store for camera_frame frames (clinician camera feed). Mirrors
// EegQualityStore's stable-snapshot pattern so it plugs into
// useSyncExternalStore without looping.

export type CameraFrameState = { latest: CameraFrame | null };

const EMPTY: CameraFrameState = { latest: null };

export class CameraFrameStore {
  private subscribers = new Set<(s: CameraFrameState) => void>();
  private snapshot: CameraFrameState = EMPTY;

  push(frame: CameraFrame): void {
    this.snapshot = { latest: frame };
    for (const cb of this.subscribers) cb(this.snapshot);
  }

  getState(): CameraFrameState {
    return this.snapshot;
  }

  subscribe(cb: (s: CameraFrameState) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}
