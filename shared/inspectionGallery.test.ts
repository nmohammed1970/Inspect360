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

// Template fields with parentFieldId still list as flat photo destinations
const withSubs = {
  sections: [
    {
      id: "section_entry",
      title: "Entry / Hallway",
      fields: [
        { id: "field_doors", label: "Doors", type: "photo_array" },
        {
          id: "field_custom_knob",
          label: "Door Knob",
          type: "photo_array",
          parentFieldId: "field_doors",
        },
        {
          id: "field_custom_frame",
          label: "Door Frame",
          type: "photo_array",
          parentFieldId: "field_doors",
        },
      ],
    },
  ],
};
const subDests = listPhotoDestinations(withSubs, {});
assert.equal(subDests.length, 3);
const knobDest = subDests.find((d) => d.fieldKey === "field_custom_knob");
assert.ok(knobDest);
assert.equal(formatDestinationLabel(knobDest!), "Entry / Hallway → Door Knob");

// Idempotent destination listing: same inputs → same unique keys
const keys = dests2.map((d) => `${d.sectionRef}::${d.fieldKey}`);
assert.equal(keys.length, new Set(keys).size);

// Property-room stable refs (sectionId/roomId) used by capture UI
const withRooms = {
  ...structure,
  propertyRoomInstances: [
    {
      roomId: "room-abc",
      sectionRef: "section_bedrooms/room-abc",
      title: "Master Bedroom",
    },
    {
      roomId: "room-def",
      sectionRef: "section_bedrooms/room-def",
      title: "Bedroom 2",
    },
  ],
};
const roomDests = listPhotoDestinations(withRooms, { section_bedrooms: 2 });
assert.ok(roomDests.some((d) => d.sectionRef === "section_bedrooms/room-abc"));
assert.ok(roomDests.some((d) => d.sectionLabel === "Master Bedroom"));
assert.equal(roomDests.filter((d) => d.sectionId === "section_bedrooms").length, 4);
assert.ok(
  assertDestinationValid(withRooms, "section_bedrooms/room-abc", "field_floor", {
    section_bedrooms: 2,
  }),
);
assert.equal(
  assertDestinationValid(withRooms, "section_bedrooms/Bedrooms 1", "field_floor", {
    section_bedrooms: 2,
  }),
  null,
);

// Count caps property-room destinations to what capture UI shows
const capped = listPhotoDestinations(withRooms, { section_bedrooms: 1 });
const cappedBedrooms = capped.filter((d) => d.sectionId === "section_bedrooms");
assert.equal(cappedBedrooms.length, 2);
assert.ok(cappedBedrooms.every((d) => d.sectionRef === "section_bedrooms/room-abc"));
assert.ok(!cappedBedrooms.some((d) => d.sectionRef.includes("room-def")));

// Orphan propertyRoomInstances (section not in template) are ignored
const orphaned = {
  sections: [
    {
      id: "section_kitchen",
      title: "Kitchen",
      fields: [{ id: "field_kitchen", label: "Kitchen Condition", type: "photo" }],
    },
  ],
  propertyRoomInstances: [
    {
      roomId: "room-x",
      sectionRef: "section_bedrooms/room-x",
      title: "Bedroom 1",
    },
  ],
};
const orphanDests = listPhotoDestinations(orphaned, {});
assert.equal(orphanDests.length, 1);
assert.equal(orphanDests[0].sectionRef, "section_kitchen");
assert.ok(!orphanDests.some((d) => d.sectionLabel.includes("Bedroom")));

// Older snapshots without propertyRoomInstances still accept roomId refs
assert.ok(
  assertDestinationValid(structure, "section_bedrooms/room-abc", "field_floor", {}),
);

console.log("inspectionGallery.test.ts: ok");
