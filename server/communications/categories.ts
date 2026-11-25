import { and, asc, eq } from "drizzle-orm";
import {
  communicationCategories,
  DEFAULT_COMMUNICATION_CATEGORIES,
  type CommunicationCategory,
} from "@shared/schema";
import { db } from "../db";

/** Seed default categories when Communications is first enabled for an org. Idempotent. */
export async function seedCommunicationCategories(
  organizationId: string,
): Promise<CommunicationCategory[]> {
  const existing = await db
    .select()
    .from(communicationCategories)
    .where(eq(communicationCategories.organizationId, organizationId));

  const byKey = new Map(existing.map((c) => [c.key, c]));
  const created: CommunicationCategory[] = [...existing];

  for (const def of DEFAULT_COMMUNICATION_CATEGORIES) {
    if (byKey.has(def.key)) continue;
    const [row] = await db
      .insert(communicationCategories)
      .values({
        organizationId,
        key: def.key,
        label: def.label,
        defaultPriority: def.defaultPriority,
        approvalPolicy: def.approvalPolicy,
        sortOrder: def.sortOrder,
        firstResponseHours: def.key === "health_safety" ? 1 : def.key === "maintenance" ? 4 : 8,
        resolutionHours: def.key === "health_safety" ? 24 : 48,
        active: true,
        version: 1,
      })
      .returning();
    created.push(row);
  }

  return created.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function listCategories(
  organizationId: string,
  opts?: { activeOnly?: boolean },
) {
  const conditions = [eq(communicationCategories.organizationId, organizationId)];
  if (opts?.activeOnly !== false) {
    conditions.push(eq(communicationCategories.active, true));
  }
  return db
    .select()
    .from(communicationCategories)
    .where(and(...conditions))
    .orderBy(asc(communicationCategories.sortOrder));
}

export async function getCategoryById(organizationId: string, categoryId: string) {
  const [row] = await db
    .select()
    .from(communicationCategories)
    .where(
      and(
        eq(communicationCategories.organizationId, organizationId),
        eq(communicationCategories.id, categoryId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getCategoryByKey(organizationId: string, key: string) {
  const [row] = await db
    .select()
    .from(communicationCategories)
    .where(
      and(
        eq(communicationCategories.organizationId, organizationId),
        eq(communicationCategories.key, key),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateCategory(
  organizationId: string,
  categoryId: string,
  patch: Partial<{
    label: string;
    defaultPriority: string;
    defaultTeamId: string | null;
    approvalPolicy: string;
    firstResponseHours: number;
    resolutionHours: number;
    notifyOnAssign: boolean;
    escalateOverdue: boolean;
    slaJson: Record<string, unknown> | null;
    active: boolean;
    sortOrder: number;
    version: number;
  }>,
) {
  const current = await getCategoryById(organizationId, categoryId);
  if (!current) return null;
  if (typeof patch.version === "number" && patch.version !== current.version) {
    const err = new Error("Category version conflict") as Error & { status: number };
    err.status = 409;
    throw err;
  }

  const { version: _v, ...rest } = patch;
  const [row] = await db
    .update(communicationCategories)
    .set({
      ...rest,
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(communicationCategories.organizationId, organizationId),
        eq(communicationCategories.id, categoryId),
      ),
    )
    .returning();
  return row ?? null;
}

export function categoryPolicySnapshot(category: CommunicationCategory) {
  return {
    categoryId: category.id,
    categoryKey: category.key,
    categoryLabel: category.label,
    approvalPolicy: category.approvalPolicy,
    defaultPriority: category.defaultPriority,
    defaultTeamId: category.defaultTeamId,
    firstResponseHours: category.firstResponseHours,
    resolutionHours: category.resolutionHours,
    notifyOnAssign: category.notifyOnAssign,
    escalateOverdue: category.escalateOverdue,
    slaJson: category.slaJson,
    version: category.version,
    snapshotAt: new Date().toISOString(),
  };
}
