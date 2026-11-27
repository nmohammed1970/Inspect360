import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import { userDocuments, users } from "@shared/schema";
import { isExpiryDateInPast } from "@shared/workOrderCertificates";
import {
  documentsDueForExpiryEmail,
  toExpiringTeamDocument,
  buildExpiredDocumentEmail,
  type ExpiringTeamDocument,
} from "./teamDocumentExpiryLogic";

export {
  buildExpiredDocumentEmail,
  documentsDueForExpiryEmail,
  toExpiringTeamDocument,
  type ExpiringTeamDocument,
};

export async function listOrganizationExpiredDocuments(
  organizationId: string,
  now: Date = new Date(),
): Promise<ExpiringTeamDocument[]> {
  const rows = await db
    .select({
      id: userDocuments.id,
      documentName: userDocuments.documentName,
      expiryDate: userDocuments.expiryDate,
      userId: userDocuments.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      expiryNotifiedAt: userDocuments.expiryNotifiedAt,
    })
    .from(userDocuments)
    .innerJoin(users, eq(userDocuments.userId, users.id))
    .where(
      and(
        eq(userDocuments.organizationId, organizationId),
        isNotNull(userDocuments.expiryDate),
        eq(users.isActive, true),
      ),
    );

  const docs: ExpiringTeamDocument[] = [];
  for (const row of rows) {
    const doc = toExpiringTeamDocument(row);
    if (doc && isExpiryDateInPast(doc.expiryYmd, now)) docs.push(doc);
  }
  return docs;
}

export async function processExpiredTeamDocumentEmails(
  now: Date = new Date(),
): Promise<{ notified: number; failed: number }> {
  const rows = await db
    .select({
      id: userDocuments.id,
      documentName: userDocuments.documentName,
      expiryDate: userDocuments.expiryDate,
      userId: userDocuments.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      expiryNotifiedAt: userDocuments.expiryNotifiedAt,
    })
    .from(userDocuments)
    .innerJoin(users, eq(userDocuments.userId, users.id))
    .where(
      and(
        isNotNull(userDocuments.expiryDate),
        isNull(userDocuments.expiryNotifiedAt),
        eq(users.isActive, true),
      ),
    );

  const due: ExpiringTeamDocument[] = [];
  for (const row of rows) {
    const doc = toExpiringTeamDocument(row);
    if (doc) due.push(doc);
  }

  const { sendEmail } = await import("./resend");
  let notified = 0;
  let failed = 0;
  for (const doc of documentsDueForExpiryEmail(due, now)) {
    const message = buildExpiredDocumentEmail({
      firstName: doc.firstName,
      documentName: doc.documentName,
      expiryYmd: doc.expiryYmd,
    });
    try {
      await sendEmail({
        to: doc.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      await db
        .update(userDocuments)
        .set({ expiryNotifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(userDocuments.id, doc.id));
      notified += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[team-documents] Expiry email failed for document ${doc.id}:`,
        error,
      );
    }
  }
  if (notified > 0 || failed > 0) {
    console.log(
      `[team-documents] Expiry emails: ${notified} sent, ${failed} failed`,
    );
  }
  return { notified, failed };
}
