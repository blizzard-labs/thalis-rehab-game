import { useState } from "react";
import { ReportButton } from "../reports/ReportReader";
import { gameNames, sourceNames, type Game } from "./session";
import { gameDetails } from "./catalog";
import { PatientIdentity, PatientPerformance } from "./ClinicalPanels";
import {
  checkReportAccess,
  duration,
  type Participant,
  type Visit,
} from "./station";

export function PatientOverview({
  person,
  visits,
  loaded,
  busy,
  game,
  setGame,
  protocol,
  launch,
  note,
  assessment,
  remove,
}: {
  person: Participant;
  visits: Visit[];
  loaded: boolean;
  busy: boolean;
  game: Game;
  setGame: (g: Game) => void;
  protocol: (p: Participant["protocol"]) => void;
  launch: () => void;
  note: (visit: Visit, value: string) => void;
  assessment: (fma: number, arat: number) => void;
  remove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const reader = {
    name: person.name,
    id: person.id,
    assessments: person.assessments,
  };
  const latest = person.assessments[person.assessments.length - 1];
  return (
    <>
      <PatientIdentity person={person}>
        {loaded && (
          <ReportButton
            reader={reader}
            visits={visits}
            authorize={checkReportAccess}
          />
        )}
      </PatientIdentity>
      <PatientPerformance
        visits={visits}
        loaded={loaded}
        setup={
          <section className="cl-card cl-setup">
            <div className="cl-card-title">
              <h2>Session setup</h2>
            </div>
            <div className="cl-form-grid">
              <label>
                Game
                <select
                  aria-label="Game"
                  disabled={busy}
                  value={game}
                  onChange={(e) => setGame(e.target.value as Game)}
                >
                  {Object.entries(gameNames).map(([id, n]) => (
                    <option value={id} key={id}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Input
                <select
                  aria-label="Input"
                  disabled={busy}
                  value={person.protocol.source}
                  onChange={(e) =>
                    protocol({
                      ...person.protocol,
                      source: e.target
                        .value as Participant["protocol"]["source"],
                    })
                  }
                >
                  {Object.entries(sourceNames).map(([id, n]) => (
                    <option value={id} key={id}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Session length
                <select
                  aria-label="Session length"
                  disabled={busy}
                  value={person.protocol.schedule ?? "short"}
                  onChange={(e) =>
                    protocol({
                      ...person.protocol,
                      schedule: e.target
                        .value as Participant["protocol"]["schedule"],
                    })
                  }
                >
                  <option value="short">5 minutes</option>
                  <option value="clinic">
                    Two 9-minute blocks with a rest
                  </option>
                </select>
              </label>
              <label>
                Pace
                <select
                  aria-label="Pace"
                  value={person.protocol.easy ? "gentle" : "standard"}
                  disabled={busy}
                  onChange={(e) =>
                    protocol({
                      ...person.protocol,
                      easy: e.target.value === "gentle",
                    })
                  }
                >
                  <option value="gentle">Gentle</option>
                  <option value="standard">Standard</option>
                </select>
              </label>
            </div>
            <div className="cl-launch">
              <div>
                <b>Patient device</b>
                <small>
                  Create a private link and QR code. Monitor the patient's
                  screen here.
                </small>
              </div>
              <button className="cl-primary" disabled={busy} onClick={launch}>
                Start supervised session
              </button>
            </div>
          </section>
        }
        assessments={
          <section className="cl-card">
            <div className="cl-card-title">
              <h2>Clinical assessments</h2>
              <span>Staff-entered</span>
            </div>
            <dl className="cl-assessment">
              <div>
                <dt>FMA-UE</dt>
                <dd>
                  {latest?.fma ?? "—"} <small>/ 66</small>
                </dd>
              </div>
              <div>
                <dt>ARAT</dt>
                <dd>
                  {latest?.arat ?? "—"} <small>/ 57</small>
                </dd>
              </div>
            </dl>
            <p className="cl-muted">
              {latest
                ? "Recorded " + latest.date
                : "No assessment recorded yet."}
            </p>
            <details>
              <summary>Record assessment</summary>
              <form
                className="cl-form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  assessment(Number(data.get("fma")), Number(data.get("arat")));
                }}
              >
                <label>
                  FMA-UE
                  <input name="fma" type="number" required min="0" max="66" />
                </label>
                <label>
                  ARAT
                  <input name="arat" type="number" required min="0" max="57" />
                </label>
                <button disabled={busy}>Save assessment</button>
              </form>
            </details>
            {person.assessments.length > 0 && (
              <details>
                <summary>Assessment history</summary>
                <ul>
                  {person.assessments
                    .slice()
                    .reverse()
                    .map((a, i) => (
                      <li key={i}>
                        {a.date} · FMA-UE {a.fma} · ARAT {a.arat}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </section>
        }
      />
      <section className="cl-card">
        <div className="cl-card-title">
          <h2>Session history</h2>
          <span>{loaded ? visits.length + " recorded" : "Loading…"}</span>
        </div>
        {!visits.length && (
          <p className="cl-muted">
            {loaded ? "No sessions recorded yet." : "Opening patient history…"}
          </p>
        )}
        {visits.length > 0 && (
          <div className="cl-table-scroll">
            <table className="cl-visits">
              <thead>
                <tr>
                  {["Visit", "Status", "Active time", "Activity", "Review"].map(
                    (s) => (
                      <th key={s}>{s}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{gameNames[v.record.game]}</strong>
                      <small>
                        {new Date(v.record.started).toLocaleString()} ·{" "}
                        {v.record.sources
                          .map((s) => sourceNames[s])
                          .join(" → ")}
                      </small>
                    </td>
                    <td>
                      <span className="cl-pill">
                        {v.status === "playing" ? "Unfinished" : v.status}
                      </span>
                      {v.record.usedSyntheticEeg ||
                      v.record.calibration?.synthetic ? (
                        <small>Synthetic EEG</small>
                      ) : null}
                    </td>
                    <td>{duration(v.record.elapsed)}</td>
                    <td>
                      {v.record.actions} actions
                      <small>
                        {v.record.rewards}{" "}
                        {v.record.rewards === 1
                          ? gameDetails[v.record.game].unit
                          : gameDetails[v.record.game].units}
                      </small>
                    </td>
                    <td>
                      <div className="cl-history-links">
                        <ReportButton
                          reader={reader}
                          visit={v}
                          visits={visits}
                          authorize={checkReportAccess}
                        />
                        <a
                          href={"/api/staff/reports/" + v.id + ".csv"}
                          download
                        >
                          Event CSV
                        </a>
                      </div>
                      <details>
                        <summary>Session feedback</summary>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            note(
                              v,
                              String(
                                new FormData(e.currentTarget).get("note") ?? "",
                              ),
                            );
                          }}
                        >
                          <label>
                            Participant or staff observations
                            <textarea
                              name="note"
                              defaultValue={v.note}
                              maxLength={4000}
                            />
                          </label>
                          <button disabled={busy}>Save feedback</button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <details className="cl-admin">
        <summary>Remove participant</summary>
        <p>
          This deletes this participant and their sessions from this station.
        </p>
        <button
          disabled={busy}
          onClick={() => (confirm ? remove() : setConfirm(true))}
        >
          {confirm ? "Confirm deletion" : "Delete participant"}
        </button>
        {confirm && (
          <button onClick={() => setConfirm(false)}>Keep participant</button>
        )}
      </details>
    </>
  );
}
