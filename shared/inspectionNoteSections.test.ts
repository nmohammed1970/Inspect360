/**
 * Tests for inspection note section parsing.
 * Run: npx tsx shared/inspectionNoteSections.test.ts
 */
import {
  parseInspectionNote,
  hasNoteSections,
  buildMaintenanceRequestDescription,
} from "./inspectionNoteSections";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const empty = parseInspectionNote("");
assert(!hasNoteSections(empty), "empty has no sections");

const labeled = parseInspectionNote(`DESCRIPTION:
Door is sound overall.

MAINTENANCE ISSUES:
Lower right edge shows paint deterioration.

RECOMMENDED ACTIONS:
Clean, sand, prime and repaint the affected area.`);

assert(labeled.description.includes("Door is sound"), "labeled description");
assert(labeled.maintenanceIssues.includes("deterioration"), "labeled maintenance");
assert(labeled.recommendedActions.includes("repaint"), "labeled recommended");

const noneLabeled = parseInspectionNote(`DESCRIPTION:
Looks fine.

MAINTENANCE ISSUES:
None

RECOMMENDED ACTIONS:
None`);
assert(noneLabeled.description.includes("Looks fine"), "none: description kept");
assert(!noneLabeled.maintenanceIssues, "none: maintenance empty");
assert(!noneLabeled.recommendedActions, "none: recommended empty");

const legacy = parseInspectionNote(
  "The entry door appears structurally sound with even alignment. Lower right edge paint shows deterioration and scuffing. Recommend cleaning, sanding, priming and repainting the affected area.",
);
assert(legacy.description.length > 0, "legacy has description");
assert(
  legacy.maintenanceIssues.length > 0 || legacy.recommendedActions.length > 0,
  "legacy splits maintenance or recommended",
);

const maintFromAi = buildMaintenanceRequestDescription({
  fieldLabel: "Door Condition",
  sectionTitle: "Entry / Hallway",
  note: `DESCRIPTION:
Door is sound overall.

MAINTENANCE ISSUES:
Lower right edge shows paint deterioration.

RECOMMENDED ACTIONS:
Clean, sand, prime and repaint the affected area.`,
});
assert(maintFromAi.includes("inspection field: Door Condition"), "maint preamble");
assert(maintFromAi.includes("Description:"), "maint has description header");
assert(maintFromAi.includes("Door is sound"), "maint has AI description");
assert(maintFromAi.includes("Recommended Actions:"), "maint has recommended header");
assert(maintFromAi.includes("repaint"), "maint has recommended text");
assert(maintFromAi.includes("Maintenance Issues:"), "maint has issues header");

const maintPlain = buildMaintenanceRequestDescription({
  fieldLabel: "Door Condition",
  sectionTitle: "Entry / Hallway",
  note: "Inspector Comments: hinge squeaks",
});
assert(maintPlain.includes("hinge squeaks"), "plain notes included");

const maintEmpty = buildMaintenanceRequestDescription({
  fieldLabel: "Door Condition",
  sectionTitle: "Entry / Hallway",
  note: "",
});
assert(
  maintEmpty ===
    "Maintenance request created from inspection field: Door Condition in Entry / Hallway",
  "empty note is preamble only",
);

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
