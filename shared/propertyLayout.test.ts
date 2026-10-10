import assert from "node:assert/strict";
import {
  applyPropertyCountsToTemplateSnapshot,
  clampRoomCount,
  formatRoomCountsSummary,
  isAllowedFloorPlanMime,
  isBedroomCountField,
  matchTemplateSectionsToRoomTypes,
  normalizeAiLayoutResult,
  parseRepeatableCountValue,
  parseRoomCounts,
  repeatableCountsFromPropertyLayout,
  ROOM_COUNT_MAX,
  ROOM_COUNT_MIN,
} from "./propertyLayout";

assert.equal(clampRoomCount(0), ROOM_COUNT_MIN);
assert.equal(clampRoomCount(31), ROOM_COUNT_MAX);
assert.equal(clampRoomCount(1.9), 1);
assert.equal(clampRoomCount("abc"), ROOM_COUNT_MIN);
assert.equal(clampRoomCount(5), 5);

assert.deepEqual(parseRoomCounts({}), {
  bedrooms: 1,
  kitchens: 1,
  bathrooms: 1,
  livingRooms: 1,
});
assert.deepEqual(parseRoomCounts({ bedrooms: 3, bathrooms: 2 }), {
  bedrooms: 3,
  kitchens: 1,
  bathrooms: 2,
  livingRooms: 1,
});

const badAi = normalizeAiLayoutResult({
  bedrooms: 99,
  bathrooms: -2,
  kitchens: "three",
  livingRooms: 2,
});
assert.ok(badAi);
assert.equal(badAi!.bedrooms, ROOM_COUNT_MAX);
assert.equal(badAi!.bathrooms, ROOM_COUNT_MIN);
assert.equal(badAi!.kitchens, ROOM_COUNT_MIN);
assert.equal(badAi!.livingRooms, 2);

assert.equal(normalizeAiLayoutResult(null), null);
assert.equal(isAllowedFloorPlanMime("image/png"), true);
assert.equal(isAllowedFloorPlanMime("application/pdf"), true);
assert.equal(isAllowedFloorPlanMime("application/exe"), false);

const sections = [
  { id: "section_general", title: "General Information", fields: [
    { id: "field_num_bedrooms", key: "num_bedrooms", label: "Number of Bedrooms", type: "number" },
  ]},
  { id: "section_living", title: "Living Room" },
  { id: "section_kitchen", title: "Kitchen" },
  { id: "section_bedrooms", title: "Bedrooms", repeatable: true },
  { id: "section_bathrooms", title: "Bathrooms", repeatable: true },
];

const map = matchTemplateSectionsToRoomTypes(sections);
assert.equal(map.bedrooms?.id, "section_bedrooms");
assert.equal(map.bathrooms?.id, "section_bathrooms");
assert.equal(map.kitchens?.id, "section_kitchen");
assert.equal(map.livingRooms?.id, "section_living");

const applied = applyPropertyCountsToTemplateSnapshot(
  { sections },
  { bedrooms: 3, kitchens: 2, bathrooms: 2, livingRooms: 1 },
);
assert.equal(applied.counts.bedrooms, 3);
assert.equal(
  (applied.structure.sections as any[]).find((s) => s.id === "section_kitchen")?.repeatable,
  true,
);
assert.equal(
  (applied.structure.sections as any[]).find((s) => s.id === "section_living")?.repeatable,
  true,
);
assert.ok(
  applied.seedEntries.some(
    (e) => e.fieldKey === "__repeatable_count_section_bedrooms" && e.valueJson === 3,
  ),
);
assert.ok(
  applied.seedEntries.some(
    (e) => e.fieldKey === "field_num_bedrooms",
  ),
);

assert.match(formatRoomCountsSummary(applied.counts), /3 Bedrooms/);

assert.equal(isBedroomCountField({ label: "Number of Bedrooms", id: "x" }), true);
assert.equal(isBedroomCountField({ id: "field_num_bedrooms" }), true);
assert.equal(isBedroomCountField({ label: "Condition", id: "field_cond" }), false);

const fromLayout = repeatableCountsFromPropertyLayout(
  { sections },
  { bedrooms: 3, kitchens: 2, bathrooms: 2, livingRooms: 1 },
);
assert.equal(fromLayout.section_bedrooms, 3);
assert.equal(fromLayout.section_kitchen, 2);
assert.equal(fromLayout.section_bathrooms, 2);
assert.equal(fromLayout.section_living, 1);

assert.equal(parseRepeatableCountValue(3), 3);
assert.equal(parseRepeatableCountValue({ value: 4 }), 4);
assert.equal(parseRepeatableCountValue("5"), 5);
assert.equal(parseRepeatableCountValue(null), 1);

console.log("propertyLayout.test.ts: ok");
