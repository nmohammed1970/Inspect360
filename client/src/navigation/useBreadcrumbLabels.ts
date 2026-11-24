import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { ResourceMeta } from "./types";
import { matchRoute } from "./breadcrumbRegistry";

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/**
 * Resolve human labels for dynamic route params via existing React Query keys.
 */
export function useBreadcrumbLabels(): ResourceMeta {
  const [location] = useLocation();
  const pathname = location.split("?")[0] || "/";
  const matched = matchRoute(pathname);
  const params = matched?.params || {};

  const propertyId = params.propertyId;
  const blockId = params.blockId;
  const inspectionId = params.inspectionId;
  const workOrderId = params.workOrderId;
  const comparisonId = params.comparisonId;
  const feedbackId = params.feedbackId;
  const maintenanceRequestId = params.maintenanceRequestId;
  const tenantId = params.tenantId;
  const quoteId = params.quoteId;
  const invoiceId = params.invoiceId;

  const { data: property } = useQuery({
    queryKey: ["/api/properties", propertyId],
    queryFn: () => fetchJson(`/api/properties/${propertyId}`),
    enabled: !!propertyId,
    staleTime: 30_000,
  });

  const blockIdFromProperty = property?.blockId as string | undefined;
  const resolvedBlockId = blockId || blockIdFromProperty;

  const { data: block } = useQuery({
    queryKey: ["/api/blocks", resolvedBlockId],
    queryFn: () => fetchJson(`/api/blocks/${resolvedBlockId}`),
    enabled: !!resolvedBlockId && !property?.blockName,
    staleTime: 30_000,
  });

  const { data: inspection } = useQuery({
    queryKey: ["/api/inspections", inspectionId],
    queryFn: () => fetchJson(`/api/inspections/${inspectionId}`),
    enabled: !!inspectionId,
    staleTime: 30_000,
  });

  const { data: workOrder } = useQuery({
    queryKey: ["/api/work-orders", workOrderId],
    queryFn: () => fetchJson(`/api/work-orders/${workOrderId}`),
    enabled: !!workOrderId,
    staleTime: 30_000,
  });

  const { data: comparison } = useQuery({
    queryKey: ["/api/comparison-reports", comparisonId],
    queryFn: () => fetchJson(`/api/comparison-reports/${comparisonId}`),
    enabled: !!comparisonId,
    staleTime: 30_000,
  });

  const { data: feedback } = useQuery({
    queryKey: ["/api/feedback", feedbackId],
    queryFn: () => fetchJson(`/api/feedback/${feedbackId}`),
    enabled: !!feedbackId && !pathname.startsWith("/admin"),
    staleTime: 30_000,
  });

  const { data: adminFeedback } = useQuery({
    queryKey: ["/api/admin/feedback", feedbackId],
    queryFn: () => fetchJson(`/api/admin/feedback/${feedbackId}`),
    enabled: !!feedbackId && pathname.startsWith("/admin"),
    staleTime: 30_000,
  });

  const { data: maintenanceRequest } = useQuery({
    queryKey: ["/api/maintenance", maintenanceRequestId],
    queryFn: () => fetchJson(`/api/maintenance/${maintenanceRequestId}`),
    enabled: !!maintenanceRequestId,
    staleTime: 30_000,
  });

  const { data: tenant } = useQuery({
    queryKey: ["/api/tenants", tenantId],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}`),
    enabled: !!tenantId,
    staleTime: 30_000,
  });

  const meta: ResourceMeta = {};

  if (propertyId) {
    meta.propertyId = propertyId;
    meta.propertyName = property?.name || undefined;
    meta.blockId = property?.blockId || blockIdFromProperty;
    meta.blockName =
      property?.blockName || block?.name || undefined;
  }

  if (blockId) {
    meta.blockId = blockId;
    meta.blockName = block?.name || meta.blockName;
  }

  if (inspectionId) {
    meta.inspectionId = inspectionId;
    const propName =
      inspection?.property?.name || inspection?.block?.name || null;
    const type = inspection?.type
      ? String(inspection.type).replace(/_/g, " ")
      : null;
    meta.inspectionLabel = propName
      ? type
        ? `${propName} (${type})`
        : propName
      : type
        ? type.charAt(0).toUpperCase() + type.slice(1)
        : undefined;
  }

  if (workOrderId) {
    meta.workOrderId = workOrderId;
    meta.workOrderLabel =
      workOrder?.maintenanceRequest?.title ||
      workOrder?.title ||
      undefined;
  }

  if (quoteId) {
    meta.quoteId = quoteId;
    meta.quoteLabel = "Quote";
  }
  if (invoiceId) {
    meta.invoiceId = invoiceId;
    meta.invoiceLabel = "Invoice";
  }

  if (comparisonId) {
    meta.comparisonId = comparisonId;
    meta.comparisonLabel =
      comparison?.title || comparison?.name || undefined;
  }

  if (feedbackId) {
    meta.feedbackId = feedbackId;
    const fb = feedback || adminFeedback;
    meta.feedbackLabel =
      fb?.subject || fb?.title || fb?.summary || undefined;
  }

  if (maintenanceRequestId) {
    meta.maintenanceRequestId = maintenanceRequestId;
    meta.maintenanceRequestLabel = maintenanceRequest?.title || undefined;
  }

  if (tenantId) {
    meta.tenantId = tenantId;
    const name = [tenant?.firstName, tenant?.lastName]
      .filter(Boolean)
      .join(" ");
    meta.tenantName = name || tenant?.email || undefined;
  }

  return meta;
}
