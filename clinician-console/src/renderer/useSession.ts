import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionInfo } from "../main/lan/pairing";

type NeuroreachBridge = {
  open(s: SessionInfo): Promise<{ code: string; url: string }>;
  getSource?(): Promise<"sim" | "live">;
  begin(source: SessionInfo["source"]): Promise<void>;
  end(): Promise<void>;
  setMode(mode: "band_power_only" | "csp_lda_blend"): Promise<void>;
  setFusionMode(mode: "A" | "B" | "C"): Promise<void>;
  setAffectedSide(side: "left" | "right"): Promise<void>;
  calibratePose(): Promise<void>;
  beginRomCalibration(): Promise<void>;
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
    let current = true;
    nr.getSource?.().then(value => { if (current) setSource(value); });
    nr.onPatientConnected(() => { if (current) setConnected(true); });
    nr.onPatientDisconnected(() => { if (current) setConnected(false); });
    return () => { current = false; };
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

  const setFusionMode = useCallback(async (mode: "A" | "B" | "C") => {
    if (!nr) return;
    await nr.setFusionMode(mode);
  }, [nr]);

  const setAffectedSide = useCallback(async (side: "left" | "right") => {
    if (!nr) return;
    await nr.setAffectedSide(side);
  }, [nr]);

  const calibratePose = useCallback(async () => {
    if (!nr) return;
    await nr.calibratePose();
  }, [nr]);

  const beginRomCalibration = useCallback(async () => {
    if (!nr) return;
    await nr.beginRomCalibration();
  }, [nr]);

  return { source, setSource, code, url, connected, bridgeReady, open, begin, end, setMode, setFusionMode, setAffectedSide, calibratePose, beginRomCalibration };
}
