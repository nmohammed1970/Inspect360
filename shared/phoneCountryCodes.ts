// Mapping of ISO 3166-1 alpha-2 country codes to phone dial codes
export const COUNTRY_TO_PHONE_CODE: Record<string, string> = {
  GB: "+44",
  GG: "+44",
  IM: "+44",
  JE: "+44",
  US: "+1",
  CA: "+1",
  AS: "+1",
  GU: "+1",
  MP: "+1",
  PR: "+1",
  VI: "+1",
  AE: "+971",
  AU: "+61",
  IE: "+353",
  NZ: "+64",
  SG: "+65",
  IN: "+91",
  ZA: "+27",
  SA: "+966",
  QA: "+974",
  KW: "+965",
  BH: "+973",
  OM: "+968",
  FR: "+33",
  DE: "+49",
  IT: "+39",
  ES: "+34",
  NL: "+31",
  BE: "+32",
  CH: "+41",
  AT: "+43",
  SE: "+46",
  NO: "+47",
  DK: "+45",
  FI: "+358",
  PL: "+48",
  PT: "+351",
  GR: "+30",
  TR: "+90",
  RU: "+7",
  CN: "+86",
  JP: "+81",
  KR: "+82",
  BR: "+55",
  MX: "+52",
  AR: "+54",
  CL: "+56",
  CO: "+57",
  PE: "+51",
  EG: "+20",
  NG: "+234",
  KE: "+254",
  ZW: "+263",
  PK: "+92",
  BD: "+880",
  ID: "+62",
  MY: "+60",
  TH: "+66",
  VN: "+84",
  PH: "+63",
};

/** Preferred UI labels for dial codes (unique codes only). */
export const PHONE_CODE_LABELS: Record<string, string> = {
  "+1": "United States / Canada",
  "+7": "Russia",
  "+20": "Egypt",
  "+27": "South Africa",
  "+30": "Greece",
  "+31": "Netherlands",
  "+32": "Belgium",
  "+33": "France",
  "+34": "Spain",
  "+39": "Italy",
  "+41": "Switzerland",
  "+43": "Austria",
  "+44": "United Kingdom",
  "+45": "Denmark",
  "+46": "Sweden",
  "+47": "Norway",
  "+48": "Poland",
  "+49": "Germany",
  "+51": "Peru",
  "+52": "Mexico",
  "+54": "Argentina",
  "+55": "Brazil",
  "+56": "Chile",
  "+57": "Colombia",
  "+60": "Malaysia",
  "+61": "Australia",
  "+62": "Indonesia",
  "+63": "Philippines",
  "+64": "New Zealand",
  "+65": "Singapore",
  "+66": "Thailand",
  "+81": "Japan",
  "+82": "South Korea",
  "+84": "Vietnam",
  "+86": "China",
  "+90": "Turkey",
  "+91": "India",
  "+92": "Pakistan",
  "+234": "Nigeria",
  "+254": "Kenya",
  "+263": "Zimbabwe",
  "+351": "Portugal",
  "+353": "Ireland",
  "+358": "Finland",
  "+880": "Bangladesh",
  "+965": "Kuwait",
  "+966": "Saudi Arabia",
  "+968": "Oman",
  "+971": "United Arab Emirates",
  "+973": "Bahrain",
  "+974": "Qatar",
};

/** Dial codes longest-first so +353 wins over +35 / +3. */
const DIAL_CODES_LONGEST_FIRST: string[] = Array.from(
  new Set(Object.values(COUNTRY_TO_PHONE_CODE)),
).sort((a, b) => b.length - a.length);

export function getPhoneCodeOptions(): Array<{ code: string; label: string }> {
  return DIAL_CODES_LONGEST_FIRST.slice()
    .sort((a, b) => {
      const numA = parseInt(a.replace("+", ""), 10) || 9999;
      const numB = parseInt(b.replace("+", ""), 10) || 9999;
      return numA - numB;
    })
    .map((code) => ({
      code,
      label: PHONE_CODE_LABELS[code] || code,
    }));
}

export function getPhoneCodeForCountry(countryCode: string): string {
  return COUNTRY_TO_PHONE_CODE[countryCode.toUpperCase()] || "+1";
}

export function getCountryCodeFromPhoneCode(phoneCode: string): string | null {
  const normalized = phoneCode.startsWith("+") ? phoneCode : `+${phoneCode}`;
  for (const [country, code] of Object.entries(COUNTRY_TO_PHONE_CODE)) {
    if (code === normalized) return country;
  }
  return null;
}

/**
 * Split a stored/combined phone into dial code + national number.
 * Matches known dial codes longest-first (works with E.164 like +447700900123).
 */
export function parsePhoneNumber(fullPhone: string | null | undefined): {
  countryCode: string | null;
  number: string;
} {
  if (!fullPhone) return { countryCode: null, number: "" };
  const trimmed = fullPhone.trim();
  if (!trimmed) return { countryCode: null, number: "" };

  const compact = trimmed.replace(/[\s\-().]/g, "");

  for (const code of DIAL_CODES_LONGEST_FIRST) {
    if (compact.startsWith(code)) {
      return {
        countryCode: code,
        number: compact.slice(code.length),
      };
    }
  }

  // Unknown +prefix: take 1–3 digit country code heuristically
  const fallback = compact.match(/^(\+\d{1,3})(.*)$/);
  if (fallback) {
    return { countryCode: fallback[1], number: fallback[2] };
  }

  return { countryCode: null, number: trimmed };
}

/** Combine dial code + national number for display while typing. */
export function combinePhoneNumber(countryCode: string, number: string): string {
  if (!number.trim()) return "";
  const normalizedCode = countryCode.startsWith("+") ? countryCode : `+${countryCode}`;
  const national = number.trim().replace(/\D/g, "").replace(/^0+/, "");
  if (!national) return "";
  return `${normalizedCode} ${national}`;
}

/**
 * Normalize to E.164 (+ and digits only). Returns null if missing/invalid.
 * Suitable for TextMagic and DB storage.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumber(trimmed);
  let digits = "";
  let withPlus = "";

  if (parsed.countryCode) {
    const codeDigits = parsed.countryCode.replace(/\D/g, "");
    const national = parsed.number.replace(/\D/g, "").replace(/^0+/, "");
    if (!codeDigits || !national) return null;
    digits = `${codeDigits}${national}`;
    withPlus = `+${digits}`;
  } else {
    const cleaned = trimmed.replace(/[\s\-().]/g, "");
    if (!cleaned.startsWith("+")) return null;
    digits = cleaned.slice(1).replace(/\D/g, "");
    withPlus = `+${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  if (!/^\+\d{8,15}$/.test(withPlus)) return null;
  return withPlus;
}

/**
 * Value to persist in DB. Empty → null. Prefer E.164; otherwise compact +digits if possible.
 */
export function normalizePhoneForStorage(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const e164 = normalizePhoneE164(trimmed);
  if (e164) return e164;
  const compact = trimmed.replace(/[\s\-().]/g, "");
  return compact || null;
}
