/**
 * One-shot migration: rent_periods → rent_charges (+ synthetic receipts for collected amounts).
 * Never invents payment dates beyond collectedAt / period dueDate.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  rentAccounts,
  rentCharges,
  rentPeriods,
  tenantAssignments,
  toMinorUnits,
} from "@shared/schema";
import { createReceipt, ensureRentAccountForAssignment, generateChargesForAccount } from "./service";
import { writeFinancialAudit } from "./audit";
import { deriveChargeStatus } from "@shared/rentScheduleMath";

export async function migrateLegacyRentPeriods(
  organizationId: string,
  opts: { dryRun?: boolean; actorUserId?: string | null } = {},
) {
  const commit = opts.dryRun === false;

  const assignments = await db
    .select()
    .from(tenantAssignments)
    .where(eq(tenantAssignments.organizationId, organizationId));

  const summary = {
    dryRun: !commit,
    assignments: assignments.length,
    accountsEnsured: 0,
    periodsSeen: 0,
    chargesCreated: 0,
    receiptsCreated: 0,
    skippedMigrated: 0,
    totals: {
      amountDueMinor: 0,
      amountPaidMinor: 0,
    },
    exceptions: [] as string[],
  };

  for (const assignment of assignments) {
    const periods = await db
      .select()
      .from(rentPeriods)
      .where(
        and(
          eq(rentPeriods.organizationId, organizationId),
          eq(rentPeriods.tenantAssignmentId, assignment.id),
        ),
      );

    if (!periods.length && !assignment.monthlyRent) continue;

    if (!commit) {
      for (const p of periods) {
        summary.periodsSeen += 1;
        summary.totals.amountDueMinor += toMinorUnits(p.amountDue);
        summary.totals.amountPaidMinor += toMinorUnits(p.amountPaid);
      }
      continue;
    }

    const account = await ensureRentAccountForAssignment(assignment.id, opts.actorUserId);
    summary.accountsEnsured += 1;

    if (account.migratedFromLegacy) {
      summary.skippedMigrated += 1;
      continue;
    }

    // Generate schedule-based charges first
    await generateChargesForAccount(account.id, { actorUserId: opts.actorUserId });

    for (const p of periods) {
      summary.periodsSeen += 1;
      const amountDueMinor = toMinorUnits(p.amountDue);
      const amountPaidMinor = toMinorUnits(p.amountPaid);
      summary.totals.amountDueMinor += amountDueMinor;
      summary.totals.amountPaidMinor += amountPaidMinor;

      // Prefer linking to existing generated charge by period start, else insert opening/legacy charge
      const [existingCharge] = await db
        .select()
        .from(rentCharges)
        .where(and(eq(rentCharges.accountId, account.id), eq(rentCharges.periodStart, p.periodStart)))
        .limit(1);

      let chargeId = existingCharge?.id;
      if (!chargeId) {
        const status = deriveChargeStatus({
          amountMinor: amountDueMinor,
          allocatedMinor: 0,
          dueDate: p.dueDate,
          asOf: new Date(),
        });
        const [created] = await db
          .insert(rentCharges)
          .values({
            organizationId,
            accountId: account.id,
            scheduleVersionId: null,
            periodStart: p.periodStart,
            periodEnd: p.periodEnd,
            dueDate: p.dueDate,
            amountMinor: amountDueMinor,
            allocatedMinor: 0,
            type: "rent",
            status: p.status === "waived" ? "adjusted" : status,
            legacyPeriodId: p.id,
            postedAt: new Date(),
            effectiveDate: p.dueDate,
            currency: p.currency || "GBP",
            idempotencyKey: `legacy:${p.id}`,
            createdBy: opts.actorUserId || null,
          })
          .onConflictDoNothing()
          .returning();
        if (created) {
          chargeId = created.id;
          summary.chargesCreated += 1;
        } else {
          const [again] = await db
            .select()
            .from(rentCharges)
            .where(eq(rentCharges.legacyPeriodId, p.id))
            .limit(1);
          chargeId = again?.id;
        }
      } else {
        await db
          .update(rentCharges)
          .set({ legacyPeriodId: p.id, updatedAt: new Date() })
          .where(eq(rentCharges.id, existingCharge.id));
      }

      if (!chargeId) {
        summary.exceptions.push(`Could not create/link charge for period ${p.id}`);
        continue;
      }

      if (amountPaidMinor > 0 && p.status !== "waived") {
        await createReceipt({
          organizationId,
          accountId: account.id,
          amountMinor: amountPaidMinor,
          reference: `LEGACY-${p.id.slice(0, 8)}`,
          receivedAt: p.collectedAt || p.dueDate,
          channel: "legacy_migration",
          confirm: true,
          allocateOldestFirst: false,
          allocations: [{ chargeId, amountMinor: Math.min(amountPaidMinor, amountDueMinor) }],
          creditExcess: true,
          idempotencyKey: `legacy-receipt:${p.id}`,
          externalId: `legacy-period:${p.id}`,
          actorUserId: opts.actorUserId,
          source: "rent_periods",
        });
        summary.receiptsCreated += 1;
      }
    }

    await db
      .update(rentAccounts)
      .set({ migratedFromLegacy: true, updatedAt: new Date() })
      .where(eq(rentAccounts.id, account.id));
  }

  if (commit) {
    await writeFinancialAudit({
      organizationId,
      entityType: "rent_migration",
      entityId: organizationId,
      action: "legacy_periods_migrated",
      actorUserId: opts.actorUserId,
      after: summary,
    });
  }

  return summary;
}

/** Dry-run friendly wrapper used by API. */
export async function runLegacyMigration(
  organizationId: string,
  dryRun: boolean,
  actorUserId?: string | null,
) {
  return migrateLegacyRentPeriods(organizationId, { dryRun, actorUserId });
}
