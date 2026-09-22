/**
 * Rules for buy-credit requests. Identity and status are never taken from the client body.
 */

export const MIN_CREDIT_REQUEST = 6;
export const MAX_CREDIT_REQUEST = 100000;
export const MAX_CREDIT_REQUEST_MESSAGE = 2000;
export const DUPLICATE_WINDOW_MS = 60 * 1000;
export const MAX_CREDIT_REQUESTS_PER_HOUR = 10;

export const CREDIT_REQUEST_STATUSES = ["REQUESTED", "GRANTED"] as const;
export type CreditRequestStatus = (typeof CREDIT_REQUEST_STATUSES)[number];

export type ParsedCreditRequest = {
  creditsRequested: number;
  message: string;
};

export type CreditRequestFieldError = {
  ok: false;
  field: "credits" | "message";
  message: string;
};

const CREDITS_ERROR = "Please enter a valid number of credits. Minimum is 6.";
const CREDITS_MAX_ERROR = "Please enter a valid number of credits. Maximum is 100000.";
const MESSAGE_ERROR = "Please enter a message.";
const MESSAGE_LENGTH_ERROR = "Message must be 2000 characters or fewer.";

export function parseCreditRequestCreate(body: unknown): { ok: true } & ParsedCreditRequest | CreditRequestFieldError {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const credits = parseWholeCredits(record.creditsRequested);
  if (credits === null || credits < MIN_CREDIT_REQUEST) {
    return { ok: false, field: "credits", message: CREDITS_ERROR };
  }
  if (credits > MAX_CREDIT_REQUEST) {
    return { ok: false, field: "credits", message: CREDITS_MAX_ERROR };
  }

  if (typeof record.message !== "string") {
    return { ok: false, field: "message", message: MESSAGE_ERROR };
  }
  const message = record.message.trim();
  if (!message) {
    return { ok: false, field: "message", message: MESSAGE_ERROR };
  }
  if (message.length > MAX_CREDIT_REQUEST_MESSAGE) {
    return { ok: false, field: "message", message: MESSAGE_LENGTH_ERROR };
  }

  return { ok: true, creditsRequested: credits, message };
}

function parseWholeCredits(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) return null;
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export type RequestAccount = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  organizationId: string;
  organizationName: string;
};

/** Name, email, organization, and status always come from the signed-in account. */
export function resolveRequestIdentity(account: RequestAccount): {
  requestedByUserId: string;
  requesterEmail: string;
  requesterName: string;
  organizationId: string;
  organizationName: string;
  status: "REQUESTED";
} {
  const parts = [account.firstName, account.lastName]
    .map((part) => (part || "").trim())
    .filter(Boolean);
  return {
    requestedByUserId: account.id,
    requesterEmail: account.email.trim(),
    requesterName: parts.join(" ") || account.email.trim(),
    organizationId: account.organizationId,
    organizationName: account.organizationName.trim() || "Organization",
    status: "REQUESTED",
  };
}

export function isDuplicateSubmission(
  previous: { creditsRequested: number; message: string; createdAt: Date | string } | null,
  next: ParsedCreditRequest,
  now: Date,
): boolean {
  if (!previous) return false;
  const created = new Date(previous.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const age = now.getTime() - created.getTime();
  return age >= 0
    && age < DUPLICATE_WINDOW_MS
    && previous.creditsRequested === next.creditsRequested
    && previous.message === next.message;
}

export function exceedsHourlyLimit(recentCount: number): boolean {
  return recentCount >= MAX_CREDIT_REQUESTS_PER_HOUR;
}

export function uniqueAdminEmails(admins: { email?: string | null }[]): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const admin of admins) {
    const email = (admin.email || "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export function applyGrant(
  status: string,
  adminId: string,
  now: Date,
): { ok: true; status: "GRANTED"; grantedAt: Date; grantedBy: string; eventType: "CREDIT_REQUEST_GRANTED" } | { ok: false; statusCode: number; message: string } {
  if (!adminId) {
    return { ok: false, statusCode: 403, message: "Admin session required" };
  }
  if (status === "GRANTED") {
    return { ok: false, statusCode: 409, message: "This request is already granted" };
  }
  if (status !== "REQUESTED") {
    return { ok: false, statusCode: 400, message: "This request cannot be granted" };
  }
  return {
    ok: true,
    status: "GRANTED",
    grantedAt: now,
    grantedBy: adminId,
    eventType: "CREDIT_REQUEST_GRANTED",
  };
}
