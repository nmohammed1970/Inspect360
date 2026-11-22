/**
 * Run: npx tsx shared/maintenanceFinanceMath.test.ts
 */
import {
  computePaymentSummary,
  computeQuoteLine,
  computeQuoteTotals,
  resolveVatPercent,
  roundHalfUp,
} from "./maintenanceFinanceMath";

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

check(roundHalfUp(1.5) === 2, "half-up 1.5 → 2");
check(resolveVatPercent("standard_20") === 20, "standard 20%");
check(resolveVatPercent("reduced") === 5, "reduced 5%");
check(resolveVatPercent("exempt") === 0, "exempt 0");
check(resolveVatPercent("zero_rated") === 0, "zero 0");

const labour = computeQuoteLine({ quantity: 2, unitPriceMinor: 5500, vatRate: "standard_20" });
check(labour.lineNetMinor === 11000, "2×55.00 net 110.00");
check(labour.lineTaxMinor === 2200, "20% of 110 = 22.00");
check(labour.lineTotalMinor === 13200, "line total 132.00");

const materials = computeQuoteLine({ quantity: 1, unitPriceMinor: 3250, vatRate: "standard_20" });
check(materials.lineNetMinor === 3250, "materials net");
check(materials.lineTaxMinor === 650, "materials tax");

const callout = computeQuoteLine({ quantity: 1, unitPriceMinor: 2500, vatRate: "standard_20" });
const totals = computeQuoteTotals([
  { lineNetMinor: 11000, lineTaxMinor: 2200, lineTotalMinor: 13200 },
  { lineNetMinor: 3250, lineTaxMinor: 650, lineTotalMinor: 3900 },
  { lineNetMinor: 2500, lineTaxMinor: 500, lineTotalMinor: 3000 },
]);
check(totals.subtotalMinor === 16750, "subtotal 167.50");
check(totals.taxMinor === 3350, "tax 33.50");
check(totals.totalMinor === 20100, "total 201.00");

const exempt = computeQuoteLine({ quantity: 1, unitPriceMinor: 10000, vatRate: "exempt" });
check(exempt.lineTaxMinor === 0 && exempt.lineTotalMinor === 10000, "exempt no tax");

const pay0 = computePaymentSummary(20100, []);
check(pay0.status === "unpaid" && pay0.outstandingMinor === 20100, "unpaid");
const payPart = computePaymentSummary(20100, [10000]);
check(payPart.status === "partially_paid" && payPart.outstandingMinor === 10100, "partial");
const payFull = computePaymentSummary(20100, [10000, 10100]);
check(payFull.status === "paid" && payFull.outstandingMinor === 0, "paid");

console.log(`maintenanceFinanceMath: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
