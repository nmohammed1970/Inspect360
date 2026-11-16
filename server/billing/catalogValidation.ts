/** Publish-time validation for Nov 2026 billing catalog. */

export const DEFAULT_INSPECTION_FLOOR_MINOR = 295; // £2.95

export type CatalogValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type PlanPriceInput = {
  planCode: string;
  cycle: "monthly" | "yearly";
  amountMinor: number;
  enquireOnly?: boolean;
};

export type PlanInput = {
  code: string;
  tab: string;
  enquireOnly?: boolean;
  monthlyInspections?: number | null;
  yearlyInspections?: number | null;
  enabled?: boolean;
};

export type TopupInput = {
  code: string;
  kind: string;
  quantity: number;
  amountMinor: number;
  enabled?: boolean;
};

export function effectivePerInspectionMinor(opts: {
  amountMinor: number;
  inspections: number;
}): number | null {
  if (!opts.inspections || opts.inspections <= 0) return null;
  return Math.round(opts.amountMinor / opts.inspections);
}

export function validateCatalog(input: {
  plans: PlanInput[];
  prices: PlanPriceInput[];
  topups: TopupInput[];
  floorMinor?: number;
}): { ok: boolean; issues: CatalogValidationIssue[] } {
  const issues: CatalogValidationIssue[] = [];
  const floor = input.floorMinor ?? DEFAULT_INSPECTION_FLOOR_MINOR;

  for (const p of input.prices) {
    if (p.amountMinor < 0) {
      issues.push({
        code: "NEGATIVE_PRICE",
        message: `${p.planCode} ${p.cycle} has negative amount`,
        severity: "error",
      });
    }
  }

  const byPlan = new Map<string, { monthly?: number; yearly?: number }>();
  for (const p of input.prices) {
    const row = byPlan.get(p.planCode) || {};
    if (p.cycle === "monthly") row.monthly = p.amountMinor;
    if (p.cycle === "yearly") row.yearly = p.amountMinor;
    byPlan.set(p.planCode, row);
  }

  for (const plan of input.plans) {
    if (plan.enquireOnly || plan.enabled === false) continue;
    const prices = byPlan.get(plan.code);
    if (!prices?.monthly && prices?.monthly !== 0) {
      issues.push({
        code: "MISSING_MONTHLY",
        message: `Plan ${plan.code} missing monthly price`,
        severity: "error",
      });
    }
    if (!prices?.yearly && prices?.yearly !== 0) {
      // Pay-as-you-go may not offer yearly
      if (plan.code !== "ai_payg") {
        issues.push({
          code: "MISSING_YEARLY",
          message: `Plan ${plan.code} missing yearly price`,
          severity: "error",
        });
      }
    }
    if (
      typeof prices?.monthly === "number" &&
      typeof prices?.yearly === "number" &&
      plan.code !== "ai_payg"
    ) {
      const expected = prices.monthly * 10;
      if (prices.yearly !== expected) {
        issues.push({
          code: "YEARLY_NOT_10X",
          message: `${plan.code}: yearly ${prices.yearly} must equal 10× monthly (${expected})`,
          severity: "error",
        });
      }
    }

    // Floor check on effective per-inspection for self-serve plans
    if (typeof prices?.monthly === "number" && plan.monthlyInspections) {
      const per = effectivePerInspectionMinor({
        amountMinor: prices.monthly,
        inspections: plan.monthlyInspections,
      });
      if (per != null && per < floor) {
        issues.push({
          code: "BELOW_FLOOR",
          message: `${plan.code} monthly works out at ${per}p/inspection (floor ${floor}p)`,
          severity: "error",
        });
      }
    }
    if (typeof prices?.yearly === "number" && plan.yearlyInspections) {
      const per = effectivePerInspectionMinor({
        amountMinor: prices.yearly,
        inspections: plan.yearlyInspections,
      });
      if (per != null && per < floor) {
        issues.push({
          code: "BELOW_FLOOR",
          message: `${plan.code} yearly works out at ${per}p/inspection (floor ${floor}p)`,
          severity: "error",
        });
      }
    }
  }

  for (const pack of input.topups) {
    if (pack.enabled === false) continue;
    if (pack.amountMinor < 0 || pack.quantity <= 0) {
      issues.push({
        code: "INVALID_TOPUP",
        message: `Top-up ${pack.code} has invalid amount/quantity`,
        severity: "error",
      });
      continue;
    }
    if (pack.kind === "inspection") {
      const per = Math.round(pack.amountMinor / pack.quantity);
      if (per < floor) {
        issues.push({
          code: "BELOW_FLOOR",
          message: `Top-up ${pack.code} is ${per}p/inspection (floor ${floor}p)`,
          severity: "error",
        });
      }
    }
  }

  return { ok: issues.every((i) => i.severity !== "error"), issues };
}
