import assert from "node:assert/strict";
import {
  countsFromRooms,
  defaultLengthUnitForCountry,
  floorAreaM2,
  fromMillimetres,
  hydrateRoomsFromCounts,
  metresToMm,
  normalizeAiRoomsResult,
  normalizeCategoryName,
  formatDisplayHeading,
  numberedRoomInstanceTitle,
  resolveSystemCategoryForLabel,
  roomTypeFromRoomLike,
  singularizeSectionTitle,
  slugifyCategoryName,
  toMillimetres,
  applyPropertyRoomsToTemplateSnapshot,
} from "./propertyRooms";

assert.equal(normalizeCategoryName("  Master  Bedroom "), "master bedroom");
assert.equal(slugifyCategoryName("En-suite Bathroom"), "en-suite-bathroom");

assert.equal(defaultLengthUnitForCountry("US"), "ft");
assert.equal(defaultLengthUnitForCountry("GB"), "m");
assert.equal(defaultLengthUnitForCountry(null), "m");

assert.equal(toMillimetres(1, "m"), 1000);
assert.equal(toMillimetres(12, "in"), 305);
assert.equal(fromMillimetres(1000, "m"), 1);
assert.equal(metresToMm(3.5), 3500);

assert.equal(floorAreaM2(4000, 3500), 14);
assert.equal(floorAreaM2(null, 3500), null);

assert.deepEqual(
  countsFromRooms([
    { categorySlug: "bedroom" },
    { categorySlug: "master-bedroom" },
    { categorySlug: "bathroom" },
    { categorySlug: "kitchen" },
    { categorySlug: "living-room" },
    { categorySlug: "garden" },
  ]),
  { bedrooms: 2, bathrooms: 1, kitchens: 1, livingRooms: 1 },
);

// Floor-plan AI often stores rooms under Other while naming them correctly
assert.equal(resolveSystemCategoryForLabel("Bedroom 1", "Other").slug, "bedroom");
assert.equal(resolveSystemCategoryForLabel("Reception Room", "Other").slug, "living-room");
assert.equal(resolveSystemCategoryForLabel("Kitchen", "Other").slug, "kitchen");
assert.equal(resolveSystemCategoryForLabel("Garden", "Other").slug, "garden");
assert.equal(roomTypeFromRoomLike({ categorySlug: "other", name: "Bedroom 2" }), "bedrooms");
assert.deepEqual(
  countsFromRooms([
    { categorySlug: "other", categoryName: "Other", name: "Bedroom 1" },
    { categorySlug: "other", categoryName: "Other", name: "Bedroom 2" },
    { categorySlug: "other", categoryName: "Other", name: "Bedroom 3" },
    { categorySlug: "other", categoryName: "Other", name: "Kitchen" },
    { categorySlug: "other", categoryName: "Other", name: "Reception Room" },
    { categorySlug: "other", categoryName: "Other", name: "Garden" },
  ]),
  { bedrooms: 3, bathrooms: 1, kitchens: 1, livingRooms: 1 },
);

const aiOtherCats = normalizeAiRoomsResult({
  rooms: [
    { name: "Bedroom 1", category: "Other", widthM: 3, lengthM: 4 },
    { name: "Bedroom 2", category: "Other", widthM: 3, lengthM: 4 },
    { name: "Kitchen", category: "Other", widthM: 2, lengthM: 3 },
    { name: "Reception Room", category: "Other", widthM: 5, lengthM: 7 },
  ],
});
assert.ok(aiOtherCats);
assert.equal(aiOtherCats!.rooms[0]!.category, "Bedroom");
assert.equal(aiOtherCats!.rooms[2]!.category, "Kitchen");
assert.equal(aiOtherCats!.rooms[3]!.category, "Living Room");
assert.equal(aiOtherCats!.counts.bedrooms, 2);
assert.equal(aiOtherCats!.counts.livingRooms, 1);

const ai = normalizeAiRoomsResult({
  bedrooms: 2,
  kitchens: 1,
  bathrooms: 1,
  livingRooms: 1,
  rooms: [
    { name: "Master Bedroom", category: "Master Bedroom", widthM: 4, lengthM: 3.5, confidence: "high" },
    { name: "Garden", category: "Garden", widthM: null, lengthM: null },
  ],
});
assert.ok(ai);
assert.equal(ai!.rooms.length, 2);
assert.equal(ai!.rooms[0]!.widthM, 4);
assert.equal(ai!.rooms[1]!.widthM, null);

const seeded = applyPropertyRoomsToTemplateSnapshot(
  {
    sections: [
      {
        id: "section_general",
        title: "General Information",
        fields: [{ id: "addr", type: "text", label: "Address" }],
      },
      {
        id: "section_bedrooms",
        title: "Bedrooms",
        repeatable: true,
        fields: [{ id: "f1", type: "text", label: "Bedroom Notes" }],
      },
      {
        id: "section_kitchen",
        title: "Kitchen",
        fields: [{ id: "f2", type: "photo_array", label: "Kitchen Condition" }],
      },
      {
        id: "section_bathrooms",
        title: "Bathrooms",
        repeatable: true,
        fields: [{ id: "f3", type: "photo_array", label: "Bathroom Condition" }],
      },
      {
        id: "section_signoff",
        title: "Sign-Off",
        fields: [{ id: "sig", type: "signature", label: "Signature" }],
      },
    ],
  },
  [
    {
      id: "room-1",
      name: "Master Bedroom",
      categoryId: "c1",
      categoryName: "Master Bedroom",
      categorySlug: "master-bedroom",
    },
    {
      id: "room-2",
      name: "Kitchen",
      categoryId: "c2",
      categoryName: "Kitchen",
      categorySlug: "kitchen",
    },
    {
      id: "room-3",
      name: "Rear Garden",
      categoryId: "c3",
      categoryName: "Garden",
      categorySlug: "garden",
    },
  ],
);
assert.equal(seeded.roomInstancePaths.length, 3);
assert.equal(seeded.roomInstancePaths[0]!.sectionRef, "section_bedrooms/room-1");
assert.equal(seeded.roomInstancePaths[2]!.sectionRef, "section_garden/room-3");
const gardenSection = seeded.structure.sections!.find((s) => s.id === "section_garden");
assert.ok(gardenSection);
assert.equal(gardenSection!.title, "Garden");
assert.equal(gardenSection!.repeatable, true);
assert.ok(
  (gardenSection!.fields || []).some((f) => f.label === "Overall Condition"),
);
assert.equal(formatDisplayHeading("bathroom"), "Bathroom");
assert.equal(formatDisplayHeading("overall condition"), "Overall Condition");
assert.equal(formatDisplayHeading("walls and paint"), "Walls and Paint");
assert.equal(numberedRoomInstanceTitle("bathroom 1", "bathroom", 0), "Bathroom 1");
const gardenIdx = seeded.structure.sections!.findIndex((s) => s.id === "section_garden");
const bathIdx = seeded.structure.sections!.findIndex((s) => s.id === "section_bathrooms");
const signIdx = seeded.structure.sections!.findIndex((s) => s.id === "section_signoff");
assert.ok(gardenIdx > bathIdx);
assert.ok(gardenIdx < signIdx);
const general = seeded.structure.sections!.find((s) => s.id === "section_general");
assert.equal(general?.repeatable, false);
assert.ok(
  seeded.seedEntries.some(
    (e) => e.fieldKey === "__repeatable_count_section_bedrooms" && e.valueJson === 1,
  ),
);
assert.ok(
  seeded.seedEntries.some(
    (e) => e.fieldKey === "__repeatable_count_section_garden" && e.valueJson === 1,
  ),
);

assert.equal(singularizeSectionTitle("Bedrooms"), "Bedroom");
assert.equal(singularizeSectionTitle("Bathrooms"), "Bathroom");
assert.equal(numberedRoomInstanceTitle("Bedroom", "Bedrooms", 0), "Bedroom 1");
assert.equal(numberedRoomInstanceTitle("Bedroom", "Bedrooms", 1), "Bedroom 2");
// Legacy: first bare "Bedroom", second stored as "Bedroom 1" → still 1 then 2 by index
assert.equal(numberedRoomInstanceTitle("Bedroom", "Bedrooms", 0), "Bedroom 1");
assert.equal(numberedRoomInstanceTitle("Bedroom 1", "Bedrooms", 1), "Bedroom 2");
assert.equal(numberedRoomInstanceTitle("Bedroom 2", "Bedrooms", 0), "Bedroom 1");
assert.equal(numberedRoomInstanceTitle("Master Bedroom", "Bedrooms", 0), "Master Bedroom");
assert.equal(numberedRoomInstanceTitle(undefined, "Bedrooms", 0), "Bedroom 1");

const hydrated = hydrateRoomsFromCounts(
  { bedrooms: 1, bathrooms: 2, kitchens: 0, livingRooms: 0 },
  {
    bedrooms: { id: "c-bed", name: "Bedroom", slug: "bedroom" },
    bathrooms: { id: "c-bath", name: "Bathroom", slug: "bathroom" },
  },
);
assert.equal(hydrated[0]!.name, "Bedroom 1");
assert.equal(hydrated[1]!.name, "Bathroom 1");
assert.equal(hydrated[2]!.name, "Bathroom 2");

// Misclassified Other rooms still seed bedroom/kitchen/living sections by name
const seededFromOther = applyPropertyRoomsToTemplateSnapshot(
  {
    sections: [
      {
        id: "section_general",
        title: "General Information",
        fields: [{ id: "addr", type: "text", label: "Address" }],
      },
      {
        id: "section_bedrooms",
        title: "Bedrooms",
        repeatable: true,
        fields: [{ id: "f1", type: "text", label: "Bedroom Notes" }],
      },
      {
        id: "section_kitchen",
        title: "Kitchen",
        fields: [{ id: "f2", type: "photo_array", label: "Kitchen Condition" }],
      },
      {
        id: "section_living",
        title: "Living Room",
        fields: [{ id: "f3", type: "photo_array", label: "Living Condition" }],
      },
      {
        id: "section_bathrooms",
        title: "Bathrooms",
        repeatable: true,
        fields: [{ id: "f4", type: "photo_array", label: "Bathroom Condition" }],
      },
    ],
  },
  [
    {
      id: "r1",
      name: "Bedroom 1",
      categoryId: "other",
      categoryName: "Other",
      categorySlug: "other",
    },
    {
      id: "r2",
      name: "Bedroom 2",
      categoryId: "other",
      categoryName: "Other",
      categorySlug: "other",
    },
    {
      id: "r3",
      name: "Bedroom 3",
      categoryId: "other",
      categoryName: "Other",
      categorySlug: "other",
    },
    {
      id: "r4",
      name: "Kitchen",
      categoryId: "other",
      categoryName: "Other",
      categorySlug: "other",
    },
    {
      id: "r5",
      name: "Reception Room",
      categoryId: "other",
      categoryName: "Other",
      categorySlug: "other",
    },
  ],
);
assert.equal(seededFromOther.counts.bedrooms, 3);
assert.equal(seededFromOther.counts.kitchens, 1);
assert.equal(seededFromOther.counts.livingRooms, 1);
assert.equal(
  seededFromOther.roomInstancePaths.filter((p) => p.sectionRef.startsWith("section_bedrooms/"))
    .length,
  3,
);
assert.ok(
  seededFromOther.seedEntries.some(
    (e) => e.fieldKey === "__repeatable_count_section_bedrooms" && e.valueJson === 3,
  ),
);

// Multiples of every type (bathrooms, kitchens, living, and other e.g. Garden)
assert.deepEqual(
  countsFromRooms([
    { categorySlug: "bedroom", name: "Bedroom 1" },
    { categorySlug: "bedroom", name: "Bedroom 2" },
    { categorySlug: "bathroom", name: "Bathroom 1" },
    { categorySlug: "en-suite", name: "En-suite" },
    { categorySlug: "kitchen", name: "Kitchen 1" },
    { categorySlug: "kitchen", name: "Kitchen 2" },
    { categorySlug: "living-room", name: "Lounge" },
    { categorySlug: "living-room", name: "Reception" },
    { categorySlug: "garden", name: "Front Garden" },
    { categorySlug: "garden", name: "Rear Garden" },
  ]),
  { bedrooms: 2, bathrooms: 2, kitchens: 2, livingRooms: 2 },
);

const multiSeeded = applyPropertyRoomsToTemplateSnapshot(
  {
    sections: [
      {
        id: "section_bedrooms",
        title: "Bedrooms",
        repeatable: true,
        fields: [{ id: "f1", type: "text", label: "Notes" }],
      },
      {
        id: "section_kitchen",
        title: "Kitchen",
        fields: [{ id: "f2", type: "text", label: "Notes" }],
      },
      {
        id: "section_living",
        title: "Living Room",
        fields: [{ id: "f3", type: "text", label: "Notes" }],
      },
      {
        id: "section_bathrooms",
        title: "Bathrooms",
        repeatable: true,
        fields: [{ id: "f4", type: "text", label: "Notes" }],
      },
    ],
  },
  [
    { id: "b1", name: "Bathroom 1", categoryId: "c", categoryName: "Bathroom", categorySlug: "bathroom" },
    { id: "b2", name: "En-suite", categoryId: "c", categoryName: "En-suite", categorySlug: "en-suite" },
    { id: "k1", name: "Kitchen 1", categoryId: "c", categoryName: "Kitchen", categorySlug: "kitchen" },
    { id: "k2", name: "Kitchen 2", categoryId: "c", categoryName: "Kitchen", categorySlug: "kitchen" },
    { id: "g1", name: "Front Garden", categoryId: "c", categoryName: "Garden", categorySlug: "garden" },
    { id: "g2", name: "Rear Garden", categoryId: "c", categoryName: "Garden", categorySlug: "garden" },
  ],
);
assert.equal(multiSeeded.counts.bathrooms, 2);
assert.equal(multiSeeded.counts.kitchens, 2);
assert.equal(
  multiSeeded.roomInstancePaths.filter((p) => p.sectionRef.startsWith("section_bathrooms/")).length,
  2,
);
assert.equal(
  multiSeeded.roomInstancePaths.filter((p) => p.sectionRef.startsWith("section_kitchen/")).length,
  2,
);
assert.equal(
  multiSeeded.roomInstancePaths.filter((p) => p.sectionRef.startsWith("section_garden/")).length,
  2,
);
assert.ok(
  multiSeeded.seedEntries.some(
    (e) => e.fieldKey === "__repeatable_count_section_bathrooms" && e.valueJson === 2,
  ),
);
assert.ok(
  multiSeeded.seedEntries.some(
    (e) => e.fieldKey === "__repeatable_count_section_kitchen" && e.valueJson === 2,
  ),
);
assert.ok(
  multiSeeded.seedEntries.some(
    (e) => e.fieldKey === "__repeatable_count_section_garden" && e.valueJson === 2,
  ),
);

console.log("propertyRooms.test.ts: all assertions passed");
