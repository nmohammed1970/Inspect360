/**
 * Password policy tests. Run with: npx tsx shared/passwordPolicy.test.ts
 */
import { MIN_PASSWORD_LENGTH, validateNewPassword, changePasswordFormSchema } from "./passwordPolicy";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

assert(MIN_PASSWORD_LENGTH === 6, "min length is 6");
assert(!validateNewPassword("").ok, "empty rejected");
assert(!validateNewPassword(null).ok, "null rejected");
assert(!validateNewPassword(undefined).ok, "undefined rejected");
assert(!validateNewPassword(123456).ok, "non-string rejected");
assert(!validateNewPassword("12345").ok, "too short rejected");
assert(validateNewPassword("123456").ok, "six chars accepted");
assert(validateNewPassword("abcdef").ok, "letters accepted");

const mismatch = changePasswordFormSchema.safeParse({
  currentPassword: "oldpass",
  newPassword: "123456",
  confirmPassword: "123457",
});
assert(!mismatch.success, "mismatch rejected");

const missingCurrent = changePasswordFormSchema.safeParse({
  currentPassword: "",
  newPassword: "123456",
  confirmPassword: "123456",
});
assert(!missingCurrent.success, "empty current rejected");

const matching = changePasswordFormSchema.safeParse({
  currentPassword: "oldpass",
  newPassword: "123456",
  confirmPassword: "123456",
});
assert(matching.success, "matching accepted");

const shortNew = changePasswordFormSchema.safeParse({
  currentPassword: "oldpass",
  newPassword: "12345",
  confirmPassword: "12345",
});
assert(!shortNew.success, "short new password rejected by form schema");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
