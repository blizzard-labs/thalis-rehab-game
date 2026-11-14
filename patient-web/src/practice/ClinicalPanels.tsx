import type { ReactNode } from "react";
import { Brand } from "../brand/Brand";
import { gameNames, sourceNames, type PracticeRecord } from "./session";
import { gameDetails } from "./catalog";
import {
  duration,
  type DisplayState,
  type Participant,
  type Visit,
} from "./station";
import { combine } from "../reports/report";
import type { Metric } from "../reports/measurements";
import "./clinical.css";

const num = (n: number) => Number(n.toFixed(1)).toLocaleString();
export function StationHeader({
  live = false,
  children,
}: {
  live?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="cl-mast">
      <div className="cl-identity">
        <Brand />
        <span className="cl-workspace-name">Clinical workspace</span>
      </div>
      <div className="cl-mast-actions">
        {live && <span className="cl-live-label">Session monitor</span>}
        {children}
      </div>
    </header>
  );
}
export function MetricStrip({ items }: { items: [string, string, string][] }) {
  return (
    <dl className="cl-metrics">
      {items.map(([name, value, detail]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>
            <span>{value}</span>
            <small>{detail}</small>
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Point = { label: string; value: number | null };
export function ActivityChart({
  points,
  unit,
  empty,
  max,
}: {
  points: Point[];
  unit: string;
  empty: string;
  max?: number;
}) {
  const measured = points.filter((p) => p.value !== null);
  if (!measured.length) return <div className="cl-chart-empty">{empty}</div>;
  const high = Math.max(max ?? 0, 1, ...measured.map((p) => p.value!));
  const x = (i: number) => 43 + ((i + 0.5) / points.length) * 604;
  const y = (v: number) => 109 - (v / high) * 88;
  const width = Math.min(38, 360 / points.length);
  return (
    <svg
      className="cl-chart"
      viewBox="0 0 670 140"
      role="img"
      aria-label={
        unit +
        " · " +
        points
          .map(
            (p) =>
              p.label +
              ": " +
              (p.value === null ? "unavailable" : num(p.value)),
          )
          .join(", ")
      }
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1="40"
            x2="650"
            y1={y(high * f)}
            y2={y(high * f)}
            stroke="var(--nr-line)"
            strokeDasharray={f ? "3 4" : undefined}
          />
          <text x="32" y={y(high * f) + 4} textAnchor="end">
            {num(high * f)}
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <g key={i}>
          {p.value !== null && p.value > 0 && (
            <rect
              x={x(i) - width / 2}
              y={y(p.value)}
              width={width}
              height={109 - y(p.value)}
              rx="2"
              fill="var(--nr-blue)"
            >
              <title>
                {p.label} · {num(p.value)} {unit}
              </title>
            </rect>
          )}
          {(points.length <= 7 ||
            [0, Math.floor(points.length / 2), points.length - 1].includes(
              i,
            )) && (
            <text x={x(i)} y="130" textAnchor="middle">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function PatientPerformance({
  visits,
  loaded,
  setup,
  assessments,
}: {
  visits: Visit[];
  loaded: boolean;
  setup: ReactNode;
  assessments: ReactNode;
}) {
  const complete = visits
    .filter(
      (v) =>
        v.status === "complete" &&
        !v.record.usedSyntheticEeg &&
        !v.record.calibration?.synthetic,
    )
    .sort(
      (a, b) => Date.parse(a.record.started) - Date.parse(b.record.started),
    );
  const total = complete.reduce((n, v) => n + v.record.elapsed, 0),
    actions = complete.reduce((n, v) => n + v.record.actions, 0);
  const latest = complete[complete.length - 1];
  const results = new Map<
    PracticeRecord["game"],
    { visits: number; rewards: number }
  >();
  for (const { record } of complete) {
    const total = results.get(record.game) ?? { visits: 0, rewards: 0 };
    total.visits++;
    total.rewards += record.rewards;
    results.set(record.game, total);
  }
  const points = complete
    .slice(-7)
    .map((v) => ({
      label: new Date(v.record.started).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      value: v.record.elapsed / 60,
    }));
  return (
    <>
      <MetricStrip
        items={[
          [
            "Completed visits",
            loaded ? String(complete.length) : "—",
            "Recorded practice",
          ],
          [
            "Active practice",
            loaded ? duration(total) : "—",
            "Minutes : seconds",
          ],
          [
            "Logged actions",
            loaded ? String(actions) : "—",
            "Across completed visits",
          ],
          [
            "Latest visit",
            latest ? points[points.length - 1].label : "—",
            latest ? gameNames[latest.record.game] : "No completed visit",
          ],
        ]}
      />
      <div className="cl-workgrid">
        <div className="cl-stack">
          <section className="cl-card">
            <div className="cl-card-title">
              <h2>Practice activity</h2>
              <span>Active minutes · last 7 visits</span>
            </div>
            <ActivityChart
              points={points}
              unit="minutes"
              empty={
                loaded
                  ? "Completed visits will appear here."
                  : "Loading visit history…"
              }
            />
            {visits.some(
              (v) =>
                v.record.usedSyntheticEeg || v.record.calibration?.synthetic,
            ) && (
              <p className="cl-note">
                Synthetic EEG visits are listed in history and excluded from
                practice totals.
              </p>
            )}
          </section>
          {assessments}
        </div>
        {setup}
      </div>
      {results.size > 0 && (
        <section className="cl-card">
          <div className="cl-card-title">
            <h2>Game outcomes</h2>
            <span>Completed visits</span>
          </div>
          <dl className="cl-outcomes">
            {Array.from(results, ([game, v]) => (
              <div key={game}>
                <dt>{gameNames[game]}</dt>
                <dd>
                  {v.rewards}{" "}
                  {v.rewards === 1
                    ? gameDetails[game].unit
                    : gameDetails[game].units}
                  <small>
                    {v.visits} {v.visits === 1 ? "visit" : "visits"}
                  </small>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}

function InputTrace({ display }: { display: DisplayState }) {
  const points = display.trace ?? [];
  const colors = { camera: "var(--camera-trace)", eeg: "var(--eeg-trace)" };
  const usable = points.some((p) => p.camera !== null || p.eeg !== null);
  return (
    <section className="cl-card">
      <div className="cl-card-title">
        <h2>Live input</h2>
        <span>Last 60 seconds · %</span>
      </div>
      {usable ? (
        <svg
          className="cl-chart"
          viewBox="0 0 420 138"
          role="img"
          aria-label="Normalized camera and EEG input over the last minute"
        >
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line
                x1="30"
                x2="410"
                y1={104 - v * 0.86}
                y2={104 - v * 0.86}
                stroke="var(--nr-line)"
                strokeDasharray="3 3"
              />
              <text x="26" y={108 - v * 0.86} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {(["camera", "eeg"] as const).map((key) => {
            let path = "",
              prior: number | null = null;
            for (const p of points) {
              const val = p[key];
              if (val === null) {
                prior = null;
                continue;
              }
              path +=
                (prior === null || prior - p.age > 2.5 ? "M" : "L") +
                (410 - (p.age / 60) * 380).toFixed(1) +
                " " +
                (104 - val * 86).toFixed(1) +
                " ";
              prior = p.age;
            }
            const last = points[points.length - 1];
            return (
              <g key={key}>
                <path
                  d={path}
                  fill="none"
                  stroke={colors[key]}
                  strokeWidth="2"
                />
                {last?.[key] != null && (
                  <circle
                    cx={410 - (last.age / 60) * 380}
                    cy={104 - last[key]! * 86}
                    r="2.5"
                    fill={colors[key]}
                  />
                )}
              </g>
            );
          })}
          <text x="30" y="128">
            60 s ago
          </text>
          <text x="410" y="128" textAnchor="end">
            Now
          </text>
        </svg>
      ) : (
        <p className="cl-chart-empty">Waiting for measured input.</p>
      )}
      <div className="cl-legend">
        {(display.source === "camera" || display.source === "blended") && (
          <span>Camera reach</span>
        )}
        {(display.source === "eeg" || display.source === "blended") && (
          <span className="cl-eeg-key">EEG input</span>
        )}
      </div>
    </section>
  );
}

function signalNumber(record: PracticeRecord, key: Metric) {
  const m = combine(record.intervals ?? [], key);
  return m ? num(m.integral / m.seconds) : "—";
}
export function RunPerformance({
  display,
  player,
}: {
  display: DisplayState;
  player?: ReactNode;
}) {
  const r = display.record,
    source = r?.sources[r.sources.length - 1] ?? display.source;
  const observed = Object.values(r?.measurements ?? {}).reduce(
    (n, m) => n + m.validSeconds,
    0,
  );
  const missing = Object.values(r?.measurements ?? {}).reduce(
    (n, m) => n + m.missingSeconds,
    0,
  );
  const sensor = source !== "button",
    resting = display.patientPaused || display.state === "paused";
  const live =
    display.connected && !resting && display.state === "playing"
      ? display.telemetry
      : null;
  const count = Math.max(1, Math.ceil((r?.elapsed ?? 0) / 30));
  const points: Point[] = Array.from(
    { length: Math.min(count, 12) },
    (_, i) => {
      const index = Math.max(0, count - 12) + i,
        start = index * 30;
      const bins = (r?.intervals ?? []).filter((b) => b.index === index);
      const m = combine(bins, "input");
      return {
        label: duration(start),
        value: sensor
          ? m
            ? m.integral / m.seconds
            : null
          : (r?.events ?? []).filter(
              (e) =>
                e.kind === "action" &&
                Math.min(count - 1, Math.floor(e.seconds / 30)) === index,
            ).length,
      };
    },
  );
  const history = (r?.events ?? []).slice(-6).reverse();
  const activity = (
    <section className="cl-card">
      <div className="cl-card-title">
        <h2>{sensor ? "Input trend" : "Action timeline"}</h2>
        <span>30-second intervals</span>
      </div>
      <ActivityChart
        points={r && r.elapsed > 0 ? points : []}
        max={sensor ? 100 : undefined}
        unit={sensor ? "mean input (%)" : "actions"}
        empty={sensor ? "Waiting for observed input." : "Waiting for gameplay."}
      />
      <div className="cl-chart-caption">
        {sensor ? "Mean observed game input" : "Logged game actions"} · active
        session time
      </div>
    </section>
  );
  const camera = source === "camera" || source === "blended",
    eeg = source === "eeg" || source === "blended";
  return (
    <>
      <MetricStrip
        items={[
          [
            "Active time",
            r ? duration(r.elapsed) : "—",
            display.schedule === "clinic"
              ? "Two 9-minute blocks"
              : "5-minute protocol",
          ],
          ["Actions", r ? String(r.actions) : "—", "Logged attempts"],
          [
            gameDetails[display.game].units,
            r ? String(r.rewards) : "—",
            gameNames[display.game],
          ],
          [
            sensor ? "Current input" : "Actions / min",
            sensor
              ? live?.input != null
                ? Math.round(live.input * 100) + "%"
                : "—"
              : r && r.elapsed >= 10
                ? num((r.actions * 60) / r.elapsed)
                : "—",
            sensor
              ? "Latest valid observation"
              : r && r.elapsed >= 10
                ? "Active play time"
                : "After 10 seconds of play",
          ],
        ]}
      />
      <div className="cl-monitor-grid">
        {player ?? (sensor ? <InputTrace display={display} /> : activity)}
        <div className="cl-stack">
          {player && (sensor ? <InputTrace display={display} /> : activity)}
          <section className="cl-card">
            <div className="cl-card-title">
              <h2>Run details</h2>
            </div>
            <dl className="cl-facts">
              <div>
                <dt>Current input</dt>
                <dd>{sourceNames[source]}</dd>
              </div>
              <div>
                <dt>Practice arm</dt>
                <dd>{display.side}</dd>
              </div>
              <div>
                <dt>Pace</dt>
                <dd>{display.easy ? "Gentle" : "Standard"}</dd>
              </div>
              <div>
                <dt>Last checkpoint</dt>
                <dd>
                  {r ? duration(r.elapsed) + " active" : "Awaiting start"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
      {sensor && activity}
      {(camera || eeg || observed + missing > 0) && (
        <section className="cl-card">
          <div className="cl-card-title">
            <h2>Sensor monitoring</h2>
            <span>
              {r?.usedSyntheticEeg
                ? "Synthetic EEG test"
                : "Observed measurements"}
            </span>
          </div>
          <dl className="cl-facts cl-sensors">
            {camera && (
              <>
                <div>
                  <dt>Camera</dt>
                  <dd>{live?.camera || "Awaiting live camera"}</dd>
                </div>
                <div>
                  <dt>Current reach</dt>
                  <dd>
                    {live?.cameraLevel != null
                      ? Math.round(live.cameraLevel * 100) + "%"
                      : "—"}
                  </dd>
                </div>
              </>
            )}
            {eeg && (
              <>
                <div>
                  <dt>EEG</dt>
                  <dd>{live?.eeg || "Awaiting live EEG"}</dd>
                </div>
                <div>
                  <dt>Calibration</dt>
                  <dd>{r?.calibration?.method ?? "Pending"}</dd>
                </div>
              </>
            )}
            {r && (
              <>
                <div>
                  <dt>Sensor coverage</dt>
                  <dd>
                    {observed + missing > 0
                      ? Math.round((100 * observed) / (observed + missing)) +
                        "%"
                      : "—"}
                  </dd>
                </div>
                {(camera ||
                  r.sources.includes("blended") ||
                  r.sources.includes("camera")) && (
                  <div>
                    <dt>Mean upper-arm elevation (°)</dt>
                    <dd>{signalNumber(r, "shoulder")}</dd>
                  </div>
                )}
                {(eeg ||
                  r.sources.includes("blended") ||
                  r.sources.includes("eeg")) && (
                  <>
                    <div>
                      <dt>Mean C3 / C4 mu ERD (%)</dt>
                      <dd>
                        {signalNumber(r, "muC3")} / {signalNumber(r, "muC4")}
                      </dd>
                    </div>
                    <div>
                      <dt>Calibration accuracy</dt>
                      <dd>
                        {r.calibration?.accuracy != null
                          ? num(100 * r.calibration.accuracy) + "%"
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Feedback p95</dt>
                      <dd>
                        {r.feedback?.count ? r.feedback.p95Ms + " ms" : "—"}
                      </dd>
                    </div>
                  </>
                )}
              </>
            )}
          </dl>
        </section>
      )}
      <section className="cl-card">
        <div className="cl-card-title">
          <h2>Recent events</h2>
          <span>Active time</span>
        </div>
        {history.length ? (
          <ol className="cl-events">
            {history.map((e, i) => (
              <li key={i}>
                <time>{duration(e.seconds)}</time>
                <strong>
                  {
                    {
                      action: "Action recorded",
                      reward: "Game reward",
                      pause: "Paused",
                      resume: "Resumed",
                      switch: "Input changed",
                    }[e.kind]
                  }
                </strong>
                <span>{sourceNames[e.source]}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="cl-muted">No events recorded yet.</p>
        )}
      </section>
    </>
  );
}
export function PatientIdentity({
  person,
  children,
}: {
  person: Participant;
  children?: ReactNode;
}) {
  return (
    <div className="cl-patient-heading">
      <div>
        <p className="cl-overline">Patient overview</p>
        <h1>{person.name}</h1>
        <p className="cl-meta">
          {person.side === "left" ? "Left" : "Right"} practice arm{" "}
          <span>·</span> Consent recorded{" "}
          {new Date(person.consent).toLocaleDateString()}
        </p>
      </div>
      {children}
    </div>
  );
}
