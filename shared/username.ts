/**
 * Derive a unique users.username from email + company/org name.
 * Login uses email; username is only a unique internal slug.
 */

const USERNAME_MAX = 200;

/** Humanize email local-part for display (never show composite username). */
export function emailLocalDisplayName(email: string | null | undefined): string {
  const raw = String(email || "").trim();
  if (!raw.includes("@")) return "";
  const local = raw.split("@")[0] || "";
  return local
    .replace(/[._+-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function buildOwnerUsername(email: string, companyName: string): string {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const company = String(companyName || "").trim().replace(/\s+/g, " ");
  const base = `${normalizedEmail}|${company}`;
  if (base.length <= USERNAME_MAX) return base;
  return base.slice(0, USERNAME_MAX);
}

/** Append -2, -3, ... when the base username is already taken. */
export function withUsernameCollisionSuffix(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = `-${attempt}`;
  const maxBase = USERNAME_MAX - suffix.length;
  return `${base.slice(0, Math.max(1, maxBase))}${suffix}`;
}
