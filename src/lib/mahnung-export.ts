import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeightRule,
  ShadingType,
} from "docx";
import { jsPDF } from "jspdf";

export interface MahnungLineItem {
  label: string;
  value: string;
}

export interface MahnungLetterData {
  // Filename / date inputs
  lastName: string;
  issueDateISO: string; // YYYY-MM-DD — used for filename
  issueDateLong: string; // "01. August 2026"
  deadlineDateLong: string;

  // Header
  companyName: string; // "Hallo Theo"
  portfolioName: string; // "Berlin Mitte Portfolio"

  // Recipient
  tenantName: string;
  unitLabel: string;
  propertyStreet?: string | null;
  propertyPostalCode?: string | null;
  propertyCity?: string | null;

  // Body
  subject: string;
  introText: string;
  closingText: string;

  // Aufstellung
  lineItems: MahnungLineItem[]; // Hauptforderung rows + fees + interest
  totalLabel: string; // "Gesamtforderung:"
  totalValue: string;

  // Payment line
  iban: string;
  bic: string;
}

export function fileBaseName(d: MahnungLetterData): string {
  return `Mahnung_${d.lastName}_${d.issueDateISO}`;
}

/* -------------------- PDF -------------------- */

export function downloadAsPdf(d: MahnungLetterData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 20;
  const rightX = pageW - marginX;
  let y = 22;

  const lh = 5.2; // line height in mm (~10.5pt)

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(d.companyName, marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(d.portfolioName, marginX, y + 5);
  doc.setTextColor(60);
  doc.setFontSize(10);
  doc.text(`Berlin, ${d.issueDateLong}`, rightX, y, { align: "right" });
  doc.setTextColor(0);

  y += 22;

  // Recipient
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.text(d.tenantName, marginX, y);
  doc.setFont("helvetica", "normal");
  y += lh;
  doc.text(d.unitLabel, marginX, y);
  if (d.propertyStreet) {
    y += lh;
    doc.text(d.propertyStreet, marginX, y);
  }
  const cityLine = [d.propertyPostalCode, d.propertyCity]
    .filter(Boolean)
    .join(" ");
  if (cityLine) {
    y += lh;
    doc.text(cityLine, marginX, y);
  }

  y += 12;

  // Betreff
  doc.setFont("helvetica", "bold");
  doc.text(`Betreff: ${d.subject}`, marginX, y);
  doc.setFont("helvetica", "normal");

  y += 9;

  // Salutation
  doc.text(`Sehr geehrte/r Herr/Frau ${d.lastName},`, marginX, y);
  y += 8;

  // Intro (justified-ish via splitTextToSize)
  const maxW = pageW - 2 * marginX;
  const intro = doc.splitTextToSize(d.introText, maxW);
  doc.text(intro, marginX, y);
  y += intro.length * lh + 4;

  // Aufstellung header
  doc.setFont("helvetica", "bold");
  doc.text("Aufstellung:", marginX, y);
  doc.setFont("helvetica", "normal");
  y += 6;

  // Line items
  for (const item of d.lineItems) {
    doc.text(`${item.label}:`, marginX, y);
    doc.text(item.value, rightX, y, { align: "right" });
    y += lh;
  }
  // Divider
  y += 1.5;
  doc.setDrawColor(0);
  doc.line(marginX, y, rightX, y);
  y += 5.5;

  // Total
  doc.setFont("helvetica", "bold");
  doc.text(d.totalLabel, marginX, y);
  doc.text(d.totalValue, rightX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 10;

  // Payment line
  const payment = `Bitte begleichen Sie den offenen Betrag bis spätestens ${d.deadlineDateLong} auf das folgende Konto: ${d.iban}, BIC: ${d.bic}.`;
  const paymentLines = doc.splitTextToSize(payment, maxW);
  doc.text(paymentLines, marginX, y);
  y += paymentLines.length * lh + 4;

  // Closing
  const closing = doc.splitTextToSize(d.closingText, maxW);
  doc.text(closing, marginX, y);
  y += closing.length * lh + 10;

  // Signature
  doc.text("Mit freundlichen Grüßen", marginX, y);
  y += lh;
  doc.setFont("helvetica", "bold");
  doc.text("Hausverwaltung Hallo Theo", marginX, y);

  const filename = `${fileBaseName(d)}.pdf`;
  const blob = doc.output("blob");
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.position = "fixed";
  a.style.left = "-9999px";
  a.style.top = "0";

  document.body.appendChild(a);
  a.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  );
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* -------------------- DOCX -------------------- */

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function headerTable(d: MahnungLetterData) {
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [5400, 3626],
    borders: NO_BORDER,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 5400, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: d.companyName,
                    bold: true,
                    size: 28,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: d.portfolioName,
                    color: "666666",
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 3626, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `Berlin, ${d.issueDateLong}`,
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function lineItemTable(d: MahnungLetterData): Table {
  const rows: TableRow[] = [];
  const border = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const bottomLine = {
    top: border,
    bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
    left: border,
    right: border,
  };
  const noBorder = { top: border, bottom: border, left: border, right: border };

  d.lineItems.forEach((item, i) => {
    const last = i === d.lineItems.length - 1;
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 6300, type: WidthType.DXA },
            borders: last ? bottomLine : noBorder,
            margins: { top: 40, bottom: 40, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: `${item.label}:`, size: 21 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 2726, type: WidthType.DXA },
            borders: last ? bottomLine : noBorder,
            margins: { top: 40, bottom: 40, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: item.value, size: 21 })],
              }),
            ],
          }),
        ],
      }),
    );
  });

  // Total row
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: 6300, type: WidthType.DXA },
          borders: NO_BORDER,
          margins: { top: 120, bottom: 40, left: 0, right: 0 },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: d.totalLabel, bold: true, size: 22 }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 2726, type: WidthType.DXA },
          borders: NO_BORDER,
          margins: { top: 120, bottom: 40, left: 0, right: 0 },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: d.totalValue, bold: true, size: 22 }),
              ],
            }),
          ],
        }),
      ],
    }),
  );

  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [6300, 2726],
    borders: NO_BORDER,
    rows,
  });
}

const para = (text: string, opts: { bold?: boolean; spacing?: number } = {}) =>
  new Paragraph({
    spacing: { after: opts.spacing ?? 160 },
    children: [new TextRun({ text, bold: opts.bold, size: 22 })],
  });

const spacer = (after = 200) =>
  new Paragraph({ spacing: { after }, children: [new TextRun({ text: "" })] });

export async function downloadAsDocx(d: MahnungLetterData): Promise<void> {
  const recipientChildren = [
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: d.tenantName, bold: true, size: 22 })],
    }),
    para(d.unitLabel, { spacing: 60 }),
  ];
  if (d.propertyStreet) recipientChildren.push(para(d.propertyStreet, { spacing: 60 }));
  const cityLine = [d.propertyPostalCode, d.propertyCity]
    .filter(Boolean)
    .join(" ");
  if (cityLine) recipientChildren.push(para(cityLine, { spacing: 60 }));

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 },
          },
        },
        children: [
          headerTable(d),
          spacer(400),
          ...recipientChildren,
          spacer(280),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({ text: `Betreff: ${d.subject}`, bold: true, size: 22 }),
            ],
          }),
          para(`Sehr geehrte/r Herr/Frau ${d.lastName},`),
          para(d.introText, { spacing: 240 }),
          para("Aufstellung:", { bold: true, spacing: 120 }),
          lineItemTable(d),
          spacer(240),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: "Bitte begleichen Sie den offenen Betrag bis spätestens ",
                size: 22,
              }),
              new TextRun({ text: d.deadlineDateLong, bold: true, size: 22 }),
              new TextRun({
                text: ` auf das folgende Konto: ${d.iban}, BIC: ${d.bic}.`,
                size: 22,
              }),
            ],
          }),
          para(d.closingText, { spacing: 360 }),
          para("Mit freundlichen Grüßen", { spacing: 60 }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Hausverwaltung Hallo Theo",
                bold: true,
                size: 22,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${fileBaseName(d)}.docx`);
}
