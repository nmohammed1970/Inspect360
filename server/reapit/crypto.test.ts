/**
 * Token encryption and OAuth state tests.
 * Run: npx tsx server/reapit/crypto.test.ts
 */
import { decryptSecret, encryptSecret, signOAuthState, verifyOAuthState } from "./crypto";

process.env.INTEGRATION_ENCRYPTION_KEY = "a".repeat(64);

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const cipher = encryptSecret('{"accessToken":"secret-token"}');
assert(cipher.startsWith("v1:"), "ciphertext version prefix");
assert(!cipher.includes("secret-token"), "plaintext not in ciphertext");
assert(decryptSecret(cipher) === '{"accessToken":"secret-token"}', "roundtrip decrypt");

const state = signOAuthState({ organizationId: "org-1", nonce: 1, exp: Date.now() + 60_000 });
const parsed = verifyOAuthState(state);
assert(parsed.organizationId === "org-1", "signed state organisation");

let threw = false;
try {
  verifyOAuthState(state.replace(/.$/, "x"));
} catch {
  threw = true;
}
assert(threw, "tampered state rejected");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
