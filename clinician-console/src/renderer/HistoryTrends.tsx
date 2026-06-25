import type { Patient } from "../data/types";
import { computeKpis } from "../data/selectors";

type Props = { patient: Patient };

// C4 — History & Trends. Week-over-week proxy metrics (classifier accuracy,
// peak ERD, elbow ROM, adaptive game level) cross-referenced against the formal
// clinical scales entered on the Assessments tab. specsv2 §11 / wireframe C4.
export function HistoryTrends({ patient }: Props) {
  const k = computeKpis(patient);
  return (
    <div className="content">
      <div className="kpi-grid">
        <KpiTile label="Classifier accuracy" value={`${k.classifierAccuracy.value}%`} delta={k.classifierAccuracy.delta} suffix="% over window" />
        <KpiTile label="Peak ERD (C3)" value={`${k.peakErdC3.value}%`} delta={k.peakErdC3.delta} invert suffix="% stronger" />
        <KpiTile label="Elbow ROM" value={`${k.elbowRom.value}°`} delta={k.elbowRom.delta} suffix="°" />
        <div className="kpi">
          <div className="kpi-label">Game level</div>
          <div className="kpi-value">{k.gameLevel}</div>
          <div className="kpi-delta flat">adaptive</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Proxy metrics vs clinical assessments — over weeks</div>
        <TrendChart patient={patient} />
        <div className="legend">
          <span><span className="dot" style={{ background: "#7fb2e0" }} /> classifier acc</span>
          <span><span className="dot" style={{ background: "#f1b06f" }} /> peak ERD</span>
          <span><span className="dot" style={{ background: "#5fbf8f" }} /> elbow ROM</span>
          <span><span className="dot" style={{ background: "#d68fd6" }} /> FMA-UE / ARAT (entered)</span>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, delta, suffix, invert }: { label: string; value: string; delta: number; suffix?: string; invert?: boolean }) {
  const improving = invert ? delta < 0 : delta > 0;
  const sign = delta > 0 ? "+" : "";
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className={`kpi-delta ${delta === 0 ? "flat" : improving ? "" : "flat"}`}>
        {delta === 0 ? "—" : `${sign}${delta}${suffix ?? ""}`}
      </div>
    </div>
  );
}

// Normalized multi-line chart. Each series scaled to its own min/max so the
// three different units share one frame; clinical scores marked as dots.
function TrendChart({ patient }: Props) {
  const w = 720, h = 220, pad = 16;
  const t = patient.trends;
  if (t.length < 2) return <div className="placeholder">not enough history yet</div>;

  const xs = t.map((_, i) => pad + (i / (t.length - 1)) * (w - 2 * pad));
  const line = (vals: number[], color: string) => {
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const pts = vals
      .map((v, i) => `${xs[i]},${h - pad - ((v - min) / span) * (h - 2 * pad)}`)
      .join(" ");
    return <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />;
  };

  // clinical scores aligned by date order onto the x range
  const scoreDots = patient.scores.map((s, i) => {
    const x = pad + (i / Math.max(1, patient.scores.length - 1)) * (w - 2 * pad);
    const y = h - pad - (s.fmaUe / 66) * (h - 2 * pad);
    return <circle key={s.date} cx={x} cy={y} r={4} fill="#d68fd6" />;
  });

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {line(t.map((p) => p.classifierAccuracy), "#7fb2e0")}
      {line(t.map((p) => p.peakErdC3), "#f1b06f")}
      {line(t.map((p) => p.elbowRom), "#5fbf8f")}
      {scoreDots}
    </svg>
  );
}
