import assert from "node:assert/strict";
import { duplicateTemplateSection } from "./templateSectionDuplicate";

const source = {
  id: "section_fire",
  title: "Fire Safety & Ventilation Checks",
  description: "HMO checks",
  repeatable: true,
  fields: [
    {
      id: "field_a",
      key: "field_a",
      label: "Extinguisher",
      type: "photo_array",
      required: true,
      includeCondition: true,
      includeCleanliness: false,
      options: ["Good", "Fair"],
      validation: { max: 5 },
    },
    {
      id: "field_b",
      key: "field_b",
      label: "Notes",
      type: "long_text",
      depends_on: "field_a",
    },
  ],
};

const copy = duplicateTemplateSection(source);

assert.notEqual(copy.id, source.id);
assert.equal(copy.title, "Fire Safety & Ventilation Checks_COPY");
assert.equal(copy.description, "HMO checks");
assert.equal(copy.repeatable, true);
assert.equal(copy.fields.length, 2);
assert.notEqual(copy.fields[0]!.id, "field_a");
assert.equal(copy.fields[0]!.id, copy.fields[0]!.key);
assert.equal(copy.fields[0]!.label, "Extinguisher");
assert.equal(copy.fields[0]!.includeCondition, true);
assert.deepEqual(copy.fields[0]!.options, ["Good", "Fair"]);
assert.notEqual(copy.fields[0]!.options, source.fields[0]!.options);
copy.fields[0]!.options!.push("Poor");
assert.equal(source.fields[0]!.options!.length, 2);
assert.equal(copy.fields[1]!.depends_on, copy.fields[0]!.id);

assert.equal(duplicateTemplateSection({ id: "s", title: "  ", fields: [] }).title, "Section_COPY");
assert.equal(duplicateTemplateSection(copy).title, "Fire Safety & Ventilation Checks_COPY_COPY");

console.log("templateSectionDuplicate.test.ts: ok");
