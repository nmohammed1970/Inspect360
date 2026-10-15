import assert from "node:assert/strict";
import {
  defaultGeneralInformationSection,
  isGeneralInformationSection,
} from "./defaultGeneralInformationSection";
import { isBathroomCountField, isBedroomCountField } from "./propertyLayout";

const section = defaultGeneralInformationSection();
assert.equal(section.id, "section_general_info");
assert.equal(section.title, "General Information");
assert.equal(section.repeatable, false);
assert.equal(section.fields.length, 6);

const types = section.fields.map((f) => f.type);
assert.deepEqual(types, [
  "auto_address",
  "auto_tenant_names",
  "auto_inspection_date",
  "auto_inspector",
  "auto_bedroom_count",
  "auto_bathroom_count",
]);

const bedroom = section.fields.find((f) => f.label === "Number of Bedrooms");
const bathroom = section.fields.find((f) => f.label === "Number of Bathrooms");
assert.ok(bedroom);
assert.ok(bathroom);
assert.equal(isBedroomCountField(bedroom), true);
assert.equal(isBathroomCountField(bathroom), true);
assert.equal(isGeneralInformationSection(section), true);
assert.equal(isGeneralInformationSection({ title: "Bedrooms" }), false);

console.log("defaultGeneralInformationSection.test.ts: ok");
