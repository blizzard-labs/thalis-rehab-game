import type { Report, Section } from "./report";

// Both renderers follow the same panels and reading order.
export function sheetSections(report: Report): Section[] {
  const session = report.kind === "Session report";
  const opening: Section[] = [
    {
      title: session ? "Session context" : "Report scope",
      text: report.form.context,
    },
    {
      title: session ? "Session summary" : "Longitudinal summary",
      text: report.summary,
    },
    report.overview,
  ];
  if (!session) return [...opening, ...report.sections];
  const order = [
    "EEG and calibration",
    "Decode quality",
    "Movement and posture",
    "Input coverage",
    "Time above the game threshold",
    "Four-week trend",
    "Practice timeline",
    "Cortical engagement over time",
    "Movement over time",
    "Breaks and input changes",
    "Latest recorded assessment",
    "Participant or staff observations",
    "Notes & reliability",
  ];
  return [
    ...opening,
    ...report.sections
      .slice()
      .sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title)),
  ];
}
export const reliabilityNote =
  "NeuroReach measures describe practice, engagement and movement over time. Clinical interpretation belongs with the supervising clinician and formal assessments.";

export function isStatusCell(value: string) {
  return [
    "WITHIN TARGET",
    "ABOVE TARGET",
    "MEETS MODEL GATE",
    "BELOW MODEL GATE",
  ].includes(value);
}
