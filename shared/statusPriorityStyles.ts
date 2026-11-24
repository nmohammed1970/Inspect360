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
  muted: "border-border bg-muted text-muted-foreground",
  info: "border-[color:var(--brand-info)]/30 bg-[color:var(--brand-info)]/10 text-[color:var(--brand-info)]",
  success:
    "border-[color:var(--brand-success)]/30 bg-[color:var(--brand-success)]/10 text-[color:var(--brand-success)]",
  warning:
    "border-[color:var(--brand-warning)]/50 bg-[color:var(--brand-warning)]/20 text-[color:var(--brand-slate)]",
  critical:
    "border-[color:var(--brand-critical)]/30 bg-[color:var(--brand-critical)]/10 text-[color:var(--brand-critical)]",
  action:
    "border-[color:var(--brand-warning)]/50 bg-[color:var(--brand-warning)]/20 text-[color:var(--brand-slate)]",
  primary: "border-primary/25 bg-primary/10 text-primary",
  urgent:
    "border-[color:var(--brand-critical)]/30 bg-[color:var(--brand-critical)]/10 text-[color:var(--brand-critical)]",
};

/** Solid-ish background classes for denser badges (work-order boards, etc.). */
export const SEMANTIC_TONE_SOLID_CLASS: Record<SemanticTone, string> = {
  muted: "bg-muted text-muted-foreground border-transparent",
  info: "bg-[color:var(--brand-info)]/15 text-[color:var(--brand-info)] border-transparent",
  success: "bg-[color:var(--brand-success)]/15 text-[color:var(--brand-success)] border-transparent",
  warning: "bg-[color:var(--brand-warning)]/25 text-[color:var(--brand-slate)] border-transparent",
  critical: "bg-[color:var(--brand-critical)]/15 text-[color:var(--brand-critical)] border-transparent",
  action: "bg-[color:var(--brand-warning)]/25 text-[color:var(--brand-slate)] border-transparent",
  primary: "bg-primary/15 text-primary border-transparent",
  urgent: "bg-[color:var(--brand-critical)]/15 text-[color:var(--brand-critical)] border-transparent",
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

/** Maintenance request / tenant request priority */
export function priorityTone(priority: string | null | undefined): SemanticTone {
  switch ((priority || "").toLowerCase()) {
    case "urgent":
      return "urgent";
    case "high":
      return "critical";
    case "medium":
      return "action";
    case "low":
      return "muted";
    default:
      return "muted";
  }
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
