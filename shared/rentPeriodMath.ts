/**
 * Pure rent period window math (no DB). Run: npx tsx shared/rentPeriodMath.test.ts
 */
export function clampDueDay(day: number | null | undefined): number {
  const n = Number(day);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(28, Math.floor(n));
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function lastDayOfMonthUtc(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function dueDateInMonth(year: number, monthIndex: number, dueDay: number): Date {
  const day = Math.min(dueDay, lastDayOfMonthUtc(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day));
}

/** V1: no proration — first due on/after lease start at full monthly rent. */
export function computeRentPeriodWindows(input: {
  isActive: boolean;
  monthlyRent: string | null;
  leaseStartDate: Date | null;
  leaseEndDate: Date | null;
  rentDueDay?: number | null;
}, throughDate: Date = new Date()): Array<{ periodStart: Date; periodEnd: Date; dueDate: Date; amountDue: string }> {
  if (!input.isActive) return [];
  const rent = parseFloat(String(input.monthlyRent || "0"));
  if (!Number.isFinite(rent) || rent <= 0) return [];
  if (!input.leaseStartDate) return [];

  const dueDay = clampDueDay(input.rentDueDay);
  const leaseStart = startOfUtcDay(new Date(input.leaseStartDate));
  const leaseEnd = input.leaseEndDate ? startOfUtcDay(new Date(input.leaseEndDate)) : null;
  const through = startOfUtcDay(throughDate);

  let cursorYear = leaseStart.getUTCFullYear();
  let cursorMonth = leaseStart.getUTCMonth();
  let firstDue = dueDateInMonth(cursorYear, cursorMonth, dueDay);
  if (firstDue < leaseStart) {
    cursorMonth += 1;
    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear += 1;
    }
    firstDue = dueDateInMonth(cursorYear, cursorMonth, dueDay);
  }

  const windows: Array<{ periodStart: Date; periodEnd: Date; dueDate: Date; amountDue: string }> = [];
  let due = firstDue;
  const generateUntil = leaseEnd && leaseEnd < through ? leaseEnd : through;

  while (
    due <= generateUntil ||
    (due.getUTCFullYear() === generateUntil.getUTCFullYear() && due.getUTCMonth() === generateUntil.getUTCMonth())
  ) {
    if (leaseEnd && due > leaseEnd) break;

    const nextDue = dueDateInMonth(
      due.getUTCMonth() === 11 ? due.getUTCFullYear() + 1 : due.getUTCFullYear(),
      (due.getUTCMonth() + 1) % 12,
      dueDay,
    );
    const periodEnd = new Date(nextDue.getTime() - 24 * 60 * 60 * 1000);

    windows.push({
      periodStart: due,
      periodEnd,
      dueDate: due,
      amountDue: rent.toFixed(2),
    });

    due = nextDue;
    if (windows.length > 120) break;
  }

  return windows;
}
