import assert from "node:assert/strict";
import {
  computeInspectionCaptureProgress,
  formatRequiredIncompleteMessage,
  isInspectionEntryComplete,
  isProgressMetaFieldKey,
  listRequiredIncompleteFields,
  normalizeProgressEntriesMap,
  repeatableCountsFromEntries,
  resolveSectionInstanceRefs,
} from "./inspectionProgress";

assert.equal(isProgressMetaFieldKey("__repeatable_count_bedrooms"), true);
assert.equal(isProgressMetaFieldKey("__cip_count_cip_door"), false);
assert.equal(isProgressMetaFieldKey("condition"), false);

assert.equal(isInspectionEntryComplete({ valueJson: null }), false);
assert.equal(isInspectionEntryComplete({ valueJson: "" }), false);
assert.equal(isInspectionEntryComplete({ valueJson: {} }), false);
assert.equal(isInspectionEntryComplete({ valueJson: 0 }), true);
assert.equal(isInspectionEntryComplete({ valueJson: false }), true);
assert.equal(isInspectionEntryComplete({ valueJson: "ok" }), true);
assert.equal(isInspectionEntryComplete({ photos: ["a.jpg"] }), true);
assert.equal(
  isInspectionEntryComplete({
    fieldKey: "__repeatable_count_x",
    valueJson: 3,
  }),
  false,
);

const sections = [
  {
    id: "general",
    title: "General",
    fields: [
      { id: "address", label: "Address", type: "text" },
      { id: "tenant_sig", label: "Tenant Signature", type: "signature" },
    ],
  },
  {
    id: "bedrooms",
    title: "Bedroom",
    repeatable: true,
    fields: [{ id: "condition", label: "Condition", type: "select" }],
    customInspectionPointIds: ["cip_door"],
  },
];

const structure = {
  sections,
  customInspectionPoints: [
    {
      id: "cip_door",
      label: "Door",
      repeatable: true,
      fields: [{ id: "door_cond", label: "Door condition", type: "text" }],
    },
  ],
};

const roomInstances = [
  { sectionRef: "bedrooms/room_a", title: "Master" },
  { sectionRef: "bedrooms/room_b", title: "Spare" },
];

assert.deepEqual(
  resolveSectionInstanceRefs(sections[1], { bedrooms: 2 }, roomInstances),
  ["bedrooms/room_a", "bedrooms/room_b"],
);

// Orphan + meta entries must not inflate completed above total
const entries = {
  "general-address": { sectionRef: "general", fieldKey: "address", valueJson: "1 High St" },
  "bedrooms/room_a-condition": {
    sectionRef: "bedrooms/room_a",
    fieldKey: "condition",
    valueJson: "Good",
  },
  "bedrooms/room_b-condition": {
    sectionRef: "bedrooms/room_b",
    fieldKey: "condition",
    valueJson: "Fair",
  },
  "bedrooms/room_a-__cip_count_cip_door": {
    sectionRef: "bedrooms/room_a",
    fieldKey: "__cip_count_cip_door",
    valueJson: 1,
  },
  "bedrooms/room_a-cip_door__i1__door_cond": {
    sectionRef: "bedrooms/room_a",
    fieldKey: "cip_door__i1__door_cond",
    valueJson: "OK",
  },
  "bedrooms/room_b-__cip_count_cip_door": {
    sectionRef: "bedrooms/room_b",
    fieldKey: "__cip_count_cip_door",
    valueJson: 0,
  },
  // Orphan stale sectionRef + meta — previously pushed completed > total
  "bedrooms/Bedroom 1-condition": {
    sectionRef: "bedrooms/Bedroom 1",
    fieldKey: "condition",
    valueJson: "Stale",
  },
  "bedrooms-__repeatable_count_bedrooms": {
    sectionRef: "bedrooms",
    fieldKey: "__repeatable_count_bedrooms",
    valueJson: 2,
  },
};

const progress = computeInspectionCaptureProgress({
  sections,
  entries,
  repeatableCounts: { bedrooms: 2 },
  propertyRoomInstances: roomInstances,
  templateStructure: structure as any,
  excludeTenantSignatures: true,
});

// general address (1) + 2 bedroom conditions + 2 cip counts + 1 expanded door = 6
assert.equal(progress.totalFields, 6);
assert.equal(progress.completedFields, 6);
assert.equal(progress.progress, 100);
assert.ok(progress.completedFields <= progress.totalFields);
assert.equal(progress.bySection.general?.remainingFields, 0);
assert.equal(progress.bySection.bedrooms?.remainingFields, 0);
assert.equal(progress.bySection.general?.totalFields, 1);
assert.equal(progress.bySection.bedrooms?.totalFields, 5);

const withTenantSig = computeInspectionCaptureProgress({
  sections,
  entries: {
    ...entries,
    "general-tenant_sig": {
      sectionRef: "general",
      fieldKey: "tenant_sig",
      valueJson: { image: "data:..." },
    },
  },
  repeatableCounts: { bedrooms: 2 },
  propertyRoomInstances: roomInstances,
  templateStructure: structure as any,
  excludeTenantSignatures: false,
});
assert.equal(withTenantSig.totalFields, 7);

const fromArray = normalizeProgressEntriesMap([
  { sectionRef: "a", fieldKey: "f", valueJson: 1 },
  { sectionRef: "a", fieldKey: "__repeatable_count_a", valueJson: 2 },
]);
assert.ok(fromArray["a-f"]);
assert.equal(fromArray["a-__repeatable_count_a"], undefined);

assert.deepEqual(
  repeatableCountsFromEntries([
    { sectionRef: "bedrooms", fieldKey: "__repeatable_count_bedrooms", valueJson: 3 },
  ]),
  { bedrooms: 3 },
);

const requiredSections = [
  {
    id: "general",
    title: "General Overview",
    fields: [
      { id: "notes", label: "Notes", type: "long_text", required: true },
      { id: "optional", label: "Optional", type: "text", required: false },
    ],
  },
  {
    id: "bedrooms",
    title: "Bedroom",
    repeatable: true,
    fields: [{ id: "walls", label: "Walls", type: "photo_array", required: true }],
  },
];

const requiredMissing = listRequiredIncompleteFields({
  sections: requiredSections,
  entries: {},
  repeatableCounts: { bedrooms: 1 },
  propertyRoomInstances: [{ sectionRef: "bedrooms/room_a", title: "Bedroom 1" }],
  excludeTenantSignatures: true,
});
assert.equal(requiredMissing.length, 2);
assert.ok(requiredMissing.some((f) => f.fieldKey === "notes"));
assert.ok(requiredMissing.some((f) => f.fieldKey === "walls" && f.sectionRef === "bedrooms/room_a"));
assert.ok(formatRequiredIncompleteMessage(requiredMissing).includes("2 required fields"));

const requiredFilled = listRequiredIncompleteFields({
  sections: requiredSections,
  entries: {
    "general-notes": { sectionRef: "general", fieldKey: "notes", valueJson: "Done" },
    "bedrooms/room_a-walls": {
      sectionRef: "bedrooms/room_a",
      fieldKey: "walls",
      photos: ["/objects/a.jpg"],
    },
  },
  repeatableCounts: { bedrooms: 1 },
  propertyRoomInstances: [{ sectionRef: "bedrooms/room_a", title: "Bedroom 1" }],
  excludeTenantSignatures: true,
});
assert.equal(requiredFilled.length, 0);

// Empty condition/cleanliness shells must not satisfy required
const emptyShellMissing = listRequiredIncompleteFields({
  sections: [
    {
      id: "entry",
      title: "Entry / Hallway",
      fields: [{ id: "door", label: "Door Condition", type: "photo_array", required: true }],
    },
  ],
  entries: {
    "entry-door": {
      sectionRef: "entry",
      fieldKey: "door",
      valueJson: { value: null, condition: undefined, cleanliness: "" },
      photos: [],
    },
  },
  excludeTenantSignatures: true,
});
assert.equal(emptyShellMissing.length, 1);

// Condition alone is not enough for required photo fields
const conditionOnlyStillMissing = listRequiredIncompleteFields({
  sections: [
    {
      id: "entry",
      title: "Entry / Hallway",
      fields: [{ id: "door", label: "Door Condition", type: "photo_array", required: true }],
    },
  ],
  entries: {
    "entry-door": {
      sectionRef: "entry",
      fieldKey: "door",
      valueJson: { value: null, condition: "Good", cleanliness: "" },
      photos: [],
    },
  },
  excludeTenantSignatures: true,
});
assert.equal(conditionOnlyStillMissing.length, 1);

const photosSatisfyRequired = listRequiredIncompleteFields({
  sections: [
    {
      id: "entry",
      title: "Entry / Hallway",
      fields: [{ id: "door", label: "Door Condition", type: "photo_array", required: true }],
    },
  ],
  entries: {
    "entry-door": {
      sectionRef: "entry",
      fieldKey: "door",
      valueJson: { value: null, condition: "Good" },
      photos: ["/objects/door.jpg"],
    },
  },
  excludeTenantSignatures: true,
});
assert.equal(photosSatisfyRequired.length, 0);

console.log("inspectionProgress.test.ts: all assertions passed");
