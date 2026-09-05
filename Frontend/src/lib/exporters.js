import { dateMedium, dateShort, money } from './format';

/**
 * PDF and XLS export. Both libraries are imported lazily inside the handlers so
 * they stay out of the initial bundle — they are only needed the moment a user
 * actually clicks an export button.
 */

const BRAND = { r: 124, g: 58, b: 237 };

async function loadPdf() {
  const [{ default: JsPDF }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return JsPDF;
}

function drawHeader(doc, title, subtitle) {
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('DealFlow360', 14, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 14, 19);

  doc.setTextColor(30, 16, 51);
  if (subtitle) {
    doc.setFontSize(8);
    doc.text(subtitle, 14, 33);
  }
}

/** Generic table export used by the reporting screen. */
export async function exportTableToPdf({ title, subtitle, columns, rows, fileName, summary = [] }) {
  const JsPDF = await loadPdf();
  const doc = new JsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });

  drawHeader(doc, title, subtitle);

  let startY = subtitle ? 39 : 33;

  if (summary.length) {
    doc.autoTable({
      startY,
      body: summary.map((s) => [s.label, s.value]),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1.5, textColor: [75, 59, 107] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    });
    startY = doc.lastAutoTable.finalY + 6;
  }

  doc.autoTable({
    startY,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => c.value(row))),
    theme: 'striped',
    headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b], fontSize: 8.5, textColor: 255 },
    bodyStyles: { fontSize: 8, textColor: [30, 16, 51] },
    alternateRowStyles: { fillColor: [245, 243, 255] },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(124, 111, 147);
    doc.text(
      `Generated ${dateMedium(new Date())}  ·  Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  doc.save(fileName);
}

/** Branded single-invoice PDF for the Invoice & Payment screen. */
export async function exportInvoiceToPdf(invoice, { quotation, currency = 'INR' } = {}) {
  const JsPDF = await loadPdf();
  const doc = new JsPDF();

  drawHeader(doc, `Invoice ${invoice.id}`, null);

  doc.setFontSize(9);
  doc.setTextColor(75, 59, 107);
  doc.text(`Bill to: ${invoice.customerName}`, 14, 36);
  doc.text(`Quotation: ${invoice.quotationId}`, 14, 41);
  doc.text(`Issued: ${dateShort(invoice.issueDate)}`, 140, 36);
  doc.text(`Due: ${dateShort(invoice.dueDate)}`, 140, 41);
  doc.text(`Status: ${invoice.status.replace(/_/g, ' ')}`, 140, 46);

  doc.autoTable({
    startY: 54,
    head: [['Product', 'Qty', 'Unit price', 'Disc %', 'Total']],
    body: invoice.lines.map((l) => [
      l.productName,
      String(l.qty),
      money(l.unitPrice, currency),
      `${l.discountPct}%`,
      money(l.total, currency),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b], fontSize: 8.5, textColor: 255 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 16, 51] },
    alternateRowStyles: { fillColor: [245, 243, 255] },
    margin: { left: 14, right: 14 },
  });

  const amountPaid = invoice.payments.reduce((s, p) => s + p.amount, 0);
  const balance = invoice.total - amountPaid;

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 4,
    body: [
      ['Subtotal', money(invoice.subtotal, currency)],
      ['Tax', money(invoice.tax, currency)],
      ['Total', money(invoice.total, currency)],
      ['Amount paid', money(amountPaid, currency)],
      ['Balance remaining', money(balance, currency)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 120, textColor: [75, 59, 107] },
      1: { halign: 'right', textColor: [30, 16, 51] },
    },
    margin: { left: 14, right: 14 },
  });

  if (invoice.payments.length) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Payment date', 'Amount', 'Method', 'Reference']],
      body: invoice.payments.map((p) => [
        dateShort(p.date),
        money(p.amount, currency),
        p.method.replace(/_/g, ' '),
        p.reference || '—',
      ]),
      theme: 'grid',
      headStyles: { fillColor: [99, 102, 241], fontSize: 8, textColor: 255 },
      bodyStyles: { fontSize: 8, textColor: [30, 16, 51] },
      margin: { left: 14, right: 14 },
    });
  }

  if (quotation?.customerTerms) {
    doc.setFontSize(7.5);
    doc.setTextColor(124, 111, 147);
    doc.text(doc.splitTextToSize(quotation.customerTerms, 180), 14, doc.lastAutoTable.finalY + 8);
  }

  doc.save(`${invoice.id}.pdf`);
}

/** Multi-sheet XLS export. `sheets` is [{ name, rows }] with rows as objects. */
export async function exportToXlsx({ sheets, fileName }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    // Rough auto-width so the file is readable without manual resizing.
    const keys = sheet.rows.length ? Object.keys(sheet.rows[0]) : [];
    ws['!cols'] = keys.map((k) => ({
      wch: Math.min(
        40,
        Math.max(k.length + 2, ...sheet.rows.map((r) => String(r[k] ?? '').length + 2)),
      ),
    }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  XLSX.writeFile(wb, fileName);
}
