import assert from "node:assert/strict";
import {
  cipCountFieldKey,
  cipExpandedFieldKey,
  cipInstanceLabel,
  expandCipFieldsForCount,
  getCipsForSection,
  isCipRepeatable,
  isMetaSection,
  normalizeCustomInspectionPoints,
  normalizeSectionCustomInspectionPointIds,
  parseCipCountValue,
  parseCipExpandedFieldKey,
  resolveCipInstanceCount,
  resolveFieldLabelFromTemplateStructure,
  sanitizeStructureSectionCipIds,
} from "./templateCustomInspectionPoints";

assert.equal(isMetaSection({ title: "General Information" }), true);
assert.equal(isMetaSection({ title: "Sign-Off" }), true);
assert.equal(isMetaSection({ title: "Bedrooms" }), false);

const cips = normalizeCustomInspectionPoints([
  {
    id: "cip_door_1",
    label: "  Door  ",
    fields: [
      { id: "field_top", label: "Top of Door", type: "photo_array", includeCondition: true },
      { id: "field_bottom", label: "Bottom of Door", type: "photo_array" },
    ],
  },
]);
assert.equal(cips.length, 1);
assert.equal(cips[0].label, "Door");
assert.equal(cips[0].fields.length, 2);
assert.equal(cips[0].repeatable, true);
assert.equal(isCipRepeatable(cips[0]), true);
assert.equal(resolveCipInstanceCount(cips[0], 3), 3);

const fixedCips = normalizeCustomInspectionPoints([
  { id: "cip_fixed", label: "Meter", repeatable: false, fields: [{ id: "f1", label: "Photo", type: "photo" }] },
]);
assert.equal(isCipRepeatable(fixedCips[0]), false);
assert.equal(resolveCipInstanceCount(fixedCips[0], 0), 1);
assert.equal(resolveCipInstanceCount(fixedCips[0], 9), 1);

assert.equal(cipCountFieldKey("cip_door_1"), "__cip_count_cip_door_1");
assert.equal(parseCipCountValue({ value: 3 }), 3);
assert.equal(parseCipCountValue(0), 0);

const key = cipExpandedFieldKey("cip_door_1", 2, "field_top");
assert.equal(key, "cip_door_1__i2__field_top");
assert.deepEqual(parseCipExpandedFieldKey(key), {
  cipId: "cip_door_1",
  instanceIndex: 2,
  fieldId: "field_top",
});
assert.equal(cipInstanceLabel("Door", 2), "Door 2");

const expanded = expandCipFieldsForCount(cips[0], 2);
assert.equal(expanded.length, 4);
assert.equal(expanded[0].id, "cip_door_1__i1__field_top");
assert.equal(expanded[2].cipInstanceIndex, 2);

const structure = {
  sections: [
    { id: "section_bedrooms", title: "Bedrooms", fields: [], customInspectionPointIds: ["cip_door_1"] },
    { id: "section_kitchen", title: "Kitchen", fields: [] },
    {
      id: "section_general_info",
      title: "General Information",
      fields: [],
      customInspectionPointIds: ["cip_door_1"],
    },
  ],
  customInspectionPoints: cips,
};
assert.equal(
  resolveFieldLabelFromTemplateStructure(structure, "cip_door_1__i1__field_top"),
  "Door 1 — Top of Door",
);
assert.equal(
  resolveFieldLabelFromTemplateStructure(structure, "__cip_count_cip_door_1"),
  "How many Door?",
);

assert.deepEqual(
  getCipsForSection(structure, structure.sections[0]).map((c) => c.id),
  ["cip_door_1"],
);
assert.deepEqual(getCipsForSection(structure, structure.sections[1]), []);
assert.deepEqual(getCipsForSection(structure, structure.sections[2]), []);
assert.deepEqual(
  getCipsForSection(structure, {
    id: "section_x",
    title: "X",
    customInspectionPointIds: ["cip_door_1", "cip_missing", "cip_door_1"],
  }).map((c) => c.id),
  ["cip_door_1"],
);
assert.deepEqual(
  normalizeSectionCustomInspectionPointIds(["cip_door_1", "nope", 1, "cip_door_1"], ["cip_door_1"]),
  ["cip_door_1"],
);

const sanitized = sanitizeStructureSectionCipIds({
  sections: [
    {
      id: "section_bedrooms",
      title: "Bedrooms",
      customInspectionPointIds: ["cip_door_1", "cip_gone"],
    },
  ],
  customInspectionPoints: cips,
});
assert.deepEqual(sanitized.sections![0].customInspectionPointIds, ["cip_door_1"]);

console.log("templateCustomInspectionPoints.test.ts: ok");
