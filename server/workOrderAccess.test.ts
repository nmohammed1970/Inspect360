/**
 * Work Order access rules — pure unit tests (no database).
 * Run with: npx tsx server/workOrderAccess.test.ts
 */

import {
  buildWorkOrderIdentity,
  canAccessWorkOrder,
  contactIdsForUser,
  isAllowedWorkOrderStatus,
  listScopeForUser,
} from "./workOrderAccess";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const ORG_A = "org-a";
const ORG_B = "org-b";

const clerkIdentity = buildWorkOrderIdentity({
  userId: "clerk-1",
  organizationId: ORG_A,
  role: "clerk",
  email: "clerk@example.com",
  orgContacts: [],
});

const contractorIdentity = buildWorkOrderIdentity({
  userId: "user-contractor-1",
  organizationId: ORG_A,
  role: "contractor",
  email: "contractor@example.com",
  orgContacts: [
    {
      id: "contact-contractor-1",
      type: "contractor",
      email: "contractor@example.com",
      linkedUserId: null,
    },
    {
      id: "contact-other",
      type: "contractor",
      email: "other@example.com",
      linkedUserId: null,
    },
  ],
});

const ownerIdentity = buildWorkOrderIdentity({
  userId: "owner-1",
  organizationId: ORG_A,
  role: "owner",
  email: "owner@example.com",
  orgContacts: [],
});

const clerkWithContactIdentity = buildWorkOrderIdentity({
  userId: "clerk-1",
  organizationId: ORG_A,
  role: "clerk",
  email: "clerk@example.com",
  orgContacts: [
    {
      id: "contact-clerk-1",
      type: "contractor",
      email: "clerk@example.com",
      linkedUserId: "clerk-1",
    },
  ],
});

// --- listScopeForUser ---
assert(listScopeForUser("owner") === "org", "owner uses org scope");
assert(listScopeForUser("compliance") === "org", "compliance uses org scope");
assert(listScopeForUser("clerk") === "assignee", "clerk uses assignee scope");
assert(listScopeForUser("contractor") === "assignee", "contractor uses assignee scope");

// --- contactIdsForUser ---
const linkedIds = contactIdsForUser("u1", "c@x.com", [
  { id: "c1", linkedUserId: "u1", type: "contractor", email: "other@x.com" },
  { id: "c2", linkedUserId: null, type: "contractor", email: "c@x.com" },
  { id: "c3", linkedUserId: null, type: "tenant", email: "c@x.com" },
  { id: "c4", linkedUserId: null, type: "staff", email: "c@x.com" },
]);
assert(linkedIds.includes("c1") && linkedIds.includes("c2"), "linkedUserId + contractor email match");
assert(linkedIds.includes("c4"), "non-tenant contacts match by email");
assert(!linkedIds.includes("c3"), "tenant contact with same email is ignored");

// --- clerk access ---
assert(
  canAccessWorkOrder(clerkIdentity, {
    organizationId: ORG_A,
    assignedToId: "clerk-1",
    contractorId: null,
  }),
  "clerk sees WO assigned to self",
);
assert(
  canAccessWorkOrder(clerkWithContactIdentity, {
    organizationId: ORG_A,
    assignedToId: "contact-clerk-1",
    contractorId: null,
  }),
  "clerk sees WO assignedToId = their contact id",
);
assert(
  canAccessWorkOrder(clerkWithContactIdentity, {
    organizationId: ORG_A,
    assignedToId: null,
    contractorId: "contact-clerk-1",
  }),
  "clerk sees WO with matching contractorId contact",
);
assert(
  !canAccessWorkOrder(clerkIdentity, {
    organizationId: ORG_A,
    assignedToId: "clerk-2",
    contractorId: null,
  }),
  "clerk denied other clerk assignment",
);
assert(
  !canAccessWorkOrder(clerkIdentity, {
    organizationId: ORG_A,
    assignedToId: null,
    contractorId: "contact-contractor-1",
  }),
  "clerk denied unrelated contractor-only WO",
);
assert(
  !canAccessWorkOrder(clerkIdentity, {
    organizationId: ORG_A,
    assignedToId: null,
    contractorId: null,
  }),
  "clerk denied unassigned WO",
);
assert(
  !canAccessWorkOrder(clerkIdentity, {
    organizationId: ORG_B,
    assignedToId: "clerk-1",
    contractorId: null,
  }),
  "clerk denied other org even if assignedToId matches",
);

// --- contractor access ---
assert(
  canAccessWorkOrder(contractorIdentity, {
    organizationId: ORG_A,
    assignedToId: null,
    contractorId: "contact-contractor-1",
  }),
  "contractor sees WO with matching contractor contact",
);
assert(
  canAccessWorkOrder(contractorIdentity, {
    organizationId: ORG_A,
    assignedToId: "user-contractor-1",
    contractorId: null,
  }),
  "contractor sees WO assignedToId = user id",
);
assert(
  canAccessWorkOrder(contractorIdentity, {
    organizationId: ORG_A,
    assignedToId: "contact-contractor-1",
    contractorId: null,
  }),
  "contractor sees WO assignedToId = their contact id",
);
assert(
  !canAccessWorkOrder(contractorIdentity, {
    organizationId: ORG_A,
    assignedToId: null,
    contractorId: "contact-other",
  }),
  "contractor denied other contractor contact",
);
assert(
  !canAccessWorkOrder(contractorIdentity, {
    organizationId: ORG_B,
    assignedToId: null,
    contractorId: "contact-contractor-1",
  }),
  "contractor denied other org",
);
assert(
  !canAccessWorkOrder(contractorIdentity, {
    organizationId: ORG_A,
    assignedToId: "clerk-1",
    contractorId: null,
  }),
  "contractor denied clerk-only assignment",
);

// --- owner ---
assert(
  canAccessWorkOrder(ownerIdentity, {
    organizationId: ORG_A,
    assignedToId: null,
    contractorId: null,
  }),
  "owner sees unassigned WO in org",
);
assert(
  !canAccessWorkOrder(ownerIdentity, {
    organizationId: ORG_B,
    assignedToId: null,
    contractorId: null,
  }),
  "owner denied other org (IDOR)",
);

// --- status ---
assert(isAllowedWorkOrderStatus("owner", "rejected"), "owner can reject");
assert(!isAllowedWorkOrderStatus("clerk", "rejected"), "clerk cannot reject");
assert(isAllowedWorkOrderStatus("clerk", "completed"), "clerk can complete");
assert(isAllowedWorkOrderStatus("contractor", "in_progress"), "contractor can set in_progress");
assert(!isAllowedWorkOrderStatus("contractor", "bogus"), "invalid status rejected");

console.log(`\nworkOrderAccess.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
