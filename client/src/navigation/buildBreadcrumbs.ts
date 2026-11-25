import type { BreadcrumbItem, ResourceMeta } from "./types";
import {
  defaultHierarchy,
  isBreadcrumbExcluded,
  matchRoute,
  resourceKeyFromPath,
  segmentLabel,
} from "./breadcrumbRegistry";
import { getValidNavContext } from "./navContext";

export type BuildBreadcrumbsInput = {
  pathname: string;
  /** Optional search string including leading ? */
  search?: string;
  meta?: ResourceMeta;
  /** Inject trail for tests; otherwise read from sessionStorage */
  trailOverride?: ReturnType<typeof getValidNavContext>;
};

/**
 * Build breadcrumb items for the current location.
 * Priority: valid NavContext trail → hierarchy fallback from registry + meta.
 */
export function buildBreadcrumbs(input: BuildBreadcrumbsInput): BreadcrumbItem[] {
  const pathname = input.pathname.split("?")[0] || "/";
  if (isBreadcrumbExcluded(pathname)) return [];

  const meta = input.meta || {};
  const key = resourceKeyFromPath(pathname);
  const ctx =
    input.trailOverride !== undefined
      ? input.trailOverride
      : key
        ? getValidNavContext(key)
        : null;

  if (ctx && key) {
    return applyTrail(pathname, ctx, meta);
  }

  return applyLabels(defaultHierarchy(pathname, meta), meta);
}

function applyTrail(
  pathname: string,
  ctx: NonNullable<ReturnType<typeof getValidNavContext>>,
  meta: ResourceMeta,
): BreadcrumbItem[] {
  const matched = matchRoute(pathname);
  const shell = matched?.shell ?? "staff";
  const rootLabel =
    shell === "admin" ? "Admin" : shell === "tenant" ? "Home" : "Workspace";
  const rootHref =
    shell === "admin"
      ? "/admin/dashboard"
      : shell === "tenant"
        ? "/tenant/home"
        : "/dashboard";

  const crumbs: BreadcrumbItem[] = [{ label: rootLabel, href: rootHref }];

  for (const entry of ctx.trail) {
    const href =
      ctx.returnTo &&
      entry.href === (ctx.returnTo.split("?")[0] || entry.href)
        ? ctx.returnTo
        : entry.href;
    crumbs.push({ label: entry.label, href });
  }

  // Current page leaf
  const leaf = currentLeafLabel(pathname, meta);
  crumbs.push({ label: leaf, current: true });
  return crumbs;
}

function currentLeafLabel(pathname: string, meta: ResourceMeta): string {
  const matched = matchRoute(pathname);
  const params = matched?.params || {};
  if (params.propertyId) return meta.propertyName || "Property";
  if (params.blockId) return meta.blockName || "Block";
  if (params.inspectionId) {
    const nested = pathname.match(/\/(capture|review|report)$/);
    if (nested) return segmentLabel(nested[1]);
    return meta.inspectionLabel || "Inspection";
  }
  if (params.quoteId) return meta.quoteLabel || "Quote";
  if (params.invoiceId) return meta.invoiceLabel || "Invoice";
  if (params.workOrderId) return meta.workOrderLabel || "Work order";
  if (params.maintenanceRequestId) {
    return meta.maintenanceRequestLabel || "Request";
  }
  if (params.comparisonId) return meta.comparisonLabel || "Comparison";
  if (params.tenantId) return meta.tenantName || "Tenant";
  if (params.feedbackId) return meta.feedbackLabel || "Case";
  const parts = pathname.split("/").filter(Boolean);
  return segmentLabel(parts[parts.length - 1] || "Details");
}

function applyLabels(
  crumbs: BreadcrumbItem[],
  meta: ResourceMeta,
): BreadcrumbItem[] {
  // Hierarchy already used meta; ensure placeholders aren't raw UUIDs
  return crumbs.map((c) => {
    if (/^[0-9a-f-]{8,}$/i.test(c.label)) {
      return { ...c, label: "Details" };
    }
    return c;
  });
}

/**
 * Collapse middle crumbs for narrow viewports.
 * Keeps first, last parent (if any), and current — middle goes into overflow.
 */
export function collapseBreadcrumbs(
  crumbs: BreadcrumbItem[],
  maxVisible = 4,
): { visible: BreadcrumbItem[]; overflow: BreadcrumbItem[] } {
  if (crumbs.length <= maxVisible) {
    return { visible: crumbs, overflow: [] };
  }
  const first = crumbs[0];
  const current = crumbs[crumbs.length - 1];
  const parent = crumbs.length > 2 ? crumbs[crumbs.length - 2] : null;
  const overflow = crumbs.slice(1, parent ? -2 : -1);
  const visible = parent
    ? [first, { label: "…", href: undefined }, parent, current]
    : [first, { label: "…", href: undefined }, current];
  return { visible, overflow };
}

/**
 * Parent href for Back buttons — prefers returnTo from context, else hierarchy parent.
 */
export function resolveParentHref(
  pathname: string,
  meta: ResourceMeta = {},
): string | null {
  const path = pathname.split("?")[0] || "/";
  const key = resourceKeyFromPath(path);
  if (key) {
    const ctx = getValidNavContext(key);
    if (ctx?.returnTo) return ctx.returnTo;
  }
  const crumbs = defaultHierarchy(path, meta);
  for (let i = crumbs.length - 2; i >= 0; i--) {
    if (crumbs[i].href) return crumbs[i].href!;
  }
  return null;
}
