import assert from "node:assert/strict";
import {
  buildCheckOutSnapshotFromCheckIn,
  buildSeedEntriesFromCheckOutSnapshot,
  checkoutSnapshotMissingCheckInCustoms,
  mapCheckInIdToCheckOutId,
  mapCheckInSectionRefToCheckOut,
} from "./checkInSnapshotForCheckOut";

assert.equal(mapCheckInIdToCheckOutId("field_checkin_entry_door_condition"), "field_checkout_entry_door_condition");
assert.equal(mapCheckInIdToCheckOutId("section_checkin_general_info"), "section_checkout_general_info");
assert.equal(mapCheckInIdToCheckOutId("field_custom_abc"), "field_custom_abc");
assert.equal(
  mapCheckInSectionRefToCheckOut("section_checkin_bedrooms/room-uuid-1"),
  "section_checkout_bedrooms/room-uuid-1",
);

const checkIn = {
  sections: [
    {
      id: "section_checkin_entry_hallway",
      title: "Entry / Hallway",
      fields: [
        {
          id: "field_checkin_entry_door_condition",
          key: "field_checkin_entry_door_condition",
          label: "Door Condition",
          type: "photo_array",
          includeCondition: true,
        },
        {
          id: "field_custom_ceiling_1",
          key: "field_custom_ceiling_1",
          label: "Ceiling Condition",
          type: "photo_array",
          custom: true,
          includeCondition: true,
          includeCleanliness: true,
        },
      ],
    },
    {
      id: "section_checkin_bedrooms",
      title: "Bedrooms",
      repeatable: true,
      fields: [
        {
          id: "field_checkin_bedroom_floor",
          key: "field_checkin_bedroom_floor",
          label: "Floor Condition",
          type: "photo_array",
        },
      ],
    },
    {
      id: "section_garden_auto",
      title: "Garden",
      fields: [
        {
          id: "field_custom_fence_1",
          key: "field_custom_fence_1",
          label: "Garden Fence",
          type: "photo_array",
          custom: true,
        },
      ],
    },
  ],
  propertyRoomInstances: [
    {
      roomId: "room-uuid-1",
      sectionRef: "section_checkin_bedrooms/room-uuid-1",
      title: "Master Bedroom",
    },
  ],
};

const checkOut = buildCheckOutSnapshotFromCheckIn(checkIn);
assert.equal(checkOut.sections!.length, 3);
assert.equal(checkOut.sections![0].id, "section_checkout_entry_hallway");
assert.equal(checkOut.sections![0].fields[0].id, "field_checkout_entry_door_condition");
assert.equal(checkOut.sections![0].fields[1].id, "field_custom_ceiling_1");
assert.equal(checkOut.sections![0].fields[1].label, "Ceiling Condition");
assert.equal(checkOut.sections![0].fields[1].custom, true);
assert.equal(checkOut.sections![2].id, "section_garden_auto");
assert.equal(checkOut.sections![2].fields[0].id, "field_custom_fence_1");
assert.equal(
  checkOut.propertyRoomInstances![0].sectionRef,
  "section_checkout_bedrooms/room-uuid-1",
);
assert.equal(checkOut.propertyRoomInstances![0].title, "Master Bedroom");

const seeds = buildSeedEntriesFromCheckOutSnapshot(checkOut);
assert.equal(seeds.length, 1);
assert.equal(seeds[0].fieldKey, "__repeatable_count_section_checkout_bedrooms");
assert.equal(seeds[0].valueJson, 1);

const thinCheckout = {
  sections: [
    {
      id: "section_checkout_entry_hallway",
      fields: [{ id: "field_checkout_entry_door_condition", type: "photo_array" }],
    },
  ],
};
assert.equal(checkoutSnapshotMissingCheckInCustoms(checkIn, thinCheckout), true);
assert.equal(checkoutSnapshotMissingCheckInCustoms(checkIn, checkOut), false);

// Default-style shared section ids (no checkin token) stay stable
const sharedIds = buildCheckOutSnapshotFromCheckIn({
  sections: [
    {
      id: "section_entry_hallway",
      fields: [{ id: "field_checkin_entry_door_condition", key: "field_checkin_entry_door_condition" }],
    },
  ],
});
assert.equal(sharedIds.sections![0].id, "section_entry_hallway");
assert.equal(sharedIds.sections![0].fields[0].id, "field_checkout_entry_door_condition");

console.log("checkInSnapshotForCheckOut.test.ts: ok");
