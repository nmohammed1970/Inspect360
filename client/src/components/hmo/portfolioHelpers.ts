import { formatHmoDate } from "@/components/hmo/hmoLabels";

export type PortfolioProfile = {
  propertyId: string;
  overallStatus: string | null;
  evidenceCompleteness: number | null;
  lastAssessedAt?: string | null;
  address?: string | null;
  name?: string | null;
  borough?: string | null;
  expiryDate?: string | null;
  licenceStatus?: string | null;
  licenceEvidenceStatus?: string | null;
  hmoClassification?: string | null;
  maxPersons?: number | null;
  occupantsNow?: number | null;
  occupancyMismatch?: boolean;
  licenceEvidenceMissing?: boolean;
  missingSafetyDoc?: boolean;
  hmoInspectionDueSoon?: boolean;
  hmoInspectionMissed?: boolean;
  hmoInspectionOverdue?: boolean;
  nextHmoInspectionDate?: string | null;
  lastHmoInspectionDate?: string | null;
  alertCount?: number;
  alertSeverity?: string | null;
  alertProblem?: string | null;
  ruleSourceLabel?: string | null;
  authorityName?: string | null;
  nextAction?: string | null;
  managerName?: string | null;
  holderName?: string | null;
  urgentCount?: number;
  highCount?: number;
  mediumCount?: number;
  openFindingCount?: number;
};

export type QuickFilter = "all" | "action" | "urgent" | "upcoming" | "verify";
export type SortMode = "priority" | "due" | "name";

export type PriorityStatus = {
  text: string;
  cls: "urgent" | "action" | "soon" | "verify" | "clear";
  rank: number;
};

const MS_DAY = 24 * 60 * 60 * 1000;

export function daysUntil(iso: string | null | undefined, asOf = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((t - asOf) / MS_DAY);
}

export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "Not recorded";
  return formatHmoDate(String(iso));
}

export function displayAddress(p: PortfolioProfile): string {
  return (p.address || p.name || "Property").trim();
}

export function displayCouncil(p: PortfolioProfile): string {
  return (p.authorityName || p.borough || "").trim();
}

export function isLicenceExpired(p: PortfolioProfile, asOf = Date.now()): boolean {
  if (!p.expiryDate) return false;
  const status = String(p.licenceStatus || "").toUpperCase();
  if (status === "EXPIRED_DOCUMENT") return true;
  const d = daysUntil(p.expiryDate, asOf);
  return d != null && d < 0;
}

export function isLicenceVerified(p: PortfolioProfile): boolean {
  const evidence = String(p.licenceEvidenceStatus || "").toUpperCase();
  const status = String(p.licenceStatus || "").toUpperCase();
  if (evidence === "ISSUED" || evidence === "NOT_REQUIRED") return true;
  if (status === "CURRENT" || status === "EXPIRED_DOCUMENT" || status === "RENEWAL_PENDING_EVIDENCE") {
    return true;
  }
  return Boolean(p.expiryDate) && !p.licenceEvidenceMissing;
}

export function needsVerify(p: PortfolioProfile): boolean {
  if (p.licenceEvidenceMissing) return true;
  const evidence = String(p.licenceEvidenceStatus || "").toUpperCase();
  const status = String(p.licenceStatus || "").toUpperCase();
  if (evidence === "UNKNOWN" || evidence === "REQUIRED_MISSING") return true;
  if (status === "UNDER_REVIEW" || status === "DRAFT") return true;
  if (!p.lastHmoInspectionDate && !p.lastAssessedAt) return true;
  if (p.maxPersons == null && (p.hmoClassification === "HMO" || p.hmoClassification === "UNSURE")) {
    return true;
  }
  if (!p.overallStatus || p.overallStatus === "NOT_ASSESSED") return true;
  return false;
}

export function isUrgent(p: PortfolioProfile): boolean {
  if ((p.urgentCount || 0) > 0) return true;
  if (p.overallStatus === "CRITICAL_EXCEPTION") return true;
  if (String(p.alertSeverity || "").toUpperCase() === "CRITICAL") return true;
  return false;
}

export function inspectionOverdue(p: PortfolioProfile): boolean {
  return Boolean(p.hmoInspectionOverdue || p.hmoInspectionMissed);
}

export function isAction(p: PortfolioProfile, asOf = Date.now()): boolean {
  if (isUrgent(p)) return true;
  if (p.overallStatus === "ACTION_REQUIRED" || p.overallStatus === "CRITICAL_EXCEPTION") return true;
  if ((p.openFindingCount || p.alertCount || 0) > 0) return true;
  if (p.occupancyMismatch) return true;
  if (isLicenceExpired(p, asOf)) return true;
  if (inspectionOverdue(p)) return true;
  return false;
}

export function dueItems(
  p: PortfolioProfile,
  asOf = Date.now(),
): Array<{ type: string; date: string }> {
  const items: Array<{ type: string; date: string }> = [];
  if (p.expiryDate && isLicenceVerified(p)) {
    const d = daysUntil(p.expiryDate, asOf);
    if (d != null && d >= 0) items.push({ type: "Licence expiry", date: p.expiryDate });
  }
  if (p.nextHmoInspectionDate) {
    const d = daysUntil(p.nextHmoInspectionDate, asOf);
    if (d != null && d >= 0) {
      items.push({ type: "HMO inspection", date: p.nextHmoInspectionDate });
    }
  }
  return items;
}

export function hasUpcoming(p: PortfolioProfile, windowDays: number, asOf = Date.now()): boolean {
  return dueItems(p, asOf).some((i) => {
    const d = daysUntil(i.date, asOf);
    return d != null && d <= windowDays;
  });
}

export function nextDeadlineIso(p: PortfolioProfile, asOf = Date.now()): string | null {
  const items = dueItems(p, asOf);
  if (!items.length) {
    if (p.expiryDate && isLicenceExpired(p, asOf)) return p.expiryDate;
    if (p.nextHmoInspectionDate && inspectionOverdue(p)) return p.nextHmoInspectionDate;
    return null;
  }
  return items.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
    .date;
}

export function priorityStatus(
  p: PortfolioProfile,
  windowDays: number,
  asOf = Date.now(),
): PriorityStatus {
  if (isUrgent(p)) return { text: "Urgent", cls: "urgent", rank: 5 };
  if (isAction(p, asOf)) return { text: "Action needed", cls: "action", rank: 4 };
  if (needsVerify(p)) return { text: "Verify data", cls: "verify", rank: 3 };
  if (hasUpcoming(p, windowDays, asOf)) return { text: "Coming up", cls: "soon", rank: 2 };
  return { text: "No exceptions", cls: "clear", rank: 1 };
}

export function matchesQuick(
  p: PortfolioProfile,
  quick: QuickFilter,
  windowDays: number,
  asOf = Date.now(),
): boolean {
  if (quick === "action") return isAction(p, asOf);
  if (quick === "urgent") return isUrgent(p);
  if (quick === "upcoming") return hasUpcoming(p, windowDays, asOf);
  if (quick === "verify") return needsVerify(p);
  return true;
}

export function sortProfiles(
  rows: PortfolioProfile[],
  sort: SortMode,
  windowDays: number,
  asOf = Date.now(),
): PortfolioProfile[] {
  const copy = rows.slice();
  if (sort === "name") {
    return copy.sort((a, b) => displayAddress(a).localeCompare(displayAddress(b)));
  }
  if (sort === "due") {
    return copy.sort((a, b) => {
      const ad = nextDeadlineIso(a, asOf);
      const bd = nextDeadlineIso(b, asOf);
      const av = ad ? daysUntil(ad, asOf) ?? 9999 : 9999;
      const bv = bd ? daysUntil(bd, asOf) ?? 9999 : 9999;
      return av - bv;
    });
  }
  return copy.sort((a, b) => {
    const ra = priorityStatus(a, windowDays, asOf).rank;
    const rb = priorityStatus(b, windowDays, asOf).rank;
    if (rb !== ra) return rb - ra;
    const ad = nextDeadlineIso(a, asOf);
    const bd = nextDeadlineIso(b, asOf);
    const av = ad ? daysUntil(ad, asOf) ?? 9999 : 9999;
    const bv = bd ? daysUntil(bd, asOf) ?? 9999 : 9999;
    return av - bv;
  });
}

export function suggestedNextAction(p: PortfolioProfile, asOf = Date.now()): string {
  if (p.nextAction?.trim()) return p.nextAction.trim();
  if (p.alertProblem?.trim()) return p.alertProblem.trim();
  if (isUrgent(p)) return "Review urgent inspection findings";
  if (inspectionOverdue(p)) return "Book overdue HMO inspection";
  if (isLicenceExpired(p, asOf)) return "Confirm current licence position";
  if (p.occupancyMismatch) return "Investigate occupancy exception";
  if (needsVerify(p)) return "Confirm licence and inspection records";
  if (hasUpcoming(p, 30, asOf)) {
    const next = dueItems(p, asOf)[0];
    if (next?.type === "Licence expiry") return "Review licence renewal progress";
    return "Prepare upcoming HMO inspection";
  }
  return "No immediate HMO exceptions";
}

export const priorityPillClass: Record<PriorityStatus["cls"], string> = {
  urgent: "text-[#b93b4a] bg-[#fff0f1]",
  action: "text-[#a56b16] bg-[#fff2de]",
  soon: "text-[#856613] bg-[#fff8e8]",
  verify: "text-[#417c98] bg-[#eaf5fa]",
  clear: "text-[#00877a] bg-[#e8f8f3]",
};
