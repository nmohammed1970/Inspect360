import assert from "node:assert/strict";
import {
  buildCheckOutSnapshotFromCheckIn,
  buildSeedEntriesFromCheckOutSnapshot,
  mapCheckInIdToCheckOutId,
  mapCheckInSectionRefToCheckOut,
} from "./checkInSnapshotForCheckOut";

assert.equal(mapCheckInIdToCheckOutId("field_checkin_entry_door_condition"), "field_checkout_entry_door_condition");
assert.equal(mapCheckInIdToCheckOutId("section_checkin_general_info"), "section_checkout_general_info");
assert.equal(mapCheckInIdToCheckOutId("cip_abc-123"), "cip_abc-123");
assert.equal(mapCheckInIdToCheckOutId("__cip_count_cip_abc"), "__cip_count_cip_abc");
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
      ],
    },
    {
      id: "section_checkin_bedrooms",
      title: "Bedrooms",
      repeatable: true,
      customInspectionPointIds: ["cip_door_1"],
      fields: [
        {
          id: "field_checkin_bedroom_floor",
          key: "field_checkin_bedroom_floor",
          label: "Floor Condition",
          type: "photo_array",
        },
      ],
    },
  ],
  customInspectionPoints: [
    {
      id: "cip_door_1",
      label: "Door",
      fields: [
        {
          id: "field_door_top",
          key: "field_door_top",
          label: "Top of Door",
          type: "photo_array",
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
assert.equal(checkOut.sections!.length, 2);
assert.equal(checkOut.sections![0].id, "section_checkout_entry_hallway");
assert.equal(checkOut.sections![0].fields[0].id, "field_checkout_entry_door_condition");
assert.equal(checkOut.customInspectionPoints![0].id, "cip_door_1");
assert.equal(checkOut.customInspectionPoints![0].label, "Door");
assert.equal(checkOut.customInspectionPoints![0].fields[0].id, "field_door_top");
assert.deepEqual(checkOut.sections![1].customInspectionPointIds, ["cip_door_1"]);
assert.equal(
  checkOut.propertyRoomInstances![0].sectionRef,
  "section_checkout_bedrooms/room-uuid-1",
);
assert.equal(checkOut.propertyRoomInstances![0].title, "Master Bedroom");

const seeds = buildSeedEntriesFromCheckOutSnapshot(checkOut);
assert.equal(seeds.length, 1);
assert.equal(seeds[0].fieldKey, "__repeatable_count_section_checkout_bedrooms");
assert.equal(seeds[0].valueJson, 1);

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
