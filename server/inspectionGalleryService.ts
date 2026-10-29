/**
 * Per-inspection image gallery: register, assign, unassign, move, delete.
 * Assignments sync object URLs into inspection_entries.photos for reports.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  inspectionEntries,
  inspectionGalleryAssignments,
  inspectionGalleryImages,
  type Inspection,
  type InspectionGalleryImage,
  type User,
} from "@shared/schema";
import {
  GALLERY_FIELD_PHOTO_MAX,
  GALLERY_REGISTER_BATCH_MAX,
  assertDestinationValid,
  extractCipCountsFromEntries,
  extractRepeatableCountsFromEntries,
  formatDestinationLabel,
  isAllowedGalleryMime,
  listPhotoDestinations,
  normalizeObjectUrl,
  type PhotoDestination,
} from "@shared/inspectionGallery";
import { formatSignerDisplayName } from "@shared/signature";
import {
  compareCaptureToProperty,
  type GalleryAddressMatchStatus,
} from "@shared/galleryLocation";
import { geocodeAddress } from "./geocodeAddress";

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export type GalleryImageDto = {
  id: string;
  objectUrl: string;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  /** Upload / register time (ISO via JSON). Used as capture/upload timestamp on cards. */
  createdAt: Date | null;
  /** Property or block address for this inspection (shown on each gallery card). */
  propertyAddress: string | null;
  /** Assigned inspector / contractor display name. */
  inspectorName: string | null;
  captureLatitude: number | null;
  captureLongitude: number | null;
  addressMatchStatus: GalleryAddressMatchStatus | null;
  assignments: Array<{
    id: string;
    sectionRef: string;
    fieldKey: string;
    label: string;
  }>;
};

async function resolveGalleryContext(inspection: Inspection): Promise<{
  propertyAddress: string | null;
  inspectorName: string | null;
  propertyLat: number | null;
  propertyLng: number | null;
}> {
  let propertyAddress: string | null = null;
  if (inspection.propertyId) {
    const property = await storage.getProperty(inspection.propertyId);
    propertyAddress = property?.address?.trim() || property?.name?.trim() || null;
  } else if (inspection.blockId) {
    const block = await storage.getBlock(inspection.blockId);
    propertyAddress = block?.address?.trim() || block?.name?.trim() || null;
  }

  let inspectorName: string | null = null;
  if (inspection.inspectorId) {
    const inspector = await storage.getUser(inspection.inspectorId);
    inspectorName = formatSignerDisplayName(inspector) || null;
  }

  const geocoded = await geocodeAddress(propertyAddress);
  return {
    propertyAddress,
    inspectorName,
    propertyLat: geocoded?.lat ?? null,
    propertyLng: geocoded?.lng ?? null,
  };
}

async function resolveOrgId(inspection: Inspection): Promise<string | null> {
  if (inspection.organizationId) return inspection.organizationId;
  if (inspection.propertyId) {
    const property = await storage.getProperty(inspection.propertyId);
    return property?.organizationId ?? null;
  }
  if (inspection.blockId) {
    const block = await storage.getBlock(inspection.blockId);
    return block?.organizationId ?? null;
  }
  return null;
}

export async function assertInspectionGalleryAccess(
  inspectionId: string,
  user: User,
  mode: "read" | "write",
): Promise<{ inspection: Inspection; organizationId: string }> {
  if (!user.organizationId) throw httpError("No organization found", 403);

  const inspection = await storage.getInspection(inspectionId);
  if (!inspection) throw httpError("Inspection not found", 404);

  const organizationId = await resolveOrgId(inspection);
  if (!organizationId || organizationId !== user.organizationId) {
    throw httpError("Access denied", 403);
  }

  if (mode === "write") {
    if (inspection.status === "completed") {
      throw httpError("Completed inspections cannot be edited", 403);
    }
    if (user.role !== "owner" && user.role !== "compliance") {
      if (inspection.inspectorId !== user.id) {
        throw httpError("Access denied: Inspection not assigned to you", 403);
      }
    }
  }

  return { inspection, organizationId };
}

async function loadRepeatableCounts(
  inspectionId: string,
  inspection?: Inspection | null,
): Promise<Record<string, number>> {
  const insp = inspection ?? (await storage.getInspection(inspectionId));
  const entries = await storage.getInspectionEntries(inspectionId);
  const fromEntries = extractRepeatableCountsFromEntries(entries);

  const snapshot = (insp as any)?.propertyRoomCountsSnapshot;
  if (!snapshot || !insp?.templateSnapshotJson) {
    return fromEntries;
  }

  const { repeatableCountsFromPropertyLayout } = await import("@shared/propertyLayout");
  const fromProperty = repeatableCountsFromPropertyLayout(
    insp.templateSnapshotJson as any,
    snapshot,
  );
  // Entry counts reflect the inspection as currently configured (capture UI).
  // Prefer them over the property layout snapshot so gallery destinations match
  // the sections/instances the inspector actually sees.
  return { ...fromProperty, ...fromEntries };
}

function destinationLabelMap(
  structure: any,
  counts: Record<string, number>,
  cipCounts?: ReturnType<typeof extractCipCountsFromEntries>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of listPhotoDestinations(structure, counts, cipCounts)) {
    map.set(`${d.sectionRef}::${d.fieldKey}`, formatDestinationLabel(d));
  }
  return map;
}

function normalizeMatchStatus(raw: string | null | undefined): GalleryAddressMatchStatus | null {
  if (raw === "matched" || raw === "mismatched" || raw === "unavailable") return raw;
  return null;
}

async function toDto(
  image: InspectionGalleryImage,
  assignments: Array<{
    id: string;
    sectionRef: string;
    fieldKey: string;
  }>,
  labelMap: Map<string, string>,
  context: { propertyAddress: string | null; inspectorName: string | null },
): Promise<GalleryImageDto> {
  return {
    id: image.id,
    objectUrl: image.objectUrl,
    fileName: image.fileName,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    createdAt: image.createdAt,
    propertyAddress: context.propertyAddress,
    inspectorName: context.inspectorName,
    captureLatitude: image.captureLatitude ?? null,
    captureLongitude: image.captureLongitude ?? null,
    addressMatchStatus: normalizeMatchStatus(image.addressMatchStatus),
    assignments: assignments.map((a) => ({
      id: a.id,
      sectionRef: a.sectionRef,
      fieldKey: a.fieldKey,
      label:
        labelMap.get(`${a.sectionRef}::${a.fieldKey}`) ||
        `${a.sectionRef} → ${a.fieldKey}`,
    })),
  };
}

/** Upsert gallery rows + assignments for URLs already on entries (legacy). */
export async function backfillGalleryFromEntries(
  inspection: Inspection,
  organizationId: string,
): Promise<void> {
  const entries = await storage.getInspectionEntries(inspection.id);
  const labelMap = destinationLabelMap(
    inspection.templateSnapshotJson as any,
    extractRepeatableCountsFromEntries(entries),
    extractCipCountsFromEntries(entries),
  );

  for (const entry of entries) {
    const photos = Array.isArray(entry.photos) ? entry.photos : [];
    for (const raw of photos) {
      const objectUrl = normalizeObjectUrl(raw);
      if (!objectUrl) continue;

      const existing = await db
        .select()
        .from(inspectionGalleryImages)
        .where(
          and(
            eq(inspectionGalleryImages.inspectionId, inspection.id),
            eq(inspectionGalleryImages.objectUrl, objectUrl),
          ),
        )
        .limit(1);

      let imageId = existing[0]?.id;
      if (!imageId) {
        const [created] = await db
          .insert(inspectionGalleryImages)
          .values({
            organizationId,
            inspectionId: inspection.id,
            objectUrl,
            fileName: objectUrl.split("/").pop() || null,
          })
          .onConflictDoNothing({
            target: [inspectionGalleryImages.inspectionId, inspectionGalleryImages.objectUrl],
          })
          .returning();
        if (created) {
          imageId = created.id;
        } else {
          const again = await db
            .select()
            .from(inspectionGalleryImages)
            .where(
              and(
                eq(inspectionGalleryImages.inspectionId, inspection.id),
                eq(inspectionGalleryImages.objectUrl, objectUrl),
              ),
            )
            .limit(1);
          imageId = again[0]?.id;
        }
      }
      if (!imageId) continue;

      // Revive soft-deleted if present on an entry
      if (existing[0]?.deletedAt) {
        await db
          .update(inspectionGalleryImages)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(eq(inspectionGalleryImages.id, imageId));
      }

      await db
        .insert(inspectionGalleryAssignments)
        .values({
          galleryImageId: imageId,
          inspectionId: inspection.id,
          sectionRef: entry.sectionRef,
          fieldKey: entry.fieldKey,
        })
        .onConflictDoNothing({
          target: [
            inspectionGalleryAssignments.galleryImageId,
            inspectionGalleryAssignments.sectionRef,
            inspectionGalleryAssignments.fieldKey,
          ],
        });

      // Keep label map warm (unused here but validates destination path existence)
      void labelMap;
    }
  }
}

export async function listGallery(
  inspectionId: string,
  user: User,
): Promise<GalleryImageDto[]> {
  const { inspection, organizationId } = await assertInspectionGalleryAccess(
    inspectionId,
    user,
    "read",
  );

  await backfillGalleryFromEntries(inspection, organizationId);

  const counts = await loadRepeatableCounts(inspectionId, inspection);
  const entries = await storage.getInspectionEntries(inspectionId);
  const cipCounts = extractCipCountsFromEntries(entries);
  const labelMap = destinationLabelMap(inspection.templateSnapshotJson as any, counts, cipCounts);

  const images = await db
    .select()
    .from(inspectionGalleryImages)
    .where(
      and(
        eq(inspectionGalleryImages.inspectionId, inspectionId),
        eq(inspectionGalleryImages.organizationId, organizationId),
        isNull(inspectionGalleryImages.deletedAt),
      ),
    )
    .orderBy(inspectionGalleryImages.createdAt);

  if (!images.length) return [];

  const context = await resolveGalleryContext(inspection);

  const assignments = await db
    .select()
    .from(inspectionGalleryAssignments)
    .where(eq(inspectionGalleryAssignments.inspectionId, inspectionId));

  const byImage = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = byImage.get(a.galleryImageId) || [];
    list.push(a);
    byImage.set(a.galleryImageId, list);
  }

  const result: GalleryImageDto[] = [];
  for (const img of images) {
    result.push(await toDto(img, byImage.get(img.id) || [], labelMap, context));
  }
  return result;
}

export async function listDestinations(
  inspectionId: string,
  user: User,
): Promise<PhotoDestination[]> {
  const { inspection } = await assertInspectionGalleryAccess(inspectionId, user, "read");
  const counts = await loadRepeatableCounts(inspectionId, inspection);
  const entries = await storage.getInspectionEntries(inspectionId);
  const cipCounts = extractCipCountsFromEntries(entries);
  return listPhotoDestinations(inspection.templateSnapshotJson as any, counts, cipCounts);
}

export async function registerGalleryImages(
  inspectionId: string,
  user: User,
  items: Array<{
    objectUrl: string;
    fileName?: string | null;
    mimeType?: string | null;
    byteSize?: number | null;
    captureLatitude?: number | null;
    captureLongitude?: number | null;
  }>,
  autoAssign?: { sectionRef: string; fieldKey: string } | null,
  capture?: { latitude?: number | null; longitude?: number | null } | null,
): Promise<GalleryImageDto[]> {
  const { inspection, organizationId } = await assertInspectionGalleryAccess(
    inspectionId,
    user,
    "write",
  );

  if (!items?.length) throw httpError("No images to register", 400);
  if (items.length > GALLERY_REGISTER_BATCH_MAX) {
    throw httpError(`Maximum ${GALLERY_REGISTER_BATCH_MAX} images per request`, 400);
  }

  const counts = await loadRepeatableCounts(inspectionId, inspection);
  const entriesForDest = await storage.getInspectionEntries(inspectionId);
  const cipCounts = extractCipCountsFromEntries(entriesForDest);
  let dest: PhotoDestination | null = null;
  if (autoAssign?.sectionRef && autoAssign?.fieldKey) {
    dest = assertDestinationValid(
      inspection.templateSnapshotJson as any,
      autoAssign.sectionRef,
      autoAssign.fieldKey,
      counts,
      cipCounts,
    );
    // Still register the image even if assign target is unknown — browse/camera
    // uploads must appear in the gallery; assignment is best-effort.
    if (!dest) {
      console.warn(
        "[gallery] register: invalid assign destination, storing unassigned",
        autoAssign,
      );
    }
  }

  const context = await resolveGalleryContext(inspection);
  const batchLat =
    capture?.latitude != null && Number.isFinite(Number(capture.latitude))
      ? Number(capture.latitude)
      : null;
  const batchLng =
    capture?.longitude != null && Number.isFinite(Number(capture.longitude))
      ? Number(capture.longitude)
      : null;

  const createdIds: string[] = [];

  for (const item of items) {
    const objectUrl = normalizeObjectUrl(item.objectUrl);
    if (!objectUrl) throw httpError("Invalid object URL", 400);
    if (item.mimeType && !isAllowedGalleryMime(item.mimeType)) {
      throw httpError(`Unsupported image type: ${item.mimeType}`, 400);
    }

    const captureLatitude =
      item.captureLatitude != null && Number.isFinite(Number(item.captureLatitude))
        ? Number(item.captureLatitude)
        : batchLat;
    const captureLongitude =
      item.captureLongitude != null && Number.isFinite(Number(item.captureLongitude))
        ? Number(item.captureLongitude)
        : batchLng;
    const addressMatchStatus = compareCaptureToProperty(
      captureLatitude,
      captureLongitude,
      context.propertyLat,
      context.propertyLng,
    );

    const existing = await db
      .select()
      .from(inspectionGalleryImages)
      .where(
        and(
          eq(inspectionGalleryImages.inspectionId, inspectionId),
          eq(inspectionGalleryImages.objectUrl, objectUrl),
        ),
      )
      .limit(1);

    let imageId = existing[0]?.id;
    if (imageId && existing[0]?.deletedAt) {
      await db
        .update(inspectionGalleryImages)
        .set({
          deletedAt: null,
          fileName: item.fileName || existing[0].fileName,
          mimeType: item.mimeType || existing[0].mimeType,
          byteSize: item.byteSize ?? existing[0].byteSize,
          captureLatitude,
          captureLongitude,
          addressMatchStatus,
          updatedAt: new Date(),
        })
        .where(eq(inspectionGalleryImages.id, imageId));
    } else if (!imageId) {
      const [row] = await db
        .insert(inspectionGalleryImages)
        .values({
          organizationId,
          inspectionId,
          objectUrl,
          fileName: item.fileName || objectUrl.split("/").pop() || null,
          mimeType: item.mimeType || null,
          byteSize: item.byteSize ?? null,
          uploadedByUserId: user.id,
          captureLatitude,
          captureLongitude,
          addressMatchStatus,
        })
        .onConflictDoNothing({
          target: [inspectionGalleryImages.inspectionId, inspectionGalleryImages.objectUrl],
        })
        .returning();
      if (row) {
        imageId = row.id;
      } else {
        const again = await db
          .select()
          .from(inspectionGalleryImages)
          .where(
            and(
              eq(inspectionGalleryImages.inspectionId, inspectionId),
              eq(inspectionGalleryImages.objectUrl, objectUrl),
            ),
          )
          .limit(1);
        imageId = again[0]?.id;
        if (imageId) {
          await db
            .update(inspectionGalleryImages)
            .set({
              captureLatitude,
              captureLongitude,
              addressMatchStatus,
              updatedAt: new Date(),
            })
            .where(eq(inspectionGalleryImages.id, imageId));
        }
      }
    } else if (imageId) {
      await db
        .update(inspectionGalleryImages)
        .set({
          captureLatitude,
          captureLongitude,
          addressMatchStatus,
          updatedAt: new Date(),
        })
        .where(eq(inspectionGalleryImages.id, imageId));
    }

    if (imageId) {
      createdIds.push(imageId);
      if (dest) {
        await assignImagesInternal(inspection, user, [imageId], dest);
      }
    }
  }

  const all = await listGallery(inspectionId, user);
  return all.filter((g) => createdIds.includes(g.id));
}

async function findEntry(
  inspectionId: string,
  sectionRef: string,
  fieldKey: string,
) {
  const [entry] = await db
    .select()
    .from(inspectionEntries)
    .where(
      and(
        eq(inspectionEntries.inspectionId, inspectionId),
        eq(inspectionEntries.sectionRef, sectionRef),
        eq(inspectionEntries.fieldKey, fieldKey),
      ),
    )
    .limit(1);
  return entry;
}

async function appendPhotoToEntry(
  inspectionId: string,
  dest: PhotoDestination,
  objectUrl: string,
): Promise<void> {
  const entry = await findEntry(inspectionId, dest.sectionRef, dest.fieldKey);
  const current = Array.isArray(entry?.photos) ? [...entry!.photos!] : [];
  if (current.includes(objectUrl)) return;
  if (current.length >= GALLERY_FIELD_PHOTO_MAX) {
    throw httpError(
      `${formatDestinationLabel(dest)} already has ${current.length}/${GALLERY_FIELD_PHOTO_MAX} photos. Remove some before assigning more.`,
      400,
    );
  }
  const next = [...current, objectUrl];
  if (entry) {
    await storage.updateInspectionEntry(entry.id, { photos: next });
  } else {
    await storage.createInspectionEntry({
      inspectionId,
      sectionRef: dest.sectionRef,
      fieldKey: dest.fieldKey,
      fieldType: dest.fieldType,
      photos: next,
      valueJson: null,
    } as any);
  }
}

async function removePhotoFromEntry(
  inspectionId: string,
  sectionRef: string,
  fieldKey: string,
  objectUrl: string,
): Promise<void> {
  const entry = await findEntry(inspectionId, sectionRef, fieldKey);
  if (!entry || !Array.isArray(entry.photos)) return;
  const next = entry.photos.filter((p) => p !== objectUrl);
  await storage.updateInspectionEntry(entry.id, {
    photos: next.length ? next : null,
  } as any);
}

async function assignImagesInternal(
  inspection: Inspection,
  user: User,
  imageIds: string[],
  dest: PhotoDestination,
): Promise<void> {
  const images = await db
    .select()
    .from(inspectionGalleryImages)
    .where(
      and(
        eq(inspectionGalleryImages.inspectionId, inspection.id),
        isNull(inspectionGalleryImages.deletedAt),
        inArray(inspectionGalleryImages.id, imageIds),
      ),
    );

  if (images.length !== imageIds.length) {
    throw httpError("One or more images were not found in this inspection gallery", 404);
  }

  // Capacity is per field total (existing + new), not per assign batch
  const entry = await findEntry(inspection.id, dest.sectionRef, dest.fieldKey);
  const currentPhotos = Array.isArray(entry?.photos) ? entry!.photos! : [];
  const currentSet = new Set(currentPhotos);
  const newUrls = images
    .map((img) => img.objectUrl)
    .filter((url) => url && !currentSet.has(url));
  const remaining = Math.max(0, GALLERY_FIELD_PHOTO_MAX - currentPhotos.length);
  if (newUrls.length > remaining) {
    throw httpError(
      `${formatDestinationLabel(dest)} already has ${currentPhotos.length}/${GALLERY_FIELD_PHOTO_MAX} photos. ` +
        `You selected ${newUrls.length} new photo${newUrls.length === 1 ? "" : "s"} but only ${remaining} slot${remaining === 1 ? "" : "s"} left.`,
      400,
    );
  }

  for (const image of images) {
    // One photo → one inspection point: clear any prior assignments first.
    const prior = await db
      .select()
      .from(inspectionGalleryAssignments)
      .where(eq(inspectionGalleryAssignments.galleryImageId, image.id));
    for (const a of prior) {
      if (a.sectionRef === dest.sectionRef && a.fieldKey === dest.fieldKey) continue;
      await db
        .delete(inspectionGalleryAssignments)
        .where(eq(inspectionGalleryAssignments.id, a.id));
      await removePhotoFromEntry(
        inspection.id,
        a.sectionRef,
        a.fieldKey,
        image.objectUrl,
      );
    }

    await db
      .insert(inspectionGalleryAssignments)
      .values({
        galleryImageId: image.id,
        inspectionId: inspection.id,
        sectionRef: dest.sectionRef,
        fieldKey: dest.fieldKey,
        createdByUserId: user.id,
      })
      .onConflictDoNothing({
        target: [
          inspectionGalleryAssignments.galleryImageId,
          inspectionGalleryAssignments.sectionRef,
          inspectionGalleryAssignments.fieldKey,
        ],
      });

    await appendPhotoToEntry(inspection.id, dest, image.objectUrl);
  }
}

export async function assignGalleryImages(
  inspectionId: string,
  user: User,
  imageIds: string[],
  sectionRef: string,
  fieldKey: string,
): Promise<GalleryImageDto[]> {
  const { inspection } = await assertInspectionGalleryAccess(inspectionId, user, "write");
  if (!imageIds?.length) throw httpError("No images selected", 400);

  const counts = await loadRepeatableCounts(inspectionId, inspection);
  const entriesForDest = await storage.getInspectionEntries(inspectionId);
  const cipCounts = extractCipCountsFromEntries(entriesForDest);
  const dest = assertDestinationValid(
    inspection.templateSnapshotJson as any,
    sectionRef,
    fieldKey,
    counts,
    cipCounts,
  );
  if (!dest) throw httpError("Invalid assignment destination for this inspection template", 400);

  await assignImagesInternal(inspection, user, imageIds, dest);
  return listGallery(inspectionId, user);
}

export async function unassignGalleryImages(
  inspectionId: string,
  user: User,
  items: Array<{ imageId: string; sectionRef: string; fieldKey: string }>,
): Promise<GalleryImageDto[]> {
  const { inspection } = await assertInspectionGalleryAccess(inspectionId, user, "write");
  if (!items?.length) throw httpError("No unassign items provided", 400);

  for (const item of items) {
    const [image] = await db
      .select()
      .from(inspectionGalleryImages)
      .where(
        and(
          eq(inspectionGalleryImages.id, item.imageId),
          eq(inspectionGalleryImages.inspectionId, inspection.id),
        ),
      )
      .limit(1);
    if (!image) throw httpError("Gallery image not found", 404);

    await db
      .delete(inspectionGalleryAssignments)
      .where(
        and(
          eq(inspectionGalleryAssignments.galleryImageId, item.imageId),
          eq(inspectionGalleryAssignments.sectionRef, item.sectionRef),
          eq(inspectionGalleryAssignments.fieldKey, item.fieldKey),
        ),
      );

    await removePhotoFromEntry(
      inspection.id,
      item.sectionRef,
      item.fieldKey,
      image.objectUrl,
    );
  }

  return listGallery(inspectionId, user);
}

export async function moveGalleryImages(
  inspectionId: string,
  user: User,
  imageIds: string[],
  from: { sectionRef: string; fieldKey: string },
  to: { sectionRef: string; fieldKey: string },
): Promise<GalleryImageDto[]> {
  if (from.sectionRef === to.sectionRef && from.fieldKey === to.fieldKey) {
    return listGallery(inspectionId, user);
  }
  await unassignGalleryImages(
    inspectionId,
    user,
    imageIds.map((imageId) => ({
      imageId,
      sectionRef: from.sectionRef,
      fieldKey: from.fieldKey,
    })),
  );
  return assignGalleryImages(inspectionId, user, imageIds, to.sectionRef, to.fieldKey);
}

export async function deleteGalleryImages(
  inspectionId: string,
  user: User,
  imageIds: string[],
): Promise<{ deleted: number; assignmentCount: number }> {
  const { inspection } = await assertInspectionGalleryAccess(inspectionId, user, "write");
  if (!imageIds?.length) throw httpError("No images selected", 400);

  const images = await db
    .select()
    .from(inspectionGalleryImages)
    .where(
      and(
        eq(inspectionGalleryImages.inspectionId, inspection.id),
        inArray(inspectionGalleryImages.id, imageIds),
      ),
    );

  let assignmentCount = 0;
  for (const image of images) {
    const assignments = await db
      .select()
      .from(inspectionGalleryAssignments)
      .where(eq(inspectionGalleryAssignments.galleryImageId, image.id));
    assignmentCount += assignments.length;

    for (const a of assignments) {
      await removePhotoFromEntry(
        inspection.id,
        a.sectionRef,
        a.fieldKey,
        image.objectUrl,
      );
    }

    await db
      .delete(inspectionGalleryAssignments)
      .where(eq(inspectionGalleryAssignments.galleryImageId, image.id));

    await db
      .update(inspectionGalleryImages)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(inspectionGalleryImages.id, image.id));
  }

  return { deleted: images.length, assignmentCount };
}

/**
 * Drop gallery assignments whose sectionRef belongs to a removed inspection section.
 * Photos stay in the gallery (unassigned); entry rows are deleted separately.
 */
export async function clearGalleryAssignmentsForSection(
  inspectionId: string,
  sectionId: string,
): Promise<number> {
  const id = String(sectionId || "").trim();
  if (!id) return 0;

  const rows = await db
    .select()
    .from(inspectionGalleryAssignments)
    .where(eq(inspectionGalleryAssignments.inspectionId, inspectionId));

  const toDelete = rows.filter(
    (r) => r.sectionRef === id || r.sectionRef.startsWith(`${id}/`),
  );
  if (!toDelete.length) return 0;

  await db.delete(inspectionGalleryAssignments).where(
    inArray(
      inspectionGalleryAssignments.id,
      toDelete.map((r) => r.id),
    ),
  );
  return toDelete.length;
}

/** Drop gallery assignments for one inspection point (exact sectionRef). */
export async function clearGalleryAssignmentsForSectionRef(
  inspectionId: string,
  sectionRef: string,
): Promise<number> {
  const ref = String(sectionRef || "").trim();
  if (!ref) return 0;

  const rows = await db
    .select()
    .from(inspectionGalleryAssignments)
    .where(
      and(
        eq(inspectionGalleryAssignments.inspectionId, inspectionId),
        eq(inspectionGalleryAssignments.sectionRef, ref),
      ),
    );
  if (!rows.length) return 0;

  await db.delete(inspectionGalleryAssignments).where(
    inArray(
      inspectionGalleryAssignments.id,
      rows.map((r) => r.id),
    ),
  );
  return rows.length;
}
