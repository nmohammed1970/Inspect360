/**
 * Webhook signature and org-binding tests.
 * Run: npx tsx server/reapit/webhook.test.ts
 */
import { generateKeyPairSync, sign } from "crypto";
import {
  organisationIdForWebhookCustomer,
  parseSignatureHeader,
  parseWebhookBody,
  verifyEd25519,
} from "./webhook";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const parsed = parseSignatureHeader("s:key-1:1710000000:abc+signature=");
assert(parsed?.keyId === "key-1", "signature keyId");
assert(parsed?.timestamp === "1710000000", "signature timestamp");
assert(parsed?.signature === "abc+signature=", "signature value");
assert(parseSignatureHeader("nope") === null, "invalid header rejected");

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const message = "1710000000{\"eventId\":\"e1\"}";
const signature = sign(null, Buffer.from(message, "utf8"), privateKey);
const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
assert(verifyEd25519(message, signature.toString("base64"), spki.toString("base64")), "ed25519 verifies");
assert(!verifyEd25519(message, Buffer.from("nope").toString("base64"), spki.toString("base64")), "bad signature rejected");

const body = parseWebhookBody(Buffer.from(JSON.stringify({
  eventId: "evt-1",
  topicId: "properties.modified",
  customerId: "SBOX",
  new: { id: "prop-9" },
})));
assert(body.eventId === "evt-1", "eventId parsed");
assert(body.entityId === "prop-9", "entity from new.id");

const orgA = organisationIdForWebhookCustomer("cust-a", [
  { reapitCustomerId: "cust-a", organizationId: "org-a", status: "connected" },
  { reapitCustomerId: "cust-b", organizationId: "org-b", status: "connected" },
]);
const orgB = organisationIdForWebhookCustomer("cust-b", [
  { reapitCustomerId: "cust-a", organizationId: "org-a", status: "connected" },
  { reapitCustomerId: "cust-b", organizationId: "org-b", status: "connected" },
]);
assert(orgA === "org-a" && orgB === "org-b" && orgA !== orgB, "customer A does not bind org B");
assert(
  organisationIdForWebhookCustomer("cust-a", [
    { reapitCustomerId: "cust-a", organizationId: "org-a", status: "disconnected" },
  ]) === null,
  "disconnected connection ignored",
);

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
