import { useState } from "react";
import type { PatientStore } from "../data/store";
import type { ScoreStore } from "../scoring/scoreStore";
import type { EegQualityStore } from "../scoring/eegQualityStore";
import type { ConnectionState } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import { Roster } from "./Roster";
import { PatientWorkspace, type WorkspaceTab } from "./PatientWorkspace";
import { SessionFlow } from "./SessionFlow";

type Props = {
  patientStore: PatientStore;
  scoreStore: ScoreStore;
  qualityStore: EegQualityStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
};

type View =
  | { name: "roster" }
  | { name: "session"; id: string }
  | { name: "workspace"; id: string; tab: WorkspaceTab };

// Top-level console shell + navigation. Lightweight view-state router (no
// react-router dependency): roster (C1) → guided session flow → patient
// workspace holding the between-session review tabs (C4/C5).
export function App({ patientStore, scoreStore, qualityStore, connectionState, sidecarState }: Props) {
  const [view, setView] = useState<View>({ name: "roster" });

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

      {view.name === "session" && (
        <SessionFlow
          patient={patientStore.get(view.id)!}
          scoreStore={scoreStore}
          qualityStore={qualityStore}
          connectionState={connectionState}
          sidecarState={sidecarState}
          onExit={() => setView({ name: "workspace", id: view.id, tab: "history" })}
        />
      )}

      {view.name === "workspace" && (
        <PatientWorkspace
          store={patientStore}
          patientId={view.id}
          tab={view.tab}
          onTab={(tab) => setView({ name: "workspace", id: view.id, tab })}
          onStartSession={() => setView({ name: "session", id: view.id })}
          onExit={() => setView({ name: "roster" })}
        />
      )}
    </div>
  );
}
