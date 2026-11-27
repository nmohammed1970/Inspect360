/**
 * Run: npx tsx server/teamDocumentExpiry.test.ts
 */
import assert from "node:assert/strict";
import {
  buildExpiredDocumentEmail,
  documentsDueForExpiryEmail,
  toExpiringTeamDocument,
  type ExpiringTeamDocument,
} from "./teamDocumentExpiryLogic";

const now = new Date("2026-11-28T12:00:00.000Z");

const expired: ExpiringTeamDocument = {
  id: "doc-1",
  documentName: "Gas Safe certificate",
  expiryYmd: "2026-11-01",
  userId: "user-1",
  email: "member@example.com",
  firstName: "Alex",
  lastName: "Stone",
  isActive: true,
  expiryNotifiedAt: null,
};

const due = documentsDueForExpiryEmail(
  [
    expired,
    { ...expired, id: "future", expiryYmd: "2027-01-01" },
    { ...expired, id: "sent", expiryNotifiedAt: new Date("2026-11-02T00:00:00.000Z") },
    { ...expired, id: "inactive", isActive: false },
  ],
  now,
);
assert.deepEqual(due.map((doc) => doc.id), ["doc-1"], "only unsent expired active documents");

const parsed = toExpiringTeamDocument({
  id: "doc-2",
  documentName: "Electrical certificate",
  expiryDate: new Date("2026-01-15T12:00:00.000Z"),
  userId: "user-2",
  email: "member@example.com",
  firstName: null,
  lastName: null,
  isActive: true,
  expiryNotifiedAt: null,
});
assert.equal(parsed?.expiryYmd, "2026-01-15");
assert.equal(
  toExpiringTeamDocument({ ...{
    id: "doc-3",
    documentName: "Missing email",
    expiryDate: new Date("2026-01-15T12:00:00.000Z"),
    userId: "user-3",
    email: null,
    firstName: null,
    lastName: null,
    isActive: true,
    expiryNotifiedAt: null,
  } }),
  null,
);

const mail = buildExpiredDocumentEmail({
  firstName: "Alex",
  documentName: "Gas Safe certificate",
  expiryYmd: "2026-11-01",
});
assert.equal(mail.subject, "Your Gas Safe certificate has expired");
assert.match(mail.text, /new valid Gas Safe certificate/);
assert.match(mail.text, /Inspect360 team/);
assert.match(mail.text, /1 November 2026/);
assert.match(mail.html, /Gas Safe certificate/);

const unnamed = buildExpiredDocumentEmail({
  firstName: null,
  documentName: "<script>",
  expiryYmd: "2026-11-01",
});
assert.match(unnamed.text, /Hello there/);
assert.doesNotMatch(unnamed.html, /<script>/);
assert.match(unnamed.html, /&lt;script&gt;/);

console.log("teamDocumentExpiry.test.ts ok");
