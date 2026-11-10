import { gameDetails, gameNames, type Game } from "../practice/catalog";
import { sourceNames, type PracticeRecord } from "../practice/session";
import {
  intervalSeconds,
  metricLabels,
  type Interval,
  type Metric,
  type Measure,
} from "./measurements";

export type Visit = { record: PracticeRecord; status: string; note?: string };
export type Assessment = { date: string; fma: number; arat: number };
export type Reader = { name: string; id?: string; assessments?: Assessment[] };
export type Table = { columns: string[]; rows: string[][] };
export type Plot = {
  label: string;
  unit: string;
  labels: string[];
  values: (number | null)[];
  positions?: number[];
  threshold?: number;
};
export type Section = {
  title: string;
  text?: string;
  table?: Table;
  plot?: Plot;
  aside?: string;
  bars?: { label: string; value: number; unit: string }[];
  barLabel?: string;
  tiles?: { label: string; values: (number | null)[] }[];
  trajectories?: (number | null)[][];
};
export type Report = {
  kind: string;
  title: string;
  context: string;
  summary: string;
  stats: [string, string][];
  sections: Section[];
  filename: string;
  form: {
    heading: string;
    reference: string;
    date: string;
    flag?: string;
    staff: boolean;
    left: [string, string][];
    right: [string, string][];
    context: string;
  };
  overview: Section;
};
export const missing = "—";
const day = 86400000;
const week = 7 * day;
const fmt = (n: number, digits = 1) => Number(n.toFixed(digits)).toString();
const value = (n: number | null, digits = 1) =>
  n === null ? missing : fmt(n, digits);
const clock = (seconds: number) => {
  const n = Math.round(seconds);
  return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
};
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
const startTime = (v: Visit) => Date.parse(v.record.started);
const mode = (r: PracticeRecord) =>
  r.sources.map((s) => sourceNames[s]).join(" → ");
const synthetic = (r: PracticeRecord) =>
  r.usedSyntheticEeg || r.calibration?.synthetic === true;
const monday = (t: number) => {
  const midnight = Math.floor(t / day) * day;
  return midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * day;
};
export function combine(rows: Interval[], key: Metric): Measure | null {
  let seconds = 0,
    integral = 0,
    peak = -Infinity;
  for (const row of rows) {
    const m = row.metrics[key];
    if (!m || !(m.seconds > 0) || ![m.integral, m.peak].every(Number.isFinite))
      continue;
    seconds += m.seconds;
    integral += m.integral;
    peak = Math.max(peak, m.peak);
  }
  return seconds ? { seconds, integral, peak } : null;
}
function mean(rows: Interval[], key: Metric) {
  const m = combine(rows, key);
  return m ? m.integral / m.seconds : null;
}
const keys = Object.keys(metricLabels) as Metric[];
const details = (r: PracticeRecord) => gameDetails[r.game];
function table(columns: string[], rows: string[][]): Table {
  return { columns, rows };
}
// Use only intervals with the same observed time at both electrodes.
function bilateralBalance(intervals: Interval[]) {
  let c3 = 0,
    c4 = 0,
    seconds = 0;
  for (const row of intervals) {
    const l = row.metrics.muC3,
      r = row.metrics.muC4;
    if (!l || !r || !l.seconds || Math.abs(l.seconds - r.seconds) > 0.001)
      continue;
    c3 += l.integral;
    c4 += r.integral;
    seconds += l.seconds;
  }
  if (!seconds || c3 < 0 || c4 < 0 || (c3 + c4) / seconds < 0.000001)
    return null;
  return { index: (c3 - c4) / (c3 + c4), seconds };
}
function metricTable(intervals: Interval[], fields: Metric[]) {
  const rows: string[][] = [];
  for (const k of fields) {
    const m = combine(intervals, k);
    if (m)
      rows.push([
        metricLabels[k].join(" · "),
        fmt(m.integral / m.seconds),
        fmt(m.peak),
        clock(m.seconds),
      ]);
  }
  return table(
    ["Measurement", "Time-weighted mean", "Peak", "Observed (m:ss)"],
    rows,
  );
}
export function sessionReport(
  visit: Visit,
  reader: Reader,
  history: Visit[] = [],
): Report {
  const r = visit.record,
    rows = r.intervals ?? [],
    units = details(r).units;
  const pauses = r.events.filter((e) => e.kind === "pause").length;
  const span =
    intervalSeconds *
    Math.max(1, Math.ceil(r.elapsed / (intervalSeconds * 12)));
  const groups = Array.from(
    { length: Math.min(12, Math.max(1, Math.ceil(r.elapsed / span))) },
    (_, i) => ({
      label: clock(i * span) + "–" + clock(Math.min(r.elapsed, (i + 1) * span)),
      actions: 0,
      rewards: 0,
      measurements: [] as Interval[],
    }),
  );
  const groupAt = (t: number) =>
    groups[Math.max(0, Math.min(groups.length - 1, Math.floor(t / span)))];
  for (const e of r.events) {
    if (e.kind === "action") groupAt(e.seconds).actions++;
    if (e.kind === "reward") groupAt(e.seconds).rewards++;
  }
  for (const b of rows) groupAt(b.index * intervalSeconds).measurements.push(b);
  const actionsTimed = groups.reduce((n, b) => n + b.actions, 0) === r.actions;
  const rewardsTimed = groups.reduce((n, b) => n + b.rewards, 0) === r.rewards;
  const hasInput = !!combine(rows, "input");
  const sections: Section[] = [
    {
      title: "Practice timeline",
      text:
        "Intervals use active play time. Pauses stop the clock. " +
        (actionsTimed
          ? ""
          : "Only the total action count was saved for this visit. ") +
        (hasInput ? "Game input is normalized within this session." : ""),
      plot: hasInput
        ? {
            label: "Mean game input by interval",
            unit: "%",
            labels: groups.map((g) => g.label),
            values: groups.map((g) => mean(g.measurements, "input")),
          }
        : rewardsTimed
          ? {
              label: "Earned " + units + " by interval",
              unit: units,
              labels: groups.map((g) => g.label),
              values: groups.map((g) => g.rewards),
            }
          : undefined,
      table: table(
        [
          "Active time",
          "Actions",
          units[0].toUpperCase() + units.slice(1),
          ...(hasInput ? ["Mean input (%)"] : []),
        ],
        groups.map((g) => [
          g.label,
          actionsTimed ? String(g.actions) : missing,
          rewardsTimed ? String(g.rewards) : missing,
          ...(hasInput ? [value(mean(g.measurements, "input"))] : []),
        ]),
      ),
    },
  ];
  const feedback = r.feedback;
  const sources = Object.entries(r.measurements ?? {});
  if (sources.length)
    sections.push({
      title: "Input coverage",
      text: "Coverage is observed time divided by observed plus missing time for that input. In blended play both inputs must be available.",
      table: table(
        ["Input", "Observed", "Missing", "Coverage", "Mean input (%)"],
        sources.map(([s, m]) => [
          sourceNames[s as keyof typeof sourceNames],
          clock(m.validSeconds),
          clock(m.missingSeconds),
          m.validSeconds + m.missingSeconds
            ? fmt(
                (100 * m.validSeconds) / (m.validSeconds + m.missingSeconds),
              ) + "%"
            : missing,
          m.validSeconds
            ? fmt((100 * m.weightedLevel) / m.validSeconds)
            : missing,
        ]),
      ),
    });
  const above = rows.reduce((sum, b) => sum + b.above, 0),
    observed = combine(rows, "input");
  if (observed)
    sections.push({
      title: "Time above the game threshold",
      text:
        clock(above) +
        " of " +
        clock(observed.seconds) +
        " observed active time (" +
        fmt((100 * above) / observed.seconds) +
        "%). The threshold reflects the selected pace and game adaptations.",
    });
  function sensorTimeline(
    title: string,
    metricKeys: Metric[],
    preferred: Metric,
  ) {
    const fields = metricKeys.filter((k) => combine(rows, k));
    if (!fields.length) return;
    const main = fields.includes(preferred) ? preferred : fields[0];
    sections.push({
      title,
      text: "Each interval shows the mean while that measurement was available.",
      plot: {
        label: metricLabels[main][0] + " across play",
        unit: metricLabels[main][1],
        labels: groups.map((g) => g.label),
        values: groups.map((g) => mean(g.measurements, main)),
      },
      table: table(
        ["Active time", ...fields.map((k) => metricLabels[k].join(" · "))],
        groups.map((g) => [
          g.label,
          ...fields.map((k) => value(mean(g.measurements, k))),
        ]),
      ),
    });
  }
  if (r.sources.some((s) => s === "eeg" || s === "blended")) {
    const metrics = metricTable(rows, ["muC3", "muCz", "muC4", "classifier"]);
    const c = r.calibration;
    const balance = bilateralBalance(rows);
    sections.push({
      title: "EEG and calibration",
      text: [
        synthetic(r) ? "Synthetic test signal." : "",
        balance
          ? `Bilateral mu laterality index ${fmt(balance.index, 2)} over ${clock(balance.seconds)} of paired observations. Positive indicates greater C3 desynchronization, negative greater C4.`
          : "",
        c ? "Scoring method: " + c.method + "." : "",
        c?.accuracy != null
          ? "Held-out calibration accuracy: " + fmt(100 * c.accuracy) + "%."
          : "",
        feedback?.count
          ? "Sample-to-display p95: " +
            fmt(feedback.p95Ms) +
            " ms (" +
            feedback.count +
            " timed updates)."
          : "",
        metrics.rows.length
          ? "Mu ERD (8–12 Hz) is the change from resting power. Positive values indicate a drop in power. Values summarize clean, fresh input during play."
          : "Electrode trends were not recorded for this visit.",
      ]
        .filter(Boolean)
        .join(" "),
      table: metrics.rows.length ? metrics : undefined,
    });
    if (c)
      sections.push({
        title: "Decode quality",
        aside: c.method,
        table: table(
          ["Measure", "Result", "Reference / basis", "Interpretation"],
          [
            [
              "Scoring method",
              c.method,
              "Calibration at this visit",
              c.synthetic ? "Synthetic signal" : "Recorded by companion",
            ],
            ...(c.accuracy != null
              ? [
                  [
                    "Calibration CV accuracy",
                    fmt(100 * c.accuracy) + "%",
                    "Held-out trials · 60% gate",
                    c.accuracy >= 0.6 ? "MEETS MODEL GATE" : "BELOW MODEL GATE",
                  ],
                ]
              : []),
            ...(combine(rows, "classifier")
              ? [
                  [
                    "Mean imagery probability",
                    value(mean(rows, "classifier")) + "%",
                    "Available classifier windows",
                    "Target imagery class",
                  ],
                ]
              : []),
          ],
        ),
      });
    sensorTimeline(
      "Cortical engagement over time",
      ["muC3", "muCz", "muC4"],
      r.arm === "right" ? "muC3" : "muC4",
    );
  }
  if (r.sources.some((s) => s === "camera" || s === "blended")) {
    const t = metricTable(rows, ["shoulder", "elbow", "tilt", "reach"]);
    sections.push({
      title: "Movement and posture",
      text: t.rows.length
        ? "Camera estimates use visible joints on the practice side. Upper-arm elevation is relative to the torso; elbow opening approaches 180° with a straight arm. Frontal trunk tilt is relative to image vertical. Positioning affects all three angles."
        : "Joint measurements were not recorded for this visit.",
      table: t.rows.length ? t : undefined,
    });
    sensorTimeline(
      "Movement over time",
      ["shoulder", "elbow", "tilt"],
      "shoulder",
    );
  }
  const markers = r.events.filter((e) =>
    ["pause", "resume", "switch"].includes(e.kind),
  );
  if (markers.length)
    sections.push({
      title: "Breaks and input changes",
      table: table(
        ["Active time", "Event", "Input"],
        markers.map((e) => [
          clock(e.seconds),
          { pause: "Pause", resume: "Resume", switch: "Input changed" }[
            e.kind as "pause" | "resume" | "switch"
          ],
          sourceNames[e.source],
        ]),
      ),
    });
  const assessment = (reader.assessments ?? [])
    .filter((a) => a.date <= date(startTime(visit)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-1)[0];
  if (assessment)
    sections.push({
      title: "Latest recorded assessment",
      text: "Clinician-entered on " + assessment.date + ".",
      table: table(
        ["FMA-UE (0–66)", "ARAT (0–57)"],
        [[String(assessment.fma), String(assessment.arat)]],
      ),
    });
  if (visit.note)
    sections.push({
      title: "Participant or staff observations",
      text: visit.note,
    });
  const startLabel =
    new Date(startTime(visit)).toISOString().slice(0, 16).replace("T", " ") +
    " UTC";
  const protocol =
    r.schedule === "clinic"
      ? "Two 9-minute active blocks"
      : r.schedule === "short"
        ? "5-minute practice"
        : "Self-paced practice";
  const game = gameNames[r.game],
    input = mode(r),
    workspace = reader.assessments ? "Staff workstation" : "Guest practice";
  const metrics: string[][] = [
    ["Active gameplay", clock(r.elapsed), protocol, "Active clock"],
    ["Logged actions", String(r.actions), "Recorded game actions", game],
    [
      units[0].toUpperCase() + units.slice(1),
      String(r.rewards),
      "Game outcome",
      game,
    ],
    ["Pause markers", String(pauses), "Pause events", "Active clock stops"],
  ];
  if (observed)
    metrics.push(
      [
        "Mean game input",
        fmt(observed.integral / observed.seconds) + " / 100",
        "Session-normalized",
        "Peak " + fmt(observed.peak),
      ],
      [
        "Time above threshold",
        clock(above),
        "Observed input time",
        fmt((100 * above) / observed.seconds) + "% of observed",
      ],
    );
  if (feedback?.count)
    metrics.push([
      "Feedback delay (p95)",
      fmt(feedback.p95Ms) + " ms",
      "Prototype target <250 ms",
      feedback.p95Ms < 250 ? "WITHIN TARGET" : "ABOVE TARGET",
    ]);
  const contra = r.arm === "right" ? "muC3" : r.arm === "left" ? "muC4" : null;
  const erd = contra ? mean(rows, contra) : null;
  const shoulder = combine(rows, "shoulder");
  const curve = sections[0].plot;
  if (curve && hasInput && r.gentle === true) curve.threshold = 35;
  const overview: Section = {
    title: "Session metrics",
    aside:
      r.sources[0] === "blended"
        ? "EEG 0.60 · camera 0.40"
        : sourceNames[r.sources[0]],
    table: table(
      ["Measure", "Result", "Reference / basis", "Interpretation"],
      metrics,
    ),
    plot: curve,
  };
  delete sections[0].plot;
  for (const sec of sections) {
    if (sec.title === "EEG and calibration" && sec.table) {
      sec.aside = "Mu 8–12 Hz · C3 / Cz / C4";
      sec.barLabel = "Mean mu-ERD by electrode";
      sec.bars = (["muC3", "muCz", "muC4"] as const).flatMap((k) => {
        const n = mean(rows, k);
        return n === null ? [] : [{ label: k.slice(2), value: n, unit: "%" }];
      });
    }
    if (sec.title === "Movement and posture" && sec.table) {
      sec.aside = "MediaPipe · relative camera estimates";
      sec.barLabel = "Peak camera angles";
      sec.bars = (["shoulder", "elbow", "tilt"] as const).flatMap((k) => {
        const m = combine(rows, k);
        return m
          ? [{ label: metricLabels[k][0], value: m.peak, unit: "°" }]
          : [];
      });
    }
    if (sec.title === "Input coverage") sec.aside = "Active measurement time";
  }
  const earlier = history.filter(
    (v) => v.record.game === r.game && startTime(v) <= startTime(visit),
  );
  if (
    earlier.some(
      (v) =>
        v.status === "complete" &&
        !synthetic(v.record) &&
        monday(startTime(v)) < monday(startTime(visit)) &&
        monday(startTime(v)) >= monday(startTime(visit)) - 3 * week,
    )
  ) {
    const trend = progressReport(
      earlier,
      reader,
      4,
      r.game,
      date(startTime(visit)),
    ).overview;
    sections.push({
      ...trend,
      text: "Completed visits for this game through this session. Synthetic EEG and unfinished visits are excluded.",
    });
  }
  sections.push({
    title: "Notes & reliability",
    text:
      "Time-weighted means use observed active seconds. The session-normalized game input is specific to this visit. Missing observations are left blank or marked with a dash. Camera angles depend on positioning. Session ID " +
      r.id +
      ".",
  });
  return {
    kind: "Session report",
    overview,
    form: {
      staff: !!reader.assessments,
      heading: "Motor-neurofeedback session report",
      reference: "Report NR-" + r.id.slice(0, 8).toUpperCase(),
      date: date(startTime(visit)),
      flag: synthetic(r)
        ? "SYNTHETIC EEG"
        : visit.status !== "complete"
          ? visit.status.toUpperCase()
          : undefined,
      left: [
        ["Service", "NeuroReach"],
        ["Workspace", workspace],
        ["Game", game],
        ["Protocol", protocol],
      ],
      right: [
        ["Participant", reader.name],
        ...(reader.id
          ? [["Participant ID", reader.id] as [string, string]]
          : []),
        ["Practice side", r.arm ?? "Unspecified"],
        ["Started", startLabel],
        ["Status", visit.status],
      ],
      context:
        `${input} · ${game}. ${protocol}.` +
        (r.gentle === undefined
          ? ""
          : r.gentle
            ? " Gentle pace."
            : " Standard pace.") +
        (r.sources[0] === "blended"
          ? " During blended play EEG contributes 60% and camera movement 40%."
          : "") +
        (r.calibration ? " Scoring used " + r.calibration.method + "." : ""),
    },
    title: gameNames[r.game],
    context: [
      reader.name,
      new Date(startTime(visit)).toISOString().slice(0, 16).replace("T", " ") +
        " UTC",
      mode(r),
      r.arm ? r.arm + " arm" : null,
      r.gentle === undefined
        ? null
        : r.gentle
          ? "Gentle pace"
          : "Standard pace",
      visit.status,
    ]
      .filter(Boolean)
      .join(" · "),
    summary:
      `${r.actions} logged ${r.actions === 1 ? "action" : "actions"} produced ${r.rewards} ${r.rewards === 1 ? details(r).unit : units} in ${clock(r.elapsed)} of active play.` +
      (observed
        ? ` Mean game input was ${fmt(observed.integral / observed.seconds)} out of 100 over ${clock(observed.seconds)} of observed play.`
        : "") +
      (erd !== null && contra
        ? ` Mean mu ERD at ${contra.slice(2)} was ${fmt(erd)}% relative to rest.`
        : "") +
      (shoulder
        ? ` Camera-estimated upper-arm elevation peaked at ${fmt(shoulder.peak)}°.`
        : "") +
      (synthetic(r) ? " This session used synthetic EEG." : ""),
    stats: [
      ["Active play", clock(r.elapsed)],
      ["Actions", String(r.actions)],
      [units, String(r.rewards)],
      ["Pause markers", String(pauses)],
    ],
    sections,
    filename: "NeuroReach-session-" + r.id,
  };
}

type Cohort = { label: string; visits: Visit[] };
export function progressReport(
  visits: Visit[],
  reader: Reader,
  weeks: number,
  game?: Game,
  ending?: string,
): Report {
  const selected = visits
    .filter(
      (v) => (!game || v.record.game === game) && Number.isFinite(startTime(v)),
    )
    .sort((a, b) => startTime(a) - startTime(b));
  const assessments = (reader.assessments ?? [])
    .filter((a) => Number.isFinite(Date.parse(a.date)))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastVisit = selected.length
    ? startTime(selected[selected.length - 1])
    : -Infinity;
  const lastAssessment = assessments.length
    ? Date.parse(assessments[assessments.length - 1].date)
    : -Infinity;
  const latest = Math.max(lastVisit, lastAssessment);
  const lastDate =
    ending && Number.isFinite(Date.parse(ending))
      ? Date.parse(ending)
      : Number.isFinite(latest)
        ? latest
        : Date.now();
  const start = monday(lastDate) - (weeks - 1) * week;
  const end = (Math.floor(lastDate / day) + 1) * day;
  const inRange = selected.filter(
    (v) => startTime(v) >= start && startTime(v) < end,
  );
  const complete = inRange.filter(
    (v) => v.status === "complete" && !synthetic(v.record),
  );
  const partial = inRange.filter((v) => v.status !== "complete").length;
  const simulated = inRange.filter(
    (v) => v.status === "complete" && synthetic(v.record),
  ).length;
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    label: date(start + i * week),
    visits: [] as Visit[],
    seconds: 0,
    actions: 0,
  }));
  const cohorts = new Map<string, Cohort>();
  for (const v of complete) {
    const r = v.record,
      b = buckets[Math.floor((startTime(v) - start) / week)];
    b.visits.push(v);
    b.seconds += r.elapsed;
    b.actions += r.actions;
    const label = [
      gameNames[r.game],
      mode(r),
      r.arm ? r.arm + " arm" : "arm unspecified",
      r.gentle === undefined
        ? "pace unspecified"
        : r.gentle
          ? "gentle"
          : "standard",
    ].join(" · ");
    if (!cohorts.has(label)) cohorts.set(label, { label, visits: [] });
    cohorts.get(label)!.visits.push(v);
  }
  const total = complete.reduce((a, v) => a + v.record.elapsed, 0),
    actions = complete.reduce((a, v) => a + v.record.actions, 0);
  const sections: Section[] = [
    {
      title: "Weekly practice",
      text: "Weeks start Monday (UTC). Empty weeks count as zero recorded practice.",
      plot: {
        label: "Active practice per week",
        unit: "min",
        labels: buckets.map((b) => b.label),
        values: buckets.map((b) => b.seconds / 60),
      },
      table: table(
        ["Week starting", "Visits", "Active time", "Actions"],
        buckets.map((b) => [
          b.label,
          String(b.visits.length),
          clock(b.seconds),
          String(b.actions),
        ]),
      ),
    },
  ];
  for (const cohort of cohorts.values()) {
    const unit = details(cohort.visits[0].record).units;
    const weekly = buckets.map((b) => {
      const items = cohort.visits.filter(
        (v) => monday(startTime(v)) === Date.parse(b.label),
      );
      const bins = items.flatMap((v) => v.record.intervals ?? []);
      const acc = items.flatMap((v) =>
        v.record.calibration?.accuracy != null
          ? [100 * v.record.calibration.accuracy]
          : [],
      );
      const elapsed = items.reduce((s, v) => s + v.record.elapsed, 0);
      const count = items.reduce((s, v) => s + v.record.rewards, 0);
      return {
        week: b.label,
        items,
        bins,
        elapsed,
        count,
        acc: acc.length ? acc.reduce((a, x) => a + x, 0) / acc.length : null,
      };
    });
    const recorded = weekly.filter((w) => w.items.length);
    const first = recorded[0],
      last = recorded[recorded.length - 1];
    const rate = (w: typeof first) =>
      w.elapsed ? (60 * w.count) / w.elapsed : null;
    let change =
      recorded.length === 1
        ? "One recorded week; a change needs a second week with the same practice settings."
        : "";
    if (first !== last && rate(first) !== null && rate(last) !== null)
      change =
        value(rate(first)) === value(rate(last))
          ? `Recorded ${unit} per active minute averaged ${value(rate(first))} in both the first and last observed weeks (rounded).`
          : `Recorded ${unit} per active minute changed from ${value(rate(first))} to ${value(rate(last))} between ${first.week} and ${last.week}.`;
    sections.push({
      title: cohort.label,
      text: change,
      table: table(
        ["Week starting", "Visits", unit, "Per active min"],
        recorded.map((w) => [
          w.week,
          String(w.items.length),
          String(w.count),
          value(rate(w)),
        ]),
      ),
    });
    const metrics = keys.filter(
      (k) =>
        !["input", "reach", "classifier"].includes(k) &&
        recorded.some((w) => combine(w.bins, k)),
    );
    if (metrics.length || recorded.some((w) => w.acc !== null)) {
      const rows: string[][] = [];
      for (const w of recorded) {
        for (const k of metrics) {
          const m = combine(w.bins, k);
          if (m)
            rows.push([
              w.week,
              metricLabels[k].join(" · "),
              fmt(m.integral / m.seconds),
              clock(m.seconds),
            ]);
        }
        const balance = bilateralBalance(w.bins);
        if (balance)
          rows.push([
            w.week,
            "Mu laterality index",
            fmt(balance.index, 2),
            clock(balance.seconds),
          ]);
        if (w.acc !== null)
          rows.push([
            w.week,
            "Calibration accuracy (%)",
            fmt(w.acc),
            String(
              w.items.filter((v) => v.record.calibration?.accuracy != null)
                .length,
            ) + " visits",
          ]);
      }
      const primary = metrics.includes("muC4")
        ? cohort.visits[0].record.arm === "right"
          ? "muC3"
          : "muC4"
        : metrics[0];
      sections.push({
        title: "Sensor trends",
        text:
          cohort.label +
          ". Weekly means are weighted by observed play time. Calibration accuracy is averaged over visits with a reported value. Joint angles are camera estimates.",
        table: table(
          ["Week starting", "Measurement", "Mean", "Observed"],
          rows,
        ),
        plot: primary
          ? {
              label: metricLabels[primary][0] + " by week",
              unit: metricLabels[primary][1],
              labels: weekly.map((w) => w.week),
              values: weekly.map((w) => mean(w.bins, primary)),
            }
          : undefined,
      });
    }
  }
  const inWindow = assessments.filter(
    (a) => a.date >= date(start) && a.date < date(end),
  );
  const baseline = assessments.filter((a) => a.date < date(start)).slice(-1)[0];
  const displayed = baseline ? [baseline, ...inWindow] : inWindow;
  if (reader.assessments)
    sections.push({
      title: "Clinician-entered assessments",
      plot:
        displayed.length > 1
          ? {
              label: "FMA-UE on assessment dates",
              unit: "points",
              labels: displayed.map((a) => a.date),
              values: displayed.map((a) => a.fma),
              positions: displayed.map((a) => Date.parse(a.date)),
            }
          : undefined,
      text: displayed.length
        ? "Scores are shown on their recorded dates. The most recent pre-period assessment is included when available." +
          (displayed.length > 1
            ? ` FMA-UE changed from ${displayed[0].fma} to ${displayed[displayed.length - 1].fma}; ARAT from ${displayed[0].arat} to ${displayed[displayed.length - 1].arat}.`
            : "")
        : "No assessment was recorded by the end of this period.",
      table: displayed.length
        ? table(
            ["Assessment date", "FMA-UE (0–66)", "ARAT (0–57)"],
            displayed.map((a) => [
              a.date + (a === baseline ? " · prior" : ""),
              String(a.fma),
              String(a.arat),
            ]),
          )
        : undefined,
    });
  sections.push({
    title: "Notes & reliability",
    text: "Game outcomes are grouped by game, input sequence, arm and pace. Session-normalized input is used only within an individual session. A missing sensor value means it was unavailable. Practice and camera measures describe activity; formal assessments are entered separately.",
  });
  const lastWeeks = buckets.slice(-4),
    tiles = [
      { label: "Visits", values: lastWeeks.map((b) => b.visits.length) },
      {
        label: "Active min",
        values: lastWeeks.map((b) => Number(fmt(b.seconds / 60))),
      },
      { label: "Actions", values: lastWeeks.map((b) => b.actions) },
    ];
  const tilesForReport: { label: string; values: (number | null)[] }[] = [];
  if (cohorts.size === 1) {
    const arm = complete[0]?.record.arm;
    const relevant: Metric[] = [
      arm === "right" ? "muC3" : "muC4",
      "shoulder",
      "elbow",
    ];
    for (const k of relevant) {
      const values = lastWeeks.map((w) =>
        mean(
          w.visits.flatMap((v) => v.record.intervals ?? []),
          k,
        ),
      );
      if (values.some((v) => v !== null))
        tilesForReport.push({ label: metricLabels[k].join(" · "), values });
    }
  }
  tilesForReport.push(...tiles.slice(0, 4 - tilesForReport.length));
  const overview: Section = {
    title: weeks === 4 ? "Four-week trend" : "Recent four-week trend",
    aside: "Week starting (UTC) · latest four weeks",
    tiles: tilesForReport,
    table: table(
      ["Metric", ...lastWeeks.map((b) => b.label.slice(5)), "Trajectory"],
      tilesForReport.map((t) => [
        t.label,
        ...t.values.map((n) => value(n)),
        t.values.map((n) => value(n)).join(" → "),
      ]),
    ),
    trajectories: tilesForReport.map((t) => t.values),
  };
  return {
    kind: "Longitudinal report",
    overview,
    form: {
      staff: !!reader.assessments,
      heading: "Motor-neurofeedback longitudinal report",
      reference: reader.id
        ? "Report NR-" + reader.id.slice(0, 8).toUpperCase()
        : "NeuroReach progress",
      date: date(end - day),
      left: [
        ["Service", "NeuroReach"],
        [
          "Workspace",
          reader.assessments ? "Staff workstation" : "Guest practice",
        ],
        ["Games", game ? gameNames[game] : "All games"],
      ],
      right: [
        ["Participant", reader.name],
        ...(reader.id
          ? [["Participant ID", reader.id] as [string, string]]
          : []),
        ["Period", weeks + " weeks"],
        ["Through", date(end - day) + " UTC"],
      ],
      context: `Weekly review of completed ${game ? gameNames[game] : "practice"} sessions from ${date(start)} through ${date(end - day)}. Weekly results use active time and recorded game events.`,
    },
    title: "Practice over time",
    context:
      reader.name +
      " · " +
      date(start) +
      " to " +
      date(end - day) +
      " UTC · " +
      (game ? gameNames[game] : "All games"),
    summary: [
      `${complete.length} completed ${complete.length === 1 ? "visit" : "visits"} across ${buckets.filter((b) => b.visits.length).length} ${buckets.filter((b) => b.visits.length).length === 1 ? "recorded week" : "recorded weeks"}.`,
      partial
        ? `${partial} unfinished or interrupted ${partial === 1 ? "visit" : "visits"} excluded.`
        : "",
      simulated
        ? `${simulated} completed synthetic EEG ${simulated === 1 ? "visit" : "visits"} excluded.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    stats: [
      ["Completed visits", String(complete.length)],
      ["Active play", clock(total)],
      ["Actions", String(actions)],
      ["Window", weeks + " weeks"],
    ],
    sections,
    filename: "NeuroReach-progress-" + date(end - day),
  };
}
