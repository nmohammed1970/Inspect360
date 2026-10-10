import { eq } from "drizzle-orm";
import { contacts, properties, tenantAssignments, users } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { paginate, reapitGet } from "./client";
import {
  isLettingProperty,
  mapContact,
  mapProperty,
  mapTenancy,
  relatedIds,
  syntheticEmail,
} from "./mappers";
import {
  enqueueJob,
  findMapping,
  getConnectionByCustomerId,
  updateSyncRun,
  upsertConnection,
  upsertMapping,
} from "./repository";
import { randomPassword } from "./crypto";
import type {
  ReapitContact,
  ReapitLandlord,
  ReapitProperty,
  ReapitTenancy,
  SyncCounters,
} from "./types";

function bump(counters: SyncCounters, key: keyof SyncCounters) {
  counters[key] = (counters[key] || 0) + 1;
}

export async function syncProperty(organizationId: string, reapitId: string, counters?: SyncCounters): Promise<string | null> {
  const property = await reapitGet<ReapitProperty>(organizationId, `/properties/${reapitId}`);
  if (!isLettingProperty(property) && !property.letting) {
    bump(counters || {}, "propertiesSkipped");
    return null;
  }
  const mapped = mapProperty(property);
  const existing = await findMapping(organizationId, "property", reapitId);
  if (existing && property.archived) {
    await upsertMapping({
      organizationId,
      entityType: "property",
      reapitId,
      inspect360Table: "properties",
      inspect360Id: existing.inspect360Id,
    });
    bump(counters || {}, "propertiesSkipped");
    return existing.inspect360Id;
  }
  if (existing) {
    await storage.updateProperty(existing.inspect360Id, {
      name: mapped.name,
      address: mapped.address,
      propertyType: mapped.propertyType || undefined,
    });
    await upsertMapping({
      organizationId,
      entityType: "property",
      reapitId,
      inspect360Table: "properties",
      inspect360Id: existing.inspect360Id,
    });
    bump(counters || {}, "propertiesUpdated");
    return existing.inspect360Id;
  }
  const created = await storage.createProperty({
    organizationId,
    name: mapped.name,
    address: mapped.address,
    propertyType: mapped.propertyType,
  });
  await upsertMapping({
    organizationId,
    entityType: "property",
    reapitId,
    inspect360Table: "properties",
    inspect360Id: created.id,
  });
  bump(counters || {}, "propertiesCreated");
  return created.id;
}

export async function syncContact(
  organizationId: string,
  reapitId: string,
  asTenant: boolean,
  counters?: SyncCounters,
): Promise<{ contactId: string; userId?: string }> {
  const contact = await reapitGet<ReapitContact>(organizationId, `/contacts/${reapitId}`);
  const mapped = mapContact(contact);
  const existing = await findMapping(organizationId, "contact", reapitId);
  let contactId = existing?.inspect360Id;
  const payload = {
    type: (asTenant ? "tenant" : "other") as any,
    firstName: mapped.firstName,
    lastName: mapped.lastName,
    email: mapped.email,
    phone: mapped.phone,
    address: mapped.address,
    city: mapped.city,
    postalCode: mapped.postalCode,
    country: mapped.country,
  };
  if (contactId) {
    await storage.updateContact(contactId, payload);
    bump(counters || {}, "contactsUpdated");
  } else {
    const created = await storage.createContact({ ...payload, organizationId });
    contactId = created.id;
    bump(counters || {}, "contactsCreated");
  }
  await upsertMapping({
    organizationId,
    entityType: "contact",
    reapitId,
    inspect360Table: "contacts",
    inspect360Id: contactId!,
  });

  let userId: string | undefined;
  if (asTenant) {
    userId = await ensureTenantUser(organizationId, reapitId, mapped.email, mapped.firstName, mapped.lastName, mapped.phone);
    await db.update(contacts).set({ linkedUserId: userId, type: "tenant", updatedAt: new Date() }).where(eq(contacts.id, contactId!));
  }
  return { contactId: contactId!, userId };
}

async function ensureTenantUser(
  organizationId: string,
  reapitContactId: string,
  email: string | null,
  firstName: string,
  lastName: string,
  phone: string | null,
): Promise<string> {
  const existingMap = await findMapping(organizationId, "contact", reapitContactId);
  if (existingMap) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, existingMap.inspect360Id));
    if (contact?.linkedUserId) return contact.linkedUserId;
  }
  if (email) {
    const byEmail = await storage.getUserByEmail(email);
    if (byEmail && byEmail.organizationId === organizationId && byEmail.role === "tenant") {
      return byEmail.id;
    }
  }
  const loginEmailBase = !email || (await storage.getUserByEmail(email)) ? syntheticEmail(reapitContactId) : email;
  let loginEmail = loginEmailBase;
  const takenEmail = await storage.getUserByEmail(loginEmail);
  if (takenEmail && takenEmail.organizationId !== organizationId) {
    loginEmail = `reapit+${reapitContactId}.${organizationId.slice(0, 8)}@noreply.inspect360.local`;
  } else if (takenEmail && takenEmail.role === "tenant" && takenEmail.organizationId === organizationId) {
    return takenEmail.id;
  } else if (takenEmail) {
    loginEmail = `reapit+${reapitContactId}.${organizationId.slice(0, 8)}@noreply.inspect360.local`;
  }
  let username = `reapit-${reapitContactId}`.slice(0, 80);
  const existingUser = await storage.getUserByUsername(username);
  if (existingUser) {
    if (existingUser.organizationId === organizationId) return existingUser.id;
    username = `reapit-${reapitContactId}-${organizationId}`.slice(0, 80);
  }
  const user = await storage.createUser({
    username,
    email: loginEmail,
    password: await hashPassword(randomPassword()),
    firstName,
    lastName,
    phone: phone || undefined,
    role: "tenant",
    organizationId,
    isActive: true,
  });
  return user.id;
}

export async function syncLandlord(organizationId: string, reapitId: string, counters?: SyncCounters): Promise<string | null> {
  const existingMap = await findMapping(organizationId, "landlord", reapitId);
  const landlord = await reapitGet<ReapitLandlord>(organizationId, `/landlords/${reapitId}`);
  const contactIds = relatedIds(landlord.related, "contact");
  const primary = contactIds[0];
  if (!primary) {
    bump(counters || {}, "landlordsFailed");
    return null;
  }
  const { contactId } = await syncContact(organizationId, primary, false, counters);
  await db.update(contacts).set({ type: "landlord", updatedAt: new Date() }).where(eq(contacts.id, contactId));
  await upsertMapping({
    organizationId,
    entityType: "landlord",
    reapitId,
    inspect360Table: "contacts",
    inspect360Id: contactId,
  });
  bump(counters || {}, existingMap ? "landlordsUpdated" : "landlordsCreated");
  return contactId;
}

export async function syncTenancy(organizationId: string, reapitId: string, counters?: SyncCounters): Promise<string | null> {
  const tenancy = await reapitGet<ReapitTenancy>(organizationId, `/tenancies/${reapitId}`);
  if (!tenancy.propertyId) {
    bump(counters || {}, "tenanciesFailed");
    return null;
  }
  const propertyId = await syncProperty(organizationId, tenancy.propertyId, counters);
  if (!propertyId) {
    bump(counters || {}, "tenanciesFailed");
    return null;
  }
  const tenantContactId = relatedIds(tenancy.related, "contact")[0];
  if (!tenantContactId) {
    bump(counters || {}, "tenanciesFailed");
    return null;
  }
  const { userId } = await syncContact(organizationId, tenantContactId, true, counters);
  if (!userId) {
    bump(counters || {}, "tenanciesFailed");
    return null;
  }
  const mapped = mapTenancy(tenancy);
  const existing = await findMapping(organizationId, "tenancy", reapitId);
  const assignmentFields = {
    tenantId: userId,
    propertyId,
    leaseStartDate: mapped.leaseStartDate || undefined,
    leaseEndDate: mapped.leaseEndDate || undefined,
    monthlyRent: mapped.monthlyRent,
    depositAmount: mapped.depositAmount,
    isActive: mapped.isActive,
    hasPortalAccess: false,
  };
  let assignmentId = existing?.inspect360Id;
  if (assignmentId) {
    await storage.updateTenantAssignment(assignmentId, assignmentFields);
    bump(counters || {}, "tenanciesUpdated");
  } else {
    const created = await storage.createTenantAssignment({
      organizationId,
      ...assignmentFields,
    });
    assignmentId = created.id;
    bump(counters || {}, "tenanciesCreated");
  }
  await upsertMapping({
    organizationId,
    entityType: "tenancy",
    reapitId,
    inspect360Table: "tenant_assignments",
    inspect360Id: assignmentId!,
  });
  const landlordIds = relatedIds(tenancy.related, "landlord");
  if (landlordIds[0]) {
    const landlordContactId = await syncLandlord(organizationId, landlordIds[0], counters);
    if (landlordContactId) {
      await db.update(properties).set({ landlordContactId, updatedAt: new Date() }).where(eq(properties.id, propertyId));
    }
  }
  try {
    const { generateRentPeriodsForAssignment } = await import("../propertyFinanceService");
    await generateRentPeriodsForAssignment(assignmentId!);
  } catch (error: any) {
    console.error("[Reapit] Rent period generation failed:", error.message);
  }
  return assignmentId!;
}

export async function runFullSync(organizationId: string, runId: string): Promise<void> {
  const counters: SyncCounters = {};
  await updateSyncRun(runId, { status: "running", startedAt: new Date(), countersJson: counters });
  try {
    for await (const property of paginate<ReapitProperty>(organizationId, "/properties")) {
      if (!property.id) continue;
      try {
        await syncProperty(organizationId, property.id, counters);
      } catch (error: any) {
        bump(counters, "propertiesFailed");
        console.error("[Reapit] property sync failed", property.id, error.message);
      }
    }
    for await (const landlord of paginate<ReapitLandlord>(organizationId, "/landlords")) {
      if (!landlord.id) continue;
      try {
        await syncLandlord(organizationId, landlord.id, counters);
      } catch (error: any) {
        bump(counters, "landlordsFailed");
        console.error("[Reapit] landlord sync failed", landlord.id, error.message);
      }
    }
    for await (const tenancy of paginate<ReapitTenancy>(organizationId, "/tenancies")) {
      if (!tenancy.id) continue;
      try {
        await syncTenancy(organizationId, tenancy.id, counters);
      } catch (error: any) {
        bump(counters, "tenanciesFailed");
        console.error("[Reapit] tenancy sync failed", tenancy.id, error.message);
      }
    }
    await updateSyncRun(runId, {
      status: "completed",
      countersJson: counters,
      finishedAt: new Date(),
      errorMessage: null,
    });
  } catch (error: any) {
    await updateSyncRun(runId, {
      status: "failed",
      countersJson: counters,
      finishedAt: new Date(),
      errorMessage: error.message || "Sync failed",
    });
    throw error;
  }
}

export async function handleWebhookTopic(topicId: string, customerId: string | undefined, entityId: string | undefined) {
  if (topicId === "application.install") {
    if (!customerId) return;
    const connection = await getConnectionByCustomerId(customerId);
    if (connection) {
      await upsertConnection({
        organizationId: connection.organizationId,
        reapitCustomerId: customerId,
        status: "connected",
      });
    }
    return;
  }
  if (topicId === "application.uninstall") {
    if (!customerId) return;
    const connection = await getConnectionByCustomerId(customerId);
    if (connection) {
      await upsertConnection({
        organizationId: connection.organizationId,
        reapitCustomerId: customerId,
        status: "disconnected",
        tokens: null,
      });
    }
    return;
  }
  const connection = customerId ? await getConnectionByCustomerId(customerId) : undefined;
  if (!connection || connection.status !== "connected") {
    throw new Error("No connected organisation for Reapit customer");
  }
  if (!entityId) return;
  if (topicId.startsWith("properties.")) await syncProperty(connection.organizationId, entityId);
  else if (topicId.startsWith("contacts.")) await syncContact(connection.organizationId, entityId, false);
  else if (topicId.startsWith("landlords.")) await syncLandlord(connection.organizationId, entityId);
  else if (topicId.startsWith("tenancies.")) await syncTenancy(connection.organizationId, entityId);
}

export async function enqueueInitialSync(organizationId: string, type: "initial" | "manual") {
  const { createSyncRun } = await import("./repository");
  const run = await createSyncRun(organizationId, type);
  await enqueueJob({
    organizationId,
    kind: "full_sync",
    payloadJson: { runId: run.id },
  });
  return run;
}
