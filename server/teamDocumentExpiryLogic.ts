import {
  isExpiryDateInPast,
  parseCertificateExpiryDate,
} from "@shared/workOrderCertificates";

export type ExpiringTeamDocument = {
  id: string;
  documentName: string;
  expiryYmd: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  expiryNotifiedAt: Date | null;
};

export function formatExpiryLongDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildExpiredDocumentEmail(input: {
  firstName?: string | null;
  documentName: string;
  expiryYmd: string;
}): { subject: string; text: string; html: string } {
  const documentName = input.documentName.trim() || "document";
  const greeting = input.firstName?.trim() || "there";
  const expiredOn = formatExpiryLongDate(input.expiryYmd);
  const subject = `Your ${documentName} has expired`;
  const text = [
    `Hello ${greeting},`,
    "",
    `Your document "${documentName}" expired on ${expiredOn}.`,
    "",
    `Please provide a new valid ${documentName} to the Inspect360 team so your records can be updated.`,
    "",
    "Inspect360",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.5;max-width:560px">
      <p>Hello ${escapeHtml(greeting)},</p>
      <p>Your document <strong>${escapeHtml(documentName)}</strong> expired on ${escapeHtml(expiredOn)}.</p>
      <p>Please provide a new valid <strong>${escapeHtml(documentName)}</strong> to the Inspect360 team so your records can be updated.</p>
      <p style="color:#6b7280">Inspect360</p>
    </div>
  `.trim();
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toExpiringTeamDocument(row: {
  id: string;
  documentName: string;
  expiryDate: Date | string | null;
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean | null;
  expiryNotifiedAt: Date | null;
}): ExpiringTeamDocument | null {
  const expiryYmd = parseCertificateExpiryDate(row.expiryDate);
  if (!expiryYmd || !row.email) return null;
  return {
    id: row.id,
    documentName: row.documentName,
    expiryYmd,
    userId: row.userId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    isActive: row.isActive !== false,
    expiryNotifiedAt: row.expiryNotifiedAt,
  };
}

/** Documents whose expiry is before today and the member has not been emailed yet. */
export function documentsDueForExpiryEmail(
  docs: ExpiringTeamDocument[],
  now: Date = new Date(),
): ExpiringTeamDocument[] {
  return docs.filter(
    (doc) =>
      doc.isActive &&
      !doc.expiryNotifiedAt &&
      isExpiryDateInPast(doc.expiryYmd, now),
  );
}
