/**
 * TextMagic SMS for tenants.
 * Credentials only from env — never expose to clients.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { organizationSmsTemplates, smsDeliveryLog } from "@shared/schema";
import { normalizePhoneForSms, substituteSmsVars } from "@shared/smsUtils";

export { normalizePhoneForSms, substituteSmsVars } from "@shared/smsUtils";

export const SMS_EVENT_TYPES = {
  RENT_PRE_DUE_1: "rent_pre_due_1",
  RENT_PRE_DUE_2: "rent_pre_due_2",
  RENT_PRE_DUE_3: "rent_pre_due_3",
  RENT_OVERDUE: "rent_overdue",
  COMPARISON_REPORT: "comparison_report",
  CHECK_IN_INSPECTION: "check_in_inspection",
  CHECK_OUT_INSPECTION: "check_out_inspection",
  TEST: "test",
} as const;

export type SmsEventType = (typeof SMS_EVENT_TYPES)[keyof typeof SMS_EVENT_TYPES];

export const DEFAULT_SMS_TEMPLATES = {
  rentPreDue1Body:
    "Hi {tenant_name}, rent of {amount} for {property_name} is due on {due_date} ({period}). - {organization_name}",
  rentPreDue2Body:
    "Hi {tenant_name}, reminder: rent of {amount} for {property_name} is due on {due_date}. - {organization_name}",
  rentPreDue3Body:
    "Hi {tenant_name}, rent of {amount} for {property_name} is due soon ({due_date}). Please arrange payment. - {organization_name}",
  rentOverdueBody:
    "Hi {tenant_name}, rent of {amount_outstanding} for {property_name} was due {due_date} and is outstanding ({days_overdue} days). Please pay ASAP. - {organization_name}",
  comparisonReportBody:
    "Hi {tenant_name}, a comparison report is ready for {property_name}. Review it here: {portal_link} - {organization_name}",
  checkInInspectionBody:
    "Hi {tenant_name}, your check-in inspection for {property_name} is ready to review and sign: {portal_link} - {organization_name}",
  checkOutInspectionBody:
    "Hi {tenant_name}, your check-out inspection for {property_name} is ready to review and sign: {portal_link} - {organization_name}",
};

function isSmsEnabled(): boolean {
  const flag = (process.env.TEXTMAGIC_ENABLED || "").toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return Boolean(process.env.TEXTMAGIC_USERNAME && process.env.TEXTMAGIC_API_KEY);
}

function getTextMagicAuthHeader(): string {
  const username = process.env.TEXTMAGIC_USERNAME || "";
  const apiKey = process.env.TEXTMAGIC_API_KEY || "";
  const token = Buffer.from(`${username}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

export type SendTextMagicResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

export async function sendTextMagicSms(input: {
  to: string;
  text: string;
}): Promise<SendTextMagicResult> {
  if (!isSmsEnabled()) {
    return { ok: false, error: "TextMagic is not enabled or credentials are missing" };
  }

  const body = new URLSearchParams();
  body.set("phones", input.to.replace(/^\+/, ""));
  body.set("text", input.text);
  const from = (process.env.TEXTMAGIC_FROM || "").trim();
  if (from) body.set("from", from);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch("https://rest.textmagic.com/api/v2/messages", {
      method: "POST",
      headers: {
        Authorization: getTextMagicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      signal: controller.signal,
    });

    const raw = await res.text();
    let data: any = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { message: raw };
    }

    if (!res.ok) {
      const errMsg =
        data?.message ||
        data?.errors?.common?.[0] ||
        data?.error ||
        `TextMagic HTTP ${res.status}`;
      return { ok: false, error: String(errMsg) };
    }

    const messageId =
      data?.id != null
        ? String(data.id)
        : Array.isArray(data?.ids) && data.ids[0] != null
          ? String(data.ids[0])
          : null;

    return { ok: true, messageId };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return { ok: false, error: "TextMagic request timed out" };
    }
    return { ok: false, error: e?.message || "TextMagic request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

async function claimSmsLog(input: {
  organizationId: string;
  tenantUserId?: string | null;
  eventType: string;
  eventKey: string;
  recipientPhone?: string | null;
}): Promise<{ id: string } | "duplicate" | { error: string }> {
  try {
    const [row] = await db
      .insert(smsDeliveryLog)
      .values({
        organizationId: input.organizationId,
        tenantUserId: input.tenantUserId || null,
        eventType: input.eventType,
        eventKey: input.eventKey,
        recipientPhone: input.recipientPhone || null,
        status: "pending",
      })
      .returning();
    return row;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("unique") || msg.includes("duplicate") || e?.code === "23505") {
      return "duplicate";
    }
    console.error("[SMS] Failed to claim delivery log:", msg);
    return { error: msg };
  }
}

async function markSmsLog(
  id: string,
  patch: {
    status: string;
    lastError?: string | null;
    providerMessageId?: string | null;
    recipientPhone?: string | null;
    sentAt?: Date | null;
  },
) {
  await db
    .update(smsDeliveryLog)
    .set({
      status: patch.status,
      lastError: patch.lastError ?? null,
      providerMessageId: patch.providerMessageId ?? null,
      recipientPhone: patch.recipientPhone ?? undefined,
      sentAt: patch.sentAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(smsDeliveryLog.id, id));
}

export type SendTenantSmsInput = {
  organizationId: string;
  tenantUserId?: string | null;
  phone?: string | null;
  eventType: string;
  eventKey: string;
  templateBody: string;
  vars: Record<string, string>;
};

/**
 * Idempotent tenant SMS. Never throws — failures are logged only.
 */
export async function sendTenantSms(input: SendTenantSmsInput): Promise<void> {
  try {
    if (!isSmsEnabled()) {
      console.log(
        `[SMS] Skipped (disabled/missing credentials) type=${input.eventType} org=${input.organizationId}`,
      );
      return;
    }

    const e164 = normalizePhoneForSms(input.phone);
    const claim = await claimSmsLog({
      organizationId: input.organizationId,
      tenantUserId: input.tenantUserId,
      eventType: input.eventType,
      eventKey: input.eventKey,
      recipientPhone: e164,
    });

    if (claim === "duplicate") {
      console.log(
        `[SMS] Duplicate skipped type=${input.eventType} key=${input.eventKey} org=${input.organizationId}`,
      );
      return;
    }
    if ("error" in claim) return;

    if (!e164) {
      await markSmsLog(claim.id, {
        status: "skipped_no_phone",
        lastError: "Missing or invalid tenant phone number",
      });
      console.log(
        `[SMS] skipped_no_phone type=${input.eventType} tenant=${input.tenantUserId || "n/a"} org=${input.organizationId}`,
      );
      return;
    }

    const text = substituteSmsVars(input.templateBody, input.vars).trim();
    if (!text) {
      await markSmsLog(claim.id, {
        status: "failed",
        lastError: "Empty SMS body after template render",
        recipientPhone: e164,
      });
      return;
    }

    const result = await sendTextMagicSms({ to: e164, text });
    if (!result.ok) {
      await markSmsLog(claim.id, {
        status: "failed",
        lastError: result.error,
        recipientPhone: e164,
      });
      console.error(
        `[SMS] Send failed type=${input.eventType} org=${input.organizationId}: ${result.error}`,
      );
      return;
    }

    await markSmsLog(claim.id, {
      status: "sent",
      providerMessageId: result.messageId,
      recipientPhone: e164,
      sentAt: new Date(),
    });
    console.log(
      `[SMS] Sent type=${input.eventType} org=${input.organizationId} tenant=${input.tenantUserId || "n/a"}`,
    );
  } catch (e: any) {
    console.error("[SMS] Unexpected error (non-fatal):", e?.message || e);
  }
}

export async function getOrCreateSmsTemplates(organizationId: string) {
  const [existing] = await db
    .select()
    .from(organizationSmsTemplates)
    .where(eq(organizationSmsTemplates.organizationId, organizationId));
  if (existing) return existing;

  const [created] = await db
    .insert(organizationSmsTemplates)
    .values({
      organizationId,
      rentPreDue1Body: DEFAULT_SMS_TEMPLATES.rentPreDue1Body,
      rentPreDue2Body: DEFAULT_SMS_TEMPLATES.rentPreDue2Body,
      rentPreDue3Body: DEFAULT_SMS_TEMPLATES.rentPreDue3Body,
      rentOverdueBody: DEFAULT_SMS_TEMPLATES.rentOverdueBody,
      comparisonReportBody: DEFAULT_SMS_TEMPLATES.comparisonReportBody,
      checkInInspectionBody: DEFAULT_SMS_TEMPLATES.checkInInspectionBody,
      checkOutInspectionBody: DEFAULT_SMS_TEMPLATES.checkOutInspectionBody,
    })
    .returning();
  return created;
}

export async function updateSmsTemplates(
  organizationId: string,
  updates: Partial<{
    rentPreDue1Body: string | null;
    rentPreDue2Body: string | null;
    rentPreDue3Body: string | null;
    rentOverdueBody: string | null;
    comparisonReportBody: string | null;
    checkInInspectionBody: string | null;
    checkOutInspectionBody: string | null;
  }>,
) {
  await getOrCreateSmsTemplates(organizationId);
  const [row] = await db
    .update(organizationSmsTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(organizationSmsTemplates.organizationId, organizationId))
    .returning();
  return row;
}

export function resolveSmsTemplateBody(
  templates: Awaited<ReturnType<typeof getOrCreateSmsTemplates>>,
  eventType: string,
): string {
  switch (eventType) {
    case SMS_EVENT_TYPES.RENT_PRE_DUE_1:
      return templates.rentPreDue1Body || DEFAULT_SMS_TEMPLATES.rentPreDue1Body;
    case SMS_EVENT_TYPES.RENT_PRE_DUE_2:
      return templates.rentPreDue2Body || DEFAULT_SMS_TEMPLATES.rentPreDue2Body;
    case SMS_EVENT_TYPES.RENT_PRE_DUE_3:
      return templates.rentPreDue3Body || DEFAULT_SMS_TEMPLATES.rentPreDue3Body;
    case SMS_EVENT_TYPES.RENT_OVERDUE:
      return templates.rentOverdueBody || DEFAULT_SMS_TEMPLATES.rentOverdueBody;
    case SMS_EVENT_TYPES.COMPARISON_REPORT:
      return templates.comparisonReportBody || DEFAULT_SMS_TEMPLATES.comparisonReportBody;
    case SMS_EVENT_TYPES.CHECK_IN_INSPECTION:
      return templates.checkInInspectionBody || DEFAULT_SMS_TEMPLATES.checkInInspectionBody;
    case SMS_EVENT_TYPES.CHECK_OUT_INSPECTION:
      return templates.checkOutInspectionBody || DEFAULT_SMS_TEMPLATES.checkOutInspectionBody;
    default:
      return "";
  }
}

/** Owner test SMS — max 5 per user per hour. */
export async function sendTestSms(input: {
  organizationId: string;
  requestedByUserId: string;
  eventType: string;
  phone: string;
}): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  if (!isSmsEnabled()) {
    return {
      ok: false,
      message: "SMS is disabled. Set TEXTMAGIC_ENABLED=true and TextMagic credentials.",
      status: 400,
    };
  }

  const e164 = normalizePhoneForSms(input.phone);
  if (!e164) {
    return { ok: false, message: "Invalid phone number. Use international format with country code.", status: 400 };
  }

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(smsDeliveryLog)
    .where(
      and(
        eq(smsDeliveryLog.organizationId, input.organizationId),
        eq(smsDeliveryLog.eventType, SMS_EVENT_TYPES.TEST),
        eq(smsDeliveryLog.tenantUserId, input.requestedByUserId),
        gte(smsDeliveryLog.createdAt, since),
      ),
    );
  if ((recent[0]?.count || 0) >= 5) {
    return { ok: false, message: "Test SMS rate limit reached. Try again later.", status: 429 };
  }

  const templates = await getOrCreateSmsTemplates(input.organizationId);
  const sampleVars: Record<string, string> = {
    tenant_name: "Test Tenant",
    property_name: "Sample Property",
    amount: "£100.00",
    amount_outstanding: "£100.00",
    due_date: "01/01/2026",
    period: "Jan 2026",
    days_overdue: "2",
    days_until_due: "5",
    organization_name: "Inspect360",
    inspection_type: input.eventType.includes("check_out") ? "check-out" : "check-in",
    portal_link: (process.env.BASE_URL || "https://portal.inspect360.ai").replace(/\/$/, "") + "/tenant",
  };

  const body =
    resolveSmsTemplateBody(templates, input.eventType) ||
    DEFAULT_SMS_TEMPLATES.rentOverdueBody;
  const text = `[TEST] ${substituteSmsVars(body, sampleVars)}`.trim();

  const eventKey = `test:${input.requestedByUserId}:${Date.now()}`;
  await sendTenantSms({
    organizationId: input.organizationId,
    tenantUserId: input.requestedByUserId,
    phone: e164,
    eventType: SMS_EVENT_TYPES.TEST,
    eventKey,
    templateBody: text,
    vars: {},
  });

  // Check latest log for this key
  const [log] = await db
    .select()
    .from(smsDeliveryLog)
    .where(
      and(
        eq(smsDeliveryLog.organizationId, input.organizationId),
        eq(smsDeliveryLog.eventType, SMS_EVENT_TYPES.TEST),
        eq(smsDeliveryLog.eventKey, eventKey),
      ),
    );

  if (!log || log.status === "failed" || log.status === "skipped_no_phone") {
    return {
      ok: false,
      message: log?.lastError || "Failed to send test SMS",
      status: 502,
    };
  }

  return { ok: true };
}

export function getPortalBaseUrl(): string {
  return (process.env.BASE_URL || "https://portal.inspect360.ai").replace(/\/$/, "");
}
