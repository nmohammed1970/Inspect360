/**
 * Rent schedule window math (pure). Amounts in minor units.
 * Run: npx tsx shared/rentScheduleMath.test.ts
 */

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function lastDayOfMonthUtc(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Month-end handling: clamp 29–31 to last day of month (default). */
export function dueDateInMonth(
  year: number,
  monthIndex: number,
  dueDay: number,
  monthEndRule: "clamp_to_last_day" | "roll_forward" = "clamp_to_last_day",
): Date {
  const last = lastDayOfMonthUtc(year, monthIndex);
  if (dueDay <= last) {
    return new Date(Date.UTC(year, monthIndex, dueDay));
  }
  if (monthEndRule === "roll_forward") {
    // Move to day 1 of next month
    const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1;
    const nextYear = monthIndex === 11 ? year + 1 : year;
    return new Date(Date.UTC(nextYear, nextMonth, 1));
  }
  return new Date(Date.UTC(year, monthIndex, last));
}

export function daysBetweenInclusive(start: Date, end: Date): number {
  const a = startOfUtcDay(start).getTime();
  const b = startOfUtcDay(end).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000) + 1);
}

export function addDaysUtc(d: Date, days: number): Date {
  return new Date(startOfUtcDay(d).getTime() + days * 86400000);
}

export type ScheduleWindow = {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  amountMinor: number;
};

/**
 * Generate charge windows for an approved schedule version.
 * Does not invent charges after leaseEnd or after effectiveTo.
 */
export function computeScheduleWindows(input: {
  amountMinor: number;
  frequency: "weekly" | "fortnightly" | "monthly" | "quarterly";
  dueDay: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  leaseStart?: Date | null;
  leaseEnd?: Date | null;
  throughDate?: Date;
  prorationRule?: "actual_days" | "none";
  monthEndRule?: "clamp_to_last_day" | "roll_forward";
  horizonMonths?: number;
}): ScheduleWindow[] {
  if (!input.amountMinor || input.amountMinor <= 0) return [];
  const through = startOfUtcDay(input.throughDate || new Date());
  const horizon = input.horizonMonths ?? 14;
  const horizonDate = new Date(
    Date.UTC(through.getUTCFullYear(), through.getUTCMonth() + horizon, through.getUTCDate()),
  );
  const monthEndRule = input.monthEndRule || "clamp_to_last_day";
  const proration = input.prorationRule || "actual_days";

  const leaseStart = input.leaseStart ? startOfUtcDay(input.leaseStart) : null;
  const leaseEnd = input.leaseEnd ? startOfUtcDay(input.leaseEnd) : null;
  const effectiveFrom = startOfUtcDay(input.effectiveFrom);
  const effectiveTo = input.effectiveTo ? startOfUtcDay(input.effectiveTo) : null;

  let startBound = effectiveFrom;
  if (leaseStart && leaseStart > startBound) startBound = leaseStart;

  let endBound = horizonDate;
  if (leaseEnd && leaseEnd < endBound) endBound = leaseEnd;
  if (effectiveTo && effectiveTo < endBound) endBound = effectiveTo;
  if (endBound < startBound) return [];

  const windows: ScheduleWindow[] = [];
  const freq = input.frequency;

  if (freq === "monthly" || freq === "quarterly") {
    const step = freq === "quarterly" ? 3 : 1;
    let y = startBound.getUTCFullYear();
    let m = startBound.getUTCMonth();
    let due = dueDateInMonth(y, m, input.dueDay, monthEndRule);
    if (due < startBound) {
      m += step;
      while (m > 11) {
        m -= 12;
        y += 1;
      }
      due = dueDateInMonth(y, m, input.dueDay, monthEndRule);
    }

    while (due <= endBound && windows.length < 200) {
      const nextM = m + step;
      const nextY = y + Math.floor(nextM / 12);
      const nextMonth = ((nextM % 12) + 12) % 12;
      const nextDue = dueDateInMonth(nextY, nextMonth, input.dueDay, monthEndRule);
      let periodStart = due;
      let periodEnd = addDaysUtc(nextDue, -1);
      let amount = input.amountMinor;

      // Start proration
      if (proration === "actual_days" && periodStart < startBound && periodEnd >= startBound) {
        const fullDays = daysBetweenInclusive(periodStart, periodEnd);
        periodStart = startBound;
        const partialDays = daysBetweenInclusive(periodStart, periodEnd);
        if (fullDays > 0) amount = Math.round((input.amountMinor * partialDays) / fullDays);
      } else if (periodEnd < startBound) {
        m = nextMonth;
        y = nextY;
        due = nextDue;
        continue;
      }

      // End proration
      if (leaseEnd && periodEnd > leaseEnd && periodStart <= leaseEnd) {
        const fullDays = daysBetweenInclusive(due, addDaysUtc(nextDue, -1));
        periodEnd = leaseEnd;
        const partialDays = daysBetweenInclusive(periodStart, periodEnd);
        if (fullDays > 0) amount = Math.round((input.amountMinor * partialDays) / fullDays);
      }

      if (amount > 0 && (!leaseEnd || periodStart <= leaseEnd)) {
        windows.push({
          periodStart,
          periodEnd,
          dueDate: periodStart < due ? periodStart : due,
          amountMinor: amount,
        });
      }

      m = nextMonth;
      y = nextY;
      due = nextDue;
    }
    return windows;
  }

  // weekly / fortnightly
  const stepDays = freq === "weekly" ? 7 : 14;
  let due = startBound;
  // Align to dueDay-of-week if dueDay is 0-6? Spec uses day of month primarily.
  // For weekly, treat dueDay as day-of-week (0=Sun..6=Sat) when 0-6, else startBound.
  if (input.dueDay >= 0 && input.dueDay <= 6) {
    while (due.getUTCDay() !== input.dueDay) {
      due = addDaysUtc(due, 1);
    }
  }

  while (due <= endBound && windows.length < 400) {
    const periodEnd = addDaysUtc(due, stepDays - 1);
    let amount = input.amountMinor;
    let periodStart = due;
    let pe = periodEnd;

    if (leaseEnd && pe > leaseEnd) {
      pe = leaseEnd;
      if (proration === "actual_days") {
        amount = Math.round((input.amountMinor * daysBetweenInclusive(periodStart, pe)) / stepDays);
      }
    }
    if (amount > 0 && (!leaseEnd || periodStart <= leaseEnd)) {
      windows.push({ periodStart, periodEnd: pe, dueDate: due, amountMinor: amount });
    }
    due = addDaysUtc(due, stepDays);
  }
  return windows;
}

/** Outstanding balance on a charge. */
export function chargeOutstanding(amountMinor: number, allocatedMinor: number): number {
  return Math.max(0, (amountMinor || 0) - (allocatedMinor || 0));
}

/** Derive charge status from dates and allocation (as-of). */
export function deriveChargeStatus(input: {
  amountMinor: number;
  allocatedMinor: number;
  dueDate: Date;
  asOf: Date;
  current?: string;
}): "scheduled" | "due" | "part_paid" | "paid" | "overdue" | "reversed" | "adjusted" {
  if (input.current === "reversed" || input.current === "adjusted") return input.current;
  const outstanding = chargeOutstanding(input.amountMinor, input.allocatedMinor);
  if (outstanding <= 0) return "paid";
  const due = startOfUtcDay(input.dueDate);
  const asOf = startOfUtcDay(input.asOf);
  const paidSome = (input.allocatedMinor || 0) > 0;
  if (due > asOf) return paidSome ? "part_paid" : "scheduled";
  if (due.getTime() === asOf.getTime()) return paidSome ? "part_paid" : "due";
  return paidSome ? "part_paid" : "overdue";
}

/** Propose oldest-due-first allocation of `amountMinor` across charges. */
export function proposeOldestFirstAllocation(
  charges: Array<{ id: string; amountMinor: number; allocatedMinor: number; dueDate: Date }>,
  amountMinor: number,
): Array<{ chargeId: string; amountMinor: number }> {
  const sorted = [...charges]
    .filter((c) => chargeOutstanding(c.amountMinor, c.allocatedMinor) > 0)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  let remaining = amountMinor;
  const out: Array<{ chargeId: string; amountMinor: number }> = [];
  for (const c of sorted) {
    if (remaining <= 0) break;
    const need = chargeOutstanding(c.amountMinor, c.allocatedMinor);
    const take = Math.min(need, remaining);
    if (take > 0) {
      out.push({ chargeId: c.id, amountMinor: take });
      remaining -= take;
    }
  }
  return out;
}
