/**
 * Build a check-out inspection snapshot from the latest check-in snapshot.
 * Preserves sections, custom points, and property-room instances from check-in,
 * remapping checkin→checkout ids where applicable.
 */

import { isCustomPointField } from "./inspectionCustomPoints";

export type SnapshotLike = {
  sections?: Array<Record<string, any>>;
  propertyRoomInstances?: Array<{
    roomId?: string;
    sectionRef?: string;
    title?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

function mapCheckInTokenToCheckOut(value: string): string {
  if (!value) return value;
  return value.replace(/check[_-]?in/gi, (match) => {
    const lower = match.toLowerCase();
    if (lower === "check_in") return "check_out";
    if (lower === "check-in") return "check-out";
    if (lower === "checkin") return "checkout";
    return match.replace(/in/i, "out");
  });
}

export function mapCheckInIdToCheckOutId(id: string | undefined | null): string {
  if (!id) return "";
  // Custom points keep stable ids so comparison / copy-by-id works
  if (id.startsWith("field_custom_")) return id;
  return mapCheckInTokenToCheckOut(id);
}

export function mapCheckInSectionRefToCheckOut(sectionRef: string | undefined | null): string {
  if (!sectionRef) return "";
  const [base, ...rest] = String(sectionRef).split("/");
  const mappedBase = mapCheckInIdToCheckOutId(base);
  if (rest.length === 0) return mappedBase;
  // Room UUID / instance suffix stays unchanged
  return `${mappedBase}/${rest.join("/")}`;
}

function mapFieldForCheckOut(field: Record<string, any>): Record<string, any> {
  const next = { ...field };
  const originalId = typeof field.id === "string" ? field.id : typeof field.key === "string" ? field.key : "";
  const mappedId = isCustomPointField(field) ? originalId : mapCheckInIdToCheckOutId(originalId);
  if (mappedId) {
    next.id = mappedId;
    next.key = mappedId;
  } else if (typeof field.key === "string" && !isCustomPointField(field)) {
    next.key = mapCheckInIdToCheckOutId(field.key);
  }
  return next;
}

function mapSectionForCheckOut(section: Record<string, any>): Record<string, any> {
  const mappedId = mapCheckInIdToCheckOutId(String(section.id || ""));
  return {
    ...section,
    id: mappedId || section.id,
    fields: Array.isArray(section.fields)
      ? section.fields.map((f: Record<string, any>) => mapFieldForCheckOut(f || {}))
      : [],
  };
}

/**
 * Deep-clone check-in templateSnapshotJson into a check-out snapshot.
 * Keeps the same sections/points (including customs and property-room metadata).
 */
export function buildCheckOutSnapshotFromCheckIn(
  checkInSnapshot: SnapshotLike | null | undefined,
): SnapshotLike {
  if (!checkInSnapshot || typeof checkInSnapshot !== "object") {
    throw new Error("Check-in template snapshot is missing or invalid");
  }

  const raw =
    typeof (checkInSnapshot as any) === "string"
      ? JSON.parse(checkInSnapshot as unknown as string)
      : structuredClone
        ? structuredClone(checkInSnapshot)
        : JSON.parse(JSON.stringify(checkInSnapshot));

  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((s: Record<string, any>) => mapSectionForCheckOut(s || {}))
    : [];

  const propertyRoomInstances = Array.isArray(raw.propertyRoomInstances)
    ? raw.propertyRoomInstances.map((inst: Record<string, any>) => ({
        ...inst,
        sectionRef: mapCheckInSectionRefToCheckOut(String(inst.sectionRef || "")),
      }))
    : raw.propertyRoomInstances;

  return {
    ...raw,
    sections,
    propertyRoomInstances,
  };
}

/**
 * Seed repeatable-count pseudo-entries from propertyRoomInstances / section.repeatable.
 */
export function buildSeedEntriesFromCheckOutSnapshot(snapshot: SnapshotLike | null | undefined): Array<{
  sectionRef: string;
  fieldKey: string;
  fieldType: string;
  valueJson: unknown;
}> {
  if (!snapshot?.sections) return [];
  const seeds: Array<{
    sectionRef: string;
    fieldKey: string;
    fieldType: string;
    valueJson: unknown;
  }> = [];

  const roomsBySection = new Map<string, number>();
  for (const inst of snapshot.propertyRoomInstances || []) {
    const ref = String(inst.sectionRef || "");
    if (!ref.includes("/")) continue;
    const sectionId = ref.split("/")[0]!;
    roomsBySection.set(sectionId, (roomsBySection.get(sectionId) || 0) + 1);
  }

  for (const section of snapshot.sections) {
    const id = String(section.id || "");
    if (!id || !section.repeatable) continue;
    const count = roomsBySection.get(id) ?? 1;
    seeds.push({
      sectionRef: id,
      fieldKey: `__repeatable_count_${id}`,
      fieldType: "number",
      valueJson: count,
    });
  }

  return seeds;
}

/**
 * True when checkout snapshot is missing any custom field that exists on check-in.
 */
export function checkoutSnapshotMissingCheckInCustoms(
  checkInSnapshot: SnapshotLike | null | undefined,
  checkOutSnapshot: SnapshotLike | null | undefined,
): boolean {
  if (!checkInSnapshot?.sections?.length) return false;
  const checkoutIds = new Set<string>();
  for (const section of checkOutSnapshot?.sections || []) {
    for (const field of section.fields || []) {
      const id = String(field.id || field.key || "");
      if (id) checkoutIds.add(id);
    }
  }
  for (const section of checkInSnapshot.sections) {
    for (const field of section.fields || []) {
      if (!isCustomPointField(field)) continue;
      const id = String(field.id || field.key || "");
      if (id && !checkoutIds.has(id)) return true;
    }
  }
  return false;
}
