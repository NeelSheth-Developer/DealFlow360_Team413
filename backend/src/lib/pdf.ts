import PDFDocument from 'pdfkit';

/**
 * Server-rendered PDFs for quotations and invoices.
 *
 * Deliberately plain: a header, a details block, a line table and a totals block. No
 * logo, no web fonts, no colour beyond one accent — a document that has to be readable
 * when printed in black and white by a procurement team is not the place for design.
 *
 * pdfkit streams, so the buffer is collected here and handed back whole. These
 * documents are a few kilobytes; buffering one is cheaper than plumbing a stream
 * through the upload path and the response path both.
 */

const INK = '#111827';
const MUTED = '#6b7280';
const ACCENT = '#4f46e5';
const LINE = '#e5e7eb';

const PAGE_MARGIN = 48;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

export type PdfLine = {
  productName: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  total: number;
};

export type PdfDocumentInput = {
  kind: 'Quotation' | 'Invoice';
  reference: string;
  issuedOn: string;
  currency: string;
  customerName: string;
  customerContact: string | null;
  customerEmail: string;
  /** Label/value pairs shown in the top-right meta block. */
  meta: { label: string; value: string }[];
  lines: PdfLine[];
  totals: { label: string; value: number; strong?: boolean }[];
  terms: string | null;
  /** Shown at the very bottom, e.g. payment instructions. */
  footNote: string | null;
};

function money(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Renders the document and resolves with the complete PDF bytes. */
export async function renderPdf(input: PdfDocumentInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  header(doc, input);
  parties(doc, input);
  const tableBottom = lineTable(doc, input);
  totalsBlock(doc, input, tableBottom);
  footer(doc, input);

  doc.end();
  return done;
}

function header(doc: PDFKit.PDFDocument, input: PdfDocumentInput) {
  doc
    .fillColor(ACCENT)
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('DEALFLOW360', PAGE_MARGIN, PAGE_MARGIN, { characterSpacing: 1 });

  doc
    .fillColor(INK)
    .fontSize(22)
    .font('Helvetica-Bold')
    .text(input.kind, PAGE_MARGIN, PAGE_MARGIN + 22);

  doc
    .fillColor(MUTED)
    .fontSize(10)
    .font('Helvetica')
    .text(input.reference, PAGE_MARGIN, PAGE_MARGIN + 50);

  // Meta block, right-aligned against the page margin.
  let y = PAGE_MARGIN + 4;
  for (const row of input.meta) {
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .font('Helvetica')
      .text(row.label, PAGE_MARGIN + CONTENT_WIDTH - 220, y, { width: 110, align: 'right' });
    doc
      .fillColor(INK)
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(row.value, PAGE_MARGIN + CONTENT_WIDTH - 100, y, { width: 100, align: 'right' });
    y += 15;
  }

  const ruleY = Math.max(PAGE_MARGIN + 74, y + 8);
  doc
    .moveTo(PAGE_MARGIN, ruleY)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, ruleY)
    .strokeColor(LINE)
    .lineWidth(1)
    .stroke();

  doc.y = ruleY + 18;
}

function parties(doc: PDFKit.PDFDocument, input: PdfDocumentInput) {
  const top = doc.y;

  doc
    .fillColor(MUTED)
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('BILL TO', PAGE_MARGIN, top, { characterSpacing: 0.5 });

  doc
    .fillColor(INK)
    .fontSize(11)
    .font('Helvetica-Bold')
    .text(input.customerName, PAGE_MARGIN, top + 14);

  let y = top + 30;
  if (input.customerContact) {
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(input.customerContact, PAGE_MARGIN, y);
    y += 13;
  }
  doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(input.customerEmail, PAGE_MARGIN, y);

  doc.y = y + 30;
}

/** Column x-offsets, measured from the left margin. Right-aligned columns carry a width. */
const COLUMNS = {
  item: { x: 0, width: 220 },
  qty: { x: 230, width: 40 },
  unit: { x: 275, width: 90 },
  discount: { x: 370, width: 55 },
  total: { x: 430, width: CONTENT_WIDTH - 430 },
};

function lineTable(doc: PDFKit.PDFDocument, input: PdfDocumentInput): number {
  const headerY = doc.y;

  doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold');
  doc.text('ITEM', PAGE_MARGIN + COLUMNS.item.x, headerY, { width: COLUMNS.item.width });
  doc.text('QTY', PAGE_MARGIN + COLUMNS.qty.x, headerY, {
    width: COLUMNS.qty.width,
    align: 'right',
  });
  doc.text('UNIT PRICE', PAGE_MARGIN + COLUMNS.unit.x, headerY, {
    width: COLUMNS.unit.width,
    align: 'right',
  });
  doc.text('DISC.', PAGE_MARGIN + COLUMNS.discount.x, headerY, {
    width: COLUMNS.discount.width,
    align: 'right',
  });
  doc.text('TOTAL', PAGE_MARGIN + COLUMNS.total.x, headerY, {
    width: COLUMNS.total.width,
    align: 'right',
  });

  let y = headerY + 14;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .strokeColor(LINE)
    .stroke();
  y += 10;

  for (const line of input.lines) {
    // A long product name wraps, so the row height is measured rather than assumed.
    const nameHeight = doc
      .fontSize(9)
      .font('Helvetica')
      .heightOfString(line.productName, { width: COLUMNS.item.width });

    const rowHeight = Math.max(nameHeight, 12);

    // Page break before the row rather than through it.
    if (y + rowHeight > doc.page.height - PAGE_MARGIN - 120) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    doc.fillColor(INK).fontSize(9).font('Helvetica');
    doc.text(line.productName, PAGE_MARGIN + COLUMNS.item.x, y, { width: COLUMNS.item.width });
    doc.text(String(line.qty), PAGE_MARGIN + COLUMNS.qty.x, y, {
      width: COLUMNS.qty.width,
      align: 'right',
    });
    doc.text(money(line.unitPrice, input.currency), PAGE_MARGIN + COLUMNS.unit.x, y, {
      width: COLUMNS.unit.width,
      align: 'right',
    });
    doc.text(
      line.discountPct > 0 ? `${line.discountPct.toFixed(2)}%` : '—',
      PAGE_MARGIN + COLUMNS.discount.x,
      y,
      { width: COLUMNS.discount.width, align: 'right' },
    );
    doc
      .font('Helvetica-Bold')
      .text(money(line.total, input.currency), PAGE_MARGIN + COLUMNS.total.x, y, {
        width: COLUMNS.total.width,
        align: 'right',
      });

    y += rowHeight + 10;
  }

  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .strokeColor(LINE)
    .stroke();
  return y + 14;
}

function totalsBlock(doc: PDFKit.PDFDocument, input: PdfDocumentInput, top: number) {
  let y = top;

  for (const row of input.totals) {
    doc
      .fillColor(row.strong ? INK : MUTED)
      .fontSize(row.strong ? 11 : 9)
      .font(row.strong ? 'Helvetica-Bold' : 'Helvetica')
      .text(row.label, PAGE_MARGIN + CONTENT_WIDTH - 260, y, { width: 150, align: 'right' });

    doc
      .fillColor(INK)
      .fontSize(row.strong ? 11 : 9)
      .font('Helvetica-Bold')
      .text(money(row.value, input.currency), PAGE_MARGIN + CONTENT_WIDTH - 100, y, {
        width: 100,
        align: 'right',
      });

    y += row.strong ? 20 : 15;
  }

  doc.y = y + 16;
}

function footer(doc: PDFKit.PDFDocument, input: PdfDocumentInput) {
  if (input.terms) {
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('TERMS', PAGE_MARGIN, doc.y, { characterSpacing: 0.5 });

    doc
      .fillColor(INK)
      .fontSize(9)
      .font('Helvetica')
      .text(input.terms, PAGE_MARGIN, doc.y + 4, { width: CONTENT_WIDTH, lineGap: 2 });
  }

  if (input.footNote) {
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text(input.footNote, PAGE_MARGIN, doc.page.height - PAGE_MARGIN - 24, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
  }
}
