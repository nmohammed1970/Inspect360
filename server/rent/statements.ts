import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  statementSnapshots,
  fromMinorUnits,
} from "@shared/schema";
import { getAccountLedger, httpError } from "./service";
import { writeFinancialAudit } from "./audit";
import { chargeOutstanding, startOfUtcDay } from "@shared/rentScheduleMath";

export async function generateStatement(
  organizationId: string,
  accountId: string,
  input: {
    from: Date;
    to: Date;
    asOf?: Date;
    actorUserId?: string | null;
  },
) {
  const ledger = await getAccountLedger(accountId, organizationId, input.asOf || input.to);
  const from = startOfUtcDay(input.from);
  const to = startOfUtcDay(input.to);
  const asOf = startOfUtcDay(input.asOf || input.to);

  const charges = ledger.charges.filter((c) => {
    const d = startOfUtcDay(c.dueDate);
    return d >= from && d <= to;
  });
  const receipts = ledger.receipts.filter((r) => {
    const d = startOfUtcDay(r.receivedAt);
    return d >= from && d <= to && r.status === "confirmed";
  });

  // Opening = unpaid charges before from
  let openingBalanceMinor = 0;
  for (const c of ledger.charges) {
    if (startOfUtcDay(c.dueDate) < from && c.status !== "reversed") {
      openingBalanceMinor += chargeOutstanding(c.amountMinor, c.allocatedMinor);
    }
  }

  const lines: Array<{
    date: string;
    type: string;
    description: string;
    debitMinor: number;
    creditMinor: number;
    balanceMinor: number;
  }> = [];

  let running = openingBalanceMinor;
  const events: Array<{ date: Date; type: string; description: string; debit: number; credit: number }> = [];

  for (const c of charges) {
    events.push({
      date: c.dueDate,
      type: "charge",
      description: `${c.type} ${c.periodStart.toISOString().slice(0, 10)}–${c.periodEnd.toISOString().slice(0, 10)}`,
      debit: c.amountMinor,
      credit: 0,
    });
  }
  for (const r of receipts) {
    events.push({
      date: r.receivedAt,
      type: "receipt",
      description: `Receipt ${r.reference || r.id}`,
      debit: 0,
      credit: r.amountMinor,
    });
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const e of events) {
    running += e.debit - e.credit;
    lines.push({
      date: e.date.toISOString().slice(0, 10),
      type: e.type,
      description: e.description,
      debitMinor: e.debit,
      creditMinor: e.credit,
      balanceMinor: running,
    });
  }

  const payload = {
    tenant: ledger.tenant,
    property: ledger.property,
    accountId,
    currency: ledger.account.currency,
    from: from.toISOString(),
    to: to.toISOString(),
    asOf: asOf.toISOString(),
    openingBalanceMinor,
    closingBalanceMinor: running,
    unappliedCreditMinor: ledger.account.unappliedCreditMinor,
    lines,
    charges: charges.map((c) => ({
      id: c.id,
      dueDate: c.dueDate,
      amountMinor: c.amountMinor,
      allocatedMinor: c.allocatedMinor,
      status: c.status,
      type: c.type,
    })),
    receipts: receipts.map((r) => ({
      id: r.id,
      receivedAt: r.receivedAt,
      amountMinor: r.amountMinor,
      reference: r.reference,
      status: r.status,
      allocationState: r.allocationState,
    })),
  };

  const [snap] = await db
    .insert(statementSnapshots)
    .values({
      organizationId,
      accountId,
      fromDate: from,
      toDate: to,
      asOf,
      openingBalanceMinor,
      closingBalanceMinor: running,
      unappliedCreditMinor: ledger.account.unappliedCreditMinor,
      payloadJson: payload,
      createdBy: input.actorUserId || null,
    })
    .returning();

  await writeFinancialAudit({
    organizationId,
    entityType: "statement",
    entityId: snap.id,
    action: "generated",
    actorUserId: input.actorUserId,
    after: { accountId, openingBalanceMinor, closingBalanceMinor: running },
  });

  return snap;
}

export function statementToCsv(payload: any): string {
  const rows = [
    ["Date", "Type", "Description", "Debit", "Credit", "Balance"],
    ...(payload.lines || []).map((l: any) => [
      l.date,
      l.type,
      l.description,
      fromMinorUnits(l.debitMinor),
      fromMinorUnits(l.creditMinor),
      fromMinorUnits(l.balanceMinor),
    ]),
  ];
  return rows
    .map((r) => r.map((v: any) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

export async function listStatements(organizationId: string, accountId?: string) {
  const { desc } = await import("drizzle-orm");
  const conditions = [eq(statementSnapshots.organizationId, organizationId)];
  if (accountId) conditions.push(eq(statementSnapshots.accountId, accountId));
  return db
    .select()
    .from(statementSnapshots)
    .where(and(...conditions))
    .orderBy(desc(statementSnapshots.createdAt))
    .limit(100);
}

export async function getStatement(organizationId: string, id: string) {
  const [snap] = await db
    .select()
    .from(statementSnapshots)
    .where(and(eq(statementSnapshots.id, id), eq(statementSnapshots.organizationId, organizationId)))
    .limit(1);
  if (!snap) throw httpError(404, "Statement not found");
  return snap;
}
