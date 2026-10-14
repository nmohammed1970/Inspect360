/**
 * Property rooms: categories, dimension units (stored as mm), AI room proposals,
 * and inspection seeding helpers.
 */

import type { PropertyRoomCounts, RoomTypeKey, TemplateSectionLike, TemplateStructureLike, SeedInspectionEntry, ConfidenceLevel } from "./propertyLayout";
import {
  applyPropertyCountsToTemplateSnapshot,
  clampRoomCount,
  matchSectionToRoomType,
  matchTemplateSectionsToRoomTypes,
  parseRoomCounts,
} from "./propertyLayout";

export type LengthUnit = "m" | "cm" | "mm" | "ft" | "in";
export type AreaUnit = "m2" | "ft2";

export const SYSTEM_ROOM_CATEGORIES: Array<{
  name: string;
  slug: string;
  sortOrder: number;
  roomType: RoomTypeKey | "other";
}> = [
  { name: "Bedroom", slug: "bedroom", sortOrder: 10, roomType: "bedrooms" },
  { name: "Master Bedroom", slug: "master-bedroom", sortOrder: 20, roomType: "bedrooms" },
  { name: "Bathroom", slug: "bathroom", sortOrder: 30, roomType: "bathrooms" },
  { name: "En-suite", slug: "en-suite", sortOrder: 40, roomType: "bathrooms" },
  { name: "Kitchen", slug: "kitchen", sortOrder: 50, roomType: "kitchens" },
  { name: "Living Room", slug: "living-room", sortOrder: 60, roomType: "livingRooms" },
  { name: "Dining Room", slug: "dining-room", sortOrder: 70, roomType: "other" },
  { name: "Hallway", slug: "hallway", sortOrder: 80, roomType: "other" },
  { name: "Utility", slug: "utility", sortOrder: 90, roomType: "other" },
  { name: "Garden", slug: "garden", sortOrder: 100, roomType: "other" },
  { name: "Garage", slug: "garage", sortOrder: 110, roomType: "other" },
  { name: "Study", slug: "study", sortOrder: 120, roomType: "other" },
  { name: "Storage", slug: "storage", sortOrder: 130, roomType: "other" },
  { name: "Other", slug: "other", sortOrder: 999, roomType: "other" },
];

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function slugifyCategoryName(name: string): string {
  return normalizeCategoryName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "other";
}

/** Default length unit from org ISO country code (not browser locale). */
export function defaultLengthUnitForCountry(countryCode: string | null | undefined): LengthUnit {
  const cc = (countryCode || "GB").toUpperCase();
  if (cc === "US") return "ft";
  return "m";
}

export function defaultAreaUnitForCountry(countryCode: string | null | undefined): AreaUnit {
  return defaultLengthUnitForCountry(countryCode) === "ft" ? "ft2" : "m2";
}

const MM_PER: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export function toMillimetres(value: number, unit: LengthUnit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * MM_PER[unit]);
}

export function fromMillimetres(mm: number | null | undefined, unit: LengthUnit): number | null {
  if (mm == null || !Number.isFinite(mm) || mm <= 0) return null;
  const v = mm / MM_PER[unit];
  if (unit === "mm") return Math.round(v);
  if (unit === "cm" || unit === "in") return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

export function floorAreaM2(
  widthMm: number | null | undefined,
  lengthMm: number | null | undefined,
): number | null {
  if (widthMm == null || lengthMm == null || widthMm <= 0 || lengthMm <= 0) return null;
  return Math.round(((widthMm / 1000) * (lengthMm / 1000)) * 100) / 100;
}

export function floorAreaFt2(
  widthMm: number | null | undefined,
  lengthMm: number | null | undefined,
): number | null {
  const m2 = floorAreaM2(widthMm, lengthMm);
  if (m2 == null) return null;
  return Math.round(m2 * 10.76391041671 * 10) / 10;
}

export function formatFloorArea(
  widthMm: number | null | undefined,
  lengthMm: number | null | undefined,
  areaUnit: AreaUnit,
): string | null {
  if (areaUnit === "ft2") {
    const ft2 = floorAreaFt2(widthMm, lengthMm);
    return ft2 == null ? null : `${ft2} ft²`;
  }
  const m2 = floorAreaM2(widthMm, lengthMm);
  return m2 == null ? null : `${m2} m²`;
}

export type CategoryRoomType = RoomTypeKey | "other";

export function roomTypeFromCategorySlug(slug: string | null | undefined): CategoryRoomType {
  const s = (slug || "").toLowerCase();
  if (s.includes("bedroom") || s === "bed") return "bedrooms";
  if (s.includes("bath") || s.includes("ensuite") || s.includes("en-suite") || s === "wc") {
    return "bathrooms";
  }
  if (s.includes("kitchen")) return "kitchens";
  if (s.includes("living") || s.includes("lounge") || s.includes("reception")) return "livingRooms";
  return "other";
}

export function roomTypeFromCategoryName(name: string | null | undefined): CategoryRoomType {
  return roomTypeFromCategorySlug(slugifyCategoryName(name || ""));
}

export type RoomLikeForCounts = {
  categorySlug?: string | null;
  categoryName?: string | null;
};

/** Recompute legacy property count columns from a room list. */
export function countsFromRooms(rooms: RoomLikeForCounts[]): PropertyRoomCounts {
  const tallies: Record<RoomTypeKey, number> = {
    bedrooms: 0,
    kitchens: 0,
    bathrooms: 0,
    livingRooms: 0,
  };
  for (const room of rooms) {
    const type = room.categorySlug
      ? roomTypeFromCategorySlug(room.categorySlug)
      : roomTypeFromCategoryName(room.categoryName);
    if (type !== "other") tallies[type] += 1;
  }
  return {
    bedrooms: clampRoomCount(tallies.bedrooms || 1, 1),
    kitchens: clampRoomCount(tallies.kitchens || 1, 1),
    bathrooms: clampRoomCount(tallies.bathrooms || 1, 1),
    livingRooms: clampRoomCount(tallies.livingRooms || 1, 1),
  };
}

export type PropertyRoomSnapshotItem = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categorySlug?: string;
  widthMm?: number | null;
  lengthMm?: number | null;
  ceilingHeightMm?: number | null;
};

export type PropertyRoomsSnapshot = {
  source: "property";
  capturedAt: string;
  rooms: PropertyRoomSnapshotItem[];
};

export function buildPropertyRoomsSnapshot(
  rooms: PropertyRoomSnapshotItem[],
  capturedAt: Date = new Date(),
): PropertyRoomsSnapshot {
  return {
    source: "property",
    capturedAt: capturedAt.toISOString(),
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      categorySlug: r.categorySlug,
      widthMm: r.widthMm ?? null,
      lengthMm: r.lengthMm ?? null,
      ceilingHeightMm: r.ceilingHeightMm ?? null,
    })),
  };
}

export type AiProposedRoom = {
  name: string;
  category: string;
  widthM?: number | null;
  lengthM?: number | null;
  areaM2?: number | null;
  confidence?: ConfidenceLevel;
};

/**
 * Normalize AI room-list output. Dimensions left null when unreliable.
 * Also derives four aggregate counts for legacy columns.
 */
export function normalizeAiRoomsResult(raw: unknown): {
  rooms: AiProposedRoom[];
  counts: PropertyRoomCounts;
  notes?: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const listRaw = obj.rooms ?? obj.proposedRooms ?? obj.estimatedMeasurements;
  const rooms: AiProposedRoom[] = [];

  if (Array.isArray(listRaw)) {
    for (const item of listRaw.slice(0, 60)) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;
      const name = String(m.name ?? m.roomLabel ?? m.label ?? "").trim().slice(0, 160);
      if (!name) continue;
      const category = String(m.category ?? m.roomType ?? m.type ?? "Other").trim().slice(0, 120) || "Other";
      const widthM = Number(m.widthM ?? m.width ?? m.width_m);
      const lengthM = Number(m.lengthM ?? m.length ?? m.length_m);
      const areaM2 = Number(m.areaM2 ?? m.area ?? m.area_m2);
      const conf = m.confidence;
      rooms.push({
        name,
        category,
        widthM: Number.isFinite(widthM) && widthM > 0 ? Math.round(widthM * 100) / 100 : null,
        lengthM: Number.isFinite(lengthM) && lengthM > 0 ? Math.round(lengthM * 100) / 100 : null,
        areaM2: Number.isFinite(areaM2) && areaM2 > 0 ? Math.round(areaM2 * 100) / 100 : null,
        confidence:
          conf === "high" || conf === "medium" || conf === "low" ? conf : undefined,
      });
    }
  }

  const countsFromProposed = countsFromRooms(
    rooms.map((r) => ({ categoryName: r.category })),
  );
  const counts = parseRoomCounts({
    bedrooms: obj.bedrooms ?? countsFromProposed.bedrooms,
    kitchens: obj.kitchens ?? countsFromProposed.kitchens,
    bathrooms: obj.bathrooms ?? countsFromProposed.bathrooms,
    livingRooms: obj.livingRooms ?? obj.living_rooms ?? countsFromProposed.livingRooms,
  });

  return {
    rooms,
    counts,
    notes: typeof obj.notes === "string" ? obj.notes.slice(0, 500) : undefined,
  };
}

export function metresToMm(m: number | null | undefined): number | null {
  if (m == null || !Number.isFinite(m) || m <= 0) return null;
  return Math.round(m * 1000);
}

function isGeneralOrSignoffSection(section: TemplateSectionLike): boolean {
  const hay = `${section.title || ""} ${section.id || ""}`.toLowerCase();
  return (
    hay.includes("general") ||
    hay.includes("overview") ||
    hay.includes("sign-off") ||
    hay.includes("signoff") ||
    hay.includes("sign_off")
  );
}

function pickRoomFieldTemplateSection(
  sections: TemplateSectionLike[],
): TemplateSectionLike | null {
  const map = matchTemplateSectionsToRoomTypes(sections);
  return (
    map.bathrooms ||
    map.kitchens ||
    map.livingRooms ||
    map.bedrooms ||
    sections.find((s) => (s.fields?.length ?? 0) > 0 && !isGeneralOrSignoffSection(s)) ||
    null
  );
}

function createAutoRoomSection(
  categoryName: string,
  categorySlug: string,
  fieldTemplate: TemplateSectionLike | null,
): TemplateSectionLike {
  const title = categoryName.trim() || "Other";
  const slug = (categorySlug || slugifyCategoryName(title)).slice(0, 60) || "other";
  const id = `section_${slug}`.replace(/[^a-z0-9_]+/g, "_").slice(0, 80);
  const fields = (fieldTemplate?.fields || []).map((f, i) => {
    const baseId = String(f.id || f.key || `field_${i}`);
    const newId = `field_${slug}_${baseId}`.slice(0, 120);
    const label = String(f.label || "Item").replace(
      /\b(Kitchens?|Bathrooms?|Bedrooms?|Living Rooms?|Living Room)\b/gi,
      title,
    );
    return {
      ...f,
      id: newId,
      key: newId,
      label,
    };
  });
  if (fields.length === 0) {
    fields.push({
      id: `field_${slug}_condition`,
      key: `field_${slug}_condition`,
      label: `${title} Condition`,
      type: "photo_array",
    });
  }
  return {
    id,
    title,
    repeatable: true,
    fields,
    // Marks sections injected from property room categories (idempotent re-apply)
    propertyRoomAuto: true,
  } as TemplateSectionLike;
}

/** Insert auto room sections after Bathrooms and before Sign-Off. */
function insertSectionAfterBathrooms(
  sections: TemplateSectionLike[],
  section: TemplateSectionLike,
): void {
  if (sections.some((s) => s.id === section.id)) return;
  const bathIdx = sections.findIndex((s) => matchSectionToRoomType(s) === "bathrooms");
  const signIdx = sections.findIndex((s) => {
    const hay = `${s.title || ""} ${s.id || ""}`.toLowerCase();
    return hay.includes("sign");
  });
  let insertAt = signIdx >= 0 ? signIdx : sections.length;
  if (bathIdx >= 0 && insertAt <= bathIdx) {
    insertAt = bathIdx + 1;
  }
  sections.splice(insertAt, 0, section);
}

/**
 * Seed inspection instances from property rooms.
 * Uses stable room id in sectionRef path: `{sectionId}/{roomId}`.
 *
 * Known types (bedroom/master bedroom, bathroom, kitchen, living) map onto template
 * sections. Other categories (Garden, Garage, …) get new repeatable sections inserted
 * after Bathrooms, cloning kitchen/bathroom-style fields.
 */
export function applyPropertyRoomsToTemplateSnapshot(
  structure: TemplateStructureLike | null | undefined,
  rooms: PropertyRoomSnapshotItem[],
  extras?: { propertyType?: string | null },
): {
  structure: TemplateStructureLike;
  seedEntries: SeedInspectionEntry[];
  counts: PropertyRoomCounts;
  roomInstancePaths: Array<{ roomId: string; sectionRef: string; title: string }>;
} {
  const counts = countsFromRooms(
    rooms.map((r) => ({ categorySlug: r.categorySlug, categoryName: r.categoryName })),
  );

  // Start from count-based apply for General fields + repeatable counts
  const base = applyPropertyCountsToTemplateSnapshot(structure, counts, extras);
  const sections = Array.isArray(base.structure.sections) ? base.structure.sections : [];
  base.structure.sections = sections;

  // Drop sections from a prior auto-apply so re-runs stay idempotent
  for (let i = sections.length - 1; i >= 0; i--) {
    if ((sections[i] as { propertyRoomAuto?: boolean }).propertyRoomAuto) {
      sections.splice(i, 1);
    }
  }
  for (const section of sections) {
    if (isGeneralOrSignoffSection(section)) {
      section.repeatable = false;
    }
  }

  const roomInstancePaths: Array<{ roomId: string; sectionRef: string; title: string }> = [];
  const roomsBySection = new Map<string, PropertyRoomSnapshotItem[]>();
  const autoSectionByKey = new Map<string, TemplateSectionLike>();
  const fieldTemplate = pickRoomFieldTemplateSection(sections);

  // Refresh section map after stripping auto sections
  const sectionMap = matchTemplateSectionsToRoomTypes(sections);

  for (const room of rooms) {
    const roomType = room.categorySlug
      ? roomTypeFromCategorySlug(room.categorySlug)
      : roomTypeFromCategoryName(room.categoryName);

    let section: TemplateSectionLike | undefined;
    if (roomType !== "other") {
      // Master Bedroom / En-suite → Bedrooms / Bathrooms via roomType
      section = sectionMap[roomType];
    }

    if (!section) {
      const matched = matchSectionForRoomCategory(
        sections,
        room.categoryName,
        room.categorySlug,
      );
      if (matched && !isGeneralOrSignoffSection(matched)) {
        section = matched;
      }
    }

    if (!section) {
      const key =
        (room.categorySlug || slugifyCategoryName(room.categoryName || "other")).toLowerCase() ||
        "other";
      section = autoSectionByKey.get(key);
      if (!section) {
        const existing = sections.find((s) => s.id === `section_${key.replace(/[^a-z0-9_]+/g, "_")}`);
        if (existing && !isGeneralOrSignoffSection(existing)) {
          section = existing;
        } else {
          section = createAutoRoomSection(room.categoryName || "Other", key, fieldTemplate);
          insertSectionAfterBathrooms(sections, section);
        }
        autoSectionByKey.set(key, section);
      }
    }

    if (!section) continue;
    section.repeatable = true;
    const list = roomsBySection.get(section.id) || [];
    list.push(room);
    roomsBySection.set(section.id, list);
    roomInstancePaths.push({
      roomId: room.id,
      sectionRef: `${section.id}/${room.id}`,
      title: room.name,
    });
  }

  // Replace repeatable count seeds for sections that have mapped rooms
  const filteredSeeds = base.seedEntries.filter(
    (e) => !String(e.fieldKey).startsWith("__repeatable_count_"),
  );
  for (const [sectionId, list] of roomsBySection) {
    filteredSeeds.push({
      sectionRef: sectionId,
      fieldKey: `__repeatable_count_${sectionId}`,
      fieldType: "number",
      valueJson: list.length,
    });
  }

  // Store room instance metadata on structure for capture UI
  (base.structure as any).propertyRoomInstances = roomInstancePaths;

  return {
    structure: base.structure,
    seedEntries: filteredSeeds,
    counts,
    roomInstancePaths,
  };
}

/** Hydrate placeholder rooms from legacy count columns when no rooms exist. */
export function hydrateRoomsFromCounts(
  counts: PropertyRoomCounts,
  categoryByRoomType: Partial<Record<RoomTypeKey, { id: string; name: string; slug: string }>>,
): Array<{
  categoryId: string;
  name: string;
  sortOrder: number;
  source: "manual";
}> {
  const out: Array<{
    categoryId: string;
    name: string;
    sortOrder: number;
    source: "manual";
  }> = [];
  let order = 0;
  const push = (type: RoomTypeKey, n: number, label: string) => {
    const cat = categoryByRoomType[type];
    if (!cat) return;
    for (let i = 1; i <= n; i++) {
      out.push({
        categoryId: cat.id,
        // Always number: Bedroom 1, Bedroom 2 (never bare "Bedroom" for the first).
        name: `${label} ${i}`,
        sortOrder: order++,
        source: "manual",
      });
    }
  };
  push("bedrooms", counts.bedrooms, "Bedroom");
  push("bathrooms", counts.bathrooms, "Bathroom");
  push("kitchens", counts.kitchens, "Kitchen");
  push("livingRooms", counts.livingRooms, "Living Room");
  return out;
}

export function matchSectionForRoomCategory(
  sections: TemplateSectionLike[],
  categoryName: string,
  categorySlug?: string,
): TemplateSectionLike | null {
  const roomType = categorySlug
    ? roomTypeFromCategorySlug(categorySlug)
    : roomTypeFromCategoryName(categoryName);
  if (roomType !== "other") {
    for (const section of sections) {
      if (matchSectionToRoomType(section) === roomType) return section;
    }
  }
  const hay = `${categorySlug || ""} ${categoryName}`.toLowerCase().replace(/-/g, " ");
  const tokens = hay.split(/\s+/).filter((t) => t.length >= 3);
  for (const section of sections) {
    if (isGeneralOrSignoffSection(section)) continue;
    const t = `${section.title || ""} ${section.id || ""}`.toLowerCase().replace(/-/g, " ");
    if (tokens.some((token) => t.includes(token))) return section;
  }
  return null;
}

/**
 * Human-readable layout line from detailed rooms (includes Garden, Garage, etc.).
 * Falls back to null when the list is empty so callers can use count summary.
 */
export function formatPropertyRoomsSummary(
  rooms: Array<{ name?: string | null; categoryName?: string | null }>,
): string | null {
  if (!rooms.length) return null;
  const byCategory = new Map<string, number>();
  for (const room of rooms) {
    const label = (room.categoryName || room.name || "Other").trim() || "Other";
    byCategory.set(label, (byCategory.get(label) || 0) + 1);
  }
  return Array.from(byCategory.entries())
    .map(([label, n]) => (n === 1 ? label : `${n} ${label}${/s$/i.test(label) ? "" : "s"}`))
    .join(" · ");
}

/** Singularize a section title for instance labels (Bedrooms → Bedroom). */
export function singularizeSectionTitle(title: string): string {
  const t = String(title || "").trim();
  if (!t) return "Room";
  if (/ies$/i.test(t)) return t.replace(/ies$/i, "y");
  if (/ses$/i.test(t)) return t.replace(/es$/i, "");
  if (/s$/i.test(t) && !/ss$/i.test(t)) return t.replace(/s$/i, "");
  return t;
}

/**
 * Display title for a repeatable room instance.
 * Type labels (Bedroom, Bedroom 1, Bedrooms 2, …) are always renumbered by
 * instance index so the first is Bedroom 1, second Bedroom 2, etc.
 * Custom names like "Master Bedroom" are left unchanged.
 */
export function numberedRoomInstanceTitle(
  roomTitle: string | null | undefined,
  sectionTitle: string,
  instanceIndex: number,
): string {
  const ordinal = Math.max(1, Math.floor(instanceIndex) + 1);
  const singular = singularizeSectionTitle(sectionTitle);
  const raw = String(roomTitle || "").trim();
  if (!raw) return `${singular} ${ordinal}`;

  // Strip a trailing instance number ("Bedroom 1" → "Bedroom") before matching type.
  const withoutNumber = raw.replace(/\s+\d+\s*$/, "").trim() || raw;
  const bare = singularizeSectionTitle(withoutNumber);
  if (
    normalizeCategoryName(withoutNumber) === normalizeCategoryName(singular) ||
    normalizeCategoryName(bare) === normalizeCategoryName(singular)
  ) {
    return `${singular} ${ordinal}`;
  }
  return raw;
}

/** True when room instances sit under General/Overview (legacy buggy seed). */
export function propertyRoomsNeedSectionRepair(
  structure: TemplateStructureLike | null | undefined,
  rooms: PropertyRoomSnapshotItem[],
): boolean {
  if (!rooms.length) return false;
  const instances =
    ((structure as { propertyRoomInstances?: Array<{ roomId: string; sectionRef: string }> })
      ?.propertyRoomInstances || []);
  if (instances.length === 0 && rooms.length > 0) return true;
  const byId = new Map(instances.map((i) => [i.roomId, i.sectionRef]));
  for (const room of rooms) {
    const ref = byId.get(room.id) || "";
    const roomType = room.categorySlug
      ? roomTypeFromCategorySlug(room.categorySlug)
      : roomTypeFromCategoryName(room.categoryName);
    if (roomType === "other") {
      if (!ref || /general|overview/i.test(ref.split("/")[0] || "")) return true;
      const sectionId = ref.split("/")[0] || "";
      const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
      if (!sections.some((s) => s.id === sectionId)) return true;
    }
    if (roomType === "bedrooms" && ref && !/bedroom/i.test(ref.split("/")[0] || "")) {
      return true;
    }
  }
  return false;
}
