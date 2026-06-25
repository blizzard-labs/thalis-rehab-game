import { useState } from "react";
import type { PatientStore } from "../data/store";
import { useSyncExternalStore } from "react";

type Props = { store: PatientStore; patientId: string };

// C4 — clinical scales entry (Assessments tab). Clinician enters formal
// FMA-UE (0–66) / ARAT (0–57); proxy metrics on the History & Trends tab are
// cross-referenced against these. Export to CSV (de-identified per specsv2 §11).
export function Assessments({ store, patientId }: Props) {
  // re-render on store mutation
  useSyncExternalStore((cb) => store.subscribe(cb), () => store.list());
  const patient = store.get(patientId)!;

  const [date, setDate] = useState("");
  const [fma, setFma] = useState("");
  const [arat, setArat] = useState("");

  const canAdd = date && fma !== "" && arat !== "";

  const add = () => {
    if (!canAdd) return;
    store.addScore(patientId, { date, fmaUe: Number(fma), arat: Number(arat) });
    setDate(""); setFma(""); setArat("");
  };

  const exportCsv = () => {
    const rows = [["date", "FMA_UE", "ARAT"], ...patient.scores.map((s) => [s.date, String(s.fmaUe), String(s.arat)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clinical-scales-${patientId.replace("#", "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="content">
      <div className="panel">
        <div className="panel-title">Clinical scales (entered)</div>
        <table className="table">
          <thead>
            <tr><th>Date</th><th>FMA-UE / 66</th><th>ARAT / 57</th></tr>
          </thead>
          <tbody>
            {patient.scores.map((s) => (
              <tr key={s.date}>
                <td>{s.date}</td>
                <td>{s.fmaUe}</td>
                <td>{s.arat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-title">Add score</div>
        <div className="roster-tools" style={{ flexWrap: "wrap", gap: 14 }}>
          <label className="chk">Date
            <input aria-label="date" type="date" className="num-input" style={{ width: 150 }} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="chk">FMA-UE
            <input aria-label="FMA-UE" type="number" min={0} max={66} className="num-input" value={fma} onChange={(e) => setFma(e.target.value)} />
          </label>
          <label className="chk">ARAT
            <input aria-label="ARAT" type="number" min={0} max={57} className="num-input" value={arat} onChange={(e) => setArat(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={!canAdd} onClick={add}>+ Add score</button>
          <button className="btn" onClick={exportCsv}>↓ Export PDF/CSV</button>
        </div>
      </div>
    </div>
  );
}
