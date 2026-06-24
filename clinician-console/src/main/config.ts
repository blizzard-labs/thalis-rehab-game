import { join } from "node:path";
import type { SidecarOptions } from "./sidecar";

export const SIDECAR_PORT = 8765;
export const SIDECAR_WS_URL = `ws://localhost:${SIDECAR_PORT}`;

export function sidecarOptions(repoRoot: string): SidecarOptions {
  return {
    command: "conda",
    args: ["run", "-n", "eeg", "python", join("signal-engine", "run_ws_server.py")],
    cwd: repoRoot,
    readyPort: SIDECAR_PORT,
    maxRestarts: 3,
    readyTimeoutMs: 30000,
    probeIntervalMs: 500,
  };
}
