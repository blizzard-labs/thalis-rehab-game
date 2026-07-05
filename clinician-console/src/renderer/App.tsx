import { useState } from "react";
import type { PatientStore } from "../data/store";
import type { ScoreStore } from "../scoring/scoreStore";
import type { EegQualityStore } from "../scoring/eegQualityStore";
import type { ConnectionState } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import { Roster } from "./Roster";
import { Setup } from "./Setup";
import { PatientWorkspace, type WorkspaceTab } from "./PatientWorkspace";
import { PairingPanel, type PairingApi, type SessionInfo } from "./PairingPanel";
import type { Patient } from "../data/types";

// The preload bridge (window.neuroreach) exposes the LAN pairing API in the
// Electron runtime; it is absent under jsdom, so the panel is guarded below.
function pairingApi(): PairingApi | null {
  const nr = (window as unknown as { neuroreach?: PairingApi }).neuroreach;
  return nr && typeof nr.startSession === "function" ? nr : null;
}

// The EEG source (sim/live) is chosen by the PairingPanel toggle, not derived
// from the patient, so it is omitted here and injected on Start Session.
function sessionInfoFor(patient: Patient): Omit<SessionInfo, "source"> {
  return {
    patientFirstName: patient.name.split(" ")[0],
    affectedSide: patient.affectedSide.toLowerCase() as "left" | "right",
    mode: patient.mode,
  };
}

type Props = {
  patientStore: PatientStore;
  scoreStore: ScoreStore;
  qualityStore: EegQualityStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
};

type View =
  | { name: "roster" }
  | { name: "setup"; id: string }
  | { name: "workspace"; id: string; tab: WorkspaceTab };

// Top-level console shell + navigation. Lightweight view-state router (no
// react-router dependency): roster (C1) → setup (C2) → patient workspace
// holding C3/C4/C5 as tabs.
export function App({ patientStore, scoreStore, qualityStore, connectionState, sidecarState }: Props) {
  const [view, setView] = useState<View>({ name: "roster" });
  const api = pairingApi();

  return (
    <div className="app-root">
      <div className="app-bar">
        <span className="app-title">NeuroReach Console</span>
        <span className="app-meta">Dr. Ortiz · Clinic A</span>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="app-badge">● Offline-OK</span>
      </div>

      {view.name === "roster" && (
        <Roster store={patientStore} onOpen={(id) => setView({ name: "workspace", id, tab: "history" })} />
      )}

      {view.name === "setup" && (
        <>
          {api && (
            <div className="pairing-card">
              <div className="panel-title">Pair patient device</div>
              <PairingPanel api={api} session={sessionInfoFor(patientStore.get(view.id)!)} />
            </div>
          )}
          <Setup
            qualityStore={qualityStore}
            patient={patientStore.get(view.id)!}
            onProceed={() => setView({ name: "workspace", id: view.id, tab: "live" })}
            onBack={() => setView({ name: "workspace", id: view.id, tab: "history" })}
          />
        </>
      )}

      {view.name === "workspace" && (
        <PatientWorkspace
          store={patientStore}
          patientId={view.id}
          scoreStore={scoreStore}
          qualityStore={qualityStore}
          connectionState={connectionState}
          sidecarState={sidecarState}
          tab={view.tab}
          onTab={(tab) => setView({ name: "workspace", id: view.id, tab })}
          onStartSession={() => setView({ name: "setup", id: view.id })}
          onExit={() => setView({ name: "roster" })}
        />
      )}
    </div>
  );
}
