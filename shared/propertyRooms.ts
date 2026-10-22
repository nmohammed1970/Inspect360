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

const HEADING_SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "in",
  "on",
  "to",
  "for",
  "via",
]);

/**
 * Title-case headings for display (Bathroom, Overall Condition, Walls and Paint).
 * Leaves intentional mid-word casing alone only by normalizing each word.
 */
export function formatDisplayHeading(text: string | null | undefined): string {
  const raw = String(text || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!raw) return "";
  return raw
    .split(" ")
    .map((word, index) => {
      if (!word) return word;
      if (/^\d+(\.\d+)?$/.test(word)) return word;
      const lower = word.toLowerCase();
      if (index > 0 && HEADING_SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
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
  if (unit === "mm") return Math.round(mm);
  if (unit === "in") return Math.round((mm / MM_PER.in) * 10) / 10;
  if (unit === "cm") return Math.round((mm / MM_PER.cm) * 10) / 10;
  if (unit === "ft") {
    // Round to nearest inch so 8'9" displays as 8.75, not 8.73 from metric rounding
    const totalInches = Math.round(mm / MM_PER.in);
    return Math.round((totalInches / 12) * 100) / 100;
  }
  return Math.round((mm / MM_PER.m) * 100) / 100;
}

/** Display mm as floor-plan style feet/inches, e.g. 12'3". */
export function formatMillimetresAsFeetInches(
  mm: number | null | undefined,
): string {
  if (mm == null || !Number.isFinite(mm) || mm <= 0) return "";
  const totalInches = Math.round(mm / MM_PER.in);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

/**
 * Parse a length field into mm.
 * Accepts feet/inches ("12'3\"", "12 ft 3 in"), decimal feet when unit is ft,
 * or a plain number in the selected unit.
 */
export function parseLengthInputToMillimetres(
  raw: string,
  unit: LengthUnit,
): number | null {
  const s = raw.trim();
  if (!s) return null;

  // Feet + inches text (with or without inch mark)
  if (/(?:'|ft|feet)/i.test(s) || /"|″|in\b/i.test(s)) {
    const metres = parseAiDimensionMetres(s);
    return metresToMm(metres);
  }

  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return toMillimetres(n, unit);
}

/** Format a stored mm length for an input, using ft/in when unit is ft. */
export function formatLengthInput(
  mm: number | null | undefined,
  unit: LengthUnit,
): string {
  if (unit === "ft") return formatMillimetresAsFeetInches(mm);
  const v = fromMillimetres(mm, unit);
  return v == null ? "" : String(v);
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

/** Stair-direction markers that must never become rooms. */
const STAIR_MARKER_ONLY = /^(up|dn|down|in|out|void)$/i;

/**
 * Stair landing / stairwell labels — one physical staircase = one landing,
 * even when UP appears on one floor and DN on another.
 */
export function isLandingLikeLabel(
  name: string | null | undefined,
  category?: string | null,
): boolean {
  const hay = normalizeCategoryName(`${category || ""} ${name || ""}`);
  if (!hay) return false;
  return /\b(landing|stairwell|staircase|\bstairs\b|\bstair\b)\b/.test(hay);
}

/** True when the AI invented a room from a stair arrow label alone. */
export function isStairMarkerOnlyLabel(name: string | null | undefined): boolean {
  const n = String(name || "").trim();
  return STAIR_MARKER_ONLY.test(n);
}

function roomHasUsableDims(room: AiProposedRoom): boolean {
  return (
    (room.widthM != null && room.widthM > 0) ||
    (room.lengthM != null && room.lengthM > 0) ||
    (room.areaM2 != null && room.areaM2 > 0)
  );
}

function confidenceRank(c: ConfidenceLevel | undefined): number {
  if (c === "high") return 3;
  if (c === "medium") return 2;
  if (c === "low") return 1;
  return 0;
}

/** Prefer the stronger of two AI room proposals when merging duplicates. */
function pickBetterAiRoom(a: AiProposedRoom, b: AiProposedRoom): AiProposedRoom {
  const aDims = roomHasUsableDims(a) ? 1 : 0;
  const bDims = roomHasUsableDims(b) ? 1 : 0;
  if (aDims !== bDims) return aDims > bDims ? a : b;
  const aConf = confidenceRank(a.confidence);
  const bConf = confidenceRank(b.confidence);
  if (aConf !== bConf) return aConf > bConf ? a : b;
  const aArea = a.areaM2 ?? (a.widthM && a.lengthM ? a.widthM * a.lengthM : 0);
  const bArea = b.areaM2 ?? (b.widthM && b.lengthM ? b.widthM * b.lengthM : 0);
  return aArea >= bArea ? a : b;
}

/**
 * Collapse duplicate stair landings and exact duplicate room rows from floor-plan AI.
 * UP/DN on the same staircase must not produce multiple Landing entries.
 */
export function dedupeAiProposedRooms(rooms: AiProposedRoom[]): AiProposedRoom[] {
  if (!rooms.length) return rooms;

  const withoutMarkers = rooms.filter((r) => !isStairMarkerOnlyLabel(r.name));

  const landings: AiProposedRoom[] = [];
  const others: AiProposedRoom[] = [];
  for (const room of withoutMarkers) {
    if (isLandingLikeLabel(room.name, room.category)) {
      landings.push(room);
    } else {
      others.push(room);
    }
  }

  // One landing per staircase: keep a single best landing-like entry
  if (landings.length > 1) {
    const best = landings.reduce((acc, cur) => pickBetterAiRoom(acc, cur));
    landings.length = 0;
    landings.push({
      ...best,
      name: /landing/i.test(best.name) ? best.name.replace(/\s+\d+$/, "").trim() || "Landing" : "Landing",
      category: "Hallway",
    });
  } else if (landings.length === 1) {
    landings[0] = {
      ...landings[0],
      category: resolveSystemCategoryForLabel(landings[0].name, landings[0].category).name,
    };
    if (landings[0].category === "Other" || isLandingLikeLabel(landings[0].name, landings[0].category)) {
      landings[0] = { ...landings[0], category: "Hallway" };
    }
  }

  // Exact duplicate name+category (case-insensitive), e.g. two "Garden"
  const mergedOthers: AiProposedRoom[] = [];
  const seen = new Map<string, number>();
  for (const room of others) {
    const key = `${normalizeCategoryName(room.category)}::${normalizeCategoryName(room.name)}`;
    const idx = seen.get(key);
    if (idx == null) {
      seen.set(key, mergedOthers.length);
      mergedOthers.push(room);
    } else {
      mergedOthers[idx] = pickBetterAiRoom(mergedOthers[idx], room);
    }
  }

  // Lounge/Diner style dual labels: drop a bare "Dining Room" when a lounge/diner already exists
  const hasLoungeDiner = mergedOthers.some((r) => {
    const hay = normalizeCategoryName(`${r.name} ${r.category}`);
    return /\b(lounge|living|reception)\b/.test(hay) && /\b(diner|dining)\b/.test(hay);
  });
  const filteredOthers = hasLoungeDiner
    ? mergedOthers.filter((r) => {
        const hay = normalizeCategoryName(`${r.name} ${r.category}`);
        const diningOnly =
          /\b(dining|diner)\b/.test(hay) && !/\b(lounge|living|reception|kitchen)\b/.test(hay);
        return !diningOnly;
      })
    : mergedOthers;

  return [...filteredOthers, ...landings];
}

export function roomTypeFromCategoryName(name: string | null | undefined): CategoryRoomType {
  return roomTypeFromCategorySlug(slugifyCategoryName(name || ""));
}

/**
 * Resolve a room label (AI category and/or room name) to a system category.
 * AI often returns category "Other" while naming rooms "Bedroom 1" / "Reception Room" —
 * prefer the name when the category is untyped.
 */
export function resolveSystemCategoryForLabel(
  roomName: string | null | undefined,
  categoryHint?: string | null,
): (typeof SYSTEM_ROOM_CATEGORIES)[number] {
  const other = SYSTEM_ROOM_CATEGORIES.find((c) => c.slug === "other")!;
  const labels = [categoryHint, roomName]
    .map((v) => (v || "").trim())
    .filter(Boolean);

  const findExact = (label: string) => {
    const norm = normalizeCategoryName(label);
    const slug = slugifyCategoryName(label);
    return SYSTEM_ROOM_CATEGORIES.find(
      (c) => c.slug === slug || normalizeCategoryName(c.name) === norm,
    );
  };

  for (const label of labels) {
    const exact = findExact(label);
    if (exact && exact.slug !== "other") return exact;
  }

  for (const label of labels) {
    const type = roomTypeFromCategoryName(label);
    if (type === "other") continue;
    const byType = SYSTEM_ROOM_CATEGORIES.find((c) => c.roomType === type);
    if (byType) return byType;
  }

  // Landings / stairs → Hallway (no separate Landing system category)
  for (const label of labels) {
    if (isLandingLikeLabel(label) || isLandingLikeLabel("", label)) {
      const hallway = SYSTEM_ROOM_CATEGORIES.find((c) => c.slug === "hallway");
      if (hallway) return hallway;
    }
  }

  // Non-count system rooms (Garden, Hallway, Study, …) matched by substring
  for (const label of labels) {
    const hay = normalizeCategoryName(label);
    const slug = slugifyCategoryName(label);
    const hit = SYSTEM_ROOM_CATEGORIES.find((c) => {
      if (c.slug === "other") return false;
      return (
        hay.includes(normalizeCategoryName(c.name)) ||
        slug.includes(c.slug) ||
        normalizeCategoryName(c.name).includes(hay)
      );
    });
    if (hit) return hit;
  }

  for (const label of labels) {
    const exact = findExact(label);
    if (exact) return exact;
  }
  return other;
}

/** Effective room type from category, falling back to the room name when category is Other. */
export function roomTypeFromRoomLike(room: {
  categorySlug?: string | null;
  categoryName?: string | null;
  name?: string | null;
}): CategoryRoomType {
  const fromCat = room.categorySlug
    ? roomTypeFromCategorySlug(room.categorySlug)
    : roomTypeFromCategoryName(room.categoryName);
  if (fromCat !== "other") return fromCat;
  if (room.name) {
    const fromName = roomTypeFromCategoryName(room.name);
    if (fromName !== "other") return fromName;
  }
  // Category name may still help when slug is "other" but name is empty
  if (room.categoryName) {
    const fromHint = roomTypeFromCategoryName(room.categoryName);
    if (fromHint !== "other") return fromHint;
  }
  return "other";
}

export type RoomLikeForCounts = {
  categorySlug?: string | null;
  categoryName?: string | null;
  /** Used when category is Other / unknown (common after floor-plan AI). */
  name?: string | null;
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
    const type = roomTypeFromRoomLike(room);
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
 * Parse a single AI dimension into metres.
 * Accepts numbers (m, or mm when clearly large), feet/inches text, and unit suffixes.
 */
export function parseAiDimensionMetres(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    // Printed plans sometimes return millimetres as a bare number (e.g. 3660)
    if (raw >= 100) return Math.round((raw / 1000) * 100) / 100;
    return Math.round(raw * 100) / 100;
  }

  const s = String(raw).trim().toLowerCase().replace(/,/g, "");
  if (!s) return null;

  // Explicit metres / cm / mm
  const metric = s.match(/^([\d.]+)\s*(m|metres?|meters?|cm|mm)\b/);
  if (metric) {
    const n = Number(metric[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = metric[2];
    if (unit === "mm") return Math.round((n / 1000) * 100) / 100;
    if (unit === "cm") return Math.round((n / 100) * 100) / 100;
    return Math.round(n * 100) / 100;
  }

  // Feet + inches: 12'6", 12' 6", 12 ft 6 in, 12ft6in
  const ftIn = s.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(\d+(?:\.\d+)?)?\s*(?:"|″|in|ins|inches)?$/,
  );
  if (ftIn) {
    const feet = Number(ftIn[1]);
    const inches = ftIn[2] != null ? Number(ftIn[2]) : 0;
    if (!Number.isFinite(feet) || feet < 0) return null;
    const totalIn = feet * 12 + (Number.isFinite(inches) ? inches : 0);
    // 3 d.p. metres so 8'9" → 2.667 (not 2.66)
    return Math.round(totalIn * 0.0254 * 1000) / 1000;
  }

  // Bare feet: 12.5 ft / 12 feet
  const ftOnly = s.match(/^([\d.]+)\s*(ft|feet)\b/);
  if (ftOnly) {
    const feet = Number(ftOnly[1]);
    if (!Number.isFinite(feet) || feet <= 0) return null;
    return Math.round(feet * 0.3048 * 1000) / 1000;
  }

  // Plain number string — same rules as numeric
  const plain = Number(s);
  if (Number.isFinite(plain) && plain > 0) return parseAiDimensionMetres(plain);
  return null;
}

function feetFieldToMetres(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw * 0.3048 * 1000) / 1000;
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Already has a unit → general parser; bare number → treat as feet
  if (/\d/.test(s) && /(ft|feet|'|m|cm|mm|in)/i.test(s)) {
    return parseAiDimensionMetres(s);
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return Math.round(n * 0.3048 * 1000) / 1000;
  return parseAiDimensionMetres(s);
}

function resolveRoomDimensions(m: Record<string, unknown>): {
  widthM: number | null;
  lengthM: number | null;
  areaM2: number | null;
} {
  // Prefer printed imperial labels when present (avoids rounded metric → wrong feet display)
  const imperialWidth = parseAiDimensionMetres(
    m.widthImperial ?? m.widthLabel ?? m.width_ft_in ?? m.widthFtIn,
  );
  const imperialLength = parseAiDimensionMetres(
    m.lengthImperial ?? m.lengthLabel ?? m.length_ft_in ?? m.lengthFtIn,
  );

  let widthM =
    imperialWidth ??
    parseAiDimensionMetres(m.widthM ?? m.width ?? m.width_m) ??
    feetFieldToMetres(m.widthFt ?? m.width_ft ?? m.widthFeet);
  let lengthM =
    imperialLength ??
    parseAiDimensionMetres(m.lengthM ?? m.length ?? m.length_m) ??
    feetFieldToMetres(m.lengthFt ?? m.length_ft ?? m.lengthFeet);

  let areaM2 = Number(m.areaM2 ?? m.area ?? m.area_m2);
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    const areaFt2 = Number(m.areaFt2 ?? m.area_ft2 ?? m.sqft ?? m.sqFt);
    if (Number.isFinite(areaFt2) && areaFt2 > 0) {
      areaM2 = Math.round(areaFt2 * 0.092903 * 100) / 100;
    } else {
      areaM2 = NaN;
    }
  } else {
    areaM2 = Math.round(areaM2 * 100) / 100;
  }

  // Derive missing side from area when one side is known
  if (areaM2 > 0) {
    if (widthM != null && lengthM == null) {
      lengthM = Math.round((areaM2 / widthM) * 100) / 100;
    } else if (lengthM != null && widthM == null) {
      widthM = Math.round((areaM2 / lengthM) * 100) / 100;
    } else if (widthM == null && lengthM == null) {
      // Square approximation only when area is all we have — skip (unreliable shape)
    }
  } else if (widthM != null && lengthM != null) {
    areaM2 = Math.round(widthM * lengthM * 100) / 100;
  }

  return {
    widthM,
    lengthM,
    areaM2: Number.isFinite(areaM2) && areaM2 > 0 ? areaM2 : null,
  };
}

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
    for (const item of listRaw.slice(0, 80)) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;
      const name = String(m.name ?? m.roomLabel ?? m.label ?? "").trim().slice(0, 160);
      if (!name) continue;
      const rawCategory =
        String(m.category ?? m.roomType ?? m.type ?? "").trim().slice(0, 120) || "Other";
      const category = resolveSystemCategoryForLabel(name, rawCategory).name;
      const dims = resolveRoomDimensions(m);
      const conf = m.confidence;
      rooms.push({
        name,
        category,
        widthM: dims.widthM,
        lengthM: dims.lengthM,
        areaM2: dims.areaM2,
        confidence:
          conf === "high" || conf === "medium" || conf === "low" ? conf : undefined,
      });
    }
  }

  const deduped = dedupeAiProposedRooms(rooms);

  const countsFromProposed = countsFromRooms(
    deduped.map((r) => ({ categoryName: r.category, name: r.name })),
  );
  // Prefer room-list tallies when the model listed rooms — more accurate than aggregate counts
  const counts = deduped.length
    ? countsFromProposed
    : parseRoomCounts({
        bedrooms: obj.bedrooms,
        kitchens: obj.kitchens,
        bathrooms: obj.bathrooms,
        livingRooms: obj.livingRooms ?? obj.living_rooms,
      });

  return {
    rooms: deduped,
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
  _fieldTemplate: TemplateSectionLike | null,
): TemplateSectionLike {
  const title = categoryName.trim() || "Other";
  const slug = (categorySlug || slugifyCategoryName(title)).slice(0, 60) || "other";
  const id = `section_${slug}`.replace(/[^a-z0-9_]+/g, "_").slice(0, 80);
  // Auto/other categories (Garden, Porch, Hallway, …) get one generic point —
  // do not clone Bedroom "Walls" etc. from the room field template.
  const fields: NonNullable<TemplateSectionLike["fields"]> = [
    {
      id: `field_${slug}_overall_condition`,
      key: `field_${slug}_overall_condition`,
      label: "Overall Condition",
      type: "photo_array",
    },
  ];
  return {
    id,
    title: formatDisplayHeading(title),
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
    rooms.map((r) => ({
      categorySlug: r.categorySlug,
      categoryName: r.categoryName,
      name: r.name,
    })),
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
    const roomType = roomTypeFromRoomLike(room);

    let section: TemplateSectionLike | undefined;
    if (roomType !== "other") {
      // Master Bedroom / En-suite → Bedrooms / Bathrooms via roomType
      section = sectionMap[roomType];
    }

    if (!section) {
      const resolvedLabel = resolveSystemCategoryForLabel(room.name, room.categoryName);
      const matched = matchSectionForRoomCategory(
        sections,
        resolvedLabel.name !== "Other" ? resolvedLabel.name : room.categoryName,
        resolvedLabel.slug !== "other" ? resolvedLabel.slug : room.categorySlug,
      );
      if (matched && !isGeneralOrSignoffSection(matched)) {
        section = matched;
      }
    }

    if (!section) {
      const resolved = resolveSystemCategoryForLabel(room.name, room.categoryName);
      const key =
        (
          (resolved.slug !== "other" ? resolved.slug : null) ||
          room.categorySlug ||
          slugifyCategoryName(room.categoryName || "other")
        ).toLowerCase() || "other";
      section = autoSectionByKey.get(key);
      if (!section) {
        const existing = sections.find((s) => s.id === `section_${key.replace(/[^a-z0-9_]+/g, "_")}`);
        if (existing && !isGeneralOrSignoffSection(existing)) {
          section = existing;
        } else {
          section = createAutoRoomSection(
            resolved.slug !== "other" ? resolved.name : room.categoryName || "Other",
            key,
            fieldTemplate,
          );
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

/** Tokens too generic for substring section matching (e.g. "room" ⊂ "bedrooms"). */
const SECTION_MATCH_STOP_TOKENS = new Set([
  "room",
  "rooms",
  "area",
  "areas",
  "space",
  "spaces",
  "unit",
  "units",
  "zone",
  "zones",
  "the",
  "and",
  "for",
]);

function sectionTextMatchesToken(sectionText: string, token: string): boolean {
  // Word-boundary match only — never "room" inside "bedrooms"
  return new RegExp(`(^|[^a-z0-9])${escapeRegExpToken(token)}([^a-z0-9]|$)`).test(sectionText);
}

function escapeRegExpToken(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const tokens = hay
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !SECTION_MATCH_STOP_TOKENS.has(t));
  if (!tokens.length) return null;
  for (const section of sections) {
    if (isGeneralOrSignoffSection(section)) continue;
    const t = `${section.title || ""} ${section.id || ""}`.toLowerCase().replace(/-/g, " ");
    if (tokens.some((token) => sectionTextMatchesToken(t, token))) return section;
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
  if (!raw) return formatDisplayHeading(`${singular} ${ordinal}`);

  // Strip a trailing instance number ("Bedroom 1" → "Bedroom") before matching type.
  const withoutNumber = raw.replace(/\s+\d+\s*$/, "").trim() || raw;
  const bare = singularizeSectionTitle(withoutNumber);
  if (
    normalizeCategoryName(withoutNumber) === normalizeCategoryName(singular) ||
    normalizeCategoryName(bare) === normalizeCategoryName(singular)
  ) {
    return formatDisplayHeading(`${singular} ${ordinal}`);
  }
  return formatDisplayHeading(raw);
}

/**
 * Rebuild room rows from frozen propertyRoomInstances when propertyRoomsSnapshot
 * is missing (still enough to remapping Living Room out of Bedrooms, etc.).
 */
export function synthesizeRoomsFromPropertyRoomInstances(
  structure: TemplateStructureLike | null | undefined,
): PropertyRoomSnapshotItem[] {
  const instances =
    ((structure as { propertyRoomInstances?: Array<{ roomId?: string; sectionRef: string; title?: string }> })
      ?.propertyRoomInstances || []);
  const out: PropertyRoomSnapshotItem[] = [];
  for (const inst of instances) {
    const id = String(inst.roomId || "").trim();
    const name = String(inst.title || "").trim();
    if (!id || !name) continue;
    const resolved = resolveSystemCategoryForLabel(name, undefined);
    out.push({
      id,
      name,
      categoryId: resolved.slug,
      categoryName: resolved.name,
      categorySlug: resolved.slug,
    });
  }
  return out;
}

function instanceMappedToWrongSection(
  structure: TemplateStructureLike | null | undefined,
  roomId: string,
  roomType: ReturnType<typeof roomTypeFromRoomLike>,
  sectionRef: string,
): boolean {
  const sections = Array.isArray(structure?.sections) ? structure!.sections! : [];
  const sectionId = String(sectionRef || "").split("/")[0] || "";
  const section = sections.find((s) => s.id === sectionId);
  if (roomType === "other") {
    if (!sectionRef || /general|overview/i.test(sectionId)) return true;
    if (!section) return true;
    return false;
  }
  if (!section) return true;
  const sectionType = matchSectionToRoomType(section);
  if (sectionType && sectionType !== roomType) return true;
  if (roomType === "bedrooms" && sectionRef && !/bedroom/i.test(sectionId)) return true;
  return false;
}

/** True when room instances sit under General/Overview or the wrong room-type section. */
export function propertyRoomsNeedSectionRepair(
  structure: TemplateStructureLike | null | undefined,
  rooms: PropertyRoomSnapshotItem[] = [],
): boolean {
  const instances =
    ((structure as { propertyRoomInstances?: Array<{ roomId?: string; sectionRef: string; title?: string }> })
      ?.propertyRoomInstances || []);

  // Detect Living Room under Bedrooms etc. from instance titles alone
  for (const inst of instances) {
    const title = String(inst.title || "").trim();
    const ref = String(inst.sectionRef || "").trim();
    if (!title || !ref) continue;
    const roomType = roomTypeFromRoomLike({ name: title });
    if (instanceMappedToWrongSection(structure, String(inst.roomId || ""), roomType, ref)) {
      return true;
    }
  }

  if (!rooms.length) return false;
  if (instances.length === 0 && rooms.length > 0) return true;
  const byId = new Map(
    instances
      .filter((i) => i.roomId)
      .map((i) => [String(i.roomId), String(i.sectionRef || "")]),
  );
  for (const room of rooms) {
    const ref = byId.get(room.id) || "";
    const roomType = roomTypeFromRoomLike(room);
    if (instanceMappedToWrongSection(structure, room.id, roomType, ref)) return true;
  }
  return false;
}

/** Floor-plan injected category sections (Garden, Hallway, Utility, …). */
export function isPropertyRoomAutoSection(
  section: { propertyRoomAuto?: boolean } | null | undefined,
): boolean {
  return !!(section as { propertyRoomAuto?: boolean } | null | undefined)?.propertyRoomAuto;
}

/** Stable property-room id in sectionRef (`sectionId/{roomUuid}`), not "Bedroom 1". */
export function isStableRoomInstanceId(instancePart: string | null | undefined): boolean {
  const s = String(instancePart || "").trim();
  if (!s || /\s/.test(s)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return true;
  }
  // Opaque ids (cuid / nanoid): no spaces, mixed letters+digits, not a plain integer
  if (s.length >= 8 && /[a-z]/i.test(s) && /\d/.test(s) && !/^\d+$/.test(s)) {
    return true;
  }
  return false;
}

/**
 * Legacy sectionRef "Bedrooms/Bedroom 3" → { sectionId, instanceNum: 3 }.
 * Never treat UUID room ids (`…/a1b2-…39`) as instance numbers — that produced
 * ghosts like "Dining Room 39" from a single room whose id ended in 39.
 */
export function parseLegacyRepeatableInstanceNumber(
  sectionRef: string | null | undefined,
): { sectionId: string; instanceNum: number } | null {
  const raw = String(sectionRef || "").trim();
  if (!raw || !raw.includes("/")) return null;
  const slash = raw.indexOf("/");
  const sectionId = raw.slice(0, slash).trim();
  const instancePart = raw.slice(slash + 1).trim();
  if (!sectionId || !instancePart || isStableRoomInstanceId(instancePart)) return null;
  // Require a label before the trailing number ("Bedroom 1", not bare "39")
  const match = instancePart.match(/^(.*\D)\s*(\d+)$/);
  if (!match) return null;
  const instanceNum = parseInt(match[2], 10);
  if (!Number.isFinite(instanceNum) || instanceNum < 1 || instanceNum > 50) return null;
  return { sectionId, instanceNum };
}

/** Counts of propertyRoomInstances grouped by base section id. */
export function repeatableCountsFromPropertyRoomInstances(
  instances:
    | Array<{ sectionRef?: string | null }>
    | null
    | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(instances)) return counts;
  for (const inst of instances) {
    const ref = String(inst.sectionRef || "").trim();
    if (!ref) continue;
    const sectionId = ref.split("/")[0]?.trim();
    if (!sectionId) continue;
    counts[sectionId] = (counts[sectionId] || 0) + 1;
  }
  return counts;
}

export function entryBelongsToSection(
  sectionRef: string | null | undefined,
  sectionId: string,
): boolean {
  const ref = String(sectionRef || "").trim();
  const id = String(sectionId || "").trim();
  if (!ref || !id) return false;
  return ref === id || ref.startsWith(`${id}/`);
}

export type PropertyRoomsSnapshotLike = {
  rooms?: PropertyRoomSnapshotItem[];
  [key: string]: unknown;
};

export type RemoveAutoSectionResult = {
  structure: TemplateStructureLike;
  propertyRoomsSnapshot: PropertyRoomsSnapshotLike | null;
  removedSectionId: string;
  removedSectionTitle: string;
  removedRoomIds: string[];
};

export type RemoveSectionInstanceResult = {
  structure: TemplateStructureLike;
  propertyRoomsSnapshot: PropertyRoomsSnapshotLike | null;
  /** Exact sectionRef removed (e.g. bathrooms/{roomId}). */
  removedSectionRef: string;
  sectionId: string;
  removedRoomId: string | null;
  /** When the last point was removed, the whole section is dropped. */
  sectionRemoved: boolean;
  removedSectionTitle: string | null;
  remainingInstanceCount: number;
  /** Updated bedroom/kitchen/… tallies from remaining frozen rooms (when snapshot present). */
  propertyRoomCounts: PropertyRoomCounts | null;
};

/** General / Sign-off must stay on every inspection. */
export function isProtectedCaptureSection(
  section: TemplateSectionLike | null | undefined,
): boolean {
  if (!section) return true;
  return isGeneralOrSignoffSection(section);
}

function filterRoomsSnapshot(
  propertyRoomsSnapshot: PropertyRoomsSnapshotLike | null | undefined,
  removedRoomIds: string[],
): PropertyRoomsSnapshotLike | null {
  if (propertyRoomsSnapshot == null) return null;
  const removedIdSet = new Set(removedRoomIds.map((id) => String(id || "").trim()).filter(Boolean));
  if (!removedIdSet.size || !Array.isArray(propertyRoomsSnapshot.rooms)) {
    return { ...propertyRoomsSnapshot };
  }
  return {
    ...propertyRoomsSnapshot,
    rooms: propertyRoomsSnapshot.rooms.filter(
      (r) => !removedIdSet.has(String(r.id || "").trim()),
    ),
  };
}

/**
 * Remove one inspection point (room instance) from an inspection snapshot.
 * If that was the last point in the section, the section tab is removed too
 * (except General / Sign-off).
 */
export function removeInspectionSectionInstance(
  structure: TemplateStructureLike | null | undefined,
  sectionRef: string,
  propertyRoomsSnapshot?: PropertyRoomsSnapshotLike | null,
): RemoveSectionInstanceResult {
  const ref = String(sectionRef || "").trim();
  if (!ref) {
    throw Object.assign(new Error("Inspection point reference is required"), { status: 400 });
  }

  const sectionId = ref.includes("/") ? ref.split("/")[0]!.trim() : ref;
  if (!sectionId) {
    throw Object.assign(new Error("Invalid inspection point reference"), { status: 400 });
  }

  const sections = Array.isArray(structure?.sections)
    ? [...(structure!.sections as TemplateSectionLike[])]
    : [];
  const sectionIndex = sections.findIndex((s) => s.id === sectionId);
  if (sectionIndex < 0) {
    throw Object.assign(new Error("Section not found on this inspection"), { status: 404 });
  }
  const section = sections[sectionIndex];
  if (isProtectedCaptureSection(section)) {
    throw Object.assign(
      new Error("General and Sign-off sections cannot be removed"),
      { status: 400 },
    );
  }

  type RoomInst = { roomId?: string; sectionRef: string; title?: string };
  const prevInstances: RoomInst[] =
    ((structure as { propertyRoomInstances?: RoomInst[] })?.propertyRoomInstances || []).map(
      (i) => ({ ...i }),
    );

  let removedRoomId: string | null = null;
  let matchedInstance = false;
  const nextInstances = prevInstances.filter((inst) => {
    const instRef = String(inst.sectionRef || "").trim();
    const roomId = String(inst.roomId || "").trim();
    if (instRef === ref || (roomId && ref.endsWith(`/${roomId}`))) {
      matchedInstance = true;
      if (roomId) removedRoomId = roomId;
      return false;
    }
    return true;
  });

  // Manual / synthetic points (no propertyRoomInstances row) are still valid to delete;
  // remaining count is derived from leftover instances for this section, or 0 when none exist.
  if (!matchedInstance && prevInstances.some((i) => entryBelongsToSection(i.sectionRef, sectionId))) {
    throw Object.assign(new Error("Inspection point not found"), { status: 404 });
  }

  const remainingForSection = nextInstances.filter((i) =>
    entryBelongsToSection(i.sectionRef, sectionId),
  ).length;

  const sectionHadInstances = prevInstances.some((i) =>
    entryBelongsToSection(i.sectionRef, sectionId),
  );
  // Floor-plan sections: drop the tab when the last room instance is removed.
  // Count-only sections (no propertyRoomInstances): caller removes the tab when count hits 0.
  const sectionRemoved = sectionHadInstances && remainingForSection === 0;

  let nextSections = sections;
  let removedSectionTitle: string | null = null;
  if (sectionRemoved) {
    nextSections = sections.filter((s) => s.id !== sectionId);
    removedSectionTitle = String(section.title || sectionId);
  }

  const removedRoomIds = removedRoomId ? [removedRoomId] : [];
  const nextRoomsSnap = filterRoomsSnapshot(propertyRoomsSnapshot, removedRoomIds);
  const propertyRoomCounts =
    nextRoomsSnap && Array.isArray(nextRoomsSnap.rooms)
      ? countsFromRooms(
          nextRoomsSnap.rooms.map((r) => ({
            categorySlug: r.categorySlug,
            categoryName: r.categoryName,
            name: r.name,
          })),
        )
      : null;

  const nextStructure: TemplateStructureLike = {
    ...(structure || {}),
    sections: nextSections,
  };
  (nextStructure as { propertyRoomInstances?: RoomInst[] }).propertyRoomInstances = nextInstances;

  return {
    structure: nextStructure,
    propertyRoomsSnapshot: nextRoomsSnap,
    removedSectionRef: ref,
    sectionId,
    removedRoomId,
    sectionRemoved,
    removedSectionTitle,
    remainingInstanceCount: remainingForSection,
    propertyRoomCounts,
  };
}

/**
 * Drop a section tab from the snapshot (used when the last count-only instance is deleted).
 * Refuses General / Sign-off.
 */
export function removeSectionFromInspectionSnapshot(
  structure: TemplateStructureLike | null | undefined,
  sectionId: string,
  propertyRoomsSnapshot?: PropertyRoomsSnapshotLike | null,
): RemoveAutoSectionResult {
  const id = String(sectionId || "").trim();
  if (!id) {
    throw Object.assign(new Error("Section id is required"), { status: 400 });
  }
  const sections = Array.isArray(structure?.sections)
    ? [...(structure!.sections as TemplateSectionLike[])]
    : [];
  const sectionIndex = sections.findIndex((s) => s.id === id);
  if (sectionIndex < 0) {
    throw Object.assign(new Error("Section not found on this inspection"), { status: 404 });
  }
  const section = sections[sectionIndex];
  if (isProtectedCaptureSection(section)) {
    throw Object.assign(
      new Error("General and Sign-off sections cannot be removed"),
      { status: 400 },
    );
  }

  const prevInstances =
    ((structure as { propertyRoomInstances?: Array<{ roomId?: string; sectionRef: string; title?: string }> })
      ?.propertyRoomInstances || []);
  const removedRoomIds: string[] = [];
  const nextInstances = prevInstances.filter((inst) => {
    if (!entryBelongsToSection(inst.sectionRef, id)) return true;
    const roomId = String(inst.roomId || "").trim();
    if (roomId) removedRoomIds.push(roomId);
    return false;
  });

  sections.splice(sectionIndex, 1);
  const nextRoomsSnap = filterRoomsSnapshot(propertyRoomsSnapshot, removedRoomIds);
  const nextStructure: TemplateStructureLike = {
    ...(structure || {}),
    sections,
  };
  (nextStructure as { propertyRoomInstances?: typeof nextInstances }).propertyRoomInstances =
    nextInstances;

  return {
    structure: nextStructure,
    propertyRoomsSnapshot: nextRoomsSnap,
    removedSectionId: id,
    removedSectionTitle: String(section.title || id),
    removedRoomIds,
  };
}

/**
 * Remove a floor-plan auto section from an inspection snapshot.
 * Also drops matching propertyRoomInstances and rooms in the frozen rooms snapshot
 * so GET repair will not recreate the section.
 */
export function removePropertyRoomAutoSection(
  structure: TemplateStructureLike | null | undefined,
  sectionId: string,
  propertyRoomsSnapshot?: PropertyRoomsSnapshotLike | null,
): RemoveAutoSectionResult {
  const id = String(sectionId || "").trim();
  if (!id) {
    throw Object.assign(new Error("Section id is required"), { status: 400 });
  }

  const sections = Array.isArray(structure?.sections)
    ? [...(structure!.sections as TemplateSectionLike[])]
    : [];
  const sectionIndex = sections.findIndex((s) => s.id === id);
  if (sectionIndex < 0) {
    throw Object.assign(new Error("Section not found on this inspection"), { status: 404 });
  }
  const section = sections[sectionIndex];
  if (!isPropertyRoomAutoSection(section)) {
    throw Object.assign(
      new Error("Only floor-plan auto sections can be removed from an inspection"),
      { status: 400 },
    );
  }

  const prevInstances =
    ((structure as { propertyRoomInstances?: Array<{ roomId?: string; sectionRef: string; title?: string }> })
      ?.propertyRoomInstances || []);
  const removedRoomIds: string[] = [];
  const nextInstances = prevInstances.filter((inst) => {
    if (!entryBelongsToSection(inst.sectionRef, id)) return true;
    const roomId = String(inst.roomId || "").trim();
    if (roomId) removedRoomIds.push(roomId);
    return false;
  });

  sections.splice(sectionIndex, 1);
  const nextRoomsSnap = filterRoomsSnapshot(propertyRoomsSnapshot, removedRoomIds);

  const nextStructure: TemplateStructureLike = {
    ...(structure || {}),
    sections,
  };
  (nextStructure as { propertyRoomInstances?: typeof nextInstances }).propertyRoomInstances =
    nextInstances;

  return {
    structure: nextStructure,
    propertyRoomsSnapshot: nextRoomsSnap,
    removedSectionId: id,
    removedSectionTitle: String(section.title || id),
    removedRoomIds,
  };
}
