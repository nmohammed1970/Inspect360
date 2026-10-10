/** Property layout room counts + inspection template seeding helpers. */

export const ROOM_COUNT_MIN = 1;
export const ROOM_COUNT_MAX = 30;

export type RoomTypeKey = "bedrooms" | "kitchens" | "bathrooms" | "livingRooms";

export type PropertyRoomCounts = {
  bedrooms: number;
  kitchens: number;
  bathrooms: number;
  livingRooms: number;
};

export type PropertyRoomCountsSnapshot = PropertyRoomCounts & {
  source: "property";
  capturedAt: string;
};

export type ConfidenceLevel = "high" | "medium" | "low";

export type AiEstimatedMeasurement = {
  roomLabel: string;
  roomType?: RoomTypeKey | "other";
  lengthM?: number | null;
  widthM?: number | null;
  areaM2?: number | null;
};

export type AiLayoutSuggestion = {
  bedrooms: number;
  kitchens: number;
  bathrooms: number;
  livingRooms: number;
  confidence?: Partial<Record<RoomTypeKey, ConfidenceLevel>>;
  estimatedMeasurements?: AiEstimatedMeasurement[];
  notes?: string;
};

export type FloorPlanAnalysisStatus =
  | "none"
  | "uploading"
  | "processing"
  | "complete"
  | "failed";

export type TemplateSectionLike = {
  id: string;
  title?: string;
  repeatable?: boolean;
  fields?: Array<{
    id: string;
    key?: string;
    label?: string;
    type?: string;
  }>;
};

export type TemplateStructureLike = {
  sections?: TemplateSectionLike[];
  [key: string]: unknown;
};

export type SeedInspectionEntry = {
  sectionRef: string;
  fieldKey: string;
  fieldType: string;
  valueJson: unknown;
};

const DEFAULT_COUNTS: PropertyRoomCounts = {
  bedrooms: 1,
  kitchens: 1,
  bathrooms: 1,
  livingRooms: 1,
};

export function clampRoomCount(value: unknown, fallback = ROOM_COUNT_MIN): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(ROOM_COUNT_MIN, Math.min(ROOM_COUNT_MAX, Math.floor(n)));
}

export function parseRoomCounts(
  input: Partial<Record<RoomTypeKey, unknown>> | null | undefined,
): PropertyRoomCounts {
  return {
    bedrooms: clampRoomCount(input?.bedrooms, DEFAULT_COUNTS.bedrooms),
    kitchens: clampRoomCount(input?.kitchens, DEFAULT_COUNTS.kitchens),
    bathrooms: clampRoomCount(input?.bathrooms, DEFAULT_COUNTS.bathrooms),
    livingRooms: clampRoomCount(input?.livingRooms, DEFAULT_COUNTS.livingRooms),
  };
}

export function roomCountZodShape() {
  // Lazy import avoided — callers use z from zod with this helper's bounds
  return {
    min: ROOM_COUNT_MIN,
    max: ROOM_COUNT_MAX,
  };
}

function asConfidence(value: unknown): ConfidenceLevel | undefined {
  if (value === "high" || value === "medium" || value === "low") return value;
  return undefined;
}

/**
 * Treat AI layout JSON as untrusted. Clamp counts; drop invalid measurements.
 */
export function normalizeAiLayoutResult(raw: unknown): AiLayoutSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const counts = parseRoomCounts({
    bedrooms: obj.bedrooms ?? obj.bedroomCount,
    kitchens: obj.kitchens ?? obj.kitchenCount,
    bathrooms: obj.bathrooms ?? obj.bathroomCount,
    livingRooms: obj.livingRooms ?? obj.livingRoomCount ?? obj.living_rooms,
  });

  const confRaw = (obj.confidence ?? obj.confidences) as Record<string, unknown> | undefined;
  const confidence: Partial<Record<RoomTypeKey, ConfidenceLevel>> = {};
  if (confRaw && typeof confRaw === "object") {
    const b = asConfidence(confRaw.bedrooms);
    const k = asConfidence(confRaw.kitchens);
    const ba = asConfidence(confRaw.bathrooms);
    const l = asConfidence(confRaw.livingRooms ?? confRaw.living_rooms);
    if (b) confidence.bedrooms = b;
    if (k) confidence.kitchens = k;
    if (ba) confidence.bathrooms = ba;
    if (l) confidence.livingRooms = l;
  }

  const measurementsRaw = obj.estimatedMeasurements ?? obj.measurements ?? obj.rooms;
  const estimatedMeasurements: AiEstimatedMeasurement[] = [];
  if (Array.isArray(measurementsRaw)) {
    for (const item of measurementsRaw.slice(0, 40)) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;
      const roomLabel = String(m.roomLabel ?? m.label ?? m.name ?? "").trim();
      if (!roomLabel) continue;
      const lengthM = Number(m.lengthM ?? m.length ?? m.length_m);
      const widthM = Number(m.widthM ?? m.width ?? m.width_m);
      const areaM2 = Number(m.areaM2 ?? m.area ?? m.area_m2);
      estimatedMeasurements.push({
        roomLabel: roomLabel.slice(0, 120),
        roomType: normalizeRoomTypeKey(m.roomType ?? m.type),
        lengthM: Number.isFinite(lengthM) && lengthM > 0 ? Math.round(lengthM * 100) / 100 : null,
        widthM: Number.isFinite(widthM) && widthM > 0 ? Math.round(widthM * 100) / 100 : null,
        areaM2: Number.isFinite(areaM2) && areaM2 > 0 ? Math.round(areaM2 * 100) / 100 : null,
      });
    }
  }

  return {
    ...counts,
    confidence: Object.keys(confidence).length ? confidence : undefined,
    estimatedMeasurements: estimatedMeasurements.length ? estimatedMeasurements : undefined,
    notes: typeof obj.notes === "string" ? obj.notes.slice(0, 500) : undefined,
  };
}

function normalizeRoomTypeKey(value: unknown): RoomTypeKey | "other" | undefined {
  const s = String(value ?? "").toLowerCase();
  if (!s) return undefined;
  if (s.includes("bedroom") || s === "bedrooms") return "bedrooms";
  if (s.includes("kitchen")) return "kitchens";
  if (s.includes("bath") || s.includes("wc") || s.includes("toilet") || s.includes("ensuite")) {
    return "bathrooms";
  }
  if (s.includes("living") || s.includes("lounge") || s.includes("reception")) return "livingRooms";
  return "other";
}

export function matchSectionToRoomType(section: TemplateSectionLike): RoomTypeKey | null {
  const title = (section.title || "").toLowerCase();
  const id = (section.id || "").toLowerCase();
  const hay = `${title} ${id}`;

  // Order matters: bathroom before bath-as-substring of other words; bedroom before bed
  if (hay.includes("bedroom")) return "bedrooms";
  if (hay.includes("bathroom") || hay.includes("ensuite") || /\bbath\b/.test(hay) || hay.includes("wc")) {
    return "bathrooms";
  }
  if (hay.includes("kitchen")) return "kitchens";
  if (hay.includes("living") || hay.includes("lounge") || hay.includes("reception")) return "livingRooms";
  return null;
}

export function matchTemplateSectionsToRoomTypes(
  sections: TemplateSectionLike[],
): Partial<Record<RoomTypeKey, TemplateSectionLike>> {
  const map: Partial<Record<RoomTypeKey, TemplateSectionLike>> = {};
  for (const section of sections) {
    const key = matchSectionToRoomType(section);
    if (!key) continue;
    // Prefer first match; keep earliest bedroom/bathroom section
    if (!map[key]) map[key] = section;
  }
  return map;
}

export function isBedroomCountField(field: {
  id?: string;
  key?: string;
  label?: string;
} | null | undefined): boolean {
  if (!field) return false;
  const label = (field.label || "").toLowerCase();
  const id = (field.id || "").toLowerCase();
  const key = (field.key || "").toLowerCase();
  return (
    (label.includes("number") && label.includes("bedroom")) ||
    id.includes("num_bedroom") ||
    key.includes("num_bedroom")
  );
}

function findBedroomCountField(sections: TemplateSectionLike[]) {
  const general = sections.find(
    (s) =>
      (s.title || "").toLowerCase().includes("general") ||
      (s.id || "").toLowerCase().includes("general"),
  );
  if (!general?.fields) return null;
  const field = general.fields.find((f) => isBedroomCountField(f));
  if (!field) return null;
  return { section: general, field };
}

/**
 * Clone template structure, force Kitchen/Living repeatable when applying counts,
 * and produce seed inspection_entries for repeatable counts + General bedroom field.
 */
export function applyPropertyCountsToTemplateSnapshot(
  structure: TemplateStructureLike | null | undefined,
  countsInput: Partial<PropertyRoomCounts>,
): {
  structure: TemplateStructureLike;
  seedEntries: SeedInspectionEntry[];
  counts: PropertyRoomCounts;
  sectionMap: Partial<Record<RoomTypeKey, TemplateSectionLike>>;
} {
  const counts = parseRoomCounts(countsInput);
  const structureClone: TemplateStructureLike = JSON.parse(JSON.stringify(structure || { sections: [] }));
  const sections = Array.isArray(structureClone.sections) ? structureClone.sections : [];
  structureClone.sections = sections;

  const sectionMap = matchTemplateSectionsToRoomTypes(sections);
  const seedEntries: SeedInspectionEntry[] = [];

  const applyCount = (roomType: RoomTypeKey, count: number) => {
    const section = sectionMap[roomType];
    if (!section) return;
    // Make Kitchen / Living Room repeatable on this inspection snapshot only
    if (roomType === "kitchens" || roomType === "livingRooms") {
      section.repeatable = true;
    }
    if (section.repeatable || roomType === "bedrooms" || roomType === "bathrooms") {
      section.repeatable = true;
      seedEntries.push({
        sectionRef: section.id,
        fieldKey: `__repeatable_count_${section.id}`,
        fieldType: "number",
        valueJson: count,
      });
    }
  };

  applyCount("bedrooms", counts.bedrooms);
  applyCount("kitchens", counts.kitchens);
  applyCount("bathrooms", counts.bathrooms);
  applyCount("livingRooms", counts.livingRooms);

  const bedroomField = findBedroomCountField(sections);
  if (bedroomField) {
    seedEntries.push({
      sectionRef: bedroomField.section.id,
      fieldKey: bedroomField.field.id,
      fieldType: bedroomField.field.type || "number",
      valueJson: { value: counts.bedrooms },
    });
  }

  return { structure: structureClone, seedEntries, counts, sectionMap };
}

export function buildPropertyRoomCountsSnapshot(
  countsInput: Partial<PropertyRoomCounts>,
  capturedAt: Date = new Date(),
): PropertyRoomCountsSnapshot {
  return {
    ...parseRoomCounts(countsInput),
    source: "property",
    capturedAt: capturedAt.toISOString(),
  };
}

/**
 * Map property/snapshot room counts onto template section ids
 * (bedrooms, kitchens, bathrooms, living rooms).
 */
export function repeatableCountsFromPropertyLayout(
  structure: TemplateStructureLike | null | undefined,
  countsInput: Partial<PropertyRoomCounts> | null | undefined,
): Record<string, number> {
  const counts = parseRoomCounts(countsInput);
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const sectionMap = matchTemplateSectionsToRoomTypes(sections);
  const result: Record<string, number> = {};

  const pairs: Array<[RoomTypeKey, number]> = [
    ["bedrooms", counts.bedrooms],
    ["kitchens", counts.kitchens],
    ["bathrooms", counts.bathrooms],
    ["livingRooms", counts.livingRooms],
  ];

  for (const [roomType, count] of pairs) {
    const section = sectionMap[roomType];
    if (section?.id) {
      result[section.id] = count;
    }
  }
  return result;
}

/** Parse stored repeatable-count valueJson (plain number or { value }). */
export function parseRepeatableCountValue(valueJson: unknown, fallback = ROOM_COUNT_MIN): number {
  if (typeof valueJson === "number" && Number.isFinite(valueJson)) {
    return clampRoomCount(valueJson, fallback);
  }
  if (valueJson && typeof valueJson === "object" && "value" in (valueJson as object)) {
    return clampRoomCount((valueJson as { value: unknown }).value, fallback);
  }
  if (typeof valueJson === "string" && valueJson.trim() !== "") {
    return clampRoomCount(Number(valueJson), fallback);
  }
  return fallback;
}

export function formatRoomCountsSummary(counts: PropertyRoomCounts): string {
  const parts = [
    `${counts.bedrooms} Bedroom${counts.bedrooms === 1 ? "" : "s"}`,
    `${counts.kitchens} Kitchen${counts.kitchens === 1 ? "" : "s"}`,
    `${counts.bathrooms} Bathroom${counts.bathrooms === 1 ? "" : "s"}`,
    `${counts.livingRooms} Living Room${counts.livingRooms === 1 ? "" : "s"}`,
  ];
  return parts.join(" · ");
}

export const FLOOR_PLAN_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export const FLOOR_PLAN_MAX_BYTES = 25 * 1024 * 1024;

export function isAllowedFloorPlanMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const normalized = mime.toLowerCase().split(";")[0].trim();
  return (FLOOR_PLAN_ALLOWED_MIME_TYPES as readonly string[]).includes(normalized);
}
