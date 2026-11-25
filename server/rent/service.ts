import { and, asc, desc, eq, inArray, sql, ne } from "drizzle-orm";
import { db } from "../db";
import {
  organizations,
  properties,
  rentAccounts,
  rentAllocations,
  rentCharges,
  rentReceipts,
  rentScheduleVersions,
  tenantAssignments,
  users,
  toMinorUnits,
  fromMinorUnits,
  type RentAccount,
  type RentCharge,
  type RentReceipt,
} from "@shared/schema";
import {
  computeScheduleWindows,
  deriveChargeStatus,
  proposeOldestFirstAllocation,
  chargeOutstanding,
  startOfUtcDay,
} from "@shared/rentScheduleMath";
import { writeFinancialAudit } from "./audit";

function httpError(status: number, message: string) {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

export async function ensureRentAccountForAssignment(
  assignmentId: string,
  actorUserId?: string | null,
): Promise<RentAccount> {
  const [existing] = await db
    .select()
    .from(rentAccounts)
    .where(eq(rentAccounts.tenancyId, assignmentId))
    .limit(1);
  if (existing) return existing;

  const [assignment] = await db
    .select()
    .from(tenantAssignments)
    .where(eq(tenantAssignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw httpError(404, "Tenancy not found");

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, assignment.organizationId))
    .limit(1);

  const currency = org?.preferredCurrency || "GBP";
  const [created] = await db
    .insert(rentAccounts)
    .values({
      organizationId: assignment.organizationId,
      tenancyId: assignment.id,
      propertyId: assignment.propertyId,
      currency,
      status: assignment.isActive ? "active" : "closed",
      payerReference: `RENT-${assignment.id.slice(0, 8).toUpperCase()}`,
    })
    .onConflictDoNothing()
    .returning();

  const account =
    created ||
    (
      await db
        .select()
        .from(rentAccounts)
        .where(eq(rentAccounts.tenancyId, assignmentId))
        .limit(1)
    )[0];

  if (!account) throw httpError(500, "Failed to create rent account");

  const amountMinor = toMinorUnits(assignment.monthlyRent);
  if (amountMinor > 0 && assignment.leaseStartDate) {
    await createScheduleVersion(account.id, {
      amountMinor,
      frequency: "monthly",
      dueDay: assignment.rentDueDay || 1,
      effectiveFrom: assignment.leaseStartDate,
      approve: true,
      actorUserId,
      notes: "Auto-provisioned from tenancy",
    });
  }

  await writeFinancialAudit({
    organizationId: account.organizationId,
    entityType: "rent_account",
    entityId: account.id,
    action: "created",
    actorUserId,
    after: account,
  });

  return account;
}

export async function createScheduleVersion(
  accountId: string,
  input: {
    amountMinor: number;
    frequency?: "weekly" | "fortnightly" | "monthly" | "quarterly";
    dueDay?: number;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    prorationRule?: "actual_days" | "none";
    approve?: boolean;
    actorUserId?: string | null;
    notes?: string;
    idempotencyKey?: string;
  },
) {
  const [account] = await db
    .select()
    .from(rentAccounts)
    .where(eq(rentAccounts.id, accountId))
    .limit(1);
  if (!account) throw httpError(404, "Rent account not found");

  if (input.idempotencyKey) {
    const [dup] = await db
      .select()
      .from(rentScheduleVersions)
      .where(
        and(
          eq(rentScheduleVersions.organizationId, account.organizationId),
          eq(rentScheduleVersions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (dup) return dup;
  }

  const approve = input.approve !== false;
  if (approve) {
    // Supersede overlapping approved versions
    const active = await db
      .select()
      .from(rentScheduleVersions)
      .where(
        and(
          eq(rentScheduleVersions.accountId, accountId),
          eq(rentScheduleVersions.status, "approved"),
        ),
      );
    for (const v of active) {
      if (!v.effectiveTo || v.effectiveTo >= input.effectiveFrom) {
        await db
          .update(rentScheduleVersions)
          .set({
            status: "superseded",
            effectiveTo: input.effectiveFrom,
            updatedAt: new Date(),
          })
          .where(eq(rentScheduleVersions.id, v.id));
      }
    }
  }

  const [version] = await db
    .insert(rentScheduleVersions)
    .values({
      organizationId: account.organizationId,
      accountId,
      amountMinor: input.amountMinor,
      frequency: input.frequency || "monthly",
      dueDay: Math.min(31, Math.max(1, input.dueDay || 1)),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo || null,
      prorationRule: input.prorationRule || "actual_days",
      status: approve ? "approved" : "draft",
      approvedBy: approve ? input.actorUserId || null : null,
      approvedAt: approve ? new Date() : null,
      notes: input.notes || null,
      idempotencyKey: input.idempotencyKey || null,
    })
    .returning();

  await writeFinancialAudit({
    organizationId: account.organizationId,
    entityType: "rent_schedule_version",
    entityId: version.id,
    action: approve ? "approved" : "drafted",
    actorUserId: input.actorUserId,
    after: version,
  });

  if (approve) {
    await generateChargesForAccount(accountId, { actorUserId: input.actorUserId });
  }

  return version;
}

export async function generateChargesForAccount(
  accountId: string,
  opts?: { throughDate?: Date; actorUserId?: string | null },
): Promise<number> {
  const [account] = await db
    .select()
    .from(rentAccounts)
    .where(eq(rentAccounts.id, accountId))
    .limit(1);
  if (!account || account.status === "closed") return 0;

  const [assignment] = await db
    .select()
    .from(tenantAssignments)
    .where(eq(tenantAssignments.id, account.tenancyId))
    .limit(1);

  const versions = await db
    .select()
    .from(rentScheduleVersions)
    .where(
      and(
        eq(rentScheduleVersions.accountId, accountId),
        eq(rentScheduleVersions.status, "approved"),
      ),
    );

  let created = 0;
  const through = opts?.throughDate || new Date();

  for (const v of versions) {
    const windows = computeScheduleWindows({
      amountMinor: v.amountMinor,
      frequency: v.frequency as any,
      dueDay: v.dueDay,
      effectiveFrom: v.effectiveFrom,
      effectiveTo: v.effectiveTo,
      leaseStart: assignment?.leaseStartDate,
      leaseEnd: assignment?.leaseEndDate,
      throughDate: through,
      prorationRule: (v.prorationRule as any) || "actual_days",
      monthEndRule: (account.monthEndRule as any) || "clamp_to_last_day",
    });

    for (const w of windows) {
      const idem = `${accountId}:${v.id}:${w.periodStart.toISOString().slice(0, 10)}:rent`;
      const asOf = startOfUtcDay(through);
      const status = deriveChargeStatus({
        amountMinor: w.amountMinor,
        allocatedMinor: 0,
        dueDate: w.dueDate,
        asOf,
      });
      const posted = status !== "scheduled";

      try {
        const inserted = await db
          .insert(rentCharges)
          .values({
            organizationId: account.organizationId,
            accountId,
            scheduleVersionId: v.id,
            periodStart: w.periodStart,
            periodEnd: w.periodEnd,
            dueDate: w.dueDate,
            amountMinor: w.amountMinor,
            allocatedMinor: 0,
            type: "rent",
            status,
            postedAt: posted ? new Date() : null,
            effectiveDate: w.dueDate,
            currency: account.currency,
            idempotencyKey: idem,
            createdBy: opts?.actorUserId || null,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted.length) created += 1;
      } catch {
        // unique conflict — ignore
      }
    }
  }
  return created;
}

export async function refreshChargeStatuses(
  organizationId: string,
  asOf: Date = new Date(),
): Promise<number> {
  const charges = await db
    .select()
    .from(rentCharges)
    .where(
      and(
        eq(rentCharges.organizationId, organizationId),
        inArray(rentCharges.status, ["scheduled", "due", "part_paid", "overdue"]),
      ),
    );
  let updated = 0;
  for (const c of charges) {
    const next = deriveChargeStatus({
      amountMinor: c.amountMinor,
      allocatedMinor: c.allocatedMinor,
      dueDate: c.dueDate,
      asOf,
      current: c.status,
    });
    if (next !== c.status) {
      await db
        .update(rentCharges)
        .set({
          status: next,
          postedAt: c.postedAt || (next !== "scheduled" ? new Date() : null),
          updatedAt: new Date(),
        })
        .where(eq(rentCharges.id, c.id));
      updated += 1;
    }
  }
  return updated;
}

export async function createReceipt(input: {
  organizationId: string;
  accountId?: string | null;
  amountMinor: number;
  currency?: string;
  reference?: string;
  receivedAt?: Date;
  channel?: string;
  confirm?: boolean;
  allocateOldestFirst?: boolean;
  allocations?: Array<{ chargeId: string; amountMinor: number }>;
  creditExcess?: boolean;
  notes?: string;
  idempotencyKey?: string;
  externalId?: string;
  bankTransactionId?: string;
  actorUserId?: string | null;
  source?: string;
}): Promise<{ receipt: RentReceipt; allocations: any[]; creditMinor: number }> {
  if (input.amountMinor <= 0) throw httpError(400, "Amount must be positive");

  if (input.idempotencyKey) {
    const [dup] = await db
      .select()
      .from(rentReceipts)
      .where(
        and(
          eq(rentReceipts.organizationId, input.organizationId),
          eq(rentReceipts.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (dup) {
      const allocs = await db
        .select()
        .from(rentAllocations)
        .where(eq(rentAllocations.receiptId, dup.id));
      return { receipt: dup, allocations: allocs, creditMinor: 0 };
    }
  }

  if (input.accountId) {
    const [acc] = await db
      .select()
      .from(rentAccounts)
      .where(
        and(
          eq(rentAccounts.id, input.accountId),
          eq(rentAccounts.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!acc) throw httpError(404, "Rent account not found");
  }

  const confirm = input.confirm !== false;
  const receivedAt = input.receivedAt || new Date();

  const [receipt] = await db
    .insert(rentReceipts)
    .values({
      organizationId: input.organizationId,
      accountId: input.accountId || null,
      amountMinor: input.amountMinor,
      channel: input.channel || "manual",
      reference: input.reference || null,
      receivedAt,
      confirmedAt: confirm ? new Date() : null,
      status: confirm ? "confirmed" : "pending",
      allocationState: "unallocated",
      currency: input.currency || "GBP",
      idempotencyKey: input.idempotencyKey || null,
      externalId: input.externalId || null,
      bankTransactionId: input.bankTransactionId || null,
      notes: input.notes || null,
      createdBy: input.actorUserId || null,
      source: input.source || null,
    })
    .returning();

  await writeFinancialAudit({
    organizationId: input.organizationId,
    entityType: "rent_receipt",
    entityId: receipt.id,
    action: confirm ? "confirmed" : "pending",
    actorUserId: input.actorUserId,
    after: receipt,
  });

  let allocationsCreated: any[] = [];
  let creditMinor = 0;

  if (confirm && input.accountId) {
    const result = await allocateReceipt(receipt.id, {
      allocateOldestFirst: input.allocateOldestFirst !== false,
      allocations: input.allocations,
      creditExcess: input.creditExcess !== false,
      actorUserId: input.actorUserId,
    });
    allocationsCreated = result.allocations;
    creditMinor = result.creditMinor;
  }

  const [fresh] = await db.select().from(rentReceipts).where(eq(rentReceipts.id, receipt.id)).limit(1);
  return { receipt: fresh || receipt, allocations: allocationsCreated, creditMinor };
}

export async function allocateReceipt(
  receiptId: string,
  input: {
    allocateOldestFirst?: boolean;
    allocations?: Array<{ chargeId: string; amountMinor: number }>;
    creditExcess?: boolean;
    actorUserId?: string | null;
  },
): Promise<{ allocations: any[]; creditMinor: number }> {
  return db.transaction(async (tx) => {
    const [receipt] = await tx
      .select()
      .from(rentReceipts)
      .where(eq(rentReceipts.id, receiptId));
    if (!receipt) throw httpError(404, "Receipt not found");
    if (receipt.status !== "confirmed") throw httpError(400, "Only confirmed receipts can be allocated");
    if (!receipt.accountId) throw httpError(400, "Suspense receipts must be assigned to an account first");

    // Row lock receipt + open charges for this account (prevents overallocation)
    await tx.execute(
      sql`SELECT id FROM rent_receipts WHERE id = ${receiptId} FOR UPDATE`,
    );
    await tx.execute(
      sql`SELECT id FROM rent_charges WHERE account_id = ${receipt.accountId} FOR UPDATE`,
    );

    const already = Number(receipt.allocatedMinor || 0);
    let remaining = receipt.amountMinor - already;
    if (remaining <= 0) {
      const existing = await tx
        .select()
        .from(rentAllocations)
        .where(and(eq(rentAllocations.receiptId, receiptId), eq(rentAllocations.isReversed, false)));
      return { allocations: existing, creditMinor: 0 };
    }

    let plan = input.allocations || [];
    if (!plan.length && input.allocateOldestFirst !== false) {
      const charges = await tx
        .select()
        .from(rentCharges)
        .where(
          and(
            eq(rentCharges.accountId, receipt.accountId),
            inArray(rentCharges.status, ["scheduled", "due", "part_paid", "overdue"]),
          ),
        )
        .orderBy(asc(rentCharges.dueDate));
      plan = proposeOldestFirstAllocation(
        charges.map((c) => ({
          id: c.id,
          amountMinor: c.amountMinor,
          allocatedMinor: c.allocatedMinor,
          dueDate: c.dueDate,
        })),
        remaining,
      );
    }

    const created: any[] = [];
    for (const line of plan) {
      if (remaining <= 0) break;
      const take = Math.min(line.amountMinor, remaining);
      if (take <= 0) continue;

      const [charge] = await tx
        .select()
        .from(rentCharges)
        .where(eq(rentCharges.id, line.chargeId));
      if (!charge || charge.accountId !== receipt.accountId) {
        throw httpError(400, `Invalid charge ${line.chargeId}`);
      }
      const need = chargeOutstanding(charge.amountMinor, charge.allocatedMinor);
      const apply = Math.min(take, need);
      if (apply <= 0) continue;

      const [alloc] = await tx
        .insert(rentAllocations)
        .values({
          organizationId: receipt.organizationId,
          receiptId: receipt.id,
          chargeId: charge.id,
          amountMinor: apply,
          effectiveAt: receipt.receivedAt || new Date(),
          createdBy: input.actorUserId || null,
        })
        .returning();
      created.push(alloc);
      remaining -= apply;

      const newAllocated = charge.allocatedMinor + apply;
      const status = deriveChargeStatus({
        amountMinor: charge.amountMinor,
        allocatedMinor: newAllocated,
        dueDate: charge.dueDate,
        asOf: new Date(),
      });
      await tx
        .update(rentCharges)
        .set({ allocatedMinor: newAllocated, status, updatedAt: new Date() })
        .where(eq(rentCharges.id, charge.id));
    }

    let creditMinor = 0;
    if (remaining > 0 && input.creditExcess !== false) {
      creditMinor = remaining;
      await tx
        .update(rentAccounts)
        .set({
          unappliedCreditMinor: sql`${rentAccounts.unappliedCreditMinor} + ${creditMinor}`,
          updatedAt: new Date(),
        })
        .where(eq(rentAccounts.id, receipt.accountId));
      remaining = 0;
    }

    const totalAllocated = receipt.amountMinor - remaining - creditMinor;
    let allocationState: "unallocated" | "partial" | "allocated" = "unallocated";
    if (totalAllocated + creditMinor >= receipt.amountMinor) allocationState = "allocated";
    else if (totalAllocated > 0) allocationState = "partial";

    await tx
      .update(rentReceipts)
      .set({
        allocatedMinor: already + created.reduce((s, a) => s + a.amountMinor, 0),
        allocationState,
        updatedAt: new Date(),
      })
      .where(eq(rentReceipts.id, receipt.id));

    await writeFinancialAudit({
      organizationId: receipt.organizationId,
      entityType: "rent_receipt",
      entityId: receipt.id,
      action: "allocated",
      actorUserId: input.actorUserId,
      after: { allocations: created, creditMinor },
    });

    return { allocations: created, creditMinor };
  });
}

export async function listAccounts(
  organizationId: string,
  filters: {
    propertyId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const limit = Math.min(filters.limit || 100, 500);
  const offset = filters.offset || 0;

  const conditions = [eq(rentAccounts.organizationId, organizationId)];
  if (filters.propertyId) conditions.push(eq(rentAccounts.propertyId, filters.propertyId));
  if (filters.status) conditions.push(eq(rentAccounts.status, filters.status));

  const rows = await db
    .select({
      account: rentAccounts,
      assignment: tenantAssignments,
      tenant: users,
      property: properties,
    })
    .from(rentAccounts)
    .innerJoin(tenantAssignments, eq(rentAccounts.tenancyId, tenantAssignments.id))
    .innerJoin(users, eq(tenantAssignments.tenantId, users.id))
    .innerJoin(properties, eq(rentAccounts.propertyId, properties.id))
    .where(and(...conditions))
    .orderBy(asc(properties.name))
    .limit(limit)
    .offset(offset);

  let filtered = rows;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = rows.filter((r) => {
      const hay = [
        r.tenant.firstName,
        r.tenant.lastName,
        r.tenant.email,
        r.property.name,
        r.property.address,
        r.account.payerReference,
        r.account.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const asOf = new Date();
  const enriched = [];
  for (const r of filtered) {
    const balances = await getAccountBalances(r.account.id, asOf);
    enriched.push({
      id: r.account.id,
      tenancyId: r.account.tenancyId,
      propertyId: r.account.propertyId,
      propertyName: r.property.name,
      unitLabel: r.property.address || null,
      tenantName: [r.tenant.firstName, r.tenant.lastName].filter(Boolean).join(" ") || r.tenant.email,
      tenantEmail: r.tenant.email,
      currency: r.account.currency,
      status: r.account.status,
      payerReference: r.account.payerReference,
      monthlyRentMinor: toMinorUnits(r.assignment.monthlyRent),
      rentDueDay: r.assignment.rentDueDay,
      leaseStartDate: r.assignment.leaseStartDate,
      leaseEndDate: r.assignment.leaseEndDate,
      unappliedCreditMinor: r.account.unappliedCreditMinor,
      ...balances,
    });
  }
  return enriched;
}

export async function getAccountBalances(accountId: string, asOf: Date = new Date()) {
  const asOfDay = startOfUtcDay(asOf);
  const charges = await db
    .select()
    .from(rentCharges)
    .where(
      and(
        eq(rentCharges.accountId, accountId),
        inArray(rentCharges.type, ["rent", "opening_balance"]),
        ne(rentCharges.status, "reversed"),
      ),
    );

  let scheduledMinor = 0;
  let collectedMinor = 0;
  let arrearsMinor = 0;
  let upcomingMinor = 0;
  let dueToDateMinor = 0;
  let dueToDateCollectedMinor = 0;
  let oldestDueDate: Date | null = null;
  let nextDueDate: Date | null = null;

  for (const c of charges) {
    const outstanding = chargeOutstanding(c.amountMinor, c.allocatedMinor);
    const due = startOfUtcDay(c.dueDate);
    scheduledMinor += c.amountMinor;
    collectedMinor += Math.min(c.allocatedMinor, c.amountMinor);

    if (due <= asOfDay) {
      dueToDateMinor += c.amountMinor;
      dueToDateCollectedMinor += Math.min(c.allocatedMinor, c.amountMinor);
      if (outstanding > 0) {
        arrearsMinor += outstanding;
        if (!oldestDueDate || due < oldestDueDate) oldestDueDate = due;
      }
    } else {
      upcomingMinor += outstanding;
      if (!nextDueDate || due < nextDueDate) nextDueDate = due;
    }
  }

  const [account] = await db.select().from(rentAccounts).where(eq(rentAccounts.id, accountId)).limit(1);

  return {
    scheduledMinor,
    collectedMinor,
    arrearsMinor,
    upcomingMinor,
    dueToDateMinor,
    dueToDateCollectedMinor,
    oldestDueDate,
    nextDueDate,
    unappliedCreditMinor: account?.unappliedCreditMinor || 0,
    balanceMinor: arrearsMinor,
  };
}

export async function getAccountLedger(accountId: string, organizationId: string, asOf?: Date) {
  const [account] = await db
    .select()
    .from(rentAccounts)
    .where(and(eq(rentAccounts.id, accountId), eq(rentAccounts.organizationId, organizationId)))
    .limit(1);
  if (!account) throw httpError(404, "Account not found");

  const [assignment] = await db
    .select()
    .from(tenantAssignments)
    .where(eq(tenantAssignments.id, account.tenancyId))
    .limit(1);
  const [tenant] = assignment
    ? await db.select().from(users).where(eq(users.id, assignment.tenantId)).limit(1)
    : [null];
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, account.propertyId))
    .limit(1);

  const charges = await db
    .select()
    .from(rentCharges)
    .where(eq(rentCharges.accountId, accountId))
    .orderBy(asc(rentCharges.dueDate));
  const receipts = await db
    .select()
    .from(rentReceipts)
    .where(eq(rentReceipts.accountId, accountId))
    .orderBy(desc(rentReceipts.receivedAt));
  const schedules = await db
    .select()
    .from(rentScheduleVersions)
    .where(eq(rentScheduleVersions.accountId, accountId))
    .orderBy(desc(rentScheduleVersions.effectiveFrom));

  const balances = await getAccountBalances(accountId, asOf || new Date());

  return {
    account,
    assignment,
    tenant: tenant
      ? {
          id: tenant.id,
          name: [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") || tenant.email,
          email: tenant.email,
        }
      : null,
    property: property
      ? { id: property.id, name: property.name, address: property.address }
      : null,
    schedules,
    charges,
    receipts,
    balances,
  };
}

export async function provisionAccountsForOrganization(organizationId: string) {
  const assignments = await db
    .select()
    .from(tenantAssignments)
    .where(and(eq(tenantAssignments.organizationId, organizationId), eq(tenantAssignments.isActive, true)));
  let created = 0;
  for (const a of assignments) {
    const before = await db
      .select({ id: rentAccounts.id })
      .from(rentAccounts)
      .where(eq(rentAccounts.tenancyId, a.id))
      .limit(1);
    await ensureRentAccountForAssignment(a.id);
    if (!before.length) created += 1;
  }
  return { assignments: assignments.length, created };
}

export { fromMinorUnits, toMinorUnits, httpError };
