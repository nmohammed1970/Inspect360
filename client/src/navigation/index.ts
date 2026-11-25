export type { BreadcrumbItem, ResourceMeta, NavContextRecord, ShellKind } from "./types";
export {
  BREADCRUMB_EXCLUSIONS,
  isBreadcrumbExcluded,
  matchRoute,
  defaultHierarchy,
  resourceKeyFromPath,
  segmentLabel,
  SEGMENT_LABELS,
} from "./breadcrumbRegistry";
export {
  buildBreadcrumbs,
  collapseBreadcrumbs,
  resolveParentHref,
} from "./buildBreadcrumbs";
export {
  recordNavigationToDetail,
  getValidNavContext,
  setNavContext,
  clearNavContext,
} from "./navContext";
export { useBreadcrumbLabels } from "./useBreadcrumbLabels";
export { useBackHref } from "./useBackHref";
export { AppBreadcrumbs, StaffBreadcrumbs } from "./AppBreadcrumbs";
export { ContextualLink, navigateWithContext } from "./ContextualLink";
