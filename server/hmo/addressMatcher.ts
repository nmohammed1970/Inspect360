export type AddressMatchResult = {
  matched: boolean;
  confidence: number;
  requiresManualSelect: boolean;
  reason: string;
  postcodeOnly: boolean;
};

function normalise(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPostcode(s: string): string | null {
  const m = String(s || "").toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return m ? m[1].replace(/\s+/g, " ") : null;
}

/**
 * Address / UPRN matcher for LIC-01.
 * Never auto-matches on postcode alone (AT-05).
 */
export function scoreAddressMatch(params: {
  propertyAddress: string | null | undefined;
  extractedAddress: string | null | undefined;
  propertyUprn?: string | null;
  extractedUprn?: string | null;
}): AddressMatchResult {
  const prop = normalise(params.propertyAddress || "");
  const extracted = normalise(params.extractedAddress || "");
  const propPc = extractPostcode(params.propertyAddress || "");
  const extPc = extractPostcode(params.extractedAddress || "");

  if (params.propertyUprn && params.extractedUprn && params.propertyUprn === params.extractedUprn) {
    return {
      matched: true,
      confidence: 0.99,
      requiresManualSelect: false,
      reason: "UPRN exact match",
      postcodeOnly: false,
    };
  }

  if (!prop || !extracted) {
    return {
      matched: false,
      confidence: 0,
      requiresManualSelect: true,
      reason: "Missing address on property or extraction — manual select required",
      postcodeOnly: false,
    };
  }

  if (prop === extracted) {
    return {
      matched: true,
      confidence: 0.98,
      requiresManualSelect: false,
      reason: "Exact normalised address match",
      postcodeOnly: false,
    };
  }

  const postcodeOnly =
    Boolean(propPc && extPc && propPc.replace(/\s/g, "") === extPc.replace(/\s/g, "")) &&
    !prop.includes(extracted.replace(extPc ? normalise(extPc) : "", "").trim()) &&
    prop.split(" ").filter((t) => t.length > 2 && extracted.includes(t)).length < 2;

  if (propPc && extPc && propPc.replace(/\s/g, "") === extPc.replace(/\s/g, "")) {
    const pcNorm = normalise(extPc);
    const withoutPostcode = extracted
      .replace(pcNorm, " ")
      .replace(/\b[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = withoutPostcode.split(" ").filter((t) => t.length > 1);
    // AT-05: postcode alone (or postcode-only extracted string) never auto-matches
    if (tokens.length === 0) {
      return {
        matched: false,
        confidence: 0.35,
        requiresManualSelect: true,
        reason: "Postcode overlap only — never auto-match; manual select required",
        postcodeOnly: true,
      };
    }
    const overlap = tokens.filter((t) => prop.includes(t)).length;
    const ratio = tokens.length ? overlap / tokens.length : 0;
    if (ratio >= 0.7 && overlap >= 2) {
      return {
        matched: true,
        confidence: 0.85,
        requiresManualSelect: false,
        reason: "Strong street + postcode overlap",
        postcodeOnly: false,
      };
    }
    return {
      matched: false,
      confidence: 0.35,
      requiresManualSelect: true,
      reason: "Postcode overlap only — never auto-match; manual select required",
      postcodeOnly: true,
    };
  }

  const propTokens = new Set(prop.split(" ").filter((t) => t.length > 2));
  const extTokens = extracted.split(" ").filter((t) => t.length > 2);
  const hit = extTokens.filter((t) => propTokens.has(t)).length;
  const conf = extTokens.length ? hit / extTokens.length : 0;
  if (conf >= 0.85 && hit >= 3) {
    return {
      matched: true,
      confidence: conf,
      requiresManualSelect: false,
      reason: "High token overlap",
      postcodeOnly: false,
    };
  }

  return {
    matched: false,
    confidence: conf,
    requiresManualSelect: true,
    reason: conf < 0.5 ? "Low-confidence address match — manual select required" : "Partial match — manual confirm required",
    postcodeOnly,
  };
}
