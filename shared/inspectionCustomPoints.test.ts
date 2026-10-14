import assert from "node:assert/strict";
import {
  appendCustomPointToSnapshot,
  canAddCustomPointsToSection,
  getChildFields,
  getTopLevelFields,
  isGeneralInfoSection,
  isSignOffSection,
  normalizeCustomPointLabel,
  removeCustomPointFromSnapshot,
  resolveFieldLabelFromSnapshot,
} from "./inspectionCustomPoints";

const baseSnapshot = {
  sections: [
    {
      id: "section_general_info",
      title: "General Information",
      fields: [
        {
          id: "field_checkin_property_address",
          label: "Property Address",
          type: "auto_address",
        },
      ],
    },
    {
      id: "section_entry_hallway",
      title: "Entry / Hallway",
      fields: [
        {
          id: "field_checkin_entry_door_condition",
          key: "field_checkin_entry_door_condition",
          label: "Door Condition",
          type: "photo_array",
          includeCondition: true,
          includeCleanliness: true,
        },
      ],
    },
    {
      id: "section_empty",
      title: "Empty Room",
      fields: [],
    },
    {
      id: "section_signoff",
      title: "Sign-Off",
      fields: [
        {
          id: "field_inspector_signature",
          label: "Inspector Signature",
          type: "signature",
        },
      ],
    },
  ],
};

assert.equal(normalizeCustomPointLabel("  Ceiling Condition  "), "Ceiling Condition");
assert.equal(normalizeCustomPointLabel("Smoke   Alarm"), "Smoke Alarm");
assert.throws(() => normalizeCustomPointLabel(""), /empty/i);
assert.throws(() => normalizeCustomPointLabel("   "), /empty/i);
assert.throws(() => normalizeCustomPointLabel(null), /required/i);

assert.equal(isGeneralInfoSection(baseSnapshot.sections[0]), true);
assert.equal(isSignOffSection(baseSnapshot.sections[3]), true);
assert.equal(isSignOffSection(baseSnapshot.sections[1]), false);
assert.equal(canAddCustomPointsToSection(baseSnapshot.sections[0]), false);
assert.equal(canAddCustomPointsToSection(baseSnapshot.sections[1]), true);
assert.equal(canAddCustomPointsToSection(baseSnapshot.sections[3]), false);

assert.throws(
  () =>
    appendCustomPointToSnapshot(baseSnapshot, {
      sectionId: "section_general_info",
      label: "Should Fail",
    }),
  /General Information/i,
);

const appended = appendCustomPointToSnapshot(baseSnapshot, {
  sectionId: "section_entry_hallway",
  label: "  Ceiling Condition  ",
  fieldId: "field_custom_test_1",
});
assert.equal(appended.created, true);
assert.equal(appended.field.label, "Ceiling Condition");
assert.equal(appended.field.type, "photo_array");
assert.equal((appended.field as any).includeCondition, true);
assert.equal((appended.field as any).includeCleanliness, true);
assert.equal(appended.field.custom, true);
assert.equal(appended.field.id, "field_custom_test_1");
assert.equal(appended.field.key, "field_custom_test_1");

const choiceAppended = appendCustomPointToSnapshot(baseSnapshot, {
  sectionId: "section_entry_hallway",
  label: "Meter Readings Taken",
  kind: "choice",
  options: [" Yes ", "No", "yes", "", "N/A"],
  fieldId: "field_custom_choice_1",
});
assert.equal(choiceAppended.created, true);
assert.equal(choiceAppended.field.type, "select");
assert.deepEqual((choiceAppended.field as any).options, ["Yes", "No", "N/A"]);
assert.throws(
  () =>
    appendCustomPointToSnapshot(baseSnapshot, {
      sectionId: "section_entry_hallway",
      label: "Broken Choice",
      kind: "choice",
      options: ["  ", ""],
    }),
  /at least one option/i,
);

const entrySection = appended.snapshot.sections!.find((s) => s.id === "section_entry_hallway")!;
assert.equal(entrySection.fields!.length, 2);
assert.equal((entrySection.fields![1] as any).label, "Ceiling Condition");
assert.equal((entrySection.fields![0] as any).label, "Door Condition");

const emptyAppend = appendCustomPointToSnapshot(baseSnapshot, {
  sectionId: "section_empty",
  label: "Window Locks",
  fieldId: "field_custom_empty_1",
});
assert.equal(emptyAppend.created, true);
const emptySection = emptyAppend.snapshot.sections!.find((s) => s.id === "section_empty")!;
assert.equal(emptySection.fields!.length, 1);

assert.throws(
  () =>
    appendCustomPointToSnapshot(baseSnapshot, {
      sectionId: "section_signoff",
      label: "Should Fail",
    }),
  /Sign-Off/i,
);

assert.throws(
  () =>
    appendCustomPointToSnapshot(baseSnapshot, {
      sectionId: "missing_section",
      label: "Nope",
    }),
  /not found/i,
);

const first = appendCustomPointToSnapshot(baseSnapshot, {
  sectionId: "section_entry_hallway",
  label: "Boiler Condition",
  clientRequestId: "req-abc",
  fieldId: "field_custom_idem_1",
});
const second = appendCustomPointToSnapshot(first.snapshot, {
  sectionId: "section_entry_hallway",
  label: "Boiler Condition Again",
  clientRequestId: "req-abc",
  fieldId: "field_custom_idem_2",
});
assert.equal(second.created, false);
assert.equal(second.field.id, "field_custom_idem_1");
const afterIdem = second.snapshot.sections!.find((s) => s.id === "section_entry_hallway")!;
assert.equal(afterIdem.fields!.length, 2);

assert.equal(
  resolveFieldLabelFromSnapshot(first.snapshot, "field_custom_idem_1"),
  "Boiler Condition",
);
assert.equal(
  resolveFieldLabelFromSnapshot(first.snapshot, "field_checkin_entry_door_condition"),
  "Door Condition",
);
assert.equal(resolveFieldLabelFromSnapshot(first.snapshot, "missing"), null);

const removed = removeCustomPointFromSnapshot(first.snapshot, {
  sectionId: "section_entry_hallway",
  fieldId: "field_custom_idem_1",
});
assert.equal(removed.removed, true);
const afterRemove = removed.snapshot.sections!.find((s) => s.id === "section_entry_hallway")!;
assert.equal(afterRemove.fields!.length, 1);
assert.equal((afterRemove.fields![0] as any).id, "field_checkin_entry_door_condition");

assert.throws(
  () =>
    removeCustomPointFromSnapshot(first.snapshot, {
      sectionId: "section_entry_hallway",
      fieldId: "field_checkin_entry_door_condition",
    }),
  /Only custom/i,
);

const alreadyGone = removeCustomPointFromSnapshot(removed.snapshot, {
  sectionId: "section_entry_hallway",
  fieldId: "field_custom_idem_1",
});
assert.equal(alreadyGone.removed, false);

// Sub-points under a custom parent
const withParent = appendCustomPointToSnapshot(baseSnapshot, {
  sectionId: "section_entry_hallway",
  label: "Doors",
  fieldId: "field_custom_doors",
});
const withChild = appendCustomPointToSnapshot(withParent.snapshot, {
  sectionId: "section_entry_hallway",
  label: "Door Knock",
  fieldId: "field_custom_door_knock",
  parentFieldId: "field_custom_doors",
});
assert.equal(withChild.created, true);
assert.equal(withChild.field.parentFieldId, "field_custom_doors");
const nestedSection = withChild.snapshot.sections!.find((s) => s.id === "section_entry_hallway")!;
assert.equal(getTopLevelFields(nestedSection.fields as any).length, 2); // Door Condition + Doors
assert.equal(getChildFields(nestedSection.fields as any, "field_custom_doors").length, 1);
assert.equal(
  resolveFieldLabelFromSnapshot(withChild.snapshot, "field_custom_door_knock"),
  "Doors › Door Knock",
);

assert.throws(
  () =>
    appendCustomPointToSnapshot(withChild.snapshot, {
      sectionId: "section_entry_hallway",
      label: "Too Deep",
      parentFieldId: "field_custom_door_knock",
    }),
  /top-level/i,
);

const cascade = removeCustomPointFromSnapshot(withChild.snapshot, {
  sectionId: "section_entry_hallway",
  fieldId: "field_custom_doors",
});
assert.equal(cascade.removed, true);
assert.deepEqual(cascade.removedFieldIds.sort(), [
  "field_custom_door_knock",
  "field_custom_doors",
].sort());
const afterCascade = cascade.snapshot.sections!.find((s) => s.id === "section_entry_hallway")!;
assert.equal(afterCascade.fields!.length, 1);

console.log("inspectionCustomPoints.test.ts: ok");
