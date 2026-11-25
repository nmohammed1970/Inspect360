import { createHash } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { bankTransactions, rentAccounts, toMinorUnits } from "@shared/schema";
import { createReceipt, httpError } from "./service";
import { writeFinancialAudit } from "./audit";

export type BankImportRow = {
  date: string;
  amount: string | number;
  reference?: string;
  counterparty?: string;
  sourceId?: string;
  direction?: "in" | "out";
};

function fingerprint(row: BankImportRow, organizationId: string): string {
  const raw = [
    organizationId,
    row.date,
    String(row.amount),
    row.reference || "",
    row.counterparty || "",
    row.sourceId || "",
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

export function previewBankImport(organizationId: string, rows: BankImportRow[]) {
  return rows.map((row, index) => {
    const amountMajor = typeof row.amount === "number" ? row.amount : parseFloat(String(row.amount).replace(/,/g, ""));
    const errors: string[] = [];
    if (!row.date || Number.isNaN(Date.parse(row.date))) errors.push("Invalid date");
    if (!Number.isFinite(amountMajor) || amountMajor === 0) errors.push("Invalid amount");
    const amountMinor = toMinorUnits(Math.abs(amountMajor));
    const direction = row.direction || (amountMajor < 0 ? "out" : "in");
    return {
      index,
      ...row,
      amountMinor,
      direction,
      fingerprint: fingerprint(row, organizationId),
      sourceId: row.sourceId || null,
      errors,
      valid: errors.length === 0,
    };
  });
}

export async function commitBankImport(
  organizationId: string,
  rows: BankImportRow[],
  opts: { actorUserId?: string | null; bankAccountLabel?: string } = {},
) {
  const preview = previewBankImport(organizationId, rows);
  const batchId = `IMP-${Date.now()}`;
  let inserted = 0;
  let duplicates = 0;
  let skipped = 0;
  const created: any[] = [];

  for (const row of preview) {
    if (!row.valid) {
      skipped += 1;
      continue;
    }
    try {
      const [tx] = await db
        .insert(bankTransactions)
        .values({
          organizationId,
          bankAccountLabel: opts.bankAccountLabel || "Primary",
          valueDate: new Date(row.date),
          amountMinor: row.amountMinor,
          direction: row.direction,
          reference: row.reference || null,
          counterparty: row.counterparty || null,
          sourceId: row.sourceId || null,
          fingerprint: row.fingerprint,
          rawJson: row,
          matchState: "unmatched",
          importBatchId: batchId,
        })
        .onConflictDoNothing()
        .returning();
      if (!tx) {
        duplicates += 1;
        continue;
      }
      inserted += 1;
      created.push(tx);

      // Suggest match by payer reference + amount
      if (row.direction === "in" && row.reference) {
        const accounts = await db
          .select()
          .from(rentAccounts)
          .where(eq(rentAccounts.organizationId, organizationId));
        const ref = row.reference.toLowerCase();
        const match = accounts.find(
          (a) => a.payerReference && ref.includes(a.payerReference.toLowerCase()),
        );
        if (match) {
          await db
            .update(bankTransactions)
            .set({ matchState: "suggested", suggestedAccountId: match.id, updatedAt: new Date() })
            .where(eq(bankTransactions.id, tx.id));
          tx.matchState = "suggested";
          tx.suggestedAccountId = match.id;
        }
      }
    } catch {
      duplicates += 1;
    }
  }

  await writeFinancialAudit({
    organizationId,
    entityType: "bank_import",
    entityId: batchId,
    action: "committed",
    actorUserId: opts.actorUserId,
    after: { inserted, duplicates, skipped },
  });

  return { batchId, inserted, duplicates, skipped, transactions: created };
}

export async function listBankTransactions(
  organizationId: string,
  filters: { matchState?: string; limit?: number } = {},
) {
  const { desc } = await import("drizzle-orm");
  const conditions = [eq(bankTransactions.organizationId, organizationId)];
  if (filters.matchState) {
    conditions.push(eq(bankTransactions.matchState, filters.matchState));
  } else {
    conditions.push(inArray(bankTransactions.matchState, ["unmatched", "suggested"]));
  }
  return db
    .select()
    .from(bankTransactions)
    .where(and(...conditions))
    .orderBy(desc(bankTransactions.valueDate))
    .limit(filters.limit || 200);
}

export async function confirmBankMatch(
  organizationId: string,
  bankTransactionId: string,
  input: {
    accountId: string;
    allocateOldestFirst?: boolean;
    actorUserId?: string | null;
  },
) {
  const [tx] = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.id, bankTransactionId),
        eq(bankTransactions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!tx) throw httpError(404, "Bank transaction not found");
  if (tx.matchState === "confirmed" || tx.matchState === "reconciled") {
    throw httpError(400, "Already matched");
  }
  if (tx.direction !== "in") throw httpError(400, "Only inbound transactions can be matched to rent");

  const result = await createReceipt({
    organizationId,
    accountId: input.accountId,
    amountMinor: tx.amountMinor,
    reference: tx.reference || tx.id,
    receivedAt: tx.valueDate,
    channel: "bank_match",
    confirm: true,
    allocateOldestFirst: input.allocateOldestFirst !== false,
    creditExcess: true,
    bankTransactionId: tx.id,
    externalId: tx.sourceId || `bank:${tx.id}`,
    idempotencyKey: `bank-match:${tx.id}`,
    actorUserId: input.actorUserId,
    source: "bank_csv",
  });

  await db
    .update(bankTransactions)
    .set({
      matchState: "confirmed",
      suggestedAccountId: input.accountId,
      receiptId: result.receipt.id,
      updatedAt: new Date(),
    })
    .where(eq(bankTransactions.id, tx.id));

  return result;
}
