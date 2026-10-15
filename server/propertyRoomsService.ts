/**
 * Org room categories + property rooms CRUD; syncs legacy layout counts.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  organizationRoomCategories,
  properties,
  propertyRooms,
  type OrganizationRoomCategory,
  type PropertyRoom,
  type PropertyRoomInput,
} from "@shared/schema";
import {
  SYSTEM_ROOM_CATEGORIES,
  countsFromRooms,
  normalizeCategoryName,
  resolveSystemCategoryForLabel,
  roomTypeFromCategorySlug,
  slugifyCategoryName,
  type PropertyRoomSnapshotItem,
} from "@shared/propertyRooms";

export async function ensureOrganizationRoomCategories(
  organizationId: string,
): Promise<OrganizationRoomCategory[]> {
  const existing = await db
    .select()
    .from(organizationRoomCategories)
    .where(eq(organizationRoomCategories.organizationId, organizationId))
    .orderBy(asc(organizationRoomCategories.sortOrder));

  if (existing.length > 0) return existing;

  for (const seed of SYSTEM_ROOM_CATEGORIES) {
    try {
      await db.insert(organizationRoomCategories).values({
        organizationId,
        name: seed.name,
        nameNormalized: normalizeCategoryName(seed.name),
        slug: seed.slug,
        isSystem: true,
        sortOrder: seed.sortOrder,
      });
    } catch {
      // Concurrent seed or unique race — ignore
    }
  }

  return db
    .select()
    .from(organizationRoomCategories)
    .where(eq(organizationRoomCategories.organizationId, organizationId))
    .orderBy(asc(organizationRoomCategories.sortOrder));
}

export async function listRoomCategories(
  organizationId: string,
): Promise<OrganizationRoomCategory[]> {
  return ensureOrganizationRoomCategories(organizationId);
}

export async function createRoomCategory(
  organizationId: string,
  name: string,
): Promise<OrganizationRoomCategory> {
  await ensureOrganizationRoomCategories(organizationId);
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw Object.assign(new Error("Category name is required"), { status: 400 });
  const nameNormalized = normalizeCategoryName(trimmed);
  const slug = slugifyCategoryName(trimmed);

  const [dup] = await db
    .select()
    .from(organizationRoomCategories)
    .where(
      and(
        eq(organizationRoomCategories.organizationId, organizationId),
        eq(organizationRoomCategories.nameNormalized, nameNormalized),
      ),
    )
    .limit(1);
  if (dup) throw Object.assign(new Error("A category with this name already exists"), { status: 409 });

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${organizationRoomCategories.sortOrder}), 0)` })
    .from(organizationRoomCategories)
    .where(eq(organizationRoomCategories.organizationId, organizationId));

  const [row] = await db
    .insert(organizationRoomCategories)
    .values({
      organizationId,
      name: trimmed.slice(0, 120),
      nameNormalized,
      slug,
      isSystem: false,
      sortOrder: (max || 0) + 10,
    })
    .returning();
  return row;
}

export async function updateRoomCategory(
  organizationId: string,
  categoryId: string,
  name: string,
): Promise<OrganizationRoomCategory> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw Object.assign(new Error("Category name is required"), { status: 400 });
  const nameNormalized = normalizeCategoryName(trimmed);

  const [existing] = await db
    .select()
    .from(organizationRoomCategories)
    .where(
      and(
        eq(organizationRoomCategories.id, categoryId),
        eq(organizationRoomCategories.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!existing) throw Object.assign(new Error("Category not found"), { status: 404 });

  const [dup] = await db
    .select()
    .from(organizationRoomCategories)
    .where(
      and(
        eq(organizationRoomCategories.organizationId, organizationId),
        eq(organizationRoomCategories.nameNormalized, nameNormalized),
      ),
    )
    .limit(1);
  if (dup && dup.id !== categoryId) {
    throw Object.assign(new Error("A category with this name already exists"), { status: 409 });
  }

  const [row] = await db
    .update(organizationRoomCategories)
    .set({
      name: trimmed.slice(0, 120),
      nameNormalized,
      slug: slugifyCategoryName(trimmed),
      updatedAt: new Date(),
    })
    .where(eq(organizationRoomCategories.id, categoryId))
    .returning();
  return row;
}

export async function deleteRoomCategory(
  organizationId: string,
  categoryId: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(organizationRoomCategories)
    .where(
      and(
        eq(organizationRoomCategories.id, categoryId),
        eq(organizationRoomCategories.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!existing) throw Object.assign(new Error("Category not found"), { status: 404 });
  if (existing.isSystem) {
    throw Object.assign(new Error("System categories cannot be deleted"), { status: 400 });
  }

  const [inUse] = await db
    .select({ id: propertyRooms.id })
    .from(propertyRooms)
    .where(eq(propertyRooms.categoryId, categoryId))
    .limit(1);
  if (inUse) {
    throw Object.assign(new Error("Category is in use by property rooms"), { status: 400 });
  }

  await db
    .delete(organizationRoomCategories)
    .where(eq(organizationRoomCategories.id, categoryId));
}

export type PropertyRoomWithCategory = PropertyRoom & {
  categoryName: string;
  categorySlug: string;
};

export async function listPropertyRooms(
  organizationId: string,
  propertyId: string,
): Promise<PropertyRoomWithCategory[]> {
  const rows = await db
    .select({
      room: propertyRooms,
      categoryName: organizationRoomCategories.name,
      categorySlug: organizationRoomCategories.slug,
    })
    .from(propertyRooms)
    .innerJoin(
      organizationRoomCategories,
      eq(propertyRooms.categoryId, organizationRoomCategories.id),
    )
    .where(
      and(
        eq(propertyRooms.organizationId, organizationId),
        eq(propertyRooms.propertyId, propertyId),
      ),
    )
    .orderBy(asc(propertyRooms.sortOrder));

  return rows.map((r) => ({
    ...r.room,
    categoryName: r.categoryName,
    categorySlug: r.categorySlug,
  }));
}

/**
 * Reassign rooms stuck on "Other" when the room name clearly implies Bedroom / Kitchen / etc.
 * Floor-plan AI often labels category as Other while naming rooms correctly.
 */
export async function repairMisclassifiedPropertyRooms(
  organizationId: string,
  propertyId: string,
): Promise<boolean> {
  const categories = await ensureOrganizationRoomCategories(organizationId);
  const rooms = await listPropertyRooms(organizationId, propertyId);
  let changed = false;

  for (const room of rooms) {
    const currentType = roomTypeFromCategorySlug(room.categorySlug);
    if (currentType !== "other" && room.categorySlug !== "other") continue;

    const resolved = resolveSystemCategoryForLabel(room.name, room.categoryName);
    if (resolved.slug === "other") continue;
    if (resolved.slug === room.categorySlug) continue;

    const target =
      categories.find((c) => c.slug === resolved.slug) ||
      categories.find((c) => normalizeCategoryName(c.name) === normalizeCategoryName(resolved.name));
    if (!target || target.id === room.categoryId) continue;

    await db
      .update(propertyRooms)
      .set({ categoryId: target.id, updatedAt: new Date() })
      .where(
        and(
          eq(propertyRooms.id, room.id),
          eq(propertyRooms.organizationId, organizationId),
          eq(propertyRooms.propertyId, propertyId),
        ),
      );
    changed = true;
  }

  return changed;
}

export async function syncPropertyLayoutCounts(
  organizationId: string,
  propertyId: string,
): Promise<void> {
  await repairMisclassifiedPropertyRooms(organizationId, propertyId);
  const rooms = await listPropertyRooms(organizationId, propertyId);
  if (rooms.length === 0) return;
  const counts = countsFromRooms(
    rooms.map((r) => ({
      categorySlug: r.categorySlug,
      categoryName: r.categoryName,
      name: r.name,
    })),
  );
  await db
    .update(properties)
    .set({
      bedrooms: counts.bedrooms,
      kitchens: counts.kitchens,
      bathrooms: counts.bathrooms,
      livingRooms: counts.livingRooms,
      updatedAt: new Date(),
    })
    .where(
      and(eq(properties.id, propertyId), eq(properties.organizationId, organizationId)),
    );
}

/** List rooms and repair misclassified AI categories + layout counts when needed. */
export async function listPropertyRoomsRepaired(
  organizationId: string,
  propertyId: string,
): Promise<PropertyRoomWithCategory[]> {
  const before = await listPropertyRooms(organizationId, propertyId);
  if (before.length === 0) return before;

  const needsRepair = before.some((r) => {
    if (roomTypeFromCategorySlug(r.categorySlug) !== "other") return false;
    return resolveSystemCategoryForLabel(r.name, r.categoryName).slug !== "other";
  });

  if (needsRepair) {
    await syncPropertyLayoutCounts(organizationId, propertyId);
    return listPropertyRooms(organizationId, propertyId);
  }

  // Still refresh legacy counts if rooms exist but columns look unsynced (all-Other → 1s)
  const counts = countsFromRooms(
    before.map((r) => ({
      categorySlug: r.categorySlug,
      categoryName: r.categoryName,
      name: r.name,
    })),
  );
  const [prop] = await db
    .select({
      bedrooms: properties.bedrooms,
      kitchens: properties.kitchens,
      bathrooms: properties.bathrooms,
      livingRooms: properties.livingRooms,
    })
    .from(properties)
    .where(
      and(eq(properties.id, propertyId), eq(properties.organizationId, organizationId)),
    )
    .limit(1);
  if (
    prop &&
    (prop.bedrooms !== counts.bedrooms ||
      prop.kitchens !== counts.kitchens ||
      prop.bathrooms !== counts.bathrooms ||
      prop.livingRooms !== counts.livingRooms)
  ) {
    await db
      .update(properties)
      .set({
        bedrooms: counts.bedrooms,
        kitchens: counts.kitchens,
        bathrooms: counts.bathrooms,
        livingRooms: counts.livingRooms,
        updatedAt: new Date(),
      })
      .where(
        and(eq(properties.id, propertyId), eq(properties.organizationId, organizationId)),
      );
  }

  return before;
}

export async function replacePropertyRooms(
  organizationId: string,
  propertyId: string,
  roomsInput: PropertyRoomInput[],
): Promise<PropertyRoomWithCategory[]> {
  const categories = await ensureOrganizationRoomCategories(organizationId);
  const catIds = new Set(categories.map((c) => c.id));

  for (const room of roomsInput) {
    if (!catIds.has(room.categoryId)) {
      throw Object.assign(new Error(`Invalid category: ${room.categoryId}`), { status: 400 });
    }
    if (!room.name?.trim()) {
      throw Object.assign(new Error("Room name is required"), { status: 400 });
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(propertyRooms)
      .where(
        and(
          eq(propertyRooms.organizationId, organizationId),
          eq(propertyRooms.propertyId, propertyId),
        ),
      );

    if (roomsInput.length === 0) return;

    await tx.insert(propertyRooms).values(
      roomsInput.map((r, idx) => ({
        id: r.id || undefined,
        organizationId,
        propertyId,
        categoryId: r.categoryId,
        name: r.name.trim().slice(0, 160),
        widthMm: r.widthMm ?? null,
        lengthMm: r.lengthMm ?? null,
        ceilingHeightMm: r.ceilingHeightMm ?? null,
        sortOrder: r.sortOrder ?? idx,
        source: r.source || "manual",
        aiConfidence: r.aiConfidence ?? null,
      })),
    );
  });

  await syncPropertyLayoutCounts(organizationId, propertyId);
  return listPropertyRooms(organizationId, propertyId);
}

export function toSnapshotItems(
  rooms: PropertyRoomWithCategory[],
): PropertyRoomSnapshotItem[] {
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    categorySlug: r.categorySlug,
    widthMm: r.widthMm,
    lengthMm: r.lengthMm,
    ceilingHeightMm: r.ceilingHeightMm,
  }));
}
