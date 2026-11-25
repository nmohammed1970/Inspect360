import type { MatchedRoute, ResourceMeta, ShellKind, BreadcrumbItem } from "./types";

/**
 * Paths that never show breadcrumbs (auth, public tokens, onboarding, 404).
 * Documented exclusions for the app-wide breadcrumb system.
 */
export const BREADCRUMB_EXCLUSIONS: string[] = [
  "/auth",
  "/forgot-password",
  "/reset-password",
  "/tenant/login",
  "/admin/login",
  "/admin/forgot-password",
  "/admin/reset-password",
  "/pricing",
  "/public/quotes",
  "/public/invoices",
  "/public/work-orders",
  "/maintenance-feedback",
];

export function isBreadcrumbExcluded(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  if (path === "/") return false;
  return BREADCRUMB_EXCLUSIONS.some(
    (ex) => path === ex || path.startsWith(ex + "/"),
  );
}

/** Static segment → display label */
export const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  blocks: "Blocks",
  properties: "Properties",
  inspections: "Inspections",
  comparisons: "Comparisons",
  compliance: "Compliance",
  hmo: "HMO portfolio",
  rules: "Rules",
  maintenance: "Maintenance",
  finance: "Quotes & Invoicing",
  feedback: "Feedback",
  analytics: "Work orders",
  reports: "Reports",
  "asset-inventory": "Asset Inventory",
  "community-moderation": "Community",
  billing: "Billing",
  contacts: "Contacts",
  settings: "Settings",
  team: "Team",
  profile: "Profile",
  credits: "Credits",
  capture: "Capture",
  review: "Review",
  report: "Report",
  tenants: "Tenants",
  "work-orders": "Work orders",
  quotes: "Quotes",
  invoices: "Invoices",
  new: "New",
  disputes: "Disputes",
  marketplace: "Marketplace",
  pricing: "Pricing",
  "my-feedback": "My feedback",
  "inspection-templates": "Inspection templates",
  "property-history": "Property history",
  portfolio: "Portfolio",
  inventory: "Inventory",
  admin: "Admin",
  "knowledge-base": "Knowledge Base",
  extensive: "Extensive",
  modules: "Modules",
  templates: "Inspection Templates",
  "unit-pricing": "Unit Pricing",
  "billing-pricing": "Billing Catalog",
  "credit-requests": "Credit Requests",
  quotations: "Quotations",
  "feature-requests": "Feature Requests",
  tenant: "Home",
  home: "Home",
  requests: "Requests",
  "log-request": "Log request",
  communications: "Communications",
  rent: "Rent management",
  cases: "Cases",
  "comparison-reports": "Comparison reports",
  community: "Community",
  "inspection-review": "Inspection review",
  "check-in-review": "Check-in review",
};

export function segmentLabel(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (isResourceId(segment)) return "Details";
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function isResourceId(segment: string): boolean {
  return /^[0-9a-f-]{8,}$/i.test(segment);
}

/**
 * Route patterns ordered most-specific first.
 * `:param` captures a path segment.
 */
const ROUTE_PATTERNS: Array<{ pattern: string; shell: ShellKind }> = [
  // Admin
  { pattern: "/admin/feedback/feature-requests", shell: "admin" },
  { pattern: "/admin/feedback/team", shell: "admin" },
  { pattern: "/admin/feedback/:feedbackId", shell: "admin" },
  { pattern: "/admin/feedback", shell: "admin" },
  { pattern: "/admin/dashboard", shell: "admin" },
  { pattern: "/admin/team", shell: "admin" },
  { pattern: "/admin/knowledge-base", shell: "admin" },
  { pattern: "/admin/extensive", shell: "admin" },
  { pattern: "/admin/modules", shell: "admin" },
  { pattern: "/admin/templates", shell: "admin" },
  { pattern: "/admin/unit-pricing", shell: "admin" },
  { pattern: "/admin/billing-pricing", shell: "admin" },
  { pattern: "/admin/credit-requests", shell: "admin" },
  { pattern: "/admin/quotations", shell: "admin" },

  // Tenant
  { pattern: "/tenant/comparison-reports/:comparisonId", shell: "tenant" },
  { pattern: "/tenant/comparison-reports", shell: "tenant" },
  { pattern: "/tenant/inspections/:inspectionId/capture", shell: "tenant" },
  { pattern: "/tenant/inspections", shell: "tenant" },
  { pattern: "/tenant/inspection-review/:inspectionId", shell: "tenant" },
  { pattern: "/tenant/check-in-review/:inspectionId", shell: "tenant" },
  { pattern: "/tenant/maintenance", shell: "tenant" },
  { pattern: "/tenant/log-request", shell: "tenant" },
  { pattern: "/tenant/requests/new", shell: "tenant" },
  { pattern: "/tenant/requests/:caseId", shell: "tenant" },
  { pattern: "/tenant/requests", shell: "tenant" },
  { pattern: "/tenant/community", shell: "tenant" },
  { pattern: "/tenant/profile", shell: "tenant" },
  { pattern: "/tenant/rent", shell: "tenant" },
  { pattern: "/tenant/home", shell: "tenant" },

  // Staff nested
  { pattern: "/work-orders/:workOrderId/quotes/new", shell: "staff" },
  { pattern: "/work-orders/:workOrderId/quotes/:quoteId", shell: "staff" },
  { pattern: "/work-orders/:workOrderId/invoices/new", shell: "staff" },
  { pattern: "/work-orders/:workOrderId/invoices/:invoiceId", shell: "staff" },
  { pattern: "/maintenance/work-orders/:workOrderId", shell: "staff" },
  { pattern: "/maintenance/feedback", shell: "staff" },
  { pattern: "/maintenance/finance", shell: "staff" },
  { pattern: "/maintenance/:maintenanceRequestId", shell: "staff" },
  { pattern: "/maintenance", shell: "staff" },
  { pattern: "/inspections/:inspectionId/capture", shell: "staff" },
  { pattern: "/inspections/:inspectionId/review", shell: "staff" },
  { pattern: "/inspections/:inspectionId/report", shell: "staff" },
  { pattern: "/inspections/:inspectionId", shell: "staff" },
  { pattern: "/inspections", shell: "staff" },
  { pattern: "/properties/:propertyId/tenants", shell: "staff" },
  { pattern: "/properties/:propertyId", shell: "staff" },
  { pattern: "/properties", shell: "staff" },
  { pattern: "/blocks/:blockId/tenants", shell: "staff" },
  { pattern: "/blocks/:blockId", shell: "staff" },
  { pattern: "/blocks", shell: "staff" },
  { pattern: "/tenants/:tenantId", shell: "staff" },
  { pattern: "/comparisons/:comparisonId", shell: "staff" },
  { pattern: "/comparisons", shell: "staff" },
  { pattern: "/feedback/:feedbackId", shell: "staff" },
  { pattern: "/feedback", shell: "staff" },
  { pattern: "/reports/inspections", shell: "staff" },
  { pattern: "/reports/blocks", shell: "staff" },
  { pattern: "/reports/properties", shell: "staff" },
  { pattern: "/reports/tenants", shell: "staff" },
  { pattern: "/reports/inventory", shell: "staff" },
  { pattern: "/reports/compliance", shell: "staff" },
  { pattern: "/reports/portfolio", shell: "staff" },
  { pattern: "/reports/property-history", shell: "staff" },
  { pattern: "/reports", shell: "staff" },
  { pattern: "/hmo/rules", shell: "staff" },
  { pattern: "/hmo", shell: "staff" },
  { pattern: "/communications/cases/new", shell: "staff" },
  { pattern: "/communications/cases/:caseId", shell: "staff" },
  { pattern: "/communications/analytics", shell: "staff" },
  { pattern: "/communications/settings", shell: "staff" },
  { pattern: "/communications", shell: "staff" },
  { pattern: "/rent", shell: "staff" },
  { pattern: "/compliance", shell: "staff" },
  { pattern: "/analytics", shell: "staff" },
  { pattern: "/asset-inventory", shell: "staff" },
  { pattern: "/contacts", shell: "staff" },
  { pattern: "/team", shell: "staff" },
  { pattern: "/settings", shell: "staff" },
  { pattern: "/billing", shell: "staff" },
  { pattern: "/credits", shell: "staff" },
  { pattern: "/profile", shell: "staff" },
  { pattern: "/community-moderation", shell: "staff" },
  { pattern: "/disputes", shell: "staff" },
  { pattern: "/marketplace", shell: "staff" },
  { pattern: "/inspection-templates", shell: "staff" },
  { pattern: "/my-feedback", shell: "staff" },
  { pattern: "/dashboard", shell: "staff" },
];

function matchPattern(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    const vp = pathParts[i];
    if (pp.startsWith(":")) {
      params[pp.slice(1)] = vp;
    } else if (pp !== vp) {
      return null;
    }
  }
  return params;
}

export function matchRoute(pathname: string): MatchedRoute | null {
  const path = pathname.split("?")[0] || "/";
  if (path === "/" || path === "") {
    return { pattern: "/dashboard", params: {}, shell: "staff" };
  }
  for (const { pattern, shell } of ROUTE_PATTERNS) {
    const params = matchPattern(pattern, path);
    if (params) {
      return { pattern, params, shell };
    }
  }
  return null;
}

/** Allowed parent list roots for trail validation */
export const ALLOWED_PARENT_PREFIXES = [
  "/dashboard",
  "/properties",
  "/blocks",
  "/inspections",
  "/maintenance",
  "/analytics",
  "/compliance",
  "/hmo",
  "/communications",
  "/comparisons",
  "/contacts",
  "/reports",
  "/feedback",
  "/asset-inventory",
  "/tenant",
  "/admin",
  "/work-orders",
];

export function isAllowedParentHref(href: string): boolean {
  const path = href.split("?")[0] || "";
  return ALLOWED_PARENT_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
}

/**
 * Hierarchy fallback when NavContext trail is missing.
 * Uses resource meta for human labels where available.
 */
export function defaultHierarchy(
  pathname: string,
  meta: ResourceMeta = {},
): BreadcrumbItem[] {
  const path = pathname.split("?")[0] || "/";
  const matched = matchRoute(path);
  const shell = matched?.shell ?? "staff";
  const rootLabel = shell === "admin" ? "Admin" : shell === "tenant" ? "Home" : "Workspace";
  const rootHref =
    shell === "admin"
      ? "/admin/dashboard"
      : shell === "tenant"
        ? "/tenant/home"
        : "/dashboard";

  if (path === "/" || path === "/dashboard") {
    if (shell === "tenant") {
      return [{ label: "Home", current: true }];
    }
    return [
      { label: rootLabel, href: rootHref },
      { label: "Dashboard", current: true },
    ];
  }

  if (shell === "admin") {
    return buildAdminHierarchy(path, matched?.params ?? {}, meta);
  }
  if (shell === "tenant") {
    return buildTenantHierarchy(path, matched?.params ?? {}, meta);
  }
  return buildStaffHierarchy(path, matched?.params ?? {}, meta, rootLabel, rootHref);
}

function buildStaffHierarchy(
  path: string,
  params: Record<string, string>,
  meta: ResourceMeta,
  rootLabel: string,
  rootHref: string,
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: rootLabel, href: rootHref }];

  if (params.propertyId) {
    if (meta.blockId && meta.blockName) {
      crumbs.push({ label: "Blocks", href: "/blocks" });
      crumbs.push({
        label: meta.blockName,
        href: `/blocks/${meta.blockId}`,
      });
    } else {
      crumbs.push({ label: "Properties", href: "/properties" });
    }
    const propLabel = meta.propertyName || "Property";
    const isTenants = path.endsWith("/tenants");
    crumbs.push({
      label: propLabel,
      href: isTenants ? `/properties/${params.propertyId}` : undefined,
      current: !isTenants,
    });
    if (isTenants) {
      crumbs.push({ label: "Tenants", current: true });
    }
    return finalizeCurrent(crumbs);
  }

  if (params.blockId) {
    crumbs.push({ label: "Blocks", href: "/blocks" });
    const blockLabel = meta.blockName || "Block";
    const isTenants = path.endsWith("/tenants");
    crumbs.push({
      label: blockLabel,
      href: isTenants ? `/blocks/${params.blockId}` : undefined,
      current: !isTenants,
    });
    if (isTenants) crumbs.push({ label: "Tenants", current: true });
    return finalizeCurrent(crumbs);
  }

  if (params.inspectionId) {
    crumbs.push({ label: "Inspections", href: "/inspections" });
    const inspLabel = meta.inspectionLabel || "Inspection";
    const nested = path.match(/\/(capture|review|report)$/);
    crumbs.push({
      label: inspLabel,
      href: nested ? `/inspections/${params.inspectionId}` : undefined,
      current: !nested,
    });
    if (nested) {
      crumbs.push({ label: segmentLabel(nested[1]), current: true });
    }
    return finalizeCurrent(crumbs);
  }

  if (params.workOrderId) {
    crumbs.push({ label: "Maintenance", href: "/maintenance" });
    const woLabel = meta.workOrderLabel || "Work order";
    const quoteNew = path.endsWith("/quotes/new");
    const invoiceNew = path.endsWith("/invoices/new");
    const quoteId = params.quoteId;
    const invoiceId = params.invoiceId;
    const woHref = `/maintenance/work-orders/${params.workOrderId}`;
    crumbs.push({
      label: woLabel,
      href: quoteNew || invoiceNew || quoteId || invoiceId ? woHref : undefined,
      current: !(quoteNew || invoiceNew || quoteId || invoiceId),
    });
    if (quoteNew) crumbs.push({ label: "New quote", current: true });
    else if (invoiceNew) crumbs.push({ label: "New invoice", current: true });
    else if (quoteId) {
      crumbs.push({ label: meta.quoteLabel || "Quote", current: true });
    } else if (invoiceId) {
      crumbs.push({ label: meta.invoiceLabel || "Invoice", current: true });
    }
    return finalizeCurrent(crumbs);
  }

  if (params.maintenanceRequestId) {
    crumbs.push({ label: "Maintenance", href: "/maintenance" });
    crumbs.push({
      label: meta.maintenanceRequestLabel || "Request",
      current: true,
    });
    return finalizeCurrent(crumbs);
  }

  if (params.comparisonId) {
    crumbs.push({ label: "Comparisons", href: "/comparisons" });
    crumbs.push({
      label: meta.comparisonLabel || "Comparison",
      current: true,
    });
    return finalizeCurrent(crumbs);
  }

  if (params.tenantId) {
    crumbs.push({ label: "Properties", href: "/properties" });
    crumbs.push({ label: meta.tenantName || "Tenant", current: true });
    return finalizeCurrent(crumbs);
  }

  if (params.feedbackId) {
    crumbs.push({ label: "Feedback", href: "/feedback" });
    crumbs.push({ label: meta.feedbackLabel || "Case", current: true });
    return finalizeCurrent(crumbs);
  }

  // Generic path walk for static staff routes
  const parts = path.split("/").filter(Boolean);
  parts.forEach((seg, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    const isLast = i === parts.length - 1;
    crumbs.push({
      label: segmentLabel(seg),
      href: isLast ? undefined : href,
      current: isLast,
    });
  });
  return finalizeCurrent(crumbs);
}

function buildTenantHierarchy(
  path: string,
  params: Record<string, string>,
  meta: ResourceMeta,
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/tenant/home" }];

  if (params.comparisonId) {
    crumbs.push({
      label: "Comparison reports",
      href: "/tenant/comparison-reports",
    });
    crumbs.push({
      label: meta.comparisonLabel || "Report",
      current: true,
    });
    return finalizeCurrent(crumbs);
  }

  if (params.inspectionId) {
    if (path.includes("/capture")) {
      crumbs.push({ label: "Inspections", href: "/tenant/inspections" });
      crumbs.push({
        label: meta.inspectionLabel || "Inspection",
        href: `/tenant/inspections`,
      });
      crumbs.push({ label: "Capture", current: true });
    } else {
      crumbs.push({ label: "Inspection review", current: true });
    }
    return finalizeCurrent(crumbs);
  }

  const parts = path.split("/").filter(Boolean).slice(1); // drop "tenant"
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "home")) {
    return [{ label: "Home", current: true }];
  }
  parts.forEach((seg, i) => {
    const href = "/tenant/" + parts.slice(0, i + 1).join("/");
    const isLast = i === parts.length - 1;
    crumbs.push({
      label: segmentLabel(seg),
      href: isLast ? undefined : href,
      current: isLast,
    });
  });
  return finalizeCurrent(crumbs);
}

function buildAdminHierarchy(
  path: string,
  params: Record<string, string>,
  meta: ResourceMeta,
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [
    { label: "Dashboard", href: "/admin/dashboard" },
  ];

  if (path === "/admin/dashboard") {
    return [{ label: "Dashboard", current: true }];
  }

  if (params.feedbackId) {
    crumbs.push({ label: "Feedback", href: "/admin/feedback" });
    crumbs.push({ label: meta.feedbackLabel || "Case", current: true });
    return finalizeCurrent(crumbs);
  }

  if (path.startsWith("/admin/feedback/")) {
    crumbs.push({ label: "Feedback", href: "/admin/feedback" });
    const tail = path.replace("/admin/feedback/", "");
    crumbs.push({ label: segmentLabel(tail), current: true });
    return finalizeCurrent(crumbs);
  }

  const parts = path.split("/").filter(Boolean).slice(1); // drop admin
  parts.forEach((seg, i) => {
    const href = "/admin/" + parts.slice(0, i + 1).join("/");
    const isLast = i === parts.length - 1;
    crumbs.push({
      label: segmentLabel(seg),
      href: isLast ? undefined : href,
      current: isLast,
    });
  });
  return finalizeCurrent(crumbs);
}

function finalizeCurrent(crumbs: BreadcrumbItem[]): BreadcrumbItem[] {
  if (crumbs.length === 0) return crumbs;
  const last = crumbs[crumbs.length - 1];
  if (!last.current) {
    crumbs[crumbs.length - 1] = { ...last, href: undefined, current: true };
  }
  return crumbs;
}

/** Resource key for NavContext, e.g. property:uuid */
export function resourceKeyFromPath(pathname: string): string | null {
  const matched = matchRoute(pathname.split("?")[0] || "/");
  if (!matched) return null;
  const p = matched.params;
  if (p.propertyId) return `property:${p.propertyId}`;
  if (p.blockId) return `block:${p.blockId}`;
  if (p.inspectionId) return `inspection:${p.inspectionId}`;
  if (p.workOrderId) {
    if (p.quoteId) return `quote:${p.quoteId}`;
    if (p.invoiceId) return `invoice:${p.invoiceId}`;
    return `workOrder:${p.workOrderId}`;
  }
  if (p.maintenanceRequestId) return `maintenance:${p.maintenanceRequestId}`;
  if (p.comparisonId) return `comparison:${p.comparisonId}`;
  if (p.tenantId) return `tenant:${p.tenantId}`;
  if (p.feedbackId) return `feedback:${p.feedbackId}`;
  return null;
}
