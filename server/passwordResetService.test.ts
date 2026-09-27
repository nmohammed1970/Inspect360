/**
 * Password reset helper tests.
 * Run: npx tsx server/passwordResetService.test.ts
 */
import {
  FORGOT_PASSWORD_GENERIC_SUCCESS,
  generateResetCode,
  hashResetToken,
  isResetTokenExpired,
  normalizeResetCode,
  normalizeResetEmail,
  resetTokenExpiryDate,
  resetTokenMatches,
  RESET_CODE_LENGTH,
  RESET_TOKEN_TTL_MS,
} from "./passwordResetService";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

assert(typeof FORGOT_PASSWORD_GENERIC_SUCCESS.message === "string", "generic message present");
assert(FORGOT_PASSWORD_GENERIC_SUCCESS.emailSent === true, "generic emailSent true");

assert(normalizeResetEmail(null) === null, "null email rejected");
assert(normalizeResetEmail("") === null, "empty email rejected");
assert(normalizeResetEmail("  Admin@Example.COM ") === "admin@example.com", "email normalized");

assert(normalizeResetCode(null) === null, "null code rejected");
assert(normalizeResetCode("12345") === null, "short code rejected");
assert(normalizeResetCode("1234567") === null, "long code rejected");
assert(normalizeResetCode("12-34-56") === "123456", "code strips non-digits");
assert(normalizeResetCode("abcdef") === null, "letters-only rejected");

const code = generateResetCode();
assert(code.length === RESET_CODE_LENGTH, "generated code length");
assert(/^\d{6}$/.test(code), "generated code digits");

const hash = hashResetToken(code);
assert(hash.length === 64, "sha256 hex length");
assert(hash !== code, "hash differs from plaintext");
assert(resetTokenMatches(hash, code), "hash match accepted");
assert(!resetTokenMatches(hash, "000000"), "wrong code rejected");
assert(resetTokenMatches(code, code), "legacy plaintext match");

assert(isResetTokenExpired(null), "null expiry is expired");
assert(isResetTokenExpired(new Date(Date.now() - 1000)), "past expiry expired");
assert(!isResetTokenExpired(new Date(Date.now() + 60_000)), "future expiry valid");

const expiry = resetTokenExpiryDate(1_000_000);
assert(expiry.getTime() === 1_000_000 + RESET_TOKEN_TTL_MS, "ttl applied");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
