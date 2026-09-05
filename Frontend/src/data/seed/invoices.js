import { daysAgo, daysAhead } from './quotations';

/**
 * Six invoices in mixed payment states so the Invoice & Payment screen has
 * something to show at every step of its status stepper, and so the reporting
 * revenue figures are not all zero on first load.
 *
 * Invoices cover ONE-TIME lines only — recurring lines bill on their own
 * schedule, which is the hybrid-billing separation the platform is about.
 */
export const invoices = [
  // Partially paid — the headline demo case for the status stepper.
  {
    id: 'INV-2031',
    quotationId: 'Q-1031',
    customerName: 'Beta Industries',
    currency: 'INR',
    status: 'partially_paid',
    lines: [
      {
        lineId: 'l-1031-1',
        productName: 'UltraSharp 27" Monitor',
        qty: 8,
        unitPrice: 30700,
        discountPct: 8,
        total: 225952,
      },
      {
        lineId: 'l-1031-2',
        productName: 'Thunderbolt Docking Station',
        qty: 8,
        unitPrice: 17750,
        discountPct: 6,
        total: 133480,
      },
    ],
    subtotal: 359432,
    tax: 64698,
    total: 424130,
    payments: [
      {
        id: 'pay-2031-1',
        invoiceId: 'INV-2031',
        amount: 200000,
        method: 'bank_transfer',
        reference: 'NEFT-88213004',
        recordedById: 'u-vikram',
        recordedByName: 'Vikram Rao',
        date: daysAgo(12).slice(0, 10),
      },
    ],
    issueDate: daysAgo(15).slice(0, 10),
    dueDate: daysAhead(0),
  },

  // Fully paid.
  {
    id: 'INV-2030',
    quotationId: 'Q-1030',
    customerName: 'Acme Corp',
    currency: 'INR',
    status: 'paid',
    lines: [
      {
        lineId: 'l-1030-1',
        productName: 'Laptop Pro 14',
        qty: 6,
        unitPrice: 87400,
        discountPct: 8,
        total: 482448,
      },
      {
        lineId: 'l-1030-2',
        productName: 'Onboarding Setup Service',
        qty: 1,
        unitPrice: 18400,
        discountPct: 9,
        total: 16744,
      },
    ],
    subtotal: 499192,
    tax: 89855,
    total: 589047,
    payments: [
      {
        id: 'pay-2030-1',
        invoiceId: 'INV-2030',
        amount: 300000,
        method: 'bank_transfer',
        reference: 'NEFT-77120945',
        recordedById: 'u-vikram',
        recordedByName: 'Vikram Rao',
        date: daysAgo(40).slice(0, 10),
      },
      {
        id: 'pay-2030-2',
        invoiceId: 'INV-2030',
        amount: 289047,
        method: 'bank_transfer',
        reference: 'NEFT-77998231',
        recordedById: 'u-vikram',
        recordedByName: 'Vikram Rao',
        date: daysAgo(31).slice(0, 10),
      },
    ],
    issueDate: daysAgo(48).slice(0, 10),
    dueDate: daysAgo(33).slice(0, 10),
  },

  // Fully paid, older.
  {
    id: 'INV-2029',
    quotationId: 'Q-1029',
    customerName: 'Horizon Education',
    currency: 'INR',
    status: 'paid',
    lines: [
      {
        lineId: 'l-1029-1',
        productName: 'Rugged Field Tablet',
        qty: 5,
        unitPrice: 55700,
        discountPct: 7,
        total: 258999,
      },
      {
        lineId: 'l-1029-2',
        productName: 'Training Workshop',
        qty: 2,
        unitPrice: 14400,
        discountPct: 8,
        total: 26496,
      },
    ],
    subtotal: 285495,
    tax: 51389,
    total: 336884,
    payments: [
      {
        id: 'pay-2029-1',
        invoiceId: 'INV-2029',
        amount: 336884,
        method: 'cheque',
        reference: 'CHQ-450918',
        recordedById: 'u-vikram',
        recordedByName: 'Vikram Rao',
        date: daysAgo(58).slice(0, 10),
      },
    ],
    issueDate: daysAgo(64).slice(0, 10),
    dueDate: daysAgo(49).slice(0, 10),
  },

  // Sent, unpaid.
  {
    id: 'INV-2032',
    quotationId: 'Q-1032',
    customerName: 'Gemini Healthcare',
    currency: 'INR',
    status: 'sent',
    lines: [
      {
        lineId: 'l-1032-1',
        productName: 'Laptop Pro 14',
        qty: 12,
        unitPrice: 87400,
        discountPct: 10,
        total: 943920,
      },
      {
        lineId: 'l-1032-2',
        productName: 'Reinforced Carry Case',
        qty: 12,
        unitPrice: 2950,
        discountPct: 10,
        total: 31860,
      },
    ],
    subtotal: 975780,
    tax: 175640,
    total: 1151420,
    payments: [],
    issueDate: daysAgo(6).slice(0, 10),
    dueDate: daysAhead(9),
  },

  // Draft — start of the stepper.
  {
    id: 'INV-2034',
    quotationId: 'Q-1034',
    customerName: 'Acme Corp',
    currency: 'INR',
    status: 'draft',
    lines: [
      {
        lineId: 'l-1034-1',
        productName: 'Laptop Pro 14',
        qty: 4,
        unitPrice: 87400,
        discountPct: 16,
        total: 293664,
      },
      {
        lineId: 'l-1034-2',
        productName: 'Thunderbolt Docking Station',
        qty: 4,
        unitPrice: 17000,
        discountPct: 10,
        total: 61200,
      },
      {
        lineId: 'l-1034-3',
        productName: 'Extended Warranty (2 years)',
        qty: 4,
        unitPrice: 8750,
        discountPct: 12,
        total: 30800,
      },
    ],
    subtotal: 385664,
    tax: 69420,
    total: 455084,
    payments: [],
    issueDate: daysAgo(2).slice(0, 10),
    dueDate: daysAhead(13),
  },

  // Partially paid, second example (different method).
  {
    id: 'INV-2033',
    quotationId: 'Q-1033',
    customerName: 'Delta Logistics',
    currency: 'INR',
    status: 'partially_paid',
    lines: [
      {
        lineId: 'l-1033-1',
        productName: 'Managed Switch 24-Port',
        qty: 4,
        unitPrice: 38650,
        discountPct: 10,
        total: 139140,
      },
      {
        lineId: 'l-1033-2',
        productName: 'WiFi 6 Access Point',
        qty: 12,
        unitPrice: 15200,
        discountPct: 12,
        total: 160512,
      },
      {
        lineId: 'l-1033-3',
        productName: 'UPS 1500VA Rack Mount',
        qty: 4,
        unitPrice: 22100,
        discountPct: 8,
        total: 81328,
      },
    ],
    subtotal: 380980,
    tax: 68576,
    total: 449556,
    payments: [
      {
        id: 'pay-2033-1',
        invoiceId: 'INV-2033',
        amount: 150000,
        method: 'upi',
        reference: 'UPI-9920184477',
        recordedById: 'u-vikram',
        recordedByName: 'Vikram Rao',
        date: daysAgo(9).slice(0, 10),
      },
    ],
    issueDate: daysAgo(11).slice(0, 10),
    dueDate: daysAhead(4),
  },
];

/** Credit notes and refunds ledger, referenced by the billing screen. */
export const creditNotes = [
  {
    id: 'CN-0007',
    quotationId: 'Q-1031',
    lineId: 'l-1031-3',
    amount: 4370,
    type: 'credit_note',
    reason: 'Seat count reduced from 20 to 18 mid-cycle (daily prorated).',
    createdAt: daysAgo(18),
    createdById: 'u-vikram',
  },
  {
    id: 'CN-0006',
    quotationId: 'Q-1029',
    lineId: 'l-1029-3',
    amount: 725,
    type: 'refund',
    reason: 'Backup & DR cancelled mid-cycle — unused days refunded.',
    createdAt: daysAgo(35),
    createdById: 'u-vikram',
  },
];
