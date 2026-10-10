import assert from "node:assert/strict";
import {
  assertDestinationValid,
  extractRepeatableCountsFromEntries,
  formatDestinationLabel,
  isAllowedGalleryMime,
  listPhotoDestinations,
  normalizeObjectUrl,
} from "./inspectionGallery";

const structure = {
  sections: [
    {
      id: "section_general",
      title: "General Information",
      fields: [
        { id: "field_notes", label: "Notes", type: "long_text" },
        { id: "field_overview_photo", label: "Overview Photo", type: "photo_array" },
      ],
    },
    {
      id: "section_bedrooms",
      title: "Bedrooms",
      repeatable: true,
      fields: [
        { id: "field_floor", label: "Floor Condition", type: "photo_array" },
        { id: "field_walls", label: "Walls and Paint", type: "photo_array" },
        { id: "field_name", label: "Room Name", type: "short_text" },
      ],
    },
    {
      id: "section_kitchen",
      title: "Kitchen",
      fields: [{ id: "field_kitchen", label: "Kitchen Condition", type: "photo" }],
    },
  ],
};

const dests1 = listPhotoDestinations(structure, {});
assert.ok(dests1.some((d) => d.sectionRef === "section_general" && d.fieldKey === "field_overview_photo"));
assert.ok(dests1.some((d) => d.sectionRef === "section_bedrooms/Bedrooms 1" && d.fieldKey === "field_floor"));
assert.ok(!dests1.some((d) => d.fieldKey === "field_name"));
assert.equal(dests1.filter((d) => d.sectionId === "section_bedrooms").length, 2);

const dests2 = listPhotoDestinations(structure, { section_bedrooms: 3 });
assert.equal(dests2.filter((d) => d.sectionId === "section_bedrooms").length, 6);
assert.ok(dests2.some((d) => d.sectionRef === "section_bedrooms/Bedrooms 3"));

assert.ok(assertDestinationValid(structure, "section_kitchen", "field_kitchen", {}));
assert.equal(assertDestinationValid(structure, "section_kitchen", "nope", {}), null);
assert.equal(
  assertDestinationValid(structure, "section_bedrooms/Bedrooms 9", "field_floor", { section_bedrooms: 2 }),
  null,
);

assert.equal(
  formatDestinationLabel({ sectionLabel: "Bedrooms 1", fieldLabel: "Floor Condition" }),
  "Bedrooms 1 → Floor Condition",
);

assert.equal(normalizeObjectUrl("/objects/abc.jpg"), "/objects/abc.jpg");
assert.equal(normalizeObjectUrl("https://host.example/objects/abc.jpg?x=1"), "/objects/abc.jpg");
assert.equal(isAllowedGalleryMime("image/png"), true);
assert.equal(isAllowedGalleryMime("application/pdf"), false);

const counts = extractRepeatableCountsFromEntries([
  { fieldKey: "__repeatable_count_section_bedrooms", valueJson: 2 },
  { fieldKey: "field_floor", valueJson: 1 },
]);
assert.equal(counts.section_bedrooms, 2);

// Custom template (no hardcoded section ids) still yields destinations
const custom = {
  sections: [
    {
      id: "custom_lobby",
      title: "Lobby",
      fields: [{ id: "photo_doors", label: "Doors", type: "photo_array" }],
    },
  ],
};
const customDests = listPhotoDestinations(custom, {});
assert.equal(customDests.length, 1);
assert.equal(customDests[0].sectionRef, "custom_lobby");
assert.ok(assertDestinationValid(custom, "custom_lobby", "photo_doors", {}));

// Idempotent destination listing: same inputs → same unique keys
const keys = dests2.map((d) => `${d.sectionRef}::${d.fieldKey}`);
assert.equal(keys.length, new Set(keys).size);

console.log("inspectionGallery.test.ts: ok");
