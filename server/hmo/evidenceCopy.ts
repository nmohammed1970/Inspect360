/** Human-readable copy for evidence requests / emails. */

export function hmoCheckLabel(checkId: string | null | undefined): string {
  switch (checkId) {
    case "LIC-01":
      return "Licence address match";
    case "LIC-02":
      return "Licence number & issuing authority";
    case "LIC-03":
      return "Licence expiry / current status";
    case "LIC-04":
      return "Licence holder / manager";
    case "LIC-05":
      return "Full conditions & schedules";
    case "OCC-01":
      return "Occupancy vs maximum";
    case "OCC-02":
      return "Household restrictions";
    case "OCC-03":
      return "Per-room occupancy";
    case "ROOM-01":
      return "Sleeping-room floor area";
    case "ROOM-02":
      return "Unauthorised room conversion";
    case "AMEN-01":
      return "Amenity provision";
    case "SAF-01":
      return "Safety certificates";
    case "COND-01":
      return "Condition / HHSRS hazards";
    case "LOC-01":
      return "Local licensing standards";
    case "PLAN-01":
      return "Planning authorisation";
    case "MGMT-01":
      return "Licence display / notices";
    default:
      return checkId?.replace(/_/g, " ") || "Supporting evidence";
  }
}

export function hmoChecksForTask(taskCode: string | null | undefined): string[] {
  switch (taskCode) {
    case "HMO-001":
      return ["LIC-02", "LIC-03"];
    case "HMO-002":
      return ["LIC-05"];
    case "HMO-003":
      return ["LIC-01", "LIC-04"];
    case "HMO-004":
      return ["OCC-01", "OCC-02", "OCC-03"];
    case "HMO-005":
      return ["ROOM-01", "ROOM-02"];
    case "HMO-006":
      return ["SAF-01", "COND-01", "AMEN-01"];
    case "HMO-007":
      return ["LOC-01", "PLAN-01", "MGMT-01"];
    default:
      return [];
  }
}

export function buildEvidenceRequestCopy(input: {
  propertyName: string;
  propertyAddress?: string | null;
  taskCode?: string | null;
  taskTitle: string;
  neededCheckIds?: string[];
}): { subject: string; requestTemplate: string; neededSummary: string } {
  const checkIds =
    input.neededCheckIds && input.neededCheckIds.length > 0
      ? input.neededCheckIds
      : hmoChecksForTask(input.taskCode);
  const neededLabels = checkIds.map((id) => hmoCheckLabel(id));
  const neededSummary =
    neededLabels.length > 0
      ? neededLabels.join("; ")
      : input.taskTitle || "Supporting evidence";

  const propertyLine = input.propertyAddress
    ? `${input.propertyName} — ${input.propertyAddress}`
    : input.propertyName;

  const requestTemplate = [
    `Property: ${propertyLine}`,
    `Needed: ${neededSummary}`,
    input.taskCode ? `Task: ${input.taskCode} — ${input.taskTitle}` : `Task: ${input.taskTitle}`,
    "",
    "Please upload the supporting document for the item above.",
  ].join("\n");

  const subject = `Evidence needed: ${neededSummary} — ${input.propertyName}`;

  return { subject, requestTemplate, neededSummary };
}
