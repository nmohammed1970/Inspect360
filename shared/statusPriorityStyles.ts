/**
 * Canonical status / priority semantic tones for the whole app.
 * Use with StatusPill tones, soft Badge classNames, or SelectTrigger styling.
 */

export type SemanticTone =
  | "muted"
  | "info"
  | "success"
  | "warning"
  | "critical"
  | "action"
  | "primary"
  | "urgent";

/** Soft tinted pill classes (border + bg + text) using brand CSS variables. */
export const SEMANTIC_TONE_CLASS: Record<SemanticTone, string> = {
  muted: "border-slate-300 bg-slate-100 text-slate-600",
  info: "border-sky-300 bg-sky-50 text-sky-800",
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  critical: "border-red-300 bg-red-50 text-red-700",
  action: "border-orange-300 bg-orange-50 text-orange-800",
  primary: "border-teal-300 bg-teal-50 text-teal-800",
  urgent: "border-rose-400 bg-rose-100 text-rose-800",
};

/** Solid-ish background classes for denser badges (work-order boards, etc.). */
export const SEMANTIC_TONE_SOLID_CLASS: Record<SemanticTone, string> = {
  muted: "bg-slate-100 text-slate-600 border-transparent",
  info: "bg-sky-100 text-sky-800 border-transparent",
  success: "bg-emerald-100 text-emerald-800 border-transparent",
  warning: "bg-amber-100 text-amber-900 border-transparent",
  critical: "bg-red-100 text-red-700 border-transparent",
  action: "bg-orange-100 text-orange-800 border-transparent",
  primary: "bg-teal-100 text-teal-800 border-transparent",
  urgent: "bg-rose-100 text-rose-800 border-transparent",
};

export type BadgeVariantName =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "info"
  | "outline";

export function toneToBadgeVariant(tone: SemanticTone): BadgeVariantName {
  switch (tone) {
    case "success":
      return "success";
    case "warning":
    case "action":
      return "warning";
    case "critical":
    case "urgent":
      return "destructive";
    case "info":
      return "info";
    case "primary":
      return "default";
    case "muted":
    default:
      return "secondary";
  }
}

export function toneClass(tone: SemanticTone, solid = false): string {
  return solid ? SEMANTIC_TONE_SOLID_CLASS[tone] : SEMANTIC_TONE_CLASS[tone];
}

/** Maintenance request / tenant request / communications priority */
export function priorityTone(priority: string | null | undefined): SemanticTone {
  switch ((priority || "").toLowerCase()) {
    case "urgent":
    case "critical":
      return "urgent";
    case "high":
      return "critical";
    case "medium":
    case "normal":
      return "warning";
    case "low":
      return "info";
    default:
      return "muted";
  }
}

/** Communications Hub case status */
export function communicationCaseStatusTone(
  status: string | null | undefined,
): SemanticTone {
  switch ((status || "").toLowerCase()) {
    case "resolved":
      return "success";
    case "closed":
      return "primary";
    case "cancelled":
      return "muted";
    case "duplicate":
      return "muted";
    case "awaiting_tenant":
      return "action";
    case "awaiting_approval":
      return "warning";
    case "awaiting_third_party":
      return "action";
    case "in_progress":
      return "primary";
    case "assigned":
      return "info";
    case "new":
      return "info";
    case "triaged":
      return "warning";
    default:
      return "muted";
  }
}

/** Tenant-facing public case status labels */
export function publicCaseStatusTone(
  publicOrInternal: string | null | undefined,
): SemanticTone {
  const s = (publicOrInternal || "").toLowerCase();
  if (s === "resolved" || s === "closed") return "success";
  if (s === "waiting for you" || s === "awaiting_tenant") return "action";
  if (s === "in progress" || s === "in_progress") return "warning";
  if (s === "received" || s === "under review" || s === "new" || s === "triaged") return "info";
  return communicationCaseStatusTone(s);
}

/** Maintenance request status (open / in_progress / completed / closed) */
export function maintenanceRequestStatusTone(
  status: string | null | undefined,
): SemanticTone {
  switch ((status || "").toLowerCase()) {
    case "completed":
      return "success";
    case "in_progress":
      return "warning";
    case "open":
      return "info";
    case "closed":
      return "muted";
    default:
      return "muted";
  }
}

/** Work order status */
export function workOrderStatusTone(status: string | null | undefined): SemanticTone {
  switch ((status || "").toLowerCase()) {
    case "completed":
      return "success";
    case "rejected":
      return "critical";
    case "in_progress":
      return "warning";
    case "waiting_parts":
      return "action";
    case "assigned":
    case "scheduled":
      return "info";
    case "pending_acceptance":
    case "pending":
      return "muted";
    default:
      return "muted";
  }
}

/** Inspection status */
export function inspectionStatusTone(status: string | null | undefined): SemanticTone {
  switch ((status || "").toLowerCase()) {
    case "completed":
    case "reviewed":
      return "success";
    case "in_progress":
      return "warning";
    case "scheduled":
      return "info";
    case "cancelled":
      return "critical";
    case "draft":
      return "muted";
    default:
      return "muted";
  }
}

/** Compliance document / licence status */
export function complianceDocTone(status: string | null | undefined): SemanticTone {
  const s = (status || "").toLowerCase().replace(/\s+/g, "_");
  if (s === "expired" || s === "overdue") return "critical";
  if (
    s === "expiring" ||
    s === "expiring_soon" ||
    s === "due_soon" ||
    s === "due_30" ||
    s === "due_90"
  ) {
    return "warning";
  }
  if (s === "current" || s === "valid" || s === "active") return "success";
  if (s === "no_expiry" || s === "no_expiry_date") return "muted";
  return "muted";
}

/** Comparison report workflow status */
export function comparisonReportStatusTone(
  status: string | null | undefined,
): SemanticTone {
  switch ((status || "").toLowerCase()) {
    case "signed":
    case "filed":
      return "success";
    case "awaiting_signatures":
      return "action";
    case "under_review":
      return "info";
    case "draft":
      return "muted";
    default:
      return "muted";
  }
}

/** Occupancy */
export function occupancyTone(status: string | null | undefined): SemanticTone {
  const s = (status || "").toLowerCase();
  if (s === "occupied") return "success";
  if (s === "vacant") return "muted";
  return "muted";
}

/** Active / inactive flags */
export function activeInactiveTone(status: string | null | undefined): SemanticTone {
  const s = (status || "").toLowerCase();
  if (s === "active" || s === "true") return "success";
  if (s === "inactive" || s === "false") return "muted";
  return "muted";
}

/** Quote / invoice lifecycle */
export function quoteLifecycleTone(status: string | null | undefined): SemanticTone {
  switch ((status || "").toLowerCase()) {
    case "accepted":
    case "converted":
    case "paid":
      return "success";
    case "sent":
    case "awaiting_payment":
      return "info";
    case "customer_changes_requested":
    case "draft":
    case "partially_paid":
      return "warning";
    case "declined":
    case "void":
    case "cancelled":
    case "expired":
    case "rejected":
    case "unpaid":
      return "critical";
    case "superseded":
      return "muted";
    default:
      return "muted";
  }
}

/** Invoice payment status */
export function paymentStatusTone(status: string | null | undefined): SemanticTone {
  switch ((status || "").toLowerCase()) {
    case "paid":
      return "success";
    case "partially_paid":
      return "warning";
    case "unpaid":
      return "critical";
    default:
      return "muted";
  }
}
