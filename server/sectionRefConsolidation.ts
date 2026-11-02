/**
 * Consolidate dual sectionRef keys (UUID ↔ synthetic Title N ↔ Overview N)
 * onto the canonical primary instance ref used by Capture + gallery destinations.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  inspectionGalleryAssignments,
  type Inspection,
  type InspectionEntry,
} from "@shared/schema";
import {
  extractRepeatableCountsFromEntries,
  listRepeatableInstances,
  resolveInstanceRefFamily,
  sectionIdFromRef,
} from "@shared/inspectionGallery";
import {
  entryLookupKey,
  mergeEntriesAcrossRefs,
  uniqueSectionRefs,
} from "@shared/inspectionProgress";

function entryHasAnyData(entry: InspectionEntry | undefined | null): boolean {
  if (!entry) return false;
  if (Array.isArray(entry.photos) && entry.photos.some((p) => typeof p === "string" && p.trim())) {
    return true;
  }
  if (typeof entry.note === "string" && entry.note.trim()) return true;
  if (entry.markedForReview) return true;
  const v = entry.valueJson;
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number" || typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return false;
}

async function remapGalleryAssignments(
  inspectionId: string,
  fromRefs: string[],
  toRef: string,
): Promise<void> {
  const sources = fromRefs.filter((r) => r && r !== toRef);
  if (!sources.length) return;

  const rows = await db
    .select()
    .from(inspectionGalleryAssignments)
    .where(
      and(
        eq(inspectionGalleryAssignments.inspectionId, inspectionId),
        inArray(inspectionGalleryAssignments.sectionRef, sources),
      ),
    );

  for (const row of rows) {
    // Prefer a single assignment on the canonical ref; drop the alias row.
    await db
      .insert(inspectionGalleryAssignments)
      .values({
        galleryImageId: row.galleryImageId,
        inspectionId,
        sectionRef: toRef,
        fieldKey: row.fieldKey,
        createdByUserId: row.createdByUserId,
      })
      .onConflictDoNothing({
        target: [
          inspectionGalleryAssignments.galleryImageId,
          inspectionGalleryAssignments.sectionRef,
          inspectionGalleryAssignments.fieldKey,
        ],
      });
    await db
      .delete(inspectionGalleryAssignments)
      .where(eq(inspectionGalleryAssignments.id, row.id));
  }
}

/**
 * Merge alias entry rows into the primary sectionRef for every repeatable
 * instance on this inspection. Safe to call on GET entries / before writes.
 * Returns how many alias rows were removed.
 */
export async function consolidateInspectionSectionRefAliases(
  inspection: Inspection,
): Promise<number> {
  const structure = inspection.templateSnapshotJson as any;
  if (!structure || !Array.isArray(structure.sections)) return 0;

  const entries = await storage.getInspectionEntries(inspection.id);
  if (!entries.length) return 0;

  const counts = extractRepeatableCountsFromEntries(entries);
  const byKey = new Map<string, InspectionEntry>();
  for (const e of entries) {
    byKey.set(entryLookupKey(e.sectionRef, e.fieldKey), e);
  }

  // Build families for every known instance (repeatable + forced room types).
  const families: Array<{ primary: string; allRefs: string[] }> = [];
  const seenPrimary = new Set<string>();
  for (const section of structure.sections) {
    if (!section?.id) continue;
    const force = !section.repeatable;
    const instances = listRepeatableInstances(
      structure,
      section.id,
      counts,
      force,
    );
    for (const inst of instances) {
      if (seenPrimary.has(inst.sectionRef)) continue;
      seenPrimary.add(inst.sectionRef);
      families.push({
        primary: inst.sectionRef,
        allRefs: uniqueSectionRefs(inst.sectionRef, inst.aliasRefs),
      });
    }
  }

  // Also discover orphan alias refs present in entries (e.g. Overview N)
  // that resolve into a known family.
  for (const entry of entries) {
    const ref = String(entry.sectionRef || "").trim();
    if (!ref.includes("/")) continue;
    if (seenPrimary.has(ref)) continue;
    const family = resolveInstanceRefFamily(structure, ref, counts);
    if (!family || family.primary === ref) continue;
    if (seenPrimary.has(family.primary)) {
      // Ensure this alias is included in that family's allRefs via merge loop below
      continue;
    }
    seenPrimary.add(family.primary);
    families.push({ primary: family.primary, allRefs: family.allRefs });
  }

  let removed = 0;
  const entriesMap: Record<string, InspectionEntry> = {};
  for (const [k, v] of byKey) entriesMap[k] = v;

  for (const family of families) {
    const aliasRefs = family.allRefs.filter((r) => r !== family.primary);
    if (!aliasRefs.length) continue;

    // Field keys that appear under any ref in this family
    const fieldKeys = new Set<string>();
    for (const ref of family.allRefs) {
      for (const e of entries) {
        if (e.sectionRef === ref) fieldKeys.add(e.fieldKey);
      }
    }

    for (const fieldKey of fieldKeys) {
      const merged = mergeEntriesAcrossRefs(
        entriesMap,
        fieldKey,
        family.primary,
        aliasRefs,
      );
      if (!merged || !entryHasAnyData(merged)) {
        // Still delete empty alias shells if primary exists or aliases are empty shells
        for (const alias of aliasRefs) {
          const aliasRow = byKey.get(entryLookupKey(alias, fieldKey));
          if (!aliasRow?.id) continue;
          await storage.deleteInspectionEntry(aliasRow.id);
          byKey.delete(entryLookupKey(alias, fieldKey));
          delete entriesMap[entryLookupKey(alias, fieldKey)];
          removed += 1;
        }
        continue;
      }

      const primaryRow = byKey.get(entryLookupKey(family.primary, fieldKey));
      const payload = {
        inspectionId: inspection.id,
        sectionRef: family.primary,
        fieldKey,
        fieldType: merged.fieldType || primaryRow?.fieldType || "text",
        valueJson: merged.valueJson ?? null,
        note: merged.note ?? null,
        photos: Array.isArray(merged.photos) && merged.photos.length ? merged.photos : null,
        markedForReview: !!(merged as any).markedForReview,
      };

      if (primaryRow?.id) {
        await storage.updateInspectionEntry(primaryRow.id, payload as any);
        const updated = { ...primaryRow, ...payload, id: primaryRow.id };
        byKey.set(entryLookupKey(family.primary, fieldKey), updated as InspectionEntry);
        entriesMap[entryLookupKey(family.primary, fieldKey)] = updated as InspectionEntry;
      } else {
        const created = await storage.createInspectionEntry(payload as any);
        byKey.set(entryLookupKey(family.primary, fieldKey), created);
        entriesMap[entryLookupKey(family.primary, fieldKey)] = created;
      }

      for (const alias of aliasRefs) {
        const aliasRow = byKey.get(entryLookupKey(alias, fieldKey));
        if (!aliasRow?.id) continue;
        if (aliasRow.id === primaryRow?.id) continue;
        await storage.deleteInspectionEntry(aliasRow.id);
        byKey.delete(entryLookupKey(alias, fieldKey));
        delete entriesMap[entryLookupKey(alias, fieldKey)];
        removed += 1;
      }
    }

    await remapGalleryAssignments(inspection.id, aliasRefs, family.primary);
  }

  // Remap any leftover gallery assignments whose sectionRef resolves to a primary
  const remainingAssignments = await db
    .select()
    .from(inspectionGalleryAssignments)
    .where(eq(inspectionGalleryAssignments.inspectionId, inspection.id));
  for (const row of remainingAssignments) {
    const family = resolveInstanceRefFamily(structure, row.sectionRef, counts);
    if (!family || family.primary === row.sectionRef) continue;
    await db
      .insert(inspectionGalleryAssignments)
      .values({
        galleryImageId: row.galleryImageId,
        inspectionId: inspection.id,
        sectionRef: family.primary,
        fieldKey: row.fieldKey,
        createdByUserId: row.createdByUserId,
      })
      .onConflictDoNothing({
        target: [
          inspectionGalleryAssignments.galleryImageId,
          inspectionGalleryAssignments.sectionRef,
          inspectionGalleryAssignments.fieldKey,
        ],
      });
    await db
      .delete(inspectionGalleryAssignments)
      .where(eq(inspectionGalleryAssignments.id, row.id));
  }

  return removed;
}

/** Canonical sectionRef for a write (UUID primary when aliases exist). */
export function canonicalizeEntrySectionRef(
  inspection: Inspection,
  sectionRef: string,
  entriesForCounts?: InspectionEntry[],
): string {
  const structure = inspection.templateSnapshotJson as any;
  const counts = extractRepeatableCountsFromEntries(entriesForCounts || []);
  const family = resolveInstanceRefFamily(structure, sectionRef, counts);
  return family?.primary || sectionRef;
}

export { sectionIdFromRef };
