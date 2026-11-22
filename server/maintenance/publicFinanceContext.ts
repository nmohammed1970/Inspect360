import { storage } from "../storage";

export type PublicOrgBrand = {
  displayName: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type PublicWorkContext = {
  issueTitle: string;
  locationLabel: string;
  propertyName: string | null;
  propertyAddress: string | null;
  blockName: string | null;
  assigneeName: string | null;
  workOrderStatus: string | null;
};

function isHttpsUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https:\/\//i.test(url.trim());
}

export async function loadPublicOrgBrand(organizationId: string): Promise<PublicOrgBrand> {
  const org = await storage.getOrganization(organizationId);
  return {
    displayName: (org?.brandingName || org?.name || "Inspect360").trim(),
    logoUrl: isHttpsUrl(org?.logoUrl) ? org!.logoUrl!.trim() : null,
    email: org?.brandingEmail || null,
    phone: org?.brandingPhone || null,
    address: (org?.brandingAddress || "").trim() || null,
  };
}

export async function loadPublicWorkContext(
  workOrderId: string,
  organizationId: string,
): Promise<PublicWorkContext | null> {
  const workOrder = await storage.getWorkOrder(workOrderId);
  if (!workOrder || workOrder.organizationId !== organizationId) return null;

  const request = await storage.getMaintenanceRequest(workOrder.maintenanceRequestId);
  let property: Awaited<ReturnType<typeof storage.getProperty>> | null = null;
  let block: Awaited<ReturnType<typeof storage.getBlock>> | null = null;
  let assigneeName: string | null = null;

  if (request?.propertyId) {
    property = (await storage.getProperty(request.propertyId)) || null;
    if (property?.blockId) {
      block = (await storage.getBlock(property.blockId)) || null;
    }
  }
  if (request?.blockId && !block) {
    block = (await storage.getBlock(request.blockId)) || null;
  }

  if (workOrder.assignedToId) {
    const user = await storage.getUser(workOrder.assignedToId);
    if (user) {
      assigneeName =
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        user.email ||
        null;
    } else {
      const contact = await storage.getContact(workOrder.assignedToId);
      if (contact) {
        assigneeName =
          [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
          contact.companyName ||
          null;
      }
    }
  }

  return {
    issueTitle: request?.title || "Maintenance work",
    locationLabel:
      property?.name || property?.address || block?.name || "Work order location",
    propertyName: property?.name ?? null,
    propertyAddress: property?.address ?? null,
    blockName: block?.name ?? null,
    assigneeName,
    workOrderStatus: workOrder.status ?? null,
  };
}
