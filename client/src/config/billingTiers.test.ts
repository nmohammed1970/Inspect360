/**
 * Billing Spec v2.0 invariant tests.
 * Run with: npx tsx client/src/config/billingTiers.test.ts
 */

import {
  TIERS,
  computePlanPrice,
  computePackPricing,
  PACK_DISCOUNTS,
  QUOTE_GATE,
  SLIDER_MAX,
  SELF_SERVE_MAX,
  ENTERPRISE_MIN,
  isEnterpriseQuoteVolume,
  getTierByInspections,
  creditsConsumed,
} from "./billingTiers";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// 1. Priced adjacent pairs decrease
const priced = TIERS.filter((t) => t.rate !== null);
for (let i = 0; i < priced.length - 1; i++) {
  assert(
    priced[i].rate! > priced[i + 1].rate!,
    `Rate must fall: ${priced[i].id} (${priced[i].rate}) > ${priced[i + 1].id} (${priced[i + 1].rate})`
  );
}

// 2. Enterprise is quote-only with null rate
const ent = TIERS.find((t) => t.id === "enterprise")!;
assert(ent.quoteOnly === true && ent.rate === null, "Enterprise must be quote-only with null rate");
assert(ent.min === QUOTE_GATE, `Enterprise min must equal QUOTE_GATE (${QUOTE_GATE})`);

// 3. No custom tier
assert(!TIERS.some((t) => t.id === "custom"), "Custom tier must be removed");

// 4. Pack matrix — Growth
const g20 = computePackPricing("growth", 20)!;
const g50 = computePackPricing("growth", 50)!;
const g100 = computePackPricing("growth", 100)!;
assert(g20.total === 95 && g20.displayRate === 4.75, `Growth 20: expected £95 / £4.75, got £${g20.total} / £${g20.displayRate}`);
assert(g50.total === 225 && g50.displayRate === 4.5, `Growth 50: expected £225 / £4.50, got £${g50.total} / £${g50.displayRate}`);
assert(g100.total === 430 && g100.displayRate === 4.3, `Growth 100: expected £430 / £4.30, got £${g100.total} / £${g100.displayRate}`);

// 5. Pack rates decrease; 100-pack equals base rate for every priced tier
const sizes = Object.keys(PACK_DISCOUNTS).map(Number).sort((a, b) => a - b);
for (const tier of priced) {
  const rates = sizes.map((s) => computePackPricing(tier.id, s)!);
  for (let i = 0; i < rates.length - 1; i++) {
    assert(
      rates[i].displayRate > rates[i + 1].displayRate,
      `${tier.id}: ${sizes[i]}-pack rate (${rates[i].displayRate}) should be > ${sizes[i + 1]}-pack (${rates[i + 1].displayRate})`
    );
  }
  const hundred = rates[rates.length - 1];
  assert(
    Math.abs(hundred.displayRate - tier.rate!) < 0.001,
    `${tier.id}: 100-pack display rate (${hundred.displayRate}) must equal base rate (${tier.rate})`
  );
}

// 6. Starter / Professional pack spot checks from v2 table
const s20 = computePackPricing("starter", 20)!;
assert(s20.total === 108 && s20.displayRate === 5.4, `Starter 20: expected £108 / £5.40, got £${s20.total} / £${s20.displayRate}`);
const p100 = computePackPricing("professional", 100)!;
assert(p100.total === 370 && p100.displayRate === 3.7, `Professional 100: expected £370 / £3.70, got £${p100.total} / £${p100.displayRate}`);

// 7. Annual formula: Growth 30 → monthly 129, annual 1238.40
const g30 = computePlanPrice(30, "annual")!;
assert(Math.abs(g30.monthly - 129) < 0.01, `Growth 30 monthly should be 129, got ${g30.monthly}`);
assert(Math.abs(g30.annual - 1238.4) < 0.01, `Growth 30 annual should be 1238.40, got ${g30.annual}`);
assert(computePlanPrice(200, "annual") === null, "Enterprise (200+) must return null price");
assert(computePlanPrice(199, "monthly") !== null, "199 must still be Professional (self-serve priced)");
assert(Math.abs(computePlanPrice(199, "monthly")!.monthly - 199 * 3.7) < 0.01, "199 Professional monthly = 199 × 3.70");

// 7b. Enterprise boundary — LOCKED
// 199 = Professional; 200 = Enterprise; slider max = 200 (Request Quote), NOT 199
assert(SELF_SERVE_MAX === 199, "SELF_SERVE_MAX must be 199");
assert(ENTERPRISE_MIN === 200 && QUOTE_GATE === 200, "Enterprise starts at 200");
assert(SLIDER_MAX === 200, "Slider must allow 200 (Request Quote), not stop at 199");
assert(isEnterpriseQuoteVolume(199) === false, "199 is not Enterprise");
assert(isEnterpriseQuoteVolume(200) === true, "200 is Enterprise quote");
assert(getTierByInspections(199).id === "professional", "199 → Professional");
assert(getTierByInspections(200).id === "enterprise", "200 → Enterprise");

// 8. creditsConsumed boundaries
assert(creditsConsumed(1) === 1, "1 photo → 1 credit");
assert(creditsConsumed(300) === 1, "300 photos → 1 credit");
assert(creditsConsumed(301) === 2, "301 photos → 2 credits");
assert(creditsConsumed(600) === 2, "600 photos → 2 credits");
assert(creditsConsumed(601) === 3, "601 photos → 3 credits");
assert(creditsConsumed(900) === 3, "900 photos → 3 credits");
assert(creditsConsumed(0) === 1, "0 photos → 1 credit (minimum)");

// 9. No Enterprise published rate string in this module's exports
const serialized = JSON.stringify(TIERS);
assert(!serialized.includes("3.2"), "Client TIERS must not contain Enterprise reference rate 3.20");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
