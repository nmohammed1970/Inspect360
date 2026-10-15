import assert from "node:assert/strict";
import {
  DEFAULT_REPORT_SECTION_ORDER,
  normalizeReportSectionOrder,
} from "./reportSectionOrder";

assert.deepEqual(normalizeReportSectionOrder(undefined), DEFAULT_REPORT_SECTION_ORDER);
assert.deepEqual(normalizeReportSectionOrder(null), DEFAULT_REPORT_SECTION_ORDER);
assert.deepEqual(normalizeReportSectionOrder([]), DEFAULT_REPORT_SECTION_ORDER);
assert.equal(DEFAULT_REPORT_SECTION_ORDER[2], "floorPlan");

assert.deepEqual(
  normalizeReportSectionOrder([
    "inspection",
    "glossary",
    "cover",
    "contents",
    "tradeMarks",
    "maintenanceLog",
    "inventory",
    "termsConditions",
    "closing",
  ]),
  [
    "inspection",
    "glossary",
    "cover",
    "contents",
    "floorPlan",
    "tradeMarks",
    "maintenanceLog",
    "inventory",
    "termsConditions",
    "closing",
  ],
);

assert.deepEqual(normalizeReportSectionOrder(["glossary", "glossary", "nope", "cover"]), [
  "glossary",
  "cover",
  "contents",
  "floorPlan",
  "tradeMarks",
  "maintenanceLog",
  "inspection",
  "inventory",
  "termsConditions",
  "closing",
]);

console.log("reportSectionOrder.test.ts: ok");
