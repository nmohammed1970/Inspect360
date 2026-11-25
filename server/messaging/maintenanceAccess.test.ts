/**
 * Maintenance discussion access policy (no DB).
 * Run: npx tsx server/messaging/maintenanceAccess.test.ts
 */
import assert from "node:assert/strict";
import { httpError, MessagingHttpError } from "./errors";

function canEnsureDiscussion(role: string, isReporter: boolean, isExistingParticipant: boolean) {
  if (role === "tenant") return isReporter;
  if (role === "owner" || role === "maintenance_admin") return true;
  return isExistingParticipant;
}

assert.equal(canEnsureDiscussion("tenant", true, false), true);
assert.equal(canEnsureDiscussion("tenant", false, false), false);
assert.equal(canEnsureDiscussion("owner", false, false), true);
assert.equal(canEnsureDiscussion("maintenance_admin", false, false), true);
assert.equal(canEnsureDiscussion("contractor", false, false), false);
assert.equal(canEnsureDiscussion("contractor", false, true), true);
assert.equal(canEnsureDiscussion("clerk", false, false), false);

const forbidden = httpError("Forbidden", 403);
assert.ok(forbidden instanceof MessagingHttpError);
assert.equal(forbidden.status, 403);

console.log("maintenance discussion access tests passed");
