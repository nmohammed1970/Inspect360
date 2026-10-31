/**
 * Pure validation helpers used by gallery assign routes.
 * Run: npx tsx server/inspectionGalleryService.test.ts
 */
import assert from "node:assert/strict";
import {
  SECTION_GALLERY_FIELD_KEY,
  assertDestinationValid,
  formatDestinationLabel,
  isSectionGalleryFieldKey,
  listPhotoDestinations,
  matchesSectionScope,
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

// Section-pool destination validation (no entries.photos sync for this key)
const pool = assertDestinationValid(snapshot, "section_a", SECTION_GALLERY_FIELD_KEY, {});
assert.ok(pool, "section-pool assign accepted for valid section");
assert.ok(isSectionGalleryFieldKey(pool!.fieldKey));
assert.equal(formatDestinationLabel(pool!), "Area A");
assert.ok(
  !listPhotoDestinations(snapshot, { section_rooms: 2 }).some((d) =>
    isSectionGalleryFieldKey(d.fieldKey),
  ),
);

const poolRoom = assertDestinationValid(
  snapshot,
  "section_rooms/Rooms 1",
  SECTION_GALLERY_FIELD_KEY,
  { section_rooms: 2 },
);
assert.ok(poolRoom);
assert.equal(
  assertDestinationValid(
    snapshot,
    "section_rooms/Rooms 9",
    SECTION_GALLERY_FIELD_KEY,
    { section_rooms: 2 },
  ),
  null,
);

// Exclusive reassignment model: one active assignment per image (client/server clear priors).
// Scope match uses aliases so UUID room paths and Title N stay in sync.
assert.equal(
  matchesSectionScope(
    {
      assignments: [
        { sectionRef: "section_rooms/room-1", fieldKey: SECTION_GALLERY_FIELD_KEY },
      ],
    },
    "section_rooms/Rooms 1",
    ["section_rooms/room-1"],
  ),
  true,
);

console.log("inspectionGalleryService.test.ts: ok");
