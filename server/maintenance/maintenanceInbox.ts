import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { listOrganizationExpiredDocuments } from "../teamDocumentExpiry";
import { formatExpiryLongDate } from "../teamDocumentExpiryLogic";
import {
  maintenanceQuotes,
  maintenanceRequestMessages,
  maintenanceRequests,
  workOrders,
  users,
} from "@shared/schema";

export type MaintenanceInboxKind =
  | "tenant_request"
  | "inspector_request"
  | "quote"
  | "tenant_message"
  | "expired_document";

export type MaintenanceInboxItem = {
  id: string;
  kind: MaintenanceInboxKind;
  title: string;
  subtitle: string;
  createdAt: string;
  href: string;
  meta?: {
    priority?: string | null;
    quoteReference?: string | null;
    source?: string | null;
    messagePreview?: string | null;
    status?: string | null;
  };
};

const FEED_CAP = 20;

const INSPECTOR_SOURCES = new Set([
  "inspection",
  "manual",
  "hmo_finding",
  "routine",
]);

function iso(d: Date | string | null | undefined): string {
  if (!d) return new Date(0).toISOString();
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function locationLabel(m: any): string {
  return (
    [m.property?.name, m.block?.name].filter(Boolean).join(" · ") ||
    m.property?.address ||
    "No location"
  );
}

function isWorkOrderAssigned(wo: {
  assignedToId?: string | null;
  contractorId?: string | null;
}): boolean {
  return Boolean(wo.assignedToId || wo.contractorId);
}

/**
 * Unified New Requests feed for owner / maintenance_admin dashboards.
 * Assigned requests / work orders drop out of this queue.
 */
export async function buildMaintenanceInbox(input: {
  organizationId: string;
  filterBlockId?: string;
  filterPropertyId?: string;
}): Promise<{ items: MaintenanceInboxItem[]; count: number }> {
  const [allMaintenance, allProperties, quoteRows, workOrderRows] = await Promise.all([
    storage.getMaintenanceByOrganization(input.organizationId),
    storage.getPropertiesByOrganization(input.organizationId),
    db
      .select({
        id: maintenanceQuotes.id,
        workOrderId: maintenanceQuotes.workOrderId,
        quoteReference: maintenanceQuotes.quoteReference,
        status: maintenanceQuotes.status,
        updatedAt: maintenanceQuotes.updatedAt,
        sentAt: maintenanceQuotes.sentAt,
        createdAt: maintenanceQuotes.createdAt,
        mrPropertyId: maintenanceRequests.propertyId,
        mrBlockId: maintenanceRequests.blockId,
        woAssignedToId: workOrders.assignedToId,
        woContractorId: workOrders.contractorId,
      })
      .from(maintenanceQuotes)
      .innerJoin(workOrders, eq(maintenanceQuotes.workOrderId, workOrders.id))
      .innerJoin(
        maintenanceRequests,
        eq(workOrders.maintenanceRequestId, maintenanceRequests.id),
      )
      .where(
        and(
          eq(maintenanceQuotes.organizationId, input.organizationId),
          inArray(maintenanceQuotes.status, [
            "sent",
            "customer_changes_requested",
            "accepted",
          ]),
        ),
      )
      .orderBy(desc(maintenanceQuotes.updatedAt)),
    db
      .select({
        id: workOrders.id,
        maintenanceRequestId: workOrders.maintenanceRequestId,
        assignedToId: workOrders.assignedToId,
        contractorId: workOrders.contractorId,
      })
      .from(workOrders)
      .where(eq(workOrders.organizationId, input.organizationId)),
  ]);

  let maintenance = allMaintenance as any[];
  let quotes = quoteRows;

  if (input.filterPropertyId) {
    maintenance = maintenance.filter((m) => m.propertyId === input.filterPropertyId);
    quotes = quotes.filter((q) => q.mrPropertyId === input.filterPropertyId);
  } else if (input.filterBlockId) {
    const blockPropertyIds = new Set(
      allProperties
        .filter((p: any) => p.blockId === input.filterBlockId)
        .map((p: any) => p.id),
    );
    maintenance = maintenance.filter(
      (m) =>
        m.blockId === input.filterBlockId ||
        (m.propertyId && blockPropertyIds.has(m.propertyId)),
    );
    quotes = quotes.filter(
      (q) =>
        q.mrBlockId === input.filterBlockId ||
        (q.mrPropertyId && blockPropertyIds.has(q.mrPropertyId)),
    );
  }

  const mrsWithAssignedWorkOrder = new Set<string>();
  for (const wo of workOrderRows) {
    if (!wo.maintenanceRequestId || !isWorkOrderAssigned(wo)) continue;
    mrsWithAssignedWorkOrder.add(wo.maintenanceRequestId);
  }

  const isRequestAssigned = (m: any) =>
    Boolean(m.assignedTo) || mrsWithAssignedWorkOrder.has(m.id);

  // Only unassigned open requests belong in New Requests.
  const openMaintenance = maintenance.filter(
    (m) => m.status === "open" && !isRequestAssigned(m),
  );
  // Tenant discussion noise for already-assigned jobs should leave the dashboard too.
  const activeForMessages = maintenance.filter(
    (m) =>
      (m.status === "open" || m.status === "in_progress") && !isRequestAssigned(m),
  );
  const activeIds = activeForMessages.map((m) => m.id);

  const items: MaintenanceInboxItem[] = [];

  for (const m of openMaintenance) {
    if (m.source === "tenant_portal") {
      items.push({
        id: `tenant_request:${m.id}`,
        kind: "tenant_request",
        title: m.title || "Tenant maintenance request",
        subtitle: locationLabel(m),
        createdAt: iso(m.createdAt),
        href: "/maintenance",
        meta: {
          priority: m.priority,
          source: m.source,
          status: m.status,
        },
      });
    } else if (INSPECTOR_SOURCES.has(m.source || "manual")) {
      items.push({
        id: `inspector_request:${m.id}`,
        kind: "inspector_request",
        title: m.title || "Maintenance request",
        subtitle: `${locationLabel(m)} · ${String(m.source || "manual").replace(/_/g, " ")}`,
        createdAt: iso(m.createdAt),
        href: "/maintenance",
        meta: {
          priority: m.priority,
          source: m.source,
          status: m.status,
        },
      });
    }
  }

  for (const q of quotes) {
    // Quote rows on an already-assigned work order leave New Requests.
    if (isWorkOrderAssigned({ assignedToId: q.woAssignedToId, contractorId: q.woContractorId })) {
      continue;
    }
    const statusLabel =
      q.status === "accepted"
        ? "Accepted — ready to convert"
        : q.status === "customer_changes_requested"
          ? "Customer requested changes"
          : "Awaiting customer response";
    items.push({
      id: `quote:${q.id}`,
      kind: "quote",
      title: q.quoteReference || "Quotation",
      subtitle: statusLabel,
      createdAt: iso(q.updatedAt || q.sentAt || q.createdAt),
      href: `/work-orders/${q.workOrderId}/quotes/${q.id}`,
      meta: {
        quoteReference: q.quoteReference,
        status: q.status,
      },
    });
  }

  // Latest message per unassigned active MR; keep those authored by tenant
  if (activeIds.length > 0) {
    const messageRows = await db
      .select({
        id: maintenanceRequestMessages.id,
        maintenanceRequestId: maintenanceRequestMessages.maintenanceRequestId,
        body: maintenanceRequestMessages.body,
        createdAt: maintenanceRequestMessages.createdAt,
        authorRole: users.role,
      })
      .from(maintenanceRequestMessages)
      .leftJoin(users, eq(maintenanceRequestMessages.authorUserId, users.id))
      .where(inArray(maintenanceRequestMessages.maintenanceRequestId, activeIds))
      .orderBy(desc(maintenanceRequestMessages.createdAt));

    const latestByRequest = new Map<string, (typeof messageRows)[0]>();
    for (const row of messageRows) {
      if (!latestByRequest.has(row.maintenanceRequestId)) {
        latestByRequest.set(row.maintenanceRequestId, row);
      }
    }

    const mrById = new Map(activeForMessages.map((m) => [m.id, m]));
    for (const [mrId, row] of latestByRequest) {
      if (row.authorRole !== "tenant") continue;
      const m = mrById.get(mrId);
      if (!m) continue;
      const preview = (row.body || "").trim().slice(0, 100);
      items.push({
        id: `tenant_message:${row.id}`,
        kind: "tenant_message",
        title: m.title || "Tenant message",
        subtitle: preview || locationLabel(m),
        createdAt: iso(row.createdAt),
        href: "/maintenance",
        meta: {
          messagePreview: preview,
          status: m.status,
          priority: m.priority,
        },
      });
    }
  }

  // Avoid double-counting: if a tenant_message exists for an MR, still keep the open request item
  // (both are useful — request + pending reply). Cap by recency.
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const capped = items.slice(0, FEED_CAP);

  let expiredDocuments: MaintenanceInboxItem[] = [];
  try {
    const expired = await listOrganizationExpiredDocuments(input.organizationId);
    expiredDocuments = expired.map((doc) => {
      const member = [doc.firstName, doc.lastName].filter(Boolean).join(" ") || doc.email;
      return {
        id: `expired_document:${doc.id}`,
        kind: "expired_document" as const,
        title: doc.documentName,
        subtitle: `${member} · expired ${formatExpiryLongDate(doc.expiryYmd)}`,
        createdAt: new Date(`${doc.expiryYmd}T12:00:00.000Z`).toISOString(),
        href: "/team",
        meta: { status: "expired" },
      };
    });
  } catch (error) {
    console.error("[maintenance-inbox] expired documents skipped:", error);
  }

  const merged = [...expiredDocuments, ...capped];
  return { items: merged, count: merged.length };
}
