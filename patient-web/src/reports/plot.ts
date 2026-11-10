import type { Plot } from "./report";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  extra = "",
) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;
const text = (
  x: number,
  y: number,
  label: string,
  anchor = "start",
  size = 8,
) =>
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="#363636">${escape(label)}</text>`;

// Each contiguous run has its own filled area. A missing week leaves a visible gap.
export function plotSvg(plot: Plot, miniature = false) {
  const w = miniature ? 110 : 540,
    h = miniature ? 30 : plot.threshold !== undefined ? 157 : 127;
  const left = miniature ? 4 : 27,
    right = miniature ? 5 : 17,
    top = miniature ? 4 : 9,
    bottom = h - (miniature ? 3 : 21);
  const valid = plot.values.filter(
    (n): n is number => n !== null && Number.isFinite(n),
  );
  const lo = Math.min(0, ...valid),
    hi =
      plot.label === "Mean game input by interval"
        ? 100
        : plot.label.startsWith("FMA-UE")
          ? 66
          : Math.max(lo === 0 ? 1 : 0, ...valid);
  const dates = plot.positions,
    last = dates?.[dates.length - 1];
  const x = (i: number) =>
    left +
    (w - left - right) *
      (dates && last !== undefined && last > dates[0]
        ? (dates[i] - dates[0]) / (last - dates[0])
        : plot.labels.length === 1
          ? 0.5
          : i / (plot.labels.length - 1));
  const y = (n: number) => bottom - ((bottom - top) * (n - lo)) / (hi - lo);
  let body = "",
    run: [number, number][] = [];
  function finish() {
    if (!run.length) return;
    const [first] = run,
      end = run[run.length - 1],
      points = run.map(([a, b]) => a + "," + b).join(" ");
    body += `<polygon points="${first[0]},${y(0)} ${points} ${end[0]},${y(0)}" fill="#dedede"/>`;
    body += `<polyline points="${points}" fill="none" stroke="#222" stroke-width="${miniature ? 1.4 : 1.8}"/>`;
    body += `<circle cx="${end[0]}" cy="${end[1]}" r="2.4" fill="${miniature ? "white" : "#222"}" stroke="#222"/>`;
    run = [];
  }
  plot.values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) finish();
    else run.push([x(i), y(v)]);
  });
  finish();
  if (!miniature) {
    body += line(left, y(0), w - right, y(0), "#9e9e9e");
    for (const n of new Set([lo, (lo + hi) / 2, hi]))
      body += text(left - 5, y(n) + 3, String(Number(n.toFixed(1))), "end");
    if (plot.threshold !== undefined)
      body += line(
        left,
        y(plot.threshold),
        w - right,
        y(plot.threshold),
        "#555",
        'stroke-dasharray="4 3"',
      );
    const n = plot.labels.length;
    for (const i of new Set([
      0,
      Math.floor((n - 1) / 3),
      Math.floor((2 * (n - 1)) / 3),
      n - 1,
    ]))
      body += text(
        x(i),
        h - 6,
        plot.labels[i],
        i === 0 ? "start" : i === n - 1 ? "end" : "middle",
      );
  }
  return svg(w, h, body);
}
export function barSvg(
  values: { label: string; value: number; unit: string }[],
) {
  const w = 540,
    h = values.length * 20 + 3,
    x0 = 122,
    x1 = 475;
  const lo = Math.min(0, ...values.map((v) => v.value)),
    hi = Math.max(lo === 0 ? 1 : 0, ...values.map((v) => v.value));
  const x = (v: number) => x0 + ((x1 - x0) * (v - lo)) / (hi - lo);
  let body = "";
  values.forEach((v, i) => {
    const y = i * 20 + 4;
    body +=
      text(2, y + 9, v.label, "start", 10) +
      `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="10" stroke="#888" stroke-width=".7" fill="#eee"/>`;
    body += `<rect x="${Math.min(x(0), x(v.value))}" y="${y}" width="${Math.abs(x(v.value) - x(0))}" height="10" fill="#373737"/>`;
    if (lo < 0) body += line(x(0), y - 2, x(0), y + 12, "#111");
    body += text(w - 2, y + 9, Number(v.value.toFixed(1)) + v.unit, "end", 10);
  });
  return svg(w, h, body);
}
export function trajectorySvg(numbers: (number | null)[]) {
  const w = 62,
    h = 16,
    step = w / numbers.length,
    lo = Math.min(0, ...numbers.map((n) => n ?? 0)),
    hi = Math.max(lo === 0 ? 1 : 0, ...numbers.map((n) => n ?? 0)),
    y = (n: number) => (h * (hi - n)) / (hi - lo);
  return svg(
    w,
    h,
    numbers
      .map((n, i) =>
        n === null
          ? ""
          : `<rect x="${i * step + 1}" y="${Math.min(y(n), y(0))}" width="${step - 2}" height="${Math.abs(y(n) - y(0))}" fill="${i === numbers.length - 1 ? "#333" : "#c9c9c9"}"/>`,
      )
      .join(""),
  );
}
