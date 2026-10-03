/** Platform-wide password minimum length (signup, change, reset). */
export const MIN_PASSWORD_LENGTH = 6;

export function validateNewPassword(password: unknown): { ok: true; password: string } | { ok: false; message: string } {
  if (typeof password !== "string" || !password) {
    return { ok: false, message: "New password is required" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  return { ok: true, password };
}
