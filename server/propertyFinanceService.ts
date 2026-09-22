/**
 * Property finance: deposits, expenses, rent period generation, reminders.
 * Rent periods are NEVER created on GET — only on lease save + reconciliation job.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  organizationRentSettings,
  propertyDeposits,
  propertyExpenses,
  rentPeriods,
  rentReminderLog,
  tenantAssignments,
  users,
  properties,
  organizations,
  type TenantAssignment,
  type OrganizationRentSettings,
  type RentPeriod,
  type PropertyDeposit,
  type PropertyExpense,
} from "@shared/schema";
import { billingCurrencySymbol } from "@shared/billingCurrencies";
import { computeRentPeriodWindows as computeWindows } from "@shared/rentPeriodMath";

const DEFAULT_TEMPLATES = {
  reminder1Subject: "Rent reminder: payment due in {days_until_due} days",
  reminder1Body:
    "Hello {tenant_name},\n\nThis is a reminder that rent of {amount} for {property_name} is due on {due_date} ({period}).\n\nThank you,\n{organization_name}",
  reminder2Subject: "Rent reminder: payment due in {days_until_due} days",
  reminder2Body:
    "Hello {tenant_name},\n\nA friendly reminder that rent of {amount} for {property_name} is due on {due_date} ({period}).\n\nThank you,\n{organization_name}",
  reminder3Subject: "Rent due soon: {due_date}",
  reminder3Body:
    "Hello {tenant_name},\n\nRent of {amount} for {property_name} is due on {due_date} ({period}). Please arrange payment.\n\nThank you,\n{organization_name}",
  overdueSubject: "Overdue rent reminder: {property_name}",
  overdueBody:
    "Hello {tenant_name},\n\nRent of {amount_outstanding} for {property_name} ({period}) was due on {due_date} and remains outstanding ({days_overdue} days overdue).\n\nPlease arrange payment as soon as possible.\n\nThank you,\n{organization_name}",
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatPeriodLabel(periodStart: Date): string {
  return periodStart.toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function formatMoney(amount: string | number, currency: string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  const sym = billingCurrencySymbol(currency || "GBP");
  return `${sym}${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function outstandingOf(period: { amountDue: string; amountPaid: string }): number {
  return Math.max(0, parseFloat(period.amountDue || "0") - parseFloat(period.amountPaid || "0"));
}

function deriveStatus(amountDue: number, amountPaid: number, current?: string): "due" | "partial" | "collected" | "waived" {
  if (current === "waived") return "waived";
  if (amountPaid <= 0) return "due";
  if (amountPaid + 0.001 >= amountDue) return "collected";
  return "partial";
}

/**
 * V1: no proration. First due date is the first rentDueDay on or after lease start.
 * Each period uses full monthlyRent.
 */
export function computeRentPeriodWindows(
  assignment: TenantAssignment,
  throughDate: Date = new Date(),
): Array<{ periodStart: Date; periodEnd: Date; dueDate: Date; amountDue: string }> {
  return computeWindows(
    {
      isActive: assignment.isActive,
      monthlyRent: assignment.monthlyRent,
      leaseStartDate: assignment.leaseStartDate,
      leaseEndDate: assignment.leaseEndDate,
      rentDueDay: assignment.rentDueDay,
    },
    throughDate,
  );
}

export async function generateRentPeriodsForAssignment(
  assignmentId: string,
  currencyFallback = "GBP",
): Promise<number> {
  const [assignment] = await db
    .select()
    .from(tenantAssignments)
    .where(eq(tenantAssignments.id, assignmentId));
  if (!assignment) return 0;

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, assignment.organizationId));
  const currency = org?.preferredCurrency || currencyFallback;

  const windows = computeRentPeriodWindows(assignment);
  let created = 0;
  for (const w of windows) {
    const inserted = await db
      .insert(rentPeriods)
      .values({
        organizationId: assignment.organizationId,
        propertyId: assignment.propertyId,
        tenantAssignmentId: assignment.id,
        periodStart: w.periodStart,
        periodEnd: w.periodEnd,
        dueDate: w.dueDate,
        amountDue: w.amountDue,
        amountPaid: "0",
        currency,
        status: "due",
      })
      .onConflictDoNothing({
        target: [rentPeriods.tenantAssignmentId, rentPeriods.periodStart],
      })
      .returning();
    if (inserted.length) created++;
  }
  return created;
}

/** Reconciliation: fill missing periods for all active assignments (never from HTTP GET). */
export async function reconcileRentPeriods(): Promise<{ assignments: number; created: number }> {
  const active = await db
    .select()
    .from(tenantAssignments)
    .where(eq(tenantAssignments.isActive, true));

  let created = 0;
  for (const a of active) {
    created += await generateRentPeriodsForAssignment(a.id);
  }
  return { assignments: active.length, created };
}

export async function listPropertyDeposits(organizationId: string, propertyId: string) {
  return db
    .select()
    .from(propertyDeposits)
    .where(
      and(
        eq(propertyDeposits.organizationId, organizationId),
        eq(propertyDeposits.propertyId, propertyId),
      ),
    )
    .orderBy(sql`${propertyDeposits.createdAt} DESC`);
}

function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD (or Date) to comparable local YMD without timezone shift. */
function receivedDateYmd(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : toYmdLocal(d);
  }
  return Number.isNaN(value.getTime()) ? null : toYmdLocal(value);
}

function assertReceivedDateNotFuture(value: Date | string | null | undefined) {
  const ymd = receivedDateYmd(value);
  if (!ymd) return;
  if (ymd > toYmdLocal(new Date())) {
    throw Object.assign(new Error("Received date cannot be in the future"), { status: 400 });
  }
}

function parseMoney(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/**
 * When any returned/deducted amount is set, returned + deducted must equal the deposit total.
 * Both empty (0) is allowed for deposits still fully held.
 */
function assertDepositSettlementAmounts(input: {
  amount: unknown;
  returnedAmount?: unknown;
  deductedAmount?: unknown;
}) {
  const amount = parseMoney(input.amount);
  const returned = parseMoney(input.returnedAmount);
  const deducted = parseMoney(input.deductedAmount);
  if (Number.isNaN(amount) || amount <= 0) {
    throw Object.assign(new Error("Deposit amount must be greater than zero"), { status: 400 });
  }
  if (Number.isNaN(returned) || returned < 0) {
    throw Object.assign(new Error("Returned amount cannot be negative"), { status: 400 });
  }
  if (Number.isNaN(deducted) || deducted < 0) {
    throw Object.assign(new Error("Deducted amount cannot be negative"), { status: 400 });
  }
  if (returned === 0 && deducted === 0) return;
  const settled = Math.round((returned + deducted) * 100) / 100;
  if (settled !== amount) {
    throw Object.assign(
      new Error(
        `Returned + deducted (${settled.toFixed(2)}) must equal the deposit amount (${amount.toFixed(2)})`,
      ),
      { status: 400 },
    );
  }
}

export async function createPropertyDeposit(
  organizationId: string,
  data: Omit<typeof propertyDeposits.$inferInsert, "id" | "organizationId" | "createdAt" | "updatedAt">,
): Promise<PropertyDeposit> {
  if (data.deductedAmount && parseFloat(String(data.deductedAmount)) > 0 && !data.deductionReason?.trim()) {
    throw Object.assign(new Error("Deduction reason is required when a deduction amount is set"), { status: 400 });
  }
  assertReceivedDateNotFuture(data.receivedDate as Date | string | null | undefined);
  assertDepositSettlementAmounts({
    amount: data.amount,
    returnedAmount: data.returnedAmount,
    deductedAmount: data.deductedAmount,
  });
  const [row] = await db
    .insert(propertyDeposits)
    .values({ ...data, organizationId })
    .returning();
  return row;
}

export async function updatePropertyDeposit(
  organizationId: string,
  id: string,
  updates: Partial<typeof propertyDeposits.$inferInsert>,
): Promise<PropertyDeposit> {
  if (updates.receivedDate !== undefined) {
    assertReceivedDateNotFuture(updates.receivedDate as Date | string | null | undefined);
  }
  const [existing] = await db
    .select()
    .from(propertyDeposits)
    .where(and(eq(propertyDeposits.id, id), eq(propertyDeposits.organizationId, organizationId)));
  if (!existing) throw Object.assign(new Error("Deposit not found"), { status: 404 });

  const nextAmount = updates.amount !== undefined ? updates.amount : existing.amount;
  const nextReturned = updates.returnedAmount !== undefined ? updates.returnedAmount : existing.returnedAmount;
  const nextDeducted = updates.deductedAmount !== undefined ? updates.deductedAmount : existing.deductedAmount;
  const nextReason = updates.deductionReason !== undefined ? updates.deductionReason : existing.deductionReason;

  if (parseMoney(nextDeducted) > 0 && !String(nextReason || "").trim()) {
    throw Object.assign(new Error("Deduction reason is required when a deduction amount is set"), { status: 400 });
  }
  assertDepositSettlementAmounts({
    amount: nextAmount,
    returnedAmount: nextReturned,
    deductedAmount: nextDeducted,
  });

  const [row] = await db
    .update(propertyDeposits)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(propertyDeposits.id, id), eq(propertyDeposits.organizationId, organizationId)))
    .returning();
  if (!row) throw Object.assign(new Error("Deposit not found"), { status: 404 });
  return row;
}

export async function deletePropertyDeposit(organizationId: string, id: string): Promise<void> {
  await db
    .delete(propertyDeposits)
    .where(and(eq(propertyDeposits.id, id), eq(propertyDeposits.organizationId, organizationId)));
}

export async function listPropertyExpenses(organizationId: string, propertyId: string) {
  return db
    .select()
    .from(propertyExpenses)
    .where(
      and(
        eq(propertyExpenses.organizationId, organizationId),
        eq(propertyExpenses.propertyId, propertyId),
      ),
    )
    .orderBy(sql`${propertyExpenses.expenseDate} DESC`);
}

export async function createPropertyExpense(
  organizationId: string,
  data: Omit<typeof propertyExpenses.$inferInsert, "id" | "organizationId" | "createdAt" | "updatedAt">,
): Promise<PropertyExpense> {
  const [row] = await db
    .insert(propertyExpenses)
    .values({ ...data, organizationId })
    .returning();
  return row;
}

export async function updatePropertyExpense(
  organizationId: string,
  id: string,
  updates: Partial<typeof propertyExpenses.$inferInsert>,
): Promise<PropertyExpense> {
  const [row] = await db
    .update(propertyExpenses)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(propertyExpenses.id, id), eq(propertyExpenses.organizationId, organizationId)))
    .returning();
  if (!row) throw Object.assign(new Error("Expense not found"), { status: 404 });
  return row;
}

export async function deletePropertyExpense(organizationId: string, id: string): Promise<void> {
  await db
    .delete(propertyExpenses)
    .where(and(eq(propertyExpenses.id, id), eq(propertyExpenses.organizationId, organizationId)));
}

export type RentPeriodListItem = RentPeriod & {
  amountOutstanding: string;
  tenantName: string;
  tenantEmail: string | null;
  hasTenantEmail: boolean;
  daysOverdue: number;
  periodLabel: string;
  isOverdue: boolean;
};

export async function listRentPeriodsForProperty(
  organizationId: string,
  propertyId: string,
): Promise<RentPeriodListItem[]> {
  const rows = await db
    .select({
      period: rentPeriods,
      tenantFirstName: users.firstName,
      tenantLastName: users.lastName,
      tenantEmail: users.email,
      tenantUsername: users.username,
    })
    .from(rentPeriods)
    .leftJoin(tenantAssignments, eq(rentPeriods.tenantAssignmentId, tenantAssignments.id))
    .leftJoin(users, eq(tenantAssignments.tenantId, users.id))
    .where(
      and(
        eq(rentPeriods.organizationId, organizationId),
        eq(rentPeriods.propertyId, propertyId),
      ),
    )
    .orderBy(sql`${rentPeriods.dueDate} DESC`);

  const today = startOfUtcDay(new Date());
  return rows.map((r) => {
    const outstanding = outstandingOf(r.period);
    const due = startOfUtcDay(new Date(r.period.dueDate));
    const isOpen = r.period.status === "due" || r.period.status === "partial";
    const isOverdue = isOpen && due < today && outstanding > 0;
    const daysOverdue = isOverdue
      ? Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const tenantName =
      [r.tenantFirstName, r.tenantLastName].filter(Boolean).join(" ").trim() ||
      r.tenantUsername ||
      "Tenant";
    const email = r.tenantEmail || null;
    return {
      ...r.period,
      amountOutstanding: outstanding.toFixed(2),
      tenantName,
      tenantEmail: email,
      hasTenantEmail: Boolean(email && email.includes("@")),
      daysOverdue,
      periodLabel: formatPeriodLabel(new Date(r.period.periodStart)),
      isOverdue,
    };
  });
}

export async function updateRentPeriodPayment(
  organizationId: string,
  periodId: string,
  input: { amountPaid?: string; status?: "due" | "partial" | "collected" | "waived"; notes?: string; amountDue?: string },
): Promise<RentPeriod> {
  const [existing] = await db
    .select()
    .from(rentPeriods)
    .where(and(eq(rentPeriods.id, periodId), eq(rentPeriods.organizationId, organizationId)));
  if (!existing) throw Object.assign(new Error("Rent period not found"), { status: 404 });

  const amountDue = parseFloat(input.amountDue !== undefined ? input.amountDue : existing.amountDue);
  let amountPaid = parseFloat(input.amountPaid !== undefined ? input.amountPaid : existing.amountPaid);
  let status = input.status || deriveStatus(amountDue, amountPaid, existing.status);

  if (status === "collected") {
    amountPaid = amountDue;
  }
  if (status === "waived") {
    // keep amounts
  } else {
    status = deriveStatus(amountDue, amountPaid, status === "waived" ? undefined : status);
  }

  const [row] = await db
    .update(rentPeriods)
    .set({
      amountDue: amountDue.toFixed(2),
      amountPaid: amountPaid.toFixed(2),
      status,
      collectedAt: status === "collected" ? new Date() : null,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(rentPeriods.id, periodId))
    .returning();
  return row;
}

export async function getOrCreateRentSettings(organizationId: string): Promise<OrganizationRentSettings> {
  const [existing] = await db
    .select()
    .from(organizationRentSettings)
    .where(eq(organizationRentSettings.organizationId, organizationId));
  if (existing) return existing;

  const [created] = await db
    .insert(organizationRentSettings)
    .values({
      organizationId,
      enabled: false,
      daysBeforeDue1: 10,
      daysBeforeDue2: 5,
      daysBeforeDue3: 2,
      ...DEFAULT_TEMPLATES,
    })
    .returning();
  return created;
}

export async function updateRentSettings(
  organizationId: string,
  updates: Partial<typeof organizationRentSettings.$inferInsert>,
): Promise<OrganizationRentSettings> {
  await getOrCreateRentSettings(organizationId);
  const [row] = await db
    .update(organizationRentSettings)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(organizationRentSettings.organizationId, organizationId))
    .returning();
  return row;
}

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

async function claimReminderLog(input: {
  organizationId: string;
  rentPeriodId: string;
  reminderType: string;
  scheduledForDate: string;
  trigger: "scheduled" | "manual";
  recipientEmail?: string | null;
}): Promise<{ id: string } | "duplicate" | { error: string }> {
  try {
    const [row] = await db
      .insert(rentReminderLog)
      .values({
        organizationId: input.organizationId,
        rentPeriodId: input.rentPeriodId,
        reminderType: input.reminderType,
        scheduledForDate: input.scheduledForDate,
        trigger: input.trigger,
        status: "pending",
        recipientEmail: input.recipientEmail || null,
      })
      .returning();
    return row;
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Unique constraint = already sent/claimed for this slot
    if (msg.includes("unique") || msg.includes("duplicate") || e?.code === "23505") {
      return "duplicate";
    }
    console.error("[RentFinance] Failed to claim reminder log:", msg);
    return { error: msg };
  }
}

async function markReminderSent(id: string) {
  await db
    .update(rentReminderLog)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(rentReminderLog.id, id));
}

async function markReminderFailed(id: string, error: string, status = "failed") {
  await db
    .update(rentReminderLog)
    .set({ status, lastError: error, updatedAt: new Date() })
    .where(eq(rentReminderLog.id, id));
}

async function sendRentEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const { sendEmail } = await import("./resend");
  const html = body.replace(/\n/g, "<br>");
  await sendEmail({ to, subject, html, text: body });
}

export async function sendManualRentReminder(
  organizationId: string,
  periodId: string,
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  const [period] = await db
    .select()
    .from(rentPeriods)
    .where(and(eq(rentPeriods.id, periodId), eq(rentPeriods.organizationId, organizationId)));
  if (!period) return { ok: false, message: "Rent period not found", status: 404 };

  const list = await listRentPeriodsForProperty(organizationId, period.propertyId);
  const item = list.find((p) => p.id === periodId);
  if (!item) return { ok: false, message: "Rent period not found", status: 404 };

  if (item.status === "collected" || item.status === "waived") {
    return { ok: false, message: "Reminders cannot be sent for collected or waived periods", status: 400 };
  }
  if (!item.hasTenantEmail || !item.tenantEmail) {
    return { ok: false, message: "No tenant email address", status: 400 };
  }

  const settings = await getOrCreateRentSettings(organizationId);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  const [prop] = await db.select().from(properties).where(eq(properties.id, period.propertyId));

  const claim = await claimReminderLog({
    organizationId,
    rentPeriodId: periodId,
    reminderType: "overdue",
    scheduledForDate: `manual-${Date.now()}`,
    trigger: "manual",
    recipientEmail: item.tenantEmail,
  });

  if (claim === "duplicate") {
    return { ok: false, message: "A reminder was already logged for this attempt", status: 409 };
  }
  if ("error" in claim) {
    return { ok: false, message: "Could not log reminder", status: 500 };
  }

  const vars = buildTemplateVars(item, org?.name || "Inspect360", prop?.name || "Property");
  const subject = substituteVars(settings.overdueSubject || DEFAULT_TEMPLATES.overdueSubject, vars);
  const body = substituteVars(settings.overdueBody || DEFAULT_TEMPLATES.overdueBody, vars);

  try {
    await sendRentEmail(item.tenantEmail, subject, body);
    await markReminderSent(claim.id);
    return { ok: true };
  } catch (e: any) {
    await markReminderFailed(claim.id, e?.message || "Send failed");
    return { ok: false, message: "Failed to send reminder email", status: 500 };
  }
}

function buildTemplateVars(
  item: RentPeriodListItem,
  orgName: string,
  propertyName: string,
): Record<string, string> {
  const due = startOfUtcDay(new Date(item.dueDate));
  const today = startOfUtcDay(new Date());
  const daysUntil = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return {
    tenant_name: item.tenantName,
    property_name: propertyName,
    amount: formatMoney(item.amountDue, item.currency),
    amount_outstanding: formatMoney(item.amountOutstanding, item.currency),
    due_date: due.toLocaleDateString("en-GB", { timeZone: "UTC" }),
    period: item.periodLabel,
    days_overdue: String(Math.max(0, item.daysOverdue)),
    days_until_due: String(Math.max(0, daysUntil)),
    organization_name: orgName,
  };
}

/** Hourly: reconcile periods + send pre-due / overdue reminders. */
export async function processRentFinanceJobs(): Promise<void> {
  try {
    await reconcileRentPeriods();
  } catch (e) {
    console.error("[RentFinance] Reconciliation failed:", e);
  }
  try {
    await processScheduledRentReminders();
  } catch (e) {
    console.error("[RentFinance] Reminder scan failed:", e);
  }
}

export async function processScheduledRentReminders(): Promise<void> {
  const enabledSettings = await db
    .select()
    .from(organizationRentSettings)
    .where(eq(organizationRentSettings.enabled, true));

  if (!enabledSettings.length) return;

  const today = startOfUtcDay(new Date());
  const todayKey = today.toISOString().slice(0, 10);

  for (const settings of enabledSettings) {
    const openPeriods = await db
      .select()
      .from(rentPeriods)
      .where(
        and(
          eq(rentPeriods.organizationId, settings.organizationId),
          inArray(rentPeriods.status, ["due", "partial"]),
        ),
      );

    if (!openPeriods.length) continue;

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, settings.organizationId));

    const propertyIds = [...new Set(openPeriods.map((p) => p.propertyId))];
    const allItems: RentPeriodListItem[] = [];
    for (const pid of propertyIds) {
      allItems.push(...(await listRentPeriodsForProperty(settings.organizationId, pid)));
    }

    const propCache = new Map<string, string>();
    for (const item of allItems) {
      if (item.status === "collected" || item.status === "waived") continue;
      if (outstandingOf(item) <= 0) continue;

      if (!item.hasTenantEmail || !item.tenantEmail) {
        // Skip silently for scheduler but log once per day
        const claim = await claimReminderLog({
          organizationId: settings.organizationId,
          rentPeriodId: item.id,
          reminderType: "skipped_no_email",
          scheduledForDate: todayKey,
          trigger: "scheduled",
          recipientEmail: null,
        });
        if (typeof claim === "object" && claim && "id" in claim && !("error" in claim)) {
          await markReminderFailed(claim.id, "No tenant email address", "skipped_no_email");
        }
        continue;
      }

      if (!propCache.has(item.propertyId)) {
        const [prop] = await db.select().from(properties).where(eq(properties.id, item.propertyId));
        propCache.set(item.propertyId, prop?.name || "Property");
      }
      const propertyName = propCache.get(item.propertyId) || "Property";
      const vars = buildTemplateVars(item, org?.name || "Inspect360", propertyName);
      const due = startOfUtcDay(new Date(item.dueDate));
      const daysUntil = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

      const preDueSlots: Array<{ days: number; type: string; subject: string | null; body: string | null; fallbackSub: string; fallbackBody: string }> = [
        { days: settings.daysBeforeDue1, type: "pre_due_1", subject: settings.reminder1Subject, body: settings.reminder1Body, fallbackSub: DEFAULT_TEMPLATES.reminder1Subject, fallbackBody: DEFAULT_TEMPLATES.reminder1Body },
        { days: settings.daysBeforeDue2, type: "pre_due_2", subject: settings.reminder2Subject, body: settings.reminder2Body, fallbackSub: DEFAULT_TEMPLATES.reminder2Subject, fallbackBody: DEFAULT_TEMPLATES.reminder2Body },
        { days: settings.daysBeforeDue3, type: "pre_due_3", subject: settings.reminder3Subject, body: settings.reminder3Body, fallbackSub: DEFAULT_TEMPLATES.reminder3Subject, fallbackBody: DEFAULT_TEMPLATES.reminder3Body },
      ];

      for (const slot of preDueSlots) {
        if (daysUntil === slot.days) {
          const claim = await claimReminderLog({
            organizationId: settings.organizationId,
            rentPeriodId: item.id,
            reminderType: slot.type,
            scheduledForDate: todayKey,
            trigger: "scheduled",
            recipientEmail: item.tenantEmail,
          });
          if (typeof claim !== "object" || !claim || !("id" in claim) || "error" in claim) continue;
          try {
            await sendRentEmail(
              item.tenantEmail,
              substituteVars(slot.subject || slot.fallbackSub, vars),
              substituteVars(slot.body || slot.fallbackBody, vars),
            );
            await markReminderSent(claim.id);
          } catch (e: any) {
            await markReminderFailed(claim.id, e?.message || "Send failed");
          }
        }
      }

      // Overdue: every other day from due date
      if (item.isOverdue && item.daysOverdue >= 0) {
        if (item.daysOverdue % 2 === 0) {
          const claim = await claimReminderLog({
            organizationId: settings.organizationId,
            rentPeriodId: item.id,
            reminderType: "overdue",
            scheduledForDate: todayKey,
            trigger: "scheduled",
            recipientEmail: item.tenantEmail,
          });
          if (typeof claim !== "object" || !claim || !("id" in claim) || "error" in claim) continue;
          try {
            await sendRentEmail(
              item.tenantEmail,
              substituteVars(settings.overdueSubject || DEFAULT_TEMPLATES.overdueSubject, vars),
              substituteVars(settings.overdueBody || DEFAULT_TEMPLATES.overdueBody, vars),
            );
            await markReminderSent(claim.id);
          } catch (e: any) {
            await markReminderFailed(claim.id, e?.message || "Send failed");
          }
        }
      }
    }
  }
}

export { DEFAULT_TEMPLATES as RENT_REMINDER_DEFAULT_TEMPLATES };
