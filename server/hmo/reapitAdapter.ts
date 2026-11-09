/**
 * Optional Reapit bridge for HMO workflows.
 * Disabled unless REAPIT_HMO_SYNC=true.
 * Never treats Reapit household/occupant figures as verified licence counts.
 */
export function isReapitHmoSyncEnabled(): boolean {
  return String(process.env.REAPIT_HMO_SYNC || "").toLowerCase() === "true";
}

export async function fetchReapitOccupancyHint(params: {
  propertyExternalId: string;
}): Promise<{
  enabled: boolean;
  verified: false;
  personCount: null;
  note: string;
  propertyExternalId: string;
}> {
  if (!isReapitHmoSyncEnabled()) {
    return {
      enabled: false,
      verified: false,
      personCount: null,
      note: "Reapit HMO sync flag off",
      propertyExternalId: params.propertyExternalId,
    };
  }
  // Discovery-only placeholder: do not invent or assert occupant counts.
  return {
    enabled: true,
    verified: false,
    personCount: null,
    note: "Reapit payload treated as unverified hint only — never authoritative for OCC checks",
    propertyExternalId: params.propertyExternalId,
  };
}
