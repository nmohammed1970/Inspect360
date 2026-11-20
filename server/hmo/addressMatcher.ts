export type AddressMatchResult = {
  matched: boolean;
  confidence: number;
  requiresManualSelect: boolean;
  reason: string;
  postcodeOnly: boolean;
};

export const LICENCE_ADDRESS_MISMATCH_MESSAGE =
  "Licence hasn't matched to property address, please try another.";

const STREET_ABBREV: Record<string, string> = {
  st: "street",
  street: "street",
  rd: "road",
  road: "road",
  ave: "avenue",
  av: "avenue",
  avenue: "avenue",
  blvd: "boulevard",
  boulevard: "boulevard",
  cl: "close",
  close: "close",
  ln: "lane",
  lane: "lane",
  dr: "drive",
  drive: "drive",
  ct: "court",
  court: "court",
  pl: "place",
  place: "place",
  ter: "terrace",
  terrace: "terrace",
  gdns: "gardens",
  gardens: "gardens",
  cres: "crescent",
  crescent: "crescent",
  sq: "square",
  square: "square",
  hwy: "highway",
  highway: "highway",
};

function normalise(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandStreetWords(s: string): string {
  return normalise(s)
    .split(" ")
    .map((t) => STREET_ABBREV[t] || t)
    .join(" ");
}

function extractPostcode(s: string): string | null {
  const m = String(s || "")
    .toUpperCase()
    .match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return m ? m[1].replace(/\s+/g, " ") : null;
}

function stripPostcode(s: string): string {
  return expandStreetWords(s)
    .replace(/\b[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * First line / house-number + street core — same property is often written
 * differently after the street (city, borough, postcode).
 */
export function coreStreetLine(address: string): string {
  // Split on comma before normalisation so city/locality are dropped.
  const firstRaw = String(address || "").split(",")[0] || String(address || "");
  const firstSegment = stripPostcode(firstRaw);
  if (!firstSegment) return "";
  const tokens = firstSegment.split(" ").filter(Boolean);
  // Prefer "... N StreetName StreetType" when present
  const typeIdx = tokens.findIndex(
    (t) =>
      Object.values(STREET_ABBREV).includes(t) || t === "view" || t === "way" || t === "row",
  );
  if (typeIdx >= 1) {
    return tokens.slice(0, typeIdx + 1).join(" ");
  }
  if (tokens.length <= 4) return tokens.join(" ");
  return tokens.slice(0, 4).join(" ");
}

function startingAddressMatch(propertyAddress: string, extractedAddress: string): AddressMatchResult | null {
  const propCore = coreStreetLine(propertyAddress);
  const extCore = coreStreetLine(extractedAddress);
  if (!propCore || !extCore) return null;

  if (propCore === extCore) {
    return {
      matched: true,
      confidence: 0.94,
      requiresManualSelect: false,
      reason: "Starting street line match (normalised)",
      postcodeOnly: false,
    };
  }

  // One starts with the other (e.g. "38 park view" vs "38 park view acton")
  if (propCore.startsWith(extCore) || extCore.startsWith(propCore)) {
    const shorter = propCore.length <= extCore.length ? propCore : extCore;
    // Require at least house number + one street token
    if (shorter.split(" ").filter((t) => t.length > 0).length >= 2) {
      return {
        matched: true,
        confidence: 0.9,
        requiresManualSelect: false,
        reason: "Starting address prefix match",
        postcodeOnly: false,
      };
    }
  }

  const propTokens = propCore.split(" ").filter((t) => t.length > 1);
  const extTokens = extCore.split(" ").filter((t) => t.length > 1);
  if (propTokens.length >= 2 && extTokens.length >= 2) {
    const propSet = new Set(propTokens);
    const hit = extTokens.filter((t) => propSet.has(t)).length;
    const ratio = hit / Math.max(propTokens.length, extTokens.length);
    // House number must agree when both have one
    const propNum = propTokens.find((t) => /^\d+[a-z]?$/i.test(t));
    const extNum = extTokens.find((t) => /^\d+[a-z]?$/i.test(t));
    if (propNum && extNum && propNum !== extNum) {
      return null;
    }
    if (ratio >= 0.75 && hit >= 2) {
      return {
        matched: true,
        confidence: 0.88,
        requiresManualSelect: false,
        reason: "Strong starting street token overlap",
        postcodeOnly: false,
      };
    }
  }

  return null;
}

/**
 * Address / UPRN matcher for licence upload gate + LIC-01.
 * Never auto-matches on postcode alone (AT-05).
 * Prefers mature starting-street matching so formatting differences still pass.
 */
export function scoreAddressMatch(params: {
  propertyAddress: string | null | undefined;
  extractedAddress: string | null | undefined;
  propertyUprn?: string | null;
  extractedUprn?: string | null;
}): AddressMatchResult {
  const prop = expandStreetWords(params.propertyAddress || "");
  const extracted = expandStreetWords(params.extractedAddress || "");
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

  const startMatch = startingAddressMatch(params.propertyAddress || "", params.extractedAddress || "");
  if (startMatch?.matched) return startMatch;

  const postcodeOnly =
    Boolean(propPc && extPc && propPc.replace(/\s/g, "") === extPc.replace(/\s/g, "")) &&
    !prop.includes(extracted.replace(extPc ? normalise(extPc) : "", "").trim()) &&
    prop.split(" ").filter((t) => t.length > 2 && extracted.includes(t)).length < 2;

  if (propPc && extPc && propPc.replace(/\s/g, "") === extPc.replace(/\s/g, "")) {
    const withoutPostcode = stripPostcode(params.extractedAddress || "");
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
    reason:
      conf < 0.5
        ? "Low-confidence address match — manual select required"
        : "Partial match — manual confirm required",
    postcodeOnly,
  };
}

/** True when licence address matches the property address or name (starting-line aware). */
export function licenceAddressMatchesProperty(params: {
  propertyAddress?: string | null;
  propertyName?: string | null;
  extractedAddress?: string | null;
  extractedUprn?: string | null;
  propertyUprn?: string | null;
}): AddressMatchResult {
  const candidates = [params.propertyAddress, params.propertyName].filter(
    (v): v is string => Boolean(v && String(v).trim()),
  );
  if (!candidates.length || !params.extractedAddress?.trim()) {
    return {
      matched: false,
      confidence: 0,
      requiresManualSelect: true,
      reason: "Missing address on property or licence",
      postcodeOnly: false,
    };
  }

  let best: AddressMatchResult = {
    matched: false,
    confidence: 0,
    requiresManualSelect: true,
    reason: "No address match",
    postcodeOnly: false,
  };

  for (const candidate of candidates) {
    const result = scoreAddressMatch({
      propertyAddress: candidate,
      extractedAddress: params.extractedAddress,
      propertyUprn: params.propertyUprn,
      extractedUprn: params.extractedUprn,
    });
    if (result.matched) return result;
    if (result.confidence > best.confidence) best = result;
  }
  return best;
}
