import { and, eq, inArray, ne, sql, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  arrearsCases,
  bankTransactions,
  rentAccounts,
  rentCharges,
  rentReceipts,
  rentReviews,
} from "@shared/schema";
import { chargeOutstanding, startOfUtcDay } from "@shared/rentScheduleMath";
import { listAccounts } from "./service";

export async function getRentDashboard(
  organizationId: string,
  opts: {
    from?: Date;
    to?: Date;
    asOf?: Date;
    propertyId?: string;
  } = {},
) {
  const asOf = startOfUtcDay(opts.asOf || new Date());
  const from = opts.from ? startOfUtcDay(opts.from) : new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const to = opts.to
    ? startOfUtcDay(opts.to)
    : new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0));

  const accounts = await listAccounts(organizationId, {
    propertyId: opts.propertyId,
    limit: 500,
  });

  // Period-scoped charges (due within reporting period)
  const chargeConditions = [
    eq(rentCharges.organizationId, organizationId),
    ne(rentCharges.status, "reversed"),
    inArray(rentCharges.type, ["rent", "opening_balance"]),
    gte(rentCharges.dueDate, from),
    lte(rentCharges.dueDate, to),
  ];
  if (opts.propertyId) {
    const accountIds = accounts.map((a) => a.id);
    if (!accountIds.length) {
      return emptyDashboard(from, to, asOf);
    }
  }

  const periodCharges = await db
    .select({
      charge: rentCharges,
      account: rentAccounts,
    })
    .from(rentCharges)
    .innerJoin(rentAccounts, eq(rentCharges.accountId, rentAccounts.id))
    .where(
      and(
        eq(rentCharges.organizationId, organizationId),
        ne(rentCharges.status, "reversed"),
        inArray(rentCharges.type, ["rent", "opening_balance"]),
        gte(rentCharges.dueDate, from),
        lte(rentCharges.dueDate, to),
        ...(opts.propertyId ? [eq(rentAccounts.propertyId, opts.propertyId)] : []),
      ),
    );

  let scheduledMinor = 0;
  let periodCollectedMinor = 0;
  let periodOverdueMinor = 0;
  let periodUpcomingMinor = 0;

  for (const { charge } of periodCharges) {
    scheduledMinor += charge.amountMinor;
    const allocated = Math.min(charge.allocatedMinor, charge.amountMinor);
    periodCollectedMinor += allocated;
    const outstanding = chargeOutstanding(charge.amountMinor, charge.allocatedMinor);
    const due = startOfUtcDay(charge.dueDate);
    if (due > asOf) periodUpcomingMinor += outstanding;
    else if (outstanding > 0) periodOverdueMinor += outstanding;
  }

  // Arrears = all unpaid with due before asOf
  let totalArrearsMinor = 0;
  let priorArrearsMinor = 0;
  for (const a of accounts) {
    totalArrearsMinor += a.arrearsMinor;
    // prior = arrears from charges before period start
  }

  const priorCharges = await db
    .select()
    .from(rentCharges)
    .innerJoin(rentAccounts, eq(rentCharges.accountId, rentAccounts.id))
    .where(
      and(
        eq(rentCharges.organizationId, organizationId),
        ne(rentCharges.status, "reversed"),
        sql`${rentCharges.dueDate} < ${from}`,
        ...(opts.propertyId ? [eq(rentAccounts.propertyId, opts.propertyId)] : []),
      ),
    );
  for (const row of priorCharges) {
    const c = row.rent_charges;
    priorArrearsMinor += chargeOutstanding(c.amountMinor, c.allocatedMinor);
  }

  // Due-to-date collection rate
  let dueToDateMinor = 0;
  let dueToDateCollectedMinor = 0;
  for (const a of accounts) {
    dueToDateMinor += a.dueToDateMinor;
    dueToDateCollectedMinor += a.dueToDateCollectedMinor;
  }
  const collectionRate =
    dueToDateMinor > 0 ? Math.round((dueToDateCollectedMinor / dueToDateMinor) * 1000) / 10 : null;

  const openArrears = await db
    .select()
    .from(arrearsCases)
    .where(
      and(
        eq(arrearsCases.organizationId, organizationId),
        ne(arrearsCases.status, "resolved"),
      ),
    );

  const unmatchedBank = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.organizationId, organizationId),
        inArray(bankTransactions.matchState, ["unmatched", "suggested"]),
      ),
    );

  const pendingReviews = await db
    .select()
    .from(rentReviews)
    .where(
      and(
        eq(rentReviews.organizationId, organizationId),
        inArray(rentReviews.status, ["eligibility_check", "draft", "awaiting_approval", "manual_review"]),
      ),
    );

  const unmatchedMinor = unmatchedBank.reduce((s, b) => s + (b.direction === "in" ? b.amountMinor : 0), 0);

  return {
    period: { from: from.toISOString(), to: to.toISOString(), asOf: asOf.toISOString(), currency: "GBP" },
    kpis: {
      scheduledMinor,
      collectedMinor: periodCollectedMinor,
      collectionRate,
      totalArrearsMinor,
      priorArrearsMinor,
      periodOverdueMinor,
      upcomingMinor: periodUpcomingMinor,
      tenancyCount: accounts.length,
    },
    breakdown: {
      collectedMinor: periodCollectedMinor,
      overdueThisPeriodMinor: periodOverdueMinor,
      notYetDueMinor: periodUpcomingMinor,
    },
    workQueue: {
      overdueTenancies: accounts.filter((a) => a.arrearsMinor > 0).length,
      overdueMinor: totalArrearsMinor,
      openArrearsCases: openArrears.length,
      unmatchedBankCount: unmatchedBank.length,
      unmatchedBankMinor: unmatchedMinor,
      reviewsAwaiting: pendingReviews.length,
    },
    accounts,
  };
}

function emptyDashboard(from: Date, to: Date, asOf: Date) {
  return {
    period: { from: from.toISOString(), to: to.toISOString(), asOf: asOf.toISOString(), currency: "GBP" },
    kpis: {
      scheduledMinor: 0,
      collectedMinor: 0,
      collectionRate: null as number | null,
      totalArrearsMinor: 0,
      priorArrearsMinor: 0,
      periodOverdueMinor: 0,
      upcomingMinor: 0,
      tenancyCount: 0,
    },
    breakdown: { collectedMinor: 0, overdueThisPeriodMinor: 0, notYetDueMinor: 0 },
    workQueue: {
      overdueTenancies: 0,
      overdueMinor: 0,
      openArrearsCases: 0,
      unmatchedBankCount: 0,
      unmatchedBankMinor: 0,
      reviewsAwaiting: 0,
    },
    accounts: [] as any[],
  };
}

export async function listReceipts(
  organizationId: string,
  filters: { accountId?: string; status?: string; limit?: number } = {},
) {
  const { desc } = await import("drizzle-orm");
  const conditions = [eq(rentReceipts.organizationId, organizationId)];
  if (filters.accountId) conditions.push(eq(rentReceipts.accountId, filters.accountId));
  if (filters.status) conditions.push(eq(rentReceipts.status, filters.status));
  return db
    .select()
    .from(rentReceipts)
    .where(and(...conditions))
    .orderBy(desc(rentReceipts.receivedAt))
    .limit(filters.limit || 200);
}
