import { normalizePhoneE164, parsePhoneNumber } from "./phoneCountryCodes";

export { normalizePhoneE164, normalizePhoneForStorage } from "./phoneCountryCodes";

export function substituteSmsVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

/** Normalize to E.164 digits with leading +. Returns null if unusable. */
export function normalizePhoneForSms(raw: string | null | undefined): string | null {
  return normalizePhoneE164(raw);
}

/** @deprecated use normalizePhoneE164 — kept for call sites that imported parse via smsUtils */
export { parsePhoneNumber };
