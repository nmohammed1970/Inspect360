import { and, desc, eq, ne, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  arrearsCaseEvents,
  arrearsCases,
  paymentPlans,
  planInstalments,
  rentAccounts,
} from "@shared/schema";
import { getAccountBalances, httpError } from "./service";
import { writeFinancialAudit } from "./audit";

const OPEN_STATUSES = [
  "review_required",
  "contact_scheduled",
  "reminder_sent",
  "plan_active",
  "disputed",
  "on_hold",
  "escalated",
];

export async function syncArrearsCasesForOrganization(organizationId: string) {
  const accounts = await db
    .select()
    .from(rentAccounts)
    .where(and(eq(rentAccounts.organizationId, organizationId), eq(rentAccounts.status, "active")));

  let opened = 0;
  let resolved = 0;
  let updated = 0;

  for (const account of accounts) {
    const balances = await getAccountBalances(account.id);
    const [openCase] = await db
      .select()
      .from(arrearsCases)
      .where(
        and(
          eq(arrearsCases.accountId, account.id),
          inArray(arrearsCases.status, OPEN_STATUSES as any),
        ),
      )
      .limit(1);

    if (balances.arrearsMinor > 0) {
      if (!openCase) {
        const [created] = await db
          .insert(arrearsCases)
          .values({
            organizationId,
            accountId: account.id,
            status: "review_required",
            overdueMinor: balances.arrearsMinor,
            oldestDueDate: balances.oldestDueDate,
          })
          .returning();
        await db.insert(arrearsCaseEvents).values({
          organizationId,
          caseId: created.id,
          eventType: "opened",
          note: "Auto-opened by overdue detection",
        });
        opened += 1;
      } else if (
        openCase.overdueMinor !== balances.arrearsMinor ||
        String(openCase.oldestDueDate) !== String(balances.oldestDueDate)
      ) {
        if (openCase.status === "on_hold" || openCase.status === "disputed") {
          await db
            .update(arrearsCases)
            .set({
              overdueMinor: balances.arrearsMinor,
              oldestDueDate: balances.oldestDueDate,
              updatedAt: new Date(),
            })
            .where(eq(arrearsCases.id, openCase.id));
        } else {
          await db
            .update(arrearsCases)
            .set({
              overdueMinor: balances.arrearsMinor,
              oldestDueDate: balances.oldestDueDate,
              updatedAt: new Date(),
            })
            .where(eq(arrearsCases.id, openCase.id));
        }
        updated += 1;
      }
    } else if (openCase) {
      await db
        .update(arrearsCases)
        .set({
          status: "resolved",
          overdueMinor: 0,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(arrearsCases.id, openCase.id));
      await db.insert(arrearsCaseEvents).values({
        organizationId,
        caseId: openCase.id,
        eventType: "resolved",
        note: "Balance cleared",
      });
      resolved += 1;
    }
  }

  return { opened, updated, resolved };
}

export async function listArrearsCases(organizationId: string, includeResolved = false) {
  const conditions = [eq(arrearsCases.organizationId, organizationId)];
  if (!includeResolved) conditions.push(ne(arrearsCases.status, "resolved"));
  return db
    .select()
    .from(arrearsCases)
    .where(and(...conditions))
    .orderBy(desc(arrearsCases.overdueMinor));
}

export async function addArrearsEvent(
  organizationId: string,
  caseId: string,
  input: {
    eventType: string;
    note?: string;
    status?: string;
    holdReason?: string;
    nextActionAt?: Date | null;
    actorUserId?: string | null;
  },
) {
  const [c] = await db
    .select()
    .from(arrearsCases)
    .where(and(eq(arrearsCases.id, caseId), eq(arrearsCases.organizationId, organizationId)))
    .limit(1);
  if (!c) throw httpError(404, "Arrears case not found");

  // Never auto-escalate to legal — escalate status is manual only
  if (input.status === "escalated" && !input.note) {
    throw httpError(400, "Escalation requires a note; legal notices are never automated");
  }

  const [event] = await db
    .insert(arrearsCaseEvents)
    .values({
      organizationId,
      caseId,
      eventType: input.eventType,
      note: input.note || null,
      actorUserId: input.actorUserId || null,
      metadataJson: input.status ? { status: input.status } : null,
    })
    .returning();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.status) patch.status = input.status;
  if (input.holdReason !== undefined) patch.holdReason = input.holdReason;
  if (input.nextActionAt !== undefined) patch.nextActionAt = input.nextActionAt;
  if (input.eventType === "contact" || input.eventType === "reminder") {
    patch.lastContactAt = new Date();
  }
  if (input.status === "resolved") patch.resolvedAt = new Date();

  const [updated] = await db
    .update(arrearsCases)
    .set(patch as any)
    .where(eq(arrearsCases.id, caseId))
    .returning();

  await writeFinancialAudit({
    organizationId,
    entityType: "arrears_case",
    entityId: caseId,
    action: input.eventType,
    actorUserId: input.actorUserId,
    after: updated,
    reason: input.note,
  });

  return { case: updated, event };
}

export async function createPaymentPlan(
  organizationId: string,
  caseId: string,
  input: {
    instalments: Array<{ dueDate: string; amountMinor: number }>;
    notes?: string;
    actorUserId?: string | null;
  },
) {
  const [c] = await db
    .select()
    .from(arrearsCases)
    .where(and(eq(arrearsCases.id, caseId), eq(arrearsCases.organizationId, organizationId)))
    .limit(1);
  if (!c) throw httpError(404, "Arrears case not found");
  if (!input.instalments?.length) throw httpError(400, "Instalments required");

  const [plan] = await db
    .insert(paymentPlans)
    .values({
      organizationId,
      accountId: c.accountId,
      caseId,
      originalArrearsMinor: c.overdueMinor,
      status: "active",
      notes: input.notes || null,
      approvedBy: input.actorUserId || null,
      approvedAt: new Date(),
      createdBy: input.actorUserId || null,
    })
    .returning();

  for (const inst of input.instalments) {
    await db.insert(planInstalments).values({
      organizationId,
      planId: plan.id,
      dueDate: new Date(inst.dueDate),
      amountMinor: inst.amountMinor,
      status: "due",
    });
  }

  await addArrearsEvent(organizationId, caseId, {
    eventType: "plan_created",
    note: input.notes || "Payment plan approved",
    status: "plan_active",
    actorUserId: input.actorUserId,
  });

  // Plan changes do NOT alter contractual rent ledger
  return plan;
}

export async function getCaseDetail(organizationId: string, caseId: string) {
  const [c] = await db
    .select()
    .from(arrearsCases)
    .where(and(eq(arrearsCases.id, caseId), eq(arrearsCases.organizationId, organizationId)))
    .limit(1);
  if (!c) throw httpError(404, "Arrears case not found");
  const events = await db
    .select()
    .from(arrearsCaseEvents)
    .where(eq(arrearsCaseEvents.caseId, caseId))
    .orderBy(desc(arrearsCaseEvents.createdAt));
  const plans = await db
    .select()
    .from(paymentPlans)
    .where(eq(paymentPlans.caseId, caseId))
    .orderBy(desc(paymentPlans.createdAt));
  return { case: c, events, plans };
}
