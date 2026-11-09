/** Human-readable labels for HMO Compliance UI (non-technical). */

export function hmoOverallStatusMeta(status: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (status) {
    case "CRITICAL_EXCEPTION":
      return { label: "Critical exception", className: "border-rose-300 bg-rose-50 text-rose-800" };
    case "ACTION_REQUIRED":
      return { label: "Action required", className: "border-amber-300 bg-amber-50 text-amber-900" };
    case "REVIEW_REQUIRED":
      return { label: "Review required", className: "border-sky-300 bg-sky-50 text-sky-900" };
    case "VERIFIED_COMPLIANT":
      return {
        label: "Verified compliant",
        className: "border-emerald-300 bg-emerald-50 text-emerald-900",
      };
    case "ASSESSMENT_DELAYED":
      return { label: "Assessment delayed", className: "border-slate-300 bg-slate-50 text-slate-700" };
    case "NOT_ASSESSED":
    default:
      return {
        label: "Not assessed",
        className: "border-muted-foreground/30 bg-muted text-foreground",
      };
  }
}

export function hmoSeverityMeta(severity: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (severity) {
    case "CRITICAL":
      return { label: "Critical", className: "border-rose-300 bg-rose-50 text-rose-800" };
    case "HIGH":
      return { label: "High", className: "border-orange-300 bg-orange-50 text-orange-900" };
    case "MEDIUM":
      return { label: "Medium", className: "border-amber-300 bg-amber-50 text-amber-900" };
    case "LOW":
      return { label: "Low", className: "border-slate-300 bg-slate-50 text-slate-700" };
    case "INFORMATIONAL":
      return { label: "Info", className: "border-sky-300 bg-sky-50 text-sky-900" };
    default:
      return { label: severity?.replace(/_/g, " ") || "Unknown", className: "" };
  }
}

export function hmoCaseStatusLabel(status: string | null | undefined): string {
  return hmoCaseStatusMeta(status).label;
}

export function hmoCaseStatusMeta(status: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (status) {
    case "OPEN":
      return { label: "Open", className: "border-sky-200 bg-sky-50 text-sky-900" };
    case "TRIAGED":
      return { label: "Triaged", className: "border-indigo-200 bg-indigo-50 text-indigo-900" };
    case "IN_PROGRESS":
      return { label: "In progress", className: "border-amber-200 bg-amber-50 text-amber-950" };
    case "AWAITING_EVIDENCE":
      return {
        label: "Awaiting evidence",
        className: "border-orange-200 bg-orange-50 text-orange-950",
      };
    case "AWAITING_REVIEW":
      return { label: "Awaiting review", className: "border-violet-200 bg-violet-50 text-violet-950" };
    case "READY_FOR_SIGNOFF":
      return {
        label: "Ready for sign-off",
        className: "border-teal-200 bg-teal-50 text-teal-950",
      };
    case "VERIFIED_CLOSED":
      return {
        label: "Closed",
        className: "border-emerald-300 bg-emerald-50 text-emerald-900",
      };
    case "REOPENED":
      return { label: "Reopened", className: "border-rose-200 bg-rose-50 text-rose-900" };
    case "CANCELLED_AS_DUPLICATE":
      return {
        label: "Cancelled (duplicate)",
        className: "border-slate-200 bg-slate-50 text-slate-700",
      };
    default:
      return {
        label: status?.replace(/_/g, " ") || "Unknown",
        className: "border-muted-foreground/20 bg-muted text-foreground",
      };
  }
}

export function hmoTaskStatusLabel(status: string | null | undefined): string {
  return hmoTaskStatusMeta(status).label;
}

export function hmoTaskStatusMeta(status: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (status) {
    case "OPEN":
      return { label: "Open", className: "border-sky-200 bg-sky-50 text-sky-900" };
    case "ASSIGNED":
      return { label: "Assigned", className: "border-indigo-200 bg-indigo-50 text-indigo-900" };
    case "IN_PROGRESS":
      return { label: "In progress", className: "border-amber-200 bg-amber-50 text-amber-950" };
    case "EVIDENCE_REQUESTED":
      return {
        label: "Evidence requested",
        className: "border-orange-200 bg-orange-50 text-orange-950",
      };
    case "EVIDENCE_RECEIVED":
      return {
        label: "Evidence received",
        className: "border-cyan-200 bg-cyan-50 text-cyan-950",
      };
    case "AWAITING_VERIFICATION":
      return {
        label: "Awaiting verification",
        className: "border-violet-200 bg-violet-50 text-violet-950",
      };
    case "VERIFIED_CLOSED":
      return {
        label: "Closed",
        className: "border-emerald-300 bg-emerald-50 text-emerald-900",
      };
    case "REOPENED":
      return { label: "Reopened", className: "border-rose-200 bg-rose-50 text-rose-900" };
    case "CANCELLED":
      return { label: "Cancelled", className: "border-slate-200 bg-slate-50 text-slate-700" };
    default:
      return {
        label: status?.replace(/_/g, " ") || "Unknown",
        className: "border-muted-foreground/20 bg-muted text-foreground",
      };
  }
}

export function hmoFindingStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "VERIFIED_COMPLIANT":
      return "Verified compliant";
    case "CONFIRMED_NON_COMPLIANT":
      return "Non-compliant";
    case "POTENTIAL_RISK":
      return "Potential risk";
    case "EVIDENCE_MISSING":
      return "Evidence missing";
    case "NOT_APPLICABLE":
      return "Not applicable";
    case "REQUIRES_HUMAN_REVIEW":
      return "Needs review";
    default:
      return status?.replace(/_/g, " ") || "Unknown";
  }
}

export function hmoLifecycleLabel(status: string | null | undefined): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "CURRENT":
      return "Current";
    case "EXPIRED_DOCUMENT":
      return "Expired document";
    case "RENEWAL_PENDING_EVIDENCE":
      return "Renewal pending evidence";
    case "SUPERSEDED":
      return "Superseded";
    case "UNDER_REVIEW":
      return "Under review";
    default:
      return status?.replace(/_/g, " ") || "Unknown";
  }
}

export function hmoRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case "compliance":
      return "Compliance";
    case "clerk":
      return "Property manager";
    case "owner":
      return "Owner";
    default:
      return role || "Unassigned";
  }
}

export function hmoPreTenancyLabel(decision: string | null | undefined): string {
  switch (decision) {
    case "ALLOW_FOR_CHECKED_CONSTRAINTS":
      return "Allowed for checked constraints";
    case "BLOCK_REVIEW_REQUIRED":
      return "Blocked — review required";
    case "INSUFFICIENT_EVIDENCE":
      return "Insufficient evidence";
    default:
      return decision?.replace(/_/g, " ") || "Unknown";
  }
}

export function formatHmoDate(value: string | Date | null | undefined): string {
  if (!value) return "Not set";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Human titles for assessment check IDs. */
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
      return checkId?.replace(/_/g, " ") || "Check";
  }
}

/** Whether a check is a full licence rule vs a later/stub module. */
export function hmoCheckGroup(checkId: string | null | undefined): "licence" | "later" {
  return String(checkId || "").startsWith("LIC-") ? "licence" : "later";
}

/**
 * Playbook tasks that typically clear or progress a given finding.
 * These are guidance links — cases still use the fixed HMO-001…008 pack.
 */
export function hmoRelatedTaskCodes(checkId: string | null | undefined): string[] {
  switch (checkId) {
    case "LIC-01":
      return ["HMO-003"];
    case "LIC-02":
      return ["HMO-001"];
    case "LIC-03":
      return ["HMO-001"];
    case "LIC-04":
      return ["HMO-003"];
    case "LIC-05":
      return ["HMO-002"];
    case "OCC-01":
    case "OCC-02":
    case "OCC-03":
      return ["HMO-004"];
    case "ROOM-01":
    case "ROOM-02":
      return ["HMO-005"];
    case "AMEN-01":
    case "SAF-01":
    case "COND-01":
      return ["HMO-006"];
    case "LOC-01":
    case "PLAN-01":
    case "MGMT-01":
      return ["HMO-007"];
    default:
      return [];
  }
}

export function hmoTaskShortLabel(taskCode: string | null | undefined): string {
  switch (taskCode) {
    case "HMO-001":
      return "Verify current licence";
    case "HMO-002":
      return "Obtain full conditions";
    case "HMO-003":
      return "Verify property / holder";
    case "HMO-004":
      return "Verify occupancy";
    case "HMO-005":
      return "Measure sleeping rooms";
    case "HMO-006":
      return "Review safety / condition";
    case "HMO-007":
      return "Local / planning evidence";
    case "HMO-008":
      return "Reassess & sign off";
    default:
      return taskCode || "Task";
  }
}

/** Findings a playbook task is meant to progress. */
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
    case "HMO-008":
      return [];
    default:
      return [];
  }
}
