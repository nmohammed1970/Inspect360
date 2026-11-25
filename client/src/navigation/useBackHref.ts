import { useLocation } from "wouter";
import { resolveParentHref } from "./buildBreadcrumbs";
import { useBreadcrumbLabels } from "./useBreadcrumbLabels";

/**
 * Shared parent href for detail-page Back buttons (aligned with breadcrumbs).
 */
export function useBackHref(fallback = "/dashboard"): string {
  const [location] = useLocation();
  const pathname = location.split("?")[0] || "/";
  const meta = useBreadcrumbLabels();
  return resolveParentHref(pathname, meta) || fallback;
}
