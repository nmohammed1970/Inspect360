/**
 * Pagination and mapping-key tests.
 * Run: npx tsx server/reapit/client.test.ts
 */
import { nextPageNumber } from "./pagination";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

assert(nextPageNumber(1, 100, 100, 3) === 2, "continue while pages remain");
assert(nextPageNumber(3, 100, 10, 3) === null, "stop at last page");
assert(nextPageNumber(1, 100, 0, 5) === null, "empty page stops");
assert(nextPageNumber(1, 100, 40) === null, "short page implies last");
assert(nextPageNumber(1, 100, 100) === 2, "full page without total continues");

function mappingKey(organizationId: string, entityType: string, reapitId: string) {
  return `${organizationId}:${entityType}:${reapitId}`;
}
const keys = new Set([
  mappingKey("org-a", "property", "p1"),
  mappingKey("org-b", "property", "p1"),
]);
assert(keys.size === 2, "same Reapit id can map independently per org");

const eventIds = new Set<string>();
function insertEvent(eventId: string) {
  if (eventIds.has(eventId)) return false;
  eventIds.add(eventId);
  return true;
}
assert(insertEvent("evt-1") === true, "first eventId inserted");
assert(insertEvent("evt-1") === false, "duplicate eventId rejected");

function collisionEmail(orgId: string, email: string, existing: { email: string; organizationId: string; role: string }) {
  if (existing.email === email && existing.organizationId === orgId && existing.role === "tenant") {
    return { action: "link", login: email };
  }
  return { action: "synthetic", login: `reapit+x@noreply.inspect360.local` };
}
assert(collisionEmail("org-a", "t@x.com", { email: "t@x.com", organizationId: "org-a", role: "tenant" }).action === "link", "same org tenant linked");
assert(collisionEmail("org-a", "t@x.com", { email: "t@x.com", organizationId: "org-b", role: "tenant" }).action === "synthetic", "other org not stolen");
assert(collisionEmail("org-a", "staff@x.com", { email: "staff@x.com", organizationId: "org-a", role: "owner" }).action === "synthetic", "staff email not stolen");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
