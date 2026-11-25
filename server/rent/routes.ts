import type { Express, Response } from "express";
import {
  isAuthenticated,
  requireCompanyModule,
  requireRole,
} from "../auth";
import { storage } from "../storage";
import {
  createReceiptBodySchema,
  createScheduleVersionBodySchema,
  toMinorUnits,
} from "@shared/schema";
import {
  allocateReceipt,
  createReceipt,
  createScheduleVersion,
  ensureRentAccountForAssignment,
  getAccountLedger,
  listAccounts,
  provisionAccountsForOrganization,
  httpError,
} from "./service";
import { getRentDashboard, listReceipts } from "./metrics";
import {
  addArrearsEvent,
  createPaymentPlan,
  getCaseDetail,
  listArrearsCases,
} from "./arrears";
import {
  commitBankImport,
  confirmBankMatch,
  listBankTransactions,
  previewBankImport,
} from "./bankImport";
import {
  generateStatement,
  getStatement,
  listStatements,
  statementToCsv,
} from "./statements";
import {
  createRentReview,
  listRentReviews,
  submitRentReview,
} from "./reviews";
import { runLegacyMigration } from "./migrate";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { rentAccounts, tenantAssignments } from "@shared/schema";

function handleErr(res: Response, error: unknown, fallback: string) {
  const err = error as { status?: number; message?: string };
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error(`[rent] ${fallback}`, error);
  return res.status(status).json({ message: err?.message || fallback });
}

async function loadStaffUser(req: any, res: Response) {
  const user = await storage.getUser(req.user.id);
  if (!user) {
    res.status(401).json({ message: "User not found" });
    return null;
  }
  if (!user.organizationId) {
    res.status(400).json({ message: "Organization required" });
    return null;
  }
  // Inspectors / contractors / maintenance have no rent access by default
  if (["contractor"].includes(user.role) || user.role === "compliance") {
    res.status(403).json({ message: "Rent access denied for this role" });
    return null;
  }
  return user;
}

export function registerRentRoutes(app: Express) {
  const staffGate = [
    isAuthenticated,
    requireCompanyModule("rentals"),
    requireRole("owner", "clerk"),
  ];
  const tenantGate = [isAuthenticated, requireCompanyModule("rentals")];

  app.get("/api/rent/dashboard", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const from = req.query.from ? new Date(String(req.query.from)) : undefined;
      const to = req.query.to ? new Date(String(req.query.to)) : undefined;
      const asOf = req.query.asOf ? new Date(String(req.query.asOf)) : undefined;
      const propertyId = req.query.propertyId ? String(req.query.propertyId) : undefined;
      const data = await getRentDashboard(user.organizationId!, {
        from,
        to,
        asOf,
        propertyId,
      });
      res.json(data);
    } catch (e) {
      handleErr(res, e, "Failed to load rent dashboard");
    }
  });

  app.get("/api/rent/accounts", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const accounts = await listAccounts(user.organizationId!, {
        propertyId: req.query.propertyId ? String(req.query.propertyId) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 200,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      });
      res.json(accounts);
    } catch (e) {
      handleErr(res, e, "Failed to list rent accounts");
    }
  });

  app.post("/api/rent/accounts/provision", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const result = await provisionAccountsForOrganization(user.organizationId!);
      res.json(result);
    } catch (e) {
      handleErr(res, e, "Failed to provision rent accounts");
    }
  });

  app.get("/api/rent/accounts/:id/ledger", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const asOf = req.query.asOf ? new Date(String(req.query.asOf)) : undefined;
      const ledger = await getAccountLedger(req.params.id, user.organizationId!, asOf);
      res.json(ledger);
    } catch (e) {
      handleErr(res, e, "Failed to load ledger");
    }
  });

  app.post("/api/rent/accounts/:id/schedule-versions", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const parsed = createScheduleVersionBodySchema.parse(req.body);
      const amountMinor =
        parsed.amountMinor ??
        (parsed.amount !== undefined ? toMinorUnits(parsed.amount) : undefined);
      if (!amountMinor) throw httpError(400, "amount or amountMinor required");
      const version = await createScheduleVersion(req.params.id, {
        amountMinor,
        frequency: parsed.frequency,
        dueDay: parsed.dueDay,
        effectiveFrom: new Date(parsed.effectiveFrom),
        effectiveTo: parsed.effectiveTo ? new Date(parsed.effectiveTo) : null,
        prorationRule: parsed.prorationRule,
        approve: parsed.approve,
        notes: parsed.notes,
        idempotencyKey: parsed.idempotencyKey,
        actorUserId: user.id,
      });
      res.status(201).json(version);
    } catch (e) {
      handleErr(res, e, "Failed to create schedule version");
    }
  });

  app.post("/api/rent/receipts", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const parsed = createReceiptBodySchema.parse(req.body);
      const amountMinor =
        parsed.amountMinor ??
        (parsed.amount !== undefined ? toMinorUnits(parsed.amount) : undefined);
      if (!amountMinor) throw httpError(400, "amount or amountMinor required");
      const result = await createReceipt({
        organizationId: user.organizationId!,
        accountId: parsed.accountId,
        amountMinor,
        currency: parsed.currency,
        reference: parsed.reference,
        receivedAt: parsed.receivedAt ? new Date(parsed.receivedAt) : undefined,
        channel: parsed.channel,
        confirm: parsed.confirm,
        allocateOldestFirst: parsed.allocateOldestFirst,
        allocations: parsed.allocations,
        creditExcess: parsed.creditExcess,
        notes: parsed.notes,
        idempotencyKey: parsed.idempotencyKey || req.header("Idempotency-Key") || undefined,
        actorUserId: user.id,
      });
      res.status(201).json(result);
    } catch (e) {
      handleErr(res, e, "Failed to record receipt");
    }
  });

  app.post("/api/rent/receipts/:id/allocations", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const result = await allocateReceipt(req.params.id, {
        allocateOldestFirst: req.body?.allocateOldestFirst !== false,
        allocations: req.body?.allocations,
        creditExcess: req.body?.creditExcess !== false,
        actorUserId: user.id,
      });
      res.json(result);
    } catch (e) {
      handleErr(res, e, "Failed to allocate receipt");
    }
  });

  app.get("/api/rent/receipts", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const rows = await listReceipts(user.organizationId!, {
        accountId: req.query.accountId ? String(req.query.accountId) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
      });
      res.json(rows);
    } catch (e) {
      handleErr(res, e, "Failed to list receipts");
    }
  });

  app.get("/api/rent/arrears", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const rows = await listArrearsCases(
        user.organizationId!,
        req.query.includeResolved === "true",
      );
      res.json(rows);
    } catch (e) {
      handleErr(res, e, "Failed to list arrears");
    }
  });

  app.get("/api/rent/arrears/:id", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const detail = await getCaseDetail(user.organizationId!, req.params.id);
      res.json(detail);
    } catch (e) {
      handleErr(res, e, "Failed to load arrears case");
    }
  });

  app.post("/api/rent/arrears/:id/events", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const result = await addArrearsEvent(user.organizationId!, req.params.id, {
        eventType: req.body?.eventType || "note",
        note: req.body?.note,
        status: req.body?.status,
        holdReason: req.body?.holdReason,
        nextActionAt: req.body?.nextActionAt ? new Date(req.body.nextActionAt) : undefined,
        actorUserId: user.id,
      });
      res.status(201).json(result);
    } catch (e) {
      handleErr(res, e, "Failed to add case event");
    }
  });

  app.post("/api/rent/arrears/:id/plans", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const plan = await createPaymentPlan(user.organizationId!, req.params.id, {
        instalments: req.body?.instalments || [],
        notes: req.body?.notes,
        actorUserId: user.id,
      });
      res.status(201).json(plan);
    } catch (e) {
      handleErr(res, e, "Failed to create payment plan");
    }
  });

  app.post("/api/rent/bank-imports/preview", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      res.json({ rows: previewBankImport(user.organizationId!, rows) });
    } catch (e) {
      handleErr(res, e, "Failed to preview bank import");
    }
  });

  app.post("/api/rent/bank-imports", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const result = await commitBankImport(user.organizationId!, rows, {
        actorUserId: user.id,
        bankAccountLabel: req.body?.bankAccountLabel,
      });
      res.status(201).json(result);
    } catch (e) {
      handleErr(res, e, "Failed to commit bank import");
    }
  });

  app.get("/api/rent/bank-transactions", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const rows = await listBankTransactions(user.organizationId!, {
        matchState: req.query.matchState ? String(req.query.matchState) : undefined,
      });
      res.json(rows);
    } catch (e) {
      handleErr(res, e, "Failed to list bank transactions");
    }
  });

  app.post("/api/rent/reconciliation/:bankTransactionId/confirm", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      if (!req.body?.accountId) throw httpError(400, "accountId required");
      const result = await confirmBankMatch(
        user.organizationId!,
        req.params.bankTransactionId,
        {
          accountId: String(req.body.accountId),
          allocateOldestFirst: req.body?.allocateOldestFirst !== false,
          actorUserId: user.id,
        },
      );
      res.json(result);
    } catch (e) {
      handleErr(res, e, "Failed to confirm bank match");
    }
  });

  app.get("/api/rent/reviews", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      res.json(await listRentReviews(user.organizationId!));
    } catch (e) {
      handleErr(res, e, "Failed to list reviews");
    }
  });

  app.post("/api/rent/reviews", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      if (!req.body?.accountId) throw httpError(400, "accountId required");
      const result = await createRentReview(user.organizationId!, String(req.body.accountId), {
        proposedAmountMinor: req.body?.proposedAmountMinor,
        proposedEffectiveDate: req.body?.proposedEffectiveDate,
        actorUserId: user.id,
      });
      res.status(201).json(result);
    } catch (e) {
      handleErr(res, e, "Failed to create review");
    }
  });

  app.post("/api/rent/reviews/:id/submit", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const updated = await submitRentReview(user.organizationId!, req.params.id, {
        action: req.body?.action || "mark_manual_review",
        proposedAmountMinor: req.body?.proposedAmountMinor,
        proposedEffectiveDate: req.body?.proposedEffectiveDate,
        noticeServedAt: req.body?.noticeServedAt,
        notes: req.body?.notes,
        actorUserId: user.id,
      });
      res.json(updated);
    } catch (e) {
      handleErr(res, e, "Failed to submit review");
    }
  });

  app.post("/api/rent/statements", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      if (!req.body?.accountId || !req.body?.from || !req.body?.to) {
        throw httpError(400, "accountId, from, and to are required");
      }
      const snap = await generateStatement(user.organizationId!, String(req.body.accountId), {
        from: new Date(req.body.from),
        to: new Date(req.body.to),
        asOf: req.body.asOf ? new Date(req.body.asOf) : undefined,
        actorUserId: user.id,
      });
      res.status(201).json(snap);
    } catch (e) {
      handleErr(res, e, "Failed to generate statement");
    }
  });

  app.get("/api/rent/statements", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      res.json(
        await listStatements(
          user.organizationId!,
          req.query.accountId ? String(req.query.accountId) : undefined,
        ),
      );
    } catch (e) {
      handleErr(res, e, "Failed to list statements");
    }
  });

  app.get("/api/rent/statements/:id", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const snap = await getStatement(user.organizationId!, req.params.id);
      if (req.query.format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="rent-statement-${snap.id}.csv"`);
        return res.send(statementToCsv(snap.payloadJson));
      }
      res.json(snap);
    } catch (e) {
      handleErr(res, e, "Failed to get statement");
    }
  });

  app.post("/api/rent/migration/legacy", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const dryRun = req.body?.dryRun !== false;
      const result = await runLegacyMigration(user.organizationId!, dryRun, user.id);
      res.json(result);
    } catch (e) {
      handleErr(res, e, "Failed to run migration");
    }
  });

  // Ensure account for a tenancy (used when opening property rent tab)
  app.post("/api/rent/tenancies/:tenancyId/ensure-account", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const [assignment] = await db
        .select()
        .from(tenantAssignments)
        .where(
          and(
            eq(tenantAssignments.id, req.params.tenancyId),
            eq(tenantAssignments.organizationId, user.organizationId!),
          ),
        )
        .limit(1);
      if (!assignment) throw httpError(404, "Tenancy not found");
      const account = await ensureRentAccountForAssignment(assignment.id, user.id);
      res.json(account);
    } catch (e) {
      handleErr(res, e, "Failed to ensure rent account");
    }
  });

  // Tenant My Rent
  app.get("/api/tenant/me/rent", ...tenantGate, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Tenant access only" });
      }
      const [assignment] = await db
        .select()
        .from(tenantAssignments)
        .where(
          and(
            eq(tenantAssignments.tenantId, user.id),
            eq(tenantAssignments.isActive, true),
          ),
        )
        .limit(1);
      if (!assignment) return res.status(404).json({ message: "No active tenancy" });

      const account = await ensureRentAccountForAssignment(assignment.id);
      if (account.organizationId !== user.organizationId && account.organizationId !== assignment.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const ledger = await getAccountLedger(account.id, assignment.organizationId);
      // Do not expose other people's bank details
      res.json({
        account: {
          id: ledger.account.id,
          currency: ledger.account.currency,
          payerReference: ledger.account.payerReference,
          unappliedCreditMinor: ledger.account.unappliedCreditMinor,
        },
        property: ledger.property,
        balances: ledger.balances,
        charges: ledger.charges.map((c) => ({
          id: c.id,
          dueDate: c.dueDate,
          periodStart: c.periodStart,
          periodEnd: c.periodEnd,
          amountMinor: c.amountMinor,
          allocatedMinor: c.allocatedMinor,
          status: c.status,
          type: c.type,
        })),
        receipts: ledger.receipts
          .filter((r) => r.status === "confirmed")
          .map((r) => ({
            id: r.id,
            receivedAt: r.receivedAt,
            amountMinor: r.amountMinor,
            reference: r.reference,
            allocationState: r.allocationState,
          })),
        monthlyRentMinor: toMinorUnits(assignment.monthlyRent),
        nextDueDate: ledger.balances.nextDueDate,
      });
    } catch (e) {
      handleErr(res, e, "Failed to load tenant rent");
    }
  });

  app.post("/api/tenant/me/rent/discrepancy", ...tenantGate, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Tenant access only" });
      }
      // Discrepancy does NOT post a receipt — audit only
      const { writeFinancialAudit } = await import("./audit");
      await writeFinancialAudit({
        organizationId: user.organizationId || "",
        entityType: "tenant_discrepancy",
        entityId: user.id,
        action: "reported",
        actorUserId: user.id,
        after: {
          reference: req.body?.reference,
          note: req.body?.note,
          amount: req.body?.amount,
        },
        reason: "Tenant reported payment discrepancy — no auto mark-paid",
      });
      res.status(201).json({
        message: "Discrepancy recorded for review. Your balance is unchanged until staff confirm a receipt.",
      });
    } catch (e) {
      handleErr(res, e, "Failed to report discrepancy");
    }
  });
}
