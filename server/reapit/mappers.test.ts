/**
 * Reapit mapper and address tests.
 * Run: npx tsx server/reapit/mappers.test.ts
 */
import {
  formatReapitAddress,
  isLettingProperty,
  mapContact,
  mapProperty,
  mapTenancy,
  relatedIds,
  syntheticEmail,
} from "./mappers";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

assert(
  formatReapitAddress({
    buildingNumber: "10",
    buildingName: "The Court",
    line1: "High Street",
    postcode: "SW1A 1AA",
  }) === "10 The Court, High Street, SW1A 1AA",
  "address joined with commas",
);
assert(formatReapitAddress(undefined) === "", "empty address");

assert(isLettingProperty({ marketingMode: "letting" }), "letting mode");
assert(isLettingProperty({ marketingMode: "sellingAndLetting" }), "sellingAndLetting after lowercase");
assert(isLettingProperty({ letting: { rent: 1000 } }), "letting object present");
assert(!isLettingProperty({ marketingMode: "selling" }), "sales-only skipped");

const mapped = mapProperty({
  id: "p1",
  address: { buildingName: "Oak House", line1: "1 Lane", postcode: "E1 1AA" },
  type: ["house"],
});
assert(mapped.name === "Oak House", "property name from building");
assert(mapped.address.includes("E1 1AA"), "property address includes postcode");
assert(mapped.propertyType === "house", "property type lowercased");

const contact = mapContact({ forename: "Ada", surname: "Lovelace", email: " ada@example.com " });
assert(contact.firstName === "Ada" && contact.lastName === "Lovelace", "contact names");
assert(contact.email === "ada@example.com", "contact email trimmed");

const active = mapTenancy({ status: "current", rent: 1200, rentFrequency: "monthly", deposit: 1800 });
assert(active.isActive === true, "current tenancy active");
assert(active.monthlyRent === "1200", "monthly rent string");
assert(active.depositAmount === "1800", "deposit string");

const ended = mapTenancy({ status: "ended" });
assert(ended.isActive === false, "ended tenancy inactive");

const weekly = mapTenancy({ status: "current", rent: 250, rentFrequency: "weekly" });
assert(weekly.monthlyRent === "1083.33", "weekly rent converted");

assert(relatedIds([{ associatedType: "contact", associatedId: "c1" }], "contact")[0] === "c1", "related ids");
assert(syntheticEmail("AbC") === "reapit+abc@noreply.inspect360.local", "synthetic email");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
