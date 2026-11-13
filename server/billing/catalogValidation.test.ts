/**
 * Billing catalog validation + credit formula unit tests (no database).
 * Run with: npx tsx server/billing/catalogValidation.test.ts
 */

import assert from "node:assert/strict";
import {
  DEFAULT_INSPECTION_FLOOR_MINOR,
  effectivePerInspectionMinor,
  validateCatalog,
} from "./catalogValidation";
import { PHOTOS_PER_CREDIT, creditsConsumed } from "@shared/billingUnits";
import { SEED_ADDONS, SEED_PLAN_MONTHLY_MINOR, SEED_TOPUPS } from "./catalogSeed";

function smsCreditsForMessage(body: string): number {
  const len = Array.from(body || "").length;
  if (len <= 0) return 1;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

{
  const result = validateCatalog({
    floorMinor: DEFAULT_INSPECTION_FLOOR_MINOR,
    plans: [
      {
        code: "pm_pro",
        tab: "property_management",
        monthlyInspections: 10,
        yearlyInspections: 120,
      },
    ],
    prices: [
      { planCode: "pm_pro", cycle: "monthly", amountMinor: 2000 },
      { planCode: "pm_pro", cycle: "yearly", amountMinor: 20000 },
    ],
    topups: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "BELOW_FLOOR"));
}

{
  const result = validateCatalog({
    plans: [
      {
        code: "pm_essentials",
        tab: "property_management",
        monthlyInspections: 5,
        yearlyInspections: 60,
      },
    ],
    prices: [
      { planCode: "pm_essentials", cycle: "monthly", amountMinor: 4900 },
      { planCode: "pm_essentials", cycle: "yearly", amountMinor: 40000 },
    ],
    topups: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "YEARLY_NOT_10X"));
}

{
  const monthly = 4900;
  const result = validateCatalog({
    plans: [
      {
        code: "pm_essentials",
        tab: "property_management",
        monthlyInspections: 5,
        yearlyInspections: 60,
      },
    ],
    prices: [
      { planCode: "pm_essentials", cycle: "monthly", amountMinor: monthly },
      { planCode: "pm_essentials", cycle: "yearly", amountMinor: monthly * 10 },
    ],
    topups: [
      { code: "insp_10", kind: "inspection", quantity: 10, amountMinor: 4500, enabled: true },
    ],
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
}

assert.equal(effectivePerInspectionMinor({ amountMinor: 4900, inspections: 5 }), 980);

assert.equal(PHOTOS_PER_CREDIT, 500);
assert.equal(creditsConsumed(1), 1);
assert.equal(creditsConsumed(500), 1);
assert.equal(creditsConsumed(501), 2);
assert.equal(creditsConsumed(1000), 2);

assert.equal(smsCreditsForMessage("hi"), 1);
assert.equal(smsCreditsForMessage("a".repeat(160)), 1);
assert.equal(smsCreditsForMessage("a".repeat(161)), 2);
assert.equal(smsCreditsForMessage("a".repeat(306)), 2);
assert.equal(smsCreditsForMessage("a".repeat(307)), 3);

// Publish immutability is enforced in catalogService.updatePlanPrice (draft-only).

{
  // Seed addon codes must match planLimits lookups
  assert.ok(SEED_ADDONS.some((a) => a.code === "addon_props10"));
  assert.ok(SEED_ADDONS.some((a) => a.code === "addon_hmo"));
  assert.ok(SEED_ADDONS.some((a) => a.code === "addon_user"));
  assert.ok(SEED_TOPUPS.some((t) => t.kind === "sms"));
  assert.ok(SEED_TOPUPS.some((t) => t.kind === "inspection"));
  for (const [code, monthly] of Object.entries(SEED_PLAN_MONTHLY_MINOR)) {
    if (code === "pm_enterprise" || code === "ai_high_volume" || code === "ai_payg") continue;
    assert.ok(monthly > 0, `${code} monthly`);
  }
}

console.log("catalogValidation.test.ts: all assertions passed");
