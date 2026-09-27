/**
 * Shared password-reset helpers used by both org users and platform admins.
 * Tokens are 6-digit codes, stored as SHA-256 hashes, expire in 1 hour, single-use.
 */
import { createHash, randomInt } from "crypto";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const RESET_CODE_LENGTH = 6;

export const FORGOT_PASSWORD_GENERIC_SUCCESS = {
  message: "If an account exists for that email, a password reset code has been sent.",
  emailSent: true as const,
};

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateResetCode(): string {
  return String(randomInt(100000, 1000000));
}

export function normalizeResetEmail(email: unknown): string | null {
  if (typeof email !== "string" || !email.trim()) return null;
  return email.toLowerCase().trim();
}

/** Digits-only 6-char code, or null if malformed. */
export function normalizeResetCode(token: unknown): string | null {
  if (token === undefined || token === null) return null;
  const normalized = String(token).replace(/\D/g, "").trim();
  return normalized.length === RESET_CODE_LENGTH ? normalized : null;
}

/**
 * Preferred: SHA-256 hash match.
 * Legacy: plaintext 6-digit stored during transition (user accounts only).
 */
export function resetTokenMatches(storedToken: string, normalizedCode: string): boolean {
  const tokenHash = hashResetToken(normalizedCode);
  return (
    storedToken === tokenHash ||
    (storedToken.length === RESET_CODE_LENGTH && storedToken === normalizedCode)
  );
}

export function isResetTokenExpired(expiry: Date | string | null | undefined): boolean {
  if (!expiry) return true;
  const when = expiry instanceof Date ? expiry : new Date(expiry);
  return Number.isNaN(when.getTime()) || new Date() > when;
}

export function resetTokenExpiryDate(fromMs: number = Date.now()): Date {
  return new Date(fromMs + RESET_TOKEN_TTL_MS);
}
