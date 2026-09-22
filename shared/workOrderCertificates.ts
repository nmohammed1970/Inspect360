/**
 * Work-order certificate extraction helpers (shared / unit-testable).
 */

export type CertificateExtractionStatus =
  | "uploaded"
  | "analysing"
  | "needs_info"
  | "ready_to_confirm"
  | "added_to_compliance"
  | "failed";

export type CertificateExtractionResult = {
  certificateType: string | null;
  expiryDate: string | null; // YYYY-MM-DD
  confidence: number; // 0–100
};

export const ALLOWED_CERTIFICATE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const MAX_CERTIFICATE_BYTES = 25 * 1024 * 1024;

const CONFIDENCE_THRESHOLD = 70;

/** Parse AI/user date strings into YYYY-MM-DD, or null if invalid. */
export function parseCertificateExpiryDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!s || /^none|n\/a|unknown|null$/i.test(s)) return null;

  // ISO or YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return null;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    return null;
  }

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local-calendar today as YYYY-MM-DD. */
export function localTodayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when expiry is strictly before today (local calendar). */
export function isExpiryDateInPast(raw: unknown, now: Date = new Date()): boolean {
  const ymd = parseCertificateExpiryDate(raw);
  if (!ymd) return false;
  return ymd < localTodayYmd(now);
}

export function isAllowedCertificateMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const n = mime.toLowerCase().split(";")[0].trim();
  return (ALLOWED_CERTIFICATE_MIME_TYPES as readonly string[]).includes(n);
}

/** Fuzzy-match AI type to a known compliance label when close. */
export function matchCertificateType(
  extracted: string | null | undefined,
  knownTypes: string[],
): string | null {
  const raw = (extracted || "").trim();
  if (!raw || /^none|n\/a|unknown$/i.test(raw)) return null;
  const lower = raw.toLowerCase();
  const exact = knownTypes.find((t) => t.toLowerCase() === lower);
  if (exact) return exact;
  const contains = knownTypes.find(
    (t) => lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower),
  );
  if (contains) return contains;
  return raw;
}

export function validateExtractionPayload(raw: unknown): CertificateExtractionResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let confidence = Number(obj.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const typeRaw =
    typeof obj.certificateType === "string"
      ? obj.certificateType
      : typeof obj.certificate_type === "string"
        ? obj.certificate_type
        : null;
  const expiryRaw =
    obj.expiryDate ?? obj.expiry_date ?? obj.validUntil ?? obj.valid_until ?? null;

  return {
    certificateType: typeRaw?.trim() || null,
    expiryDate: parseCertificateExpiryDate(expiryRaw),
    confidence,
  };
}

export function decideExtractionStatus(
  result: CertificateExtractionResult,
): "ready_to_confirm" | "needs_info" {
  const hasType = Boolean(result.certificateType);
  const hasExpiry = Boolean(result.expiryDate);
  if (hasType && hasExpiry && result.confidence >= CONFIDENCE_THRESHOLD) {
    return "ready_to_confirm";
  }
  return "needs_info";
}

export const CERTIFICATE_EXTRACTION_SYSTEM_PROMPT = `You extract certificate metadata from property/compliance documents.
Return ONLY valid JSON with this exact shape:
{"certificateType": string|null, "expiryDate": "YYYY-MM-DD"|null, "confidence": number}

Rules:
- certificateType: the kind of certificate (e.g. Gas Safety Certificate, Electrical Safety Certificate, EPC Certificate). Use null if unclear.
- expiryDate: the certificate's VALID UNTIL / EXPIRY / NEXT DUE date only. Never use issue date, inspection date, or completion date as expiry.
- If the document says "valid for N months from DATE" and you can compute reliably, set expiryDate to that end date; otherwise null.
- confidence: 0-100 integer reflecting certainty of BOTH fields.
- Do not invent values. Prefer null over guessing.`;
