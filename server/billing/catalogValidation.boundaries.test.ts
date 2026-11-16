/**
 * Catalog publish validation — boundaries & invalid inputs.
 * Run: npx tsx server/billing/catalogValidation.boundaries.test.ts
 */
import assert from "node:assert/strict";
import { validateCatalog, DEFAULT_INSPECTION_FLOOR_MINOR } from "./catalogValidation";
import { SEED_ADDONS, SEED_PLAN_MONTHLY_MINOR, SEED_PLANS, SEED_TOPUPS } from "./catalogSeed";

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

const basePlan = {
  code: "pm_essentials",
  tab: "property_management",
  monthlyInspections: 5,
  yearlyInspections: 60,
};

check(DEFAULT_INSPECTION_FLOOR_MINOR === 295, "floor constant");

{
  const r = validateCatalog({
    plans: [basePlan],
    prices: [
      { planCode: "pm_essentials", cycle: "monthly", amountMinor: -1 },
      { planCode: "pm_essentials", cycle: "yearly", amountMinor: -10 },
    ],
    topups: [],
  });
  check(!r.ok, "negative prices fail");
  check(r.issues.some((i) => i.code === "NEGATIVE_PRICE"), "NEGATIVE_PRICE issue");
}

{
  const r = validateCatalog({
    plans: [basePlan],
    prices: [{ planCode: "pm_essentials", cycle: "monthly", amountMinor: 4900 }],
    topups: [],
  });
  check(!r.ok, "missing yearly fails");
  check(r.issues.some((i) => i.code === "MISSING_YEARLY"), "MISSING_YEARLY");
}

{
  const r = validateCatalog({
    plans: [{ ...basePlan, enquireOnly: true }],
    prices: [],
    topups: [],
  });
  check(r.ok, "enquire-only needs no prices");
}

{
  const r = validateCatalog({
    plans: [basePlan],
    prices: [
      { planCode: "pm_essentials", cycle: "monthly", amountMinor: 4900 },
      { planCode: "pm_essentials", cycle: "yearly", amountMinor: 49000 },
    ],
    topups: [{ code: "bad", kind: "inspection", quantity: 0, amountMinor: 1000 }],
  });
  check(!r.ok, "topup qty 0 invalid");
  check(r.issues.some((i) => i.code === "INVALID_TOPUP"), "INVALID_TOPUP");
}

{
  const r = validateCatalog({
    plans: [basePlan],
    prices: [
      { planCode: "pm_essentials", cycle: "monthly", amountMinor: 4900 },
      { planCode: "pm_essentials", cycle: "yearly", amountMinor: 49000 },
    ],
    topups: [{ code: "cheap", kind: "inspection", quantity: 100, amountMinor: 100 }],
  });
  check(!r.ok, "topup below floor fails");
  check(r.issues.some((i) => i.code === "BELOW_FLOOR"), "topup BELOW_FLOOR");
}

{
  // Seed catalog should validate when prices are 10× and floor ok
  const prices = SEED_PLANS.filter((p) => !p.enquireOnly).flatMap((p) => {
    const m = SEED_PLAN_MONTHLY_MINOR[p.code] ?? 0;
    if (p.code === "ai_payg") {
      return [{ planCode: p.code, cycle: "monthly" as const, amountMinor: m }];
    }
    return [
      { planCode: p.code, cycle: "monthly" as const, amountMinor: m },
      { planCode: p.code, cycle: "yearly" as const, amountMinor: m * 10 },
    ];
  });
  const r = validateCatalog({
    plans: SEED_PLANS.map((p) => ({
      code: p.code,
      tab: p.tab,
      enquireOnly: p.enquireOnly,
      monthlyInspections: p.monthlyInspections,
      yearlyInspections: p.yearlyInspections,
      enabled: true,
    })),
    prices,
    topups: SEED_TOPUPS.map((t) => ({
      code: t.code,
      kind: t.kind,
      quantity: t.quantity,
      amountMinor: t.amountMinor,
      enabled: true,
    })),
  });
  check(r.ok, `seed catalog validates: ${JSON.stringify(r.issues)}`);
}

check(SEED_ADDONS.every((a) => a.code.startsWith("addon_")), "addon codes prefixed");
check(SEED_TOPUPS.some((t) => t.stripeLookupKey), "topups have lookup keys");

console.log(`catalogValidation.boundaries.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
