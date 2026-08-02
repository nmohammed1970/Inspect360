/**
 * Inspect360 Stripe proration policy for mid-cycle plan / tier changes.
 *
 * LOCKED — do not use ad-hoc "create_prorations" on upgrades and "none" on
 * downgrades. Every subscription.update for a plan change must use
 * PLAN_CHANGE_PRORATION_BEHAVIOR so money behaviour is identical everywhere.
 *
 * Why `always_invoice` (not `create_prorations` alone, not `none`):
 * - Stripe still creates the same proration line items as `create_prorations`
 * - AND finalises an invoice immediately so money settles today
 * - Upgrade → customer pays the net prorated difference now
 * - Downgrade → net credit hits Stripe customer balance / next invoice (no cash refund)
 * - `none` is forbidden for plan changes (would silently skip money adjustment)
 * - Bare `create_prorations` leaves charges/credits until the next cycle — ambiguous UX
 *
 * Stripe formula (owned by Stripe; we do not re-implement):
 *   credit  = unused time on the OLD price for the remainder of the period
 *   charge  = NEW price for the remainder of the period
 *   invoice = charge − credit  (positive = pay now; negative = account credit)
 *
 * Billing period end is unchanged unless the interval itself changes
 * (monthly ↔ annual), in which case Stripe resets the cadence per its rules.
 *
 * Inspection *credits* are separate from money — see convertRemainingPlanCreditsToBonus.
 */

export const PLAN_CHANGE_PRORATION_BEHAVIOR = "always_invoice" as const;

/** Allowed Stripe values — for validation / docs only. */
export type StripeProrationBehavior =
  | "create_prorations"
  | "always_invoice"
  | "none";

/** Params to spread into stripe.subscriptions.update for plan/tier changes. */
export function planChangeStripeUpdateParams(): {
  proration_behavior: typeof PLAN_CHANGE_PRORATION_BEHAVIOR;
} {
  return { proration_behavior: PLAN_CHANGE_PRORATION_BEHAVIOR };
}

export const PLAN_CHANGE_MONEY_RULES = {
  upgradeToday:
    "Customer pays the prorated difference today (Stripe invoice). " +
    "Unused time on the old plan is credited against the new plan for the rest of the period.",
  downgradeToday:
    "No cash refund. Unused time on the old plan becomes a Stripe credit " +
    "(customer balance / applied on the next invoice). The lower price applies for the rest of the period.",
  nextInvoice:
    "At period renewal the customer is charged the full new plan price " +
    "(any remaining credit balance is applied automatically by Stripe).",
  periodEnd:
    "Period end stays the same on same-interval changes. Changing monthly ↔ annual follows Stripe interval-change rules.",
  inspectionCredits:
    "Leftover plan inspection credits convert to bonus (keep expiry); full new quota is granted. " +
    "This is independent of Stripe money proration.",
} as const;

/** Short FAQ / UI copy */
export const PLAN_CHANGE_FAQ_COPY =
  "Upgrades and downgrades take effect immediately. Stripe prorates the remainder of the billing period " +
  `(proration_behavior="${PLAN_CHANGE_PRORATION_BEHAVIOR}"): upgrades charge the net difference today; ` +
  "downgrades issue account credit toward future invoices — we do not refund cash. " +
  "Your next renewal invoice is the full new plan price.";
