import pdfMake from "pdfmake/build/pdfmake";
import fonts from "pdfmake/build/vfs_fonts";
import type {
  Content,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type { Report, Section } from "./report";
import { barSvg, plotSvg, trajectorySvg } from "./plot";
import { isStatusCell, reliabilityNote, sheetSections } from "./sheet";

const hairline: CustomTableLayout = {
  hLineWidth: () => 0.55,
  vLineWidth: () => 0.55,
  hLineColor: () => "#969696",
  vLineColor: () => "#969696",
  paddingTop: () => 3.4,
  paddingBottom: () => 3.4,
  paddingLeft: () => 5,
  paddingRight: () => 5,
};
const box: CustomTableLayout = {
  hLineWidth: (i, node) =>
    i === 0 || i === 1 || i === node.table.body.length ? 0.7 : 0,
  vLineWidth: () => 0.7,
  hLineColor: () => "#777777",
  vLineColor: () => "#777777",
  paddingTop: () => 4.3,
  paddingBottom: () => 4.3,
  paddingLeft: () => 8,
  paddingRight: () => 8,
};
function idBlock(title: string, pairs: [string, string][]): Content {
  return {
    stack: [
      {
        text: title.toUpperCase(),
        fontSize: 9.2,
        bold: true,
        margin: [0, 2, 0, 4],
      },
      ...pairs.map(
        ([k, v]): Content => ({
          columns: [
            { text: k, color: "#454545", width: 72 },
            { text: v, bold: true, width: "*" },
          ],
          fontSize: 9.4,
          margin: [0, 1.3, 0, 1.3],
        }),
      ),
    ],
  };
}
function panel(s: Section): Content {
  const header: Content = {
    columns: [
      { text: s.title, bold: true, width: "*" },
      ...(s.aside
        ? [
            {
              text: s.aside,
              fontSize: 8,
              color: "#383838",
              alignment: "right" as const,
              width: "auto" as const,
            },
          ]
        : []),
    ],
  };
  const rows: TableCell[][] = [
    [{ ...header, fillColor: "#d9d9d9", fontSize: 10.2 }],
  ];
  if (s.text)
    rows.push([{ text: s.text, margin: [0, 3, 0, 3], fontSize: 10.3 }]);
  if (s.tiles)
    rows.push([
      {
        columns: s.tiles.map((t) => ({
          width: "*",
          table: {
            widths: ["*"],
            body: [
              [
                {
                  stack: [
                    {
                      columns: [
                        { text: t.label, fontSize: 8, width: "*" },
                        {
                          text: String(
                            Number(
                              t.values[t.values.length - 1]?.toFixed(1) ?? NaN,
                            ),
                          ).replace("NaN", "—"),
                          fontSize: 10,
                          bold: true,
                          width: "auto",
                        },
                      ],
                    },
                    {
                      svg: plotSvg(
                        {
                          label: t.label,
                          unit: "",
                          labels: t.values.map(String),
                          values: t.values,
                        },
                        true,
                      ),
                      fit: [85, 23],
                      margin: [0, 4, 0, 0],
                    },
                  ],
                },
              ],
            ],
          },
          layout: hairline,
        })),
        columnGap: 7,
      },
    ]);
  if (s.table) {
    const t = s.table;
    const body: TableCell[][] = [
      t.columns.map((c) => ({
        text: c.toUpperCase(),
        bold: true,
        fontSize: 8.2,
        fillColor: "#ececec",
        color: "#1c252c",
      })),
    ];
    t.rows.forEach((row, i) =>
      body.push(
        row.map((text, j) =>
          s.trajectories && j === row.length - 1
            ? { svg: trajectorySvg(s.trajectories[i]), fit: [59, 16] }
            : isStatusCell(text)
              ? {
                  table: {
                    widths: ["auto"],
                    body: [[{ text, fontSize: 7.3, bold: true }]],
                  },
                  layout: {
                    ...hairline,
                    paddingTop: () => 1,
                    paddingBottom: () => 1,
                    paddingLeft: () => 3,
                    paddingRight: () => 3,
                  },
                }
              : {
                  text,
                  bold: j === 0,
                  alignment:
                    j === 1 && t.columns[j] === "Result" ? "right" : "left",
                },
        ),
      ),
    );
    const widths =
      t.columns.length === 4 && t.columns[0] === "Measure"
        ? ["32%", "17%", "27%", "24%"]
        : t.columns.map(() => "*");
    rows.push([
      {
        table: { widths, headerRows: 1, body, dontBreakRows: true },
        layout: hairline,
        fontSize: 9.1,
        margin: [0, 2, 0, 2],
      },
    ]);
  }
  if (s.bars?.length)
    rows.push([
      {
        unbreakable: true,
        stack: [
          {
            text: s.barLabel ?? "Measured values",
            bold: true,
            fontSize: 9,
            margin: [0, 0, 0, 3],
          },
          { svg: barSvg(s.bars), width: 503 },
        ],
      },
    ]);
  if (s.plot)
    rows.push([
      {
        unbreakable: true,
        stack: [
          {
            columns: [
              { text: s.plot.label, bold: true, width: "*" },
              {
                text: s.plot.unit + " · active observations",
                width: "auto",
                fontSize: 8,
                color: "#444444",
              },
            ],
            fontSize: 9.1,
          },
          { svg: plotSvg(s.plot), width: 503, margin: [0, 4, 0, 1] },
          {
            text:
              "—   " +
              s.plot.label +
              (s.plot.threshold !== undefined
                ? "       – –   Engagement threshold (" +
                  s.plot.threshold +
                  "%)"
                : ""),
            fontSize: 7.4,
            color: "#333333",
          },
        ],
      },
    ]);
  return {
    table: { widths: ["*"], headerRows: 1, body: rows },
    layout: box,
    margin: [0, 0, 0, 9],
    unbreakable:
      (!s.table || s.table.rows.length <= 14) && (s.text?.length ?? 0) < 850,
  };
}
export function reportDefinition(report: Report): TDocumentDefinitions {
  const f = report.form;
  const mast: Content = {
    columns: [
      {
        text: f.heading.toUpperCase(),
        bold: true,
        fontSize: 10.6,
        characterSpacing: 0.15,
        width: "*",
      },
      ...(f.flag
        ? [
            {
              text: "[" + f.flag + "]",
              bold: true,
              fontSize: 9.2,
              color: "#b82214",
              width: "auto" as const,
            },
          ]
        : []),
      {
        text: f.reference + " · " + f.date,
        fontSize: 8,
        color: "#333333",
        width: "auto",
      },
    ],
    columnGap: 8,
  };
  const body: Content[] = [
    mast,
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 527,
          y2: 0,
          lineWidth: 1.5,
          lineColor: "#111111",
        },
      ],
      margin: [0, 4, 0, 9],
    },
    {
      table: {
        widths: ["*", "*"],
        body: [
          [
            idBlock("Reporting service", f.left),
            idBlock("Participant identifiers", f.right),
          ],
        ],
      },
      layout: box,
      margin: [0, 0, 0, 9],
    },
    ...sheetSections(report).map(panel),
    ...(f.staff
      ? [
          {
            table: {
              widths: [103, "*", 40, 100],
              body: [
                [
                  {
                    text: "Reviewed by (staff)",
                    bold: true,
                    fillColor: "#eeeeee",
                  },
                  "",
                  { text: "Date", bold: true, fillColor: "#eeeeee" },
                  "",
                ],
              ],
            },
            layout: hairline,
            margin: [0, 0, 0, 6],
            fontSize: 9,
          } as Content,
        ]
      : []),
    {
      text: reliabilityNote,
      italics: true,
      fontSize: 8.4,
      color: "#333333",
      margin: [0, 2, 0, 0],
    },
  ];
  return {
    pageSize: "A4",
    pageMargins: [34, 40, 34, 34],
    info: { title: report.kind + " · " + report.title, author: "NeuroReach" },
    defaultStyle: {
      font: "Roboto",
      fontSize: 9.3,
      lineHeight: 1.1,
      color: "#161616",
    },
    footer: (p, n) => ({
      text: f.reference + "   ·   " + p + " / " + n,
      alignment: "right",
      fontSize: 7,
      color: "#666666",
      margin: [34, 13, 34, 0],
    }),
    content: body,
  };
}
export function pdfBlob(report: Report): Promise<Blob> {
  const doc = pdfMake.createPdf(
    reportDefinition(report),
    undefined,
    undefined,
    fonts,
  );
  return new Promise((resolve) => doc.getBlob(resolve));
}
