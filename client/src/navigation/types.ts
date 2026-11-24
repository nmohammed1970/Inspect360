export type BreadcrumbItem = {
  label: string;
  href?: string;
  /** True when this is the current page (not a link) */
  current?: boolean;
};

export type NavTrailEntry = {
  href: string;
  label: string;
};

export type NavContextRecord = {
  resourceKey: string;
  trail: NavTrailEntry[];
  /** Full path+search of the list/parent when navigating to detail */
  returnTo?: string;
  updatedAt: number;
};

export type ResourceMeta = {
  propertyId?: string;
  propertyName?: string;
  blockId?: string;
  blockName?: string;
  inspectionId?: string;
  inspectionLabel?: string;
  tenantId?: string;
  tenantName?: string;
  workOrderId?: string;
  workOrderLabel?: string;
  quoteId?: string;
  quoteLabel?: string;
  invoiceId?: string;
  invoiceLabel?: string;
  comparisonId?: string;
  comparisonLabel?: string;
  feedbackId?: string;
  feedbackLabel?: string;
  maintenanceRequestId?: string;
  maintenanceRequestLabel?: string;
};

export type ShellKind = "staff" | "tenant" | "admin";

export type MatchedRoute = {
  pattern: string;
  params: Record<string, string>;
  shell: ShellKind;
  /** Static segment labels for path parts that are not params */
  segmentLabels?: Record<string, string>;
};
