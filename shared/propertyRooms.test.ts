import assert from "node:assert/strict";
import {
  countsFromRooms,
  defaultLengthUnitForCountry,
  floorAreaM2,
  fromMillimetres,
  metresToMm,
  normalizeAiRoomsResult,
  normalizeCategoryName,
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
assert.ok((gardenSection!.fields || []).some((f) => /Garden Condition/i.test(f.label || "")));
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

console.log("propertyRooms.test.ts: all assertions passed");
