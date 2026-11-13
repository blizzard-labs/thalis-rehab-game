import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { games, gameNames, type Game } from "../practice/catalog";
import {
  progressReport,
  sessionReport,
  type Reader,
  type Visit,
} from "./report";
import { sheetSections, reliabilityNote, isStatusCell } from "./sheet";
import { barSvg, trajectorySvg, plotSvg } from "./plot";
import { downloadCsv } from "./export";
import "./reports.css";

type Props = {
  reader: Reader;
  visit?: Visit;
  visits?: Visit[];
  authorize?: () => Promise<void>;
  loadVisits?: () => Promise<Visit[]>;
};
export function ReportButton(props: Props) {
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const [loaded, setLoaded] = useState<Visit[]>();
  async function view() {
    try {
      await props.authorize?.();
      if (props.loadVisits) setLoaded(await props.loadVisits());
      setError("");
      setOpen(true);
    } catch {
      setError(
        "This report is no longer available. Reopen the workspace or guest history.",
      );
    }
  }
  return (
    <>
      <button ref={opener} onClick={view}>
        {props.visit ? "Session report" : "Progress report"}
      </button>
      {error && <span role="alert">{error}</span>}
      {open && (
        <ReportReader
          {...props}
          opener={opener}
          visits={loaded ?? props.visits}
          close={() => {
            setOpen(false);
            setLoaded(undefined);
          }}
        />
      )}
    </>
  );
}
function ReportReader({
  reader,
  visit,
  visits,
  authorize,
  close,
  opener,
}: Props & { close: () => void; opener: RefObject<HTMLButtonElement> }) {
  const dialog = useRef<HTMLDialogElement>(null),
    mounted = useRef(false);
  const [weeks, setWeeks] = useState(4),
    [game, setGame] = useState<Game | "">(""),
    [ending, setEnding] = useState("");
  const [exporting, setExporting] = useState(false),
    [error, setError] = useState("");
  const report = useMemo(
    () =>
      visit
        ? sessionReport(visit, reader, visits)
        : progressReport(
            visits ?? [],
            reader,
            weeks,
            game || undefined,
            ending,
          ),
    [visit, reader, visits, weeks, game, ending],
  );
  useEffect(() => {
    mounted.current = true;
    const node = dialog.current!;
    node.showModal();
    node.scrollTop = 0;
    return () => {
      mounted.current = false;
      node.close();
      // React removes the dialog before passive cleanup. Restore focus explicitly
      // because native dialog restoration cannot reliably find its opener then.
      opener.current?.focus();
    };
  }, [opener]);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") authorize?.().catch(close);
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [authorize, close]);
  async function save(pdf: boolean) {
    setExporting(true);
    setError("");
    try {
      const blob = pdf ? await (await import("./pdf")).pdfBlob(report) : null;
      await authorize?.();
      if (!mounted.current) return;
      if (blob) {
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = report.filename + ".pdf";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else downloadCsv(report);
    } catch {
      if (mounted.current)
        setError(
          "The report could not be exported. Check your session and try again.",
        );
    } finally {
      if (mounted.current) setExporting(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="nr-report"
      aria-label={report.kind}
      onCancel={close}
    >
      <div className="report-tools">
        <button onClick={close} autoFocus>
          Close report
        </button>
        <span>
          <button disabled={exporting} onClick={() => save(true)}>
            {exporting ? "Preparing…" : "Download PDF"}
          </button>
          <button disabled={exporting} onClick={() => save(false)}>
            Export CSV
          </button>
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      {!visit && (
        <div className="report-filters">
          <label>
            Period
            <select
              aria-label="Period"
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
            >
              {[4, 12, 52].map((n) => (
                <option key={n} value={n}>
                  {n} weeks
                </option>
              ))}
            </select>
          </label>
          <label>
            Game
            <select
              aria-label="Game"
              value={game}
              onChange={(e) => setGame(e.target.value as Game | "")}
            >
              <option value="">All games</option>
              {games.map((g) => (
                <option key={g} value={g}>
                  {gameNames[g]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Through date
            <input
              type="date"
              value={ending}
              onChange={(e) => setEnding(e.target.value)}
            />
          </label>
        </div>
      )}
      <article className="report-paper">
        <header className="form-masthead">
          <h1>{report.form.heading}</h1>
          {report.form.flag && <strong>[{report.form.flag}]</strong>}
          <span>
            {report.form.reference} · {report.form.date}
          </span>
        </header>
        <div className="form-identifiers">
          {(
            [
              ["Reporting service", report.form.left],
              ["Participant identifiers", report.form.right],
            ] as const
          ).map(([title, pairs]) => (
            <div key={title}>
              <h2>{title}</h2>
              <dl>
                {pairs.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        {sheetSections(report).map((s, i) => (
          <section className="form-panel" key={i}>
            <header>
              <h2>{s.title}</h2>
              {s.aside && <span>{s.aside}</span>}
            </header>
            <div className="form-body">
              {s.text && <p>{s.text}</p>}
              {s.tiles && (
                <div className="trend-tiles">
                  {s.tiles.map((t) => (
                    <div key={t.label}>
                      <div>
                        {t.label}
                        <b>
                          {t.values[t.values.length - 1]
                            ?.toFixed(1)
                            .replace(/\.0$/, "") ?? "—"}
                        </b>
                      </div>
                      <div
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{
                          __html: plotSvg(
                            {
                              label: t.label,
                              unit: "",
                              labels: t.values.map(String),
                              values: t.values,
                            },
                            true,
                          ),
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              {s.table && (
                <div className="report-table">
                  <table
                    className={
                      s.table.columns[0] === "Measure" ? "form-measures" : ""
                    }
                    aria-label={s.title}
                  >
                    <thead>
                      <tr>
                        {s.table.columns.map((c, j) => (
                          <th scope="col" key={j}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.table.rows.map((r, n) => (
                        <tr key={n}>
                          {r.map((v, j) => (
                            <td key={j}>
                              {s.trajectories && j === r.length - 1 ? (
                                <span
                                  role="img"
                                  aria-label={v}
                                  dangerouslySetInnerHTML={{
                                    __html: trajectorySvg(s.trajectories[n]),
                                  }}
                                />
                              ) : isStatusCell(v) ? (
                                <strong className="form-status">{v}</strong>
                              ) : (
                                v
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {s.bars && s.bars.length > 0 && (
                <figure>
                  <figcaption>{s.barLabel}</figcaption>
                  <div
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: barSvg(s.bars) }}
                  />
                </figure>
              )}
              {s.plot && (
                <figure>
                  <figcaption>
                    {s.plot.label}
                    <span>{s.plot.unit} · active observations</span>
                  </figcaption>
                  <div
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: plotSvg(s.plot) }}
                  />
                  <small className="plot-key">
                    {s.plot.label}
                    {s.plot.threshold !== undefined && (
                      <span>
                        – – &nbsp; Engagement threshold ({s.plot.threshold}%)
                      </span>
                    )}
                  </small>
                </figure>
              )}
            </div>
          </section>
        ))}
        {report.form.staff && (
          <div className="form-sign">
            <b>Reviewed by (staff)</b>
            <span />
            <b>Date</b>
            <span />
          </div>
        )}
        <p className="report-reliability">{reliabilityNote}</p>
      </article>
    </dialog>
  );
}
