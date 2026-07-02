import { join } from "node:path";
import type { SidecarOptions } from "./sidecar";
import { detectLanIpv4 } from "./lan/netUtil";
import { loadOrCreateCert } from "./lan/cert";
import type { LanServerOptions } from "./lan/lanServer";

export const SIDECAR_PORT = 8765;
export const SIDECAR_WS_URL = `ws://localhost:${SIDECAR_PORT}`;

export const LAN_PORT = 8443;

export function lanServerOptions(
  repoRoot: string,
  userDataDir: string,
): Omit<LanServerOptions, "createSidecarSocket"> {
  return {
    host: detectLanIpv4(),
    port: LAN_PORT,
    patientDistDir: join(repoRoot, "patient-web", "dist"),
    cert: loadOrCreateCert(userDataDir),
    sidecarWsUrl: SIDECAR_WS_URL,
  };
}

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
