/** England PRS rent review eligibility (pure). Late fees remain disabled by default elsewhere. */

export function assessEnglandEligibility(input: {
  leaseStartDate: Date | null;
  lastIncreaseEffective?: Date | null;
  proposedEffectiveDate: Date;
  noticeServedAt?: Date | null;
  asOf?: Date;
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const asOf = input.asOf || new Date();
  const proposed = input.proposedEffectiveDate;

  if (input.leaseStartDate) {
    const twelveMonths = new Date(input.leaseStartDate);
    twelveMonths.setUTCFullYear(twelveMonths.getUTCFullYear() + 1);
    if (proposed < twelveMonths) {
      reasons.push("No rent increase in the first 12 months of a new tenancy (England PRS)");
    }
  }

  if (input.lastIncreaseEffective) {
    const nextAllowed = new Date(input.lastIncreaseEffective);
    nextAllowed.setUTCFullYear(nextAllowed.getUTCFullYear() + 1);
    if (proposed < nextAllowed) {
      reasons.push("Rent may not increase more than once per year");
    }
  }

  if (input.noticeServedAt) {
    const minNotice = new Date(input.noticeServedAt);
    minNotice.setUTCMonth(minNotice.getUTCMonth() + 2);
    if (proposed < minNotice) {
      reasons.push("At least two months' notice required (Section 13 / Form 4A)");
    }
  } else {
    reasons.push("Notice not yet served — do not auto-serve; record service evidence before activation");
  }

  if (proposed <= asOf) {
    reasons.push("Proposed effective date must be in the future until lawfully activated");
  }

  return { eligible: reasons.length === 0, reasons };
}
