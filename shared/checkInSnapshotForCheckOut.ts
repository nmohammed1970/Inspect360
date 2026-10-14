/**
 * Build a check-out inspection snapshot from the latest check-in snapshot.
 * Preserves sections, customInspectionPoints, and property-room instances from check-in,
 * remapping checkin→checkout ids where applicable.
 */

export type SnapshotLike = {
  sections?: Array<Record<string, any>>;
  customInspectionPoints?: Array<Record<string, any>>;
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
  // Template CIP ids and expanded instance keys stay stable across check-in/out
  if (id.startsWith("cip_") || id.startsWith("__cip_count_")) return id;
  if (id.includes("__i") && id.includes("__")) return id;
  return mapCheckInTokenToCheckOut(id);
}

export function mapCheckInSectionRefToCheckOut(sectionRef: string | undefined | null): string {
  if (!sectionRef) return "";
  const [base, ...rest] = String(sectionRef).split("/");
  const mappedBase = mapCheckInIdToCheckOutId(base);
  if (rest.length === 0) return mappedBase;
  return `${mappedBase}/${rest.join("/")}`;
}

function mapFieldForCheckOut(field: Record<string, any>): Record<string, any> {
  const next = { ...field };
  const originalId = typeof field.id === "string" ? field.id : typeof field.key === "string" ? field.key : "";
  const mappedId = mapCheckInIdToCheckOutId(originalId);
  if (mappedId) {
    next.id = mappedId;
    next.key = mappedId;
  } else if (typeof field.key === "string") {
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

function mapCustomInspectionPointForCheckOut(cip: Record<string, any>): Record<string, any> {
  return {
    ...cip,
    fields: Array.isArray(cip.fields)
      ? cip.fields.map((f: Record<string, any>) => mapFieldForCheckOut(f || {}))
      : [],
  };
}

/**
 * Deep-clone check-in templateSnapshotJson into a check-out snapshot.
 * Keeps sections, template customInspectionPoints, and property-room metadata.
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

  const customInspectionPoints = Array.isArray(raw.customInspectionPoints)
    ? raw.customInspectionPoints.map((c: Record<string, any>) =>
        mapCustomInspectionPointForCheckOut(c || {}),
      )
    : raw.customInspectionPoints;

  return {
    ...raw,
    sections,
    propertyRoomInstances,
    customInspectionPoints,
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
