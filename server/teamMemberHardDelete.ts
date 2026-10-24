import { and, eq, inArray } from "drizzle-orm";
import {
  chatConversations,
  chatMessages,
  communityGroups,
  communityPostFlags,
  communityTenantBlocks,
  completionChecklistResponses,
  contacts,
  creditLedger,
  dashboardPreferences,
  entitlementEvents,
  feedbackSubmissions,
  inspectionGalleryAssignments,
  inspectionGalleryImages,
  inspections,
  maintenanceRequests,
  notifications,
  propertyDeposits,
  propertyExpenses,
  teamMembers,
  tenancyAttachments,
  userDocuments,
  users,
  userTags,
  workOrderCertificates,
  workOrderCompletionChecklistResponses,
  workOrders,
} from "@shared/schema";
import { db, pool } from "./db";
import { storage } from "./storage";

export type HardDeleteTeamMemberResult = {
  deletedUserId: string;
  email: string;
  unassigned: {
    inspections: number;
    maintenanceAssigned: number;
    workOrders: number;
    teamMemberships: number;
  };
  objectPathsToDelete: string[];
};

function collectObjectPaths(user: {
  profileImageUrl?: string | null;
  certificateUrls?: string[] | null;
}, documentUrls: string[]): string[] {
  const paths = new Set<string>();
  const maybeAdd = (value: string | null | undefined) => {
    const trimmed = (value || "").trim();
    if (trimmed.startsWith("/objects/") || trimmed.startsWith("objects/")) {
      paths.add(trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
    }
  };
  maybeAdd(user.profileImageUrl);
  for (const url of user.certificateUrls || []) maybeAdd(url);
  for (const url of documentUrls) maybeAdd(url);
  return [...paths];
}

async function destroySessionsForUser(userId: string): Promise<void> {
  try {
    const { getSessionStore } = await import("./auth");
    const sessionStore = getSessionStore();
    const sessionsResult = await pool.query(`
      SELECT sid, sess
      FROM sessions
      WHERE sess::text LIKE $1
    `, [`%${userId}%`]);

    for (const sessionRow of sessionsResult.rows) {
      try {
        const sessionData =
          typeof sessionRow.sess === "string"
            ? JSON.parse(sessionRow.sess)
            : sessionRow.sess;
        if (sessionData?.passport?.user !== userId) continue;
        await new Promise<void>((resolve) => {
          sessionStore.destroy(sessionRow.sid as string, () => resolve());
        });
      } catch {
        // Continue destroying other sessions
      }
    }
  } catch (error) {
    console.error(`[hardDeleteTeamMember] Session cleanup failed for ${userId}:`, error);
  }
}

/**
 * Permanently removes a staff team member and unassigns their work.
 * Historical records (templates, credits, reports) are kept; author IDs may remain as orphans
 * where columns are NOT NULL and are not active assignments.
 */
export async function hardDeleteTeamMember(input: {
  targetUserId: string;
  requesterId: string;
  organizationId: string;
}): Promise<HardDeleteTeamMemberResult> {
  const { targetUserId, requesterId, organizationId } = input;

  if (targetUserId === requesterId) {
    throw Object.assign(new Error("You cannot delete your own account"), { status: 400 });
  }

  const target = await storage.getUser(targetUserId);
  if (!target || target.organizationId !== organizationId) {
    throw Object.assign(new Error("User not found in your organization"), { status: 403 });
  }

  if (target.role === "tenant") {
    throw Object.assign(
      new Error("Tenant accounts cannot be deleted from Team Members. Manage tenants from Contacts."),
      { status: 400 },
    );
  }

  const organization = await storage.getOrganization(organizationId);
  if (!organization) {
    throw Object.assign(new Error("Organization not found"), { status: 400 });
  }
  if (organization.ownerId === targetUserId) {
    throw Object.assign(
      new Error(
        "Cannot delete the organisation owner. Transfer ownership first, then delete this account.",
      ),
      { status: 400 },
    );
  }

  const docs = await db
    .select({ id: userDocuments.id, fileUrl: userDocuments.fileUrl })
    .from(userDocuments)
    .where(eq(userDocuments.userId, targetUserId));
  const objectPathsToDelete = collectObjectPaths(target, docs.map((d) => d.fileUrl));

  const result = await db.transaction(async (tx) => {
    // --- Unassign active work ---
    const unassignedInspections = await tx
      .update(inspections)
      .set({ inspectorId: null, updatedAt: new Date() })
      .where(and(eq(inspections.organizationId, organizationId), eq(inspections.inspectorId, targetUserId)))
      .returning({ id: inspections.id });

    // Clear tenant-approval pointer if this user somehow signed (staff edge case)
    await tx
      .update(inspections)
      .set({ tenantApprovedBy: null })
      .where(and(eq(inspections.organizationId, organizationId), eq(inspections.tenantApprovedBy, targetUserId)));

    const unassignedMaintenance = await tx
      .update(maintenanceRequests)
      .set({ assignedTo: null, updatedAt: new Date() })
      .where(
        and(
          eq(maintenanceRequests.organizationId, organizationId),
          eq(maintenanceRequests.assignedTo, targetUserId),
        ),
      )
      .returning({ id: maintenanceRequests.id });

    const unassignedWorkOrders = await tx
      .update(workOrders)
      .set({ assignedToId: null, updatedAt: new Date() })
      .where(and(eq(workOrders.organizationId, organizationId), eq(workOrders.assignedToId, targetUserId)))
      .returning({ id: workOrders.id });

    const removedTeamMemberships = await tx
      .delete(teamMembers)
      .where(eq(teamMembers.userId, targetUserId))
      .returning({ id: teamMembers.id });

    // --- Nullable authorship / uploaders (keep rows) ---
    await tx
      .update(contacts)
      .set({ linkedUserId: null, updatedAt: new Date() })
      .where(eq(contacts.linkedUserId, targetUserId));

    await tx
      .update(propertyDeposits)
      .set({ createdBy: null })
      .where(eq(propertyDeposits.createdBy, targetUserId));

    await tx
      .update(propertyExpenses)
      .set({ createdBy: null })
      .where(eq(propertyExpenses.createdBy, targetUserId));

    await tx
      .update(tenancyAttachments)
      .set({ uploadedBy: null })
      .where(eq(tenancyAttachments.uploadedBy, targetUserId));

    await tx
      .update(inspectionGalleryImages)
      .set({ uploadedByUserId: null, updatedAt: new Date() })
      .where(eq(inspectionGalleryImages.uploadedByUserId, targetUserId));

    await tx
      .update(inspectionGalleryAssignments)
      .set({ createdByUserId: null })
      .where(eq(inspectionGalleryAssignments.createdByUserId, targetUserId));

    await tx
      .update(completionChecklistResponses)
      .set({ updatedBy: null, updatedAt: new Date() })
      .where(eq(completionChecklistResponses.updatedBy, targetUserId));

    await tx
      .update(workOrderCompletionChecklistResponses)
      .set({ updatedBy: null, updatedAt: new Date() })
      .where(eq(workOrderCompletionChecklistResponses.updatedBy, targetUserId));

    await tx
      .update(workOrderCertificates)
      .set({ confirmedBy: null, updatedAt: new Date() })
      .where(eq(workOrderCertificates.confirmedBy, targetUserId));

    await tx
      .update(entitlementEvents)
      .set({ actorUserId: null })
      .where(eq(entitlementEvents.actorUserId, targetUserId));

    await tx
      .update(creditLedger)
      .set({ createdBy: null })
      .where(eq(creditLedger.createdBy, targetUserId));

    await tx
      .update(communityPostFlags)
      .set({ resolvedBy: null })
      .where(eq(communityPostFlags.resolvedBy, targetUserId));

    await tx
      .update(communityGroups)
      .set({ approvedBy: null })
      .where(eq(communityGroups.approvedBy, targetUserId));

    await tx
      .update(feedbackSubmissions)
      .set({ assignedTo: null, updatedAt: new Date() })
      .where(eq(feedbackSubmissions.assignedTo, targetUserId));

    // Community blocks created by this operator: drop the block rows (blockedBy is NOT NULL)
    await tx
      .delete(communityTenantBlocks)
      .where(eq(communityTenantBlocks.blockedByUserId, targetUserId));

    // --- Delete personal owned data ---
    if (docs.length > 0) {
      await tx.delete(userDocuments).where(eq(userDocuments.userId, targetUserId));
    }
    await tx.delete(userTags).where(eq(userTags.userId, targetUserId));
    await tx.delete(dashboardPreferences).where(eq(dashboardPreferences.userId, targetUserId));
    await tx.delete(notifications).where(eq(notifications.userId, targetUserId));
    await tx.delete(feedbackSubmissions).where(eq(feedbackSubmissions.userId, targetUserId));

    const conversations = await tx
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(eq(chatConversations.userId, targetUserId));
    if (conversations.length > 0) {
      const conversationIds = conversations.map((c) => c.id);
      await tx.delete(chatMessages).where(inArray(chatMessages.conversationId, conversationIds));
      await tx.delete(chatConversations).where(eq(chatConversations.userId, targetUserId));
    }

    // --- Wipe the user row (frees email/username for re-add / other orgs) ---
    const deleted = await tx
      .delete(users)
      .where(and(eq(users.id, targetUserId), eq(users.organizationId, organizationId)))
      .returning({ id: users.id, email: users.email });

    if (deleted.length === 0) {
      throw Object.assign(new Error("Failed to delete team member"), { status: 500 });
    }

    return {
      deletedUserId: deleted[0].id,
      email: deleted[0].email,
      unassigned: {
        inspections: unassignedInspections.length,
        maintenanceAssigned: unassignedMaintenance.length,
        workOrders: unassignedWorkOrders.length,
        teamMemberships: removedTeamMemberships.length,
      },
      objectPathsToDelete,
    };
  });

  await destroySessionsForUser(targetUserId);

  // Best-effort object storage cleanup (outside TX)
  try {
    const { ObjectStorageService } = await import("./objectStorage");
    const objectStorageService = new ObjectStorageService();
    for (const path of result.objectPathsToDelete) {
      try {
        await objectStorageService.deleteObjectEntity(path);
      } catch (err) {
        console.warn(`[hardDeleteTeamMember] Failed to delete object ${path}:`, err);
      }
    }
  } catch (err) {
    console.warn("[hardDeleteTeamMember] Object storage cleanup skipped:", err);
  }

  console.log(
    `[hardDeleteTeamMember] Deleted user ${result.deletedUserId} (${result.email}) from org ${organizationId}`,
    result.unassigned,
  );

  return result;
}
