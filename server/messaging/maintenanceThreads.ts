import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  messagingConversations,
  messagingParticipants,
  maintenanceRequests,
  properties,
  users,
} from "@shared/schema";
import { httpError } from "./errors";

export type MaintenanceRequestMeta = {
  requestId: string;
  title: string;
  status: string;
  propertyLabel: string | null;
  reference: string;
};

export async function loadMaintenanceMeta(
  maintenanceRequestId: string,
  organizationId: string,
): Promise<MaintenanceRequestMeta | null> {
  const [row] = await db
    .select({
      id: maintenanceRequests.id,
      title: maintenanceRequests.title,
      status: maintenanceRequests.status,
      propertyName: properties.name,
      propertyAddress: properties.address,
    })
    .from(maintenanceRequests)
    .leftJoin(properties, eq(properties.id, maintenanceRequests.propertyId))
    .where(
      and(
        eq(maintenanceRequests.id, maintenanceRequestId),
        eq(maintenanceRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const propertyLabel =
    row.propertyName ||
    (row.propertyAddress ? String(row.propertyAddress).slice(0, 80) : null);
  return {
    requestId: row.id,
    title: row.title,
    status: row.status,
    propertyLabel,
    reference: `MR-${row.id.slice(0, 8).toUpperCase()}`,
  };
}

export async function resolveMaintenanceDiscussionParticipantIds(
  organizationId: string,
  reportedBy: string,
): Promise<string[]> {
  const staff = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.isActive, true),
        inArray(users.role, ["owner", "maintenance_admin"]),
      ),
    );

  const ids = new Set<string>(staff.map((s) => s.id));
  const reporter = await storage.getUser(reportedBy);
  if (
    reporter &&
    reporter.organizationId === organizationId &&
    reporter.isActive
  ) {
    ids.add(reporter.id);
  }
  return [...ids];
}

/** Assert the user may open/ensure a discussion for this MR. */
export async function assertCanAccessMaintenanceRequestForDiscussion(input: {
  userId: string;
  userRole: string;
  organizationId: string;
  maintenanceRequestId: string;
}) {
  const request = await storage.getMaintenanceRequest(input.maintenanceRequestId);
  if (!request || request.organizationId !== input.organizationId) {
    throw httpError("Maintenance request not found", 404);
  }

  if (input.userRole === "tenant") {
    if (request.reportedBy !== input.userId) {
      throw httpError("Forbidden", 403);
    }
    return request;
  }

  if (input.userRole === "owner" || input.userRole === "maintenance_admin") {
    return request;
  }

  const [existing] = await db
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .innerJoin(
      messagingParticipants,
      eq(messagingParticipants.conversationId, messagingConversations.id),
    )
    .where(
      and(
        eq(messagingConversations.maintenanceRequestId, input.maintenanceRequestId),
        eq(messagingParticipants.userId, input.userId),
      ),
    )
    .limit(1);
  if (existing) return request;

  throw httpError("Forbidden", 403);
}

export async function findConversationByMaintenanceRequestId(
  organizationId: string,
  maintenanceRequestId: string,
) {
  const [existing] = await db
    .select()
    .from(messagingConversations)
    .where(
      and(
        eq(messagingConversations.organizationId, organizationId),
        eq(messagingConversations.maintenanceRequestId, maintenanceRequestId),
      ),
    )
    .limit(1);
  return existing ?? null;
}

export async function ensureActorIsParticipant(input: {
  conversationId: string;
  userId: string;
  actorRole: string;
}) {
  const [part] = await db
    .select()
    .from(messagingParticipants)
    .where(
      and(
        eq(messagingParticipants.conversationId, input.conversationId),
        eq(messagingParticipants.userId, input.userId),
      ),
    )
    .limit(1);
  if (part) return;
  if (input.actorRole !== "owner" && input.actorRole !== "maintenance_admin") {
    throw httpError("Forbidden", 403);
  }
  await db.insert(messagingParticipants).values({
    conversationId: input.conversationId,
    userId: input.userId,
    lastReadAt: new Date(),
  });
}

export async function createMaintenanceConversationRow(input: {
  organizationId: string;
  maintenanceRequestId: string;
  createdById: string;
  title: string;
  participantIds: string[];
}) {
  const [created] = await db
    .insert(messagingConversations)
    .values({
      organizationId: input.organizationId,
      type: "maintenance",
      title: input.title.slice(0, 120),
      directKey: null,
      maintenanceRequestId: input.maintenanceRequestId,
      createdById: input.createdById,
    })
    .returning();

  await db.insert(messagingParticipants).values(
    input.participantIds.map((userId) => ({
      conversationId: created.id,
      userId,
      lastReadAt: new Date(),
    })),
  );

  return created;
}

/**
 * Resolve a possible user-or-contact id to an active org user id suitable
 * for messaging_participants. Returns null if no login user exists.
 */
export async function resolveMessagingUserId(
  organizationId: string,
  candidateId: string | null | undefined,
): Promise<string | null> {
  if (!candidateId) return null;

  const user = await storage.getUser(candidateId);
  if (user?.organizationId === organizationId && user.isActive) {
    return user.id;
  }

  try {
    const contact = await storage.getContact(candidateId);
    if (!contact || contact.organizationId !== organizationId) return null;
    const linkedId = (contact as { linkedUserId?: string | null }).linkedUserId;
    if (!linkedId) return null;
    const linked = await storage.getUser(linkedId);
    if (linked?.organizationId === organizationId && linked.isActive) {
      return linked.id;
    }
  } catch {
    /* not a contact */
  }

  return null;
}

/**
 * Add an assignee/worker to the MR maintenance discussion thread if it exists.
 * Idempotent; no-ops when conversation or resolvable user is missing.
 */
export async function addUserToMaintenanceDiscussion(input: {
  organizationId: string;
  maintenanceRequestId: string;
  userId: string | null | undefined;
}): Promise<{ added: boolean; userId: string | null }> {
  const resolvedUserId = await resolveMessagingUserId(
    input.organizationId,
    input.userId,
  );
  if (!resolvedUserId) {
    return { added: false, userId: null };
  }

  const conversation = await findConversationByMaintenanceRequestId(
    input.organizationId,
    input.maintenanceRequestId,
  );
  if (!conversation) {
    return { added: false, userId: resolvedUserId };
  }

  const [existing] = await db
    .select({ id: messagingParticipants.id })
    .from(messagingParticipants)
    .where(
      and(
        eq(messagingParticipants.conversationId, conversation.id),
        eq(messagingParticipants.userId, resolvedUserId),
      ),
    )
    .limit(1);
  if (existing) {
    return { added: false, userId: resolvedUserId };
  }

  await db
    .insert(messagingParticipants)
    .values({
      conversationId: conversation.id,
      userId: resolvedUserId,
      lastReadAt: new Date(),
    })
    .onConflictDoNothing();

  return { added: true, userId: resolvedUserId };
}

/** Fire-and-forget — never fails the calling assignment flow. */
export function scheduleAddUserToMaintenanceDiscussion(input: {
  organizationId: string;
  maintenanceRequestId: string;
  userId: string | null | undefined;
}) {
  if (!input.userId || !input.maintenanceRequestId) return;
  setImmediate(() => {
    void addUserToMaintenanceDiscussion(input).catch((err) => {
      console.error(
        `[messaging] addUserToMaintenanceDiscussion failed for MR ${input.maintenanceRequestId}:`,
        err,
      );
    });
  });
}
