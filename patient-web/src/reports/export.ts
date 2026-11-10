import type { Report } from "./report";

export function csvReport(report: Report): string {
  const rows: string[][] = [
    [report.kind, report.title],
    [report.context],
    [report.summary],
    [],
    ["Measure", "Result"],
    ...report.stats,
  ];
  for (const s of [report.overview, ...report.sections]) {
    rows.push([], [s.title]);
    if (s.text) rows.push([s.text]);
    if (s.table) rows.push(s.table.columns, ...s.table.rows);
    else if (s.plot) {
      rows.push(["Interval", s.plot.label + " (" + s.plot.unit + ")"]);
      s.plot.labels.forEach((l, i) =>
        rows.push([l, s.plot!.values[i]?.toString() ?? ""]),
      );
    }
  }
  function quote(text: string) {
    // Numeric readings can be negative. Protect nonnumeric, user-entered text in spreadsheet apps.
    if (
      (/^[\s]*[=+@-]/.test(text) && !/^-?\d+(\.\d+)?%?$/.test(text)) ||
      /^[\t\r\n]/.test(text)
    )
      text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return (
    "\uFEFF" + rows.map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n"
  );
}
export function downloadCsv(report: Report) {
  const url = URL.createObjectURL(
    new Blob([csvReport(report)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = report.filename + ".csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
