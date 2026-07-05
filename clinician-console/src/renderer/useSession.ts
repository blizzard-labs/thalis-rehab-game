import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionInfo } from "../main/lan/pairing";

type NeuroreachBridge = {
  open(s: SessionInfo): Promise<{ code: string; url: string }>;
  begin(source: SessionInfo["source"]): Promise<void>;
  end(): Promise<void>;
  setMode(mode: "band_power_only" | "csp_lda_blend"): Promise<void>;
  onPatientConnected(cb: () => void): void;
  onPatientDisconnected(cb: () => void): void;
};

function bridge(): NeuroreachBridge | null {
  const nr = (window as unknown as { neuroreach?: NeuroreachBridge }).neuroreach;
  return nr && typeof nr.open === "function" ? nr : null;
}

export function useSession() {
  const [source, setSource] = useState<"sim" | "live">("sim");
  const [code, setCode] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const nr = bridge();
  const bridgeReady = nr !== null;

  useEffect(() => {
    if (!nr) return;
    nr.onPatientConnected(() => setConnected(true));
    nr.onPatientDisconnected(() => setConnected(false));
  }, [nr]);

  const open = useCallback(async (base: Omit<SessionInfo, "source">) => {
    if (!nr) return;
    const r = await nr.open({ ...base, source: sourceRef.current });
    setCode(r.code);
    setUrl(r.url);
  }, [nr]);

  const begin = useCallback(async () => {
    if (!nr) return;
    await nr.begin(sourceRef.current);
  }, [nr]);

  const end = useCallback(async () => {
    if (!nr) return;
    await nr.end();
    setCode(null);
    setUrl(null);
    setConnected(false);
  }, [nr]);

  const setMode = useCallback(async (mode: "band_power_only" | "csp_lda_blend") => {
    if (!nr) return;
    await nr.setMode(mode);
  }, [nr]);

  return { source, setSource, code, url, connected, bridgeReady, open, begin, end, setMode };
}
