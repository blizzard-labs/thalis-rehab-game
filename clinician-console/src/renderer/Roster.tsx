import { useState } from "react";
import type { PatientStore } from "../data/store";

type Props = {
  store: PatientStore;
  onOpen: (patientId: string) => void;
};

// C1 — Patient roster / worklist (session start). Mirrors an EMR worklist:
// search, pick a patient, open their workspace. Local-first; clinician role
// (full access — kiosk peers never see this screen). specsv2 wireframe C1.
export function Roster({ store, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const patients = store.search(query);

  return (
    <div className="content">
      <div className="roster-tools">
        <input
          className="input"
          placeholder="Search patients…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary" disabled title="prototype: roster is seeded">
          + New patient
        </button>
      </div>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Affected</th>
              <th>Mode</th>
              <th>Last session</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id} onClick={() => onOpen(p.id)}>
                <td>
                  <strong>{p.name}</strong>{" "}
                  <span className="ws-sub">{p.id}</span>
                </td>
                <td>{p.affectedSide}</td>
                <td>
                  <span className="pill mode">{p.mode}</span>
                </td>
                <td>{p.lastSession}</td>
                <td>
                  <span className={`trend ${p.trend}`}>
                    {p.trend === "improving" ? "▲" : p.trend === "steady" ? "▬" : "◆"} {p.trend}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
