/**
 * Pure validation helpers used by gallery assign routes.
 * Run: npx tsx server/inspectionGalleryService.test.ts
 */
import assert from "node:assert/strict";
import {
  assertDestinationValid,
  listPhotoDestinations,
  normalizeObjectUrl,
} from "../shared/inspectionGallery";

const snapshot = {
  sections: [
    {
      id: "section_a",
      title: "Area A",
      fields: [{ id: "photo_a", label: "Photo A", type: "photo" }],
    },
    {
      id: "section_rooms",
      title: "Rooms",
      repeatable: true,
      fields: [{ id: "photo_room", label: "Room Photo", type: "photo_array" }],
    },
  ],
};

// Cross-inspection style rejection: destination must exist on *this* snapshot
assert.equal(
  assertDestinationValid(snapshot, "section_other", "photo_a", {}),
  null,
  "foreign sectionRef rejected",
);
assert.equal(
  assertDestinationValid(snapshot, "section_a", "photo_foreign", {}),
  null,
  "foreign fieldKey rejected",
);
assert.ok(
  assertDestinationValid(snapshot, "section_a", "photo_a", {}),
  "valid destination accepted",
);

// Repeatable bound check (instance 3 invalid when count is 2)
assert.equal(
  assertDestinationValid(snapshot, "section_rooms/Rooms 3", "photo_room", {
    section_rooms: 2,
  }),
  null,
  "out-of-range repeatable instance rejected",
);
assert.ok(
  assertDestinationValid(snapshot, "section_rooms/Rooms 2", "photo_room", {
    section_rooms: 2,
  }),
  "in-range repeatable instance accepted",
);

const dests = listPhotoDestinations(snapshot, { section_rooms: 2 });
assert.equal(dests.filter((d) => d.fieldKey === "photo_room").length, 2);

// Object URL normalization (idempotent register key)
assert.equal(normalizeObjectUrl("/objects/x.jpg"), "/objects/x.jpg");
assert.equal(
  normalizeObjectUrl("https://cdn.example/objects/x.jpg?token=1"),
  "/objects/x.jpg",
);
assert.equal(normalizeObjectUrl("not-an-object"), null);

console.log("inspectionGalleryService.test.ts: ok");
