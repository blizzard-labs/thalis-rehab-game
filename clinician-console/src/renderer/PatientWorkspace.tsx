import type { PatientStore } from "../data/store";
import { HistoryTrends } from "./HistoryTrends";
import { ProtocolEditor } from "./ProtocolEditor";
import { Assessments } from "./Assessments";

export type WorkspaceTab = "history" | "protocol" | "assessments";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "history", label: "History & Trends" },
  { id: "protocol", label: "Protocol" },
  { id: "assessments", label: "Assessments" },
];

type Props = {
  store: PatientStore;
  patientId: string;
  tab: WorkspaceTab;
  onTab: (t: WorkspaceTab) => void;
  onStartSession: () => void;
  onExit: () => void;
};

// Patient workspace — the tabbed shell holding C3 (live), C4 (history +
// assessments) and C5 (protocol). Header carries the patient bio shown across
// all clinician screens. specsv2 wireframe C3/C4/C5 share this chrome.
export function PatientWorkspace(props: Props) {
  const { store, patientId, tab, onTab } = props;
  const p = store.get(patientId);
  if (!p) return <div className="content">Unknown patient {patientId}</div>;

  return (
    <>
      <div className="ws-header">
        <button className="link-btn" onClick={props.onExit}>← Roster</button>
        <div>
          <div className="ws-bio">{p.name} · {p.id}</div>
          <div className="ws-sub">
            {p.sex} {p.age} · {p.diagnosis} · onset {p.onsetMonths}mo ·{" "}
            {p.contraindications || "no contraindications"} · enrolled{" "}
            {new Date(p.enrolled).toLocaleDateString(undefined, { month: "short", year: "numeric" })} ·{" "}
            {p.sessionCount} sessions
          </div>
        </div>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={props.onStartSession}>Start session ▶</button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "history" && <HistoryTrends patient={p} />}
      {tab === "protocol" && <ProtocolEditor store={store} patientId={patientId} />}
      {tab === "assessments" && <Assessments store={store} patientId={patientId} />}
    </>
  );
}
