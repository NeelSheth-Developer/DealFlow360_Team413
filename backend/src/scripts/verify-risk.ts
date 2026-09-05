import 'dotenv/config';
import { loadCeilings, loadChain, scoreLines } from '../lib/risk.js';

const ceilings = await loadCeilings();
const chain = await loadChain();

type Case = { name: string; input: Parameters<typeof scoreLines>[0]; expect: Record<string, unknown> };

const L = (category: 'hardware'|'service'|'subscription'|'accessories', qty: number, unitPrice: number, discountPct: number) =>
  ({ id: null, productName: category, category, qty, unitPrice, discountPct });

const cases: Case[] = [
  { name: '1. Laptop 1000@10 hw + Service 2000@18 svc, gold',
    input: { quotationId: null, tier: 'gold', orderDiscountPct: 0, lines: [L('hardware',1,1000,10), L('service',1,2000,18)] },
    expect: { score: 5.33, worstSingleOverage: 8, totalValue: 3000, weightedOverage: 16000, approvers: 'sales_manager,finance' } },
  { name: '2. Laptop 8x87400@12 + Service 1x18400@18, gold',
    input: { quotationId: 'Q-1042', tier: 'gold', orderDiscountPct: 0, lines: [L('hardware',8,87400,12), L('service',1,18400,18)] },
    expect: { score: 0.21, worstSingleOverage: 8, totalValue: 717600, weightedOverage: 147200, approvers: 'sales_manager' } },
  { name: '3. Service 2x5000@30, ceiling 10',
    input: { quotationId: null, tier: 'gold', orderDiscountPct: 0, lines: [L('service',2,5000,30)] },
    expect: { score: 20, worstSingleOverage: 20, totalValue: 10000, approvers: 'sales_manager,finance' } },
  { name: '4. Service @8 with orderDiscount 10, ceiling 10',
    input: { quotationId: null, tier: 'gold', orderDiscountPct: 10, lines: [L('service',1,1000,8)] },
    expect: { givenPct: 17.2, overBy: 7.2 } },
  { name: '5. Hardware 4x50000@12, ceiling 15',
    input: { quotationId: null, tier: 'gold', orderDiscountPct: 0, lines: [L('hardware',4,50000,12)] },
    expect: { score: 0, approvers: '' } },
  { name: '6. Service @25, ceiling 10 -> overage 15',
    input: { quotationId: null, tier: 'gold', orderDiscountPct: 0, lines: [L('service',1,1000,25)] },
    expect: { score: 15, worstSingleOverage: 15, approvers: 'sales_manager,finance' } },
];

let failed = 0;
for (const c of cases) {
  const r = scoreLines(c.input, ceilings, chain);
  const actual: Record<string, unknown> = {
    score: r.score, worstSingleOverage: r.worstSingleOverage, totalValue: r.totalValue,
    weightedOverage: r.weightedOverage, approvers: r.approvers.join(','),
    givenPct: r.lineBreakdown[0]?.givenPct, overBy: r.lineBreakdown[0]?.overBy,
  };
  const bad = Object.entries(c.expect).filter(([k, v]) => actual[k] !== v);
  console.log(bad.length ? 'FAIL ' : 'PASS ', c.name);
  if (bad.length) {
    failed += 1;
    for (const [k, v] of bad) console.log(`        ${k}: expected ${String(v)}, got ${String(actual[k])}`);
  }
}
console.log(failed === 0 ? '\nAll 6 reference cases match.' : `\n${failed} case(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
