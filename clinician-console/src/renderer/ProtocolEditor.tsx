import { useState } from "react";
import type { PatientStore } from "../data/store";
import { ALL_MINI_GAMES, type MiniGame, type Protocol, type ReachAxis, type SessionMode } from "../data/types";

type Props = { store: PatientStore; patientId: string };

const MODES: SessionMode[] = ["Covert MI", "Blended", "Active"];

// C5 — Protocol & mode editor. Per-patient config, information-forward (nothing
// buried under menus). Mode/weight, reach axis, trial structure, enabled
// mini-games. Auto-switch note surfaces the §6.5 calibration quality gate.
export function ProtocolEditor({ store, patientId }: Props) {
  const patient = store.get(patientId)!;
  const [p, setP] = useState<Protocol>({ ...patient.protocol, enabledGames: [...patient.protocol.enabledGames] });
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<Protocol>) => { setP((cur) => ({ ...cur, ...patch })); setSaved(false); };
  const toggleGame = (g: MiniGame) =>
    set({ enabledGames: p.enabledGames.includes(g) ? p.enabledGames.filter((x) => x !== g) : [...p.enabledGames, g] });

  const save = () => { store.updateProtocol(patientId, p); setSaved(true); };

  return (
    <div className="content">
      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Session mode &amp; weighting</div>
          <div className="form-row">
            <span className="form-label">Mode</span>
            <div className="seg">
              {MODES.map((m) => (
                <button key={m} className={p.mode === m ? "active" : ""} onClick={() => set({ mode: m })}>{m}</button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <span className="form-label">Brain (EEG) ↔ Movement weight</span>
            <span>
              <input
                aria-label="EEG weight" className="slider" type="range" min={0} max={1} step={0.1}
                value={p.eegWeight} onChange={(e) => set({ eegWeight: Number(e.target.value) })}
              />
              <span className="ws-sub"> EEG {p.eegWeight.toFixed(1)} · Move {(1 - p.eegWeight).toFixed(1)}</span>
            </span>
          </div>
          {p.autoSwitchedNote && <div className="alert">⚠ {p.autoSwitchedNote}</div>}

          <div className="panel-title" style={{ marginTop: 18 }}>Reach &amp; Collect — reach axis</div>
          <div className="form-row">
            <span className="form-label">Axis (drives the avatar / checkpoint orientation)</span>
            <div className="seg">
              {(["Horizontal", "Vertical"] as ReachAxis[]).map((a) => (
                <button key={a} className={p.reachAxis === a ? "active" : ""} onClick={() => set({ reachAxis: a })}>{a}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Trial structure</div>
          <NumRow label="Trials per block" value={p.trialsPerBlock} onChange={(v) => set({ trialsPerBlock: v })} />
          <NumRow label="Imagery window (s)" value={p.imageryWindowSec} step={0.5} onChange={(v) => set({ imageryWindowSec: v })} />
          <div className="form-row">
            <label className="form-label" htmlFor="rest">Rest interval (s)</label>
            <input id="rest" className="num-input" value={p.restIntervalSec} onChange={(e) => set({ restIntervalSec: e.target.value })} />
          </div>
          <NumRow label="Blocks per session" value={p.blocksPerSession} onChange={(v) => set({ blocksPerSession: v })} />
          <div className="form-row">
            <span className="form-label">Layout side (hemianopia)</span>
            <div className="seg">
              {(["Left", "Right"] as const).map((s) => (
                <button key={s} className={p.layoutSide === s ? "active" : ""} onClick={() => set({ layoutSide: s })}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Enabled mini-games</div>
        <div className="tag-list">
          {ALL_MINI_GAMES.map((g) => (
            <label key={g} className="chk">
              <input
                aria-label={g} type="checkbox"
                checked={p.enabledGames.includes(g)} onChange={() => toggleGame(g)}
              />
              {p.enabledGames.includes(g) ? "✓ " : ""}{g}
            </label>
          ))}
        </div>
      </div>

      <div className="roster-tools">
        {saved && <span className="trend improving">✓ saved</span>}
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={save}>Save protocol</button>
      </div>
    </div>
  );
}

function NumRow({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="form-row">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input id={id} aria-label={label} className="num-input" type="number" step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
