/**
 * Pure isolation / policy checks for messaging (no DB).
 * Run: npx tsx server/messaging/isolation.test.ts
 */
import assert from "node:assert/strict";
import { buildDirectKey, httpError, MessagingHttpError } from "./errors";
import {
  takeRateLimit,
  MESSAGING_SEND_LIMIT,
  MESSAGING_SEND_WINDOW_MS,
} from "./rateLimit";
import {
  isMessagingMimeAllowed,
  messagingMaxBytesForMime,
  MESSAGING_IMAGE_MAX_BYTES,
  MESSAGING_FILE_MAX_BYTES,
} from "@shared/messagingSchema";

// Direct key is order-independent (same pair → same conversation)
assert.equal(buildDirectKey(["a", "b"]), buildDirectKey(["b", "a"]));
assert.notEqual(buildDirectKey(["a", "b"]), buildDirectKey(["a", "c"]));

// Cross-org style denial uses MessagingHttpError 403/404
const forbidden = httpError("Forbidden", 403);
assert.ok(forbidden instanceof MessagingHttpError);
assert.equal(forbidden.status, 403);
const missing = httpError("Conversation not found", 404);
assert.equal(missing.status, 404);

// MIME policy
assert.equal(isMessagingMimeAllowed("image/webp"), true);
assert.equal(isMessagingMimeAllowed("video/mp4"), true);
assert.equal(isMessagingMimeAllowed("application/pdf"), true);
assert.equal(isMessagingMimeAllowed("application/x-executable"), false);
assert.equal(messagingMaxBytesForMime("image/png"), MESSAGING_IMAGE_MAX_BYTES);
assert.equal(messagingMaxBytesForMime("application/pdf"), MESSAGING_FILE_MAX_BYTES);

// Rate limit bursts
const burstKey = `isolation-${Date.now()}`;
let allowed = 0;
let blocked = false;
for (let i = 0; i < MESSAGING_SEND_LIMIT + 5; i++) {
  const r = takeRateLimit(burstKey, MESSAGING_SEND_LIMIT, MESSAGING_SEND_WINDOW_MS);
  if (r.allowed) allowed += 1;
  else blocked = true;
}
assert.equal(allowed, MESSAGING_SEND_LIMIT);
assert.equal(blocked, true);

console.log("messaging isolation tests passed");
