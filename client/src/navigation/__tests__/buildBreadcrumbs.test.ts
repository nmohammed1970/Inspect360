/**
 * Breadcrumb builder tests.
 * Run with: npx tsx client/src/navigation/__tests__/buildBreadcrumbs.test.ts
 */

import {
  buildBreadcrumbs,
  collapseBreadcrumbs,
  resolveParentHref,
} from "../buildBreadcrumbs";
import {
  isBreadcrumbExcluded,
  matchRoute,
  defaultHierarchy,
  resourceKeyFromPath,
} from "../breadcrumbRegistry";
import { setNavContext, clearNavContext } from "../navContext";

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

// Exclusions
assert(isBreadcrumbExcluded("/auth"), "auth excluded");
assert(isBreadcrumbExcluded("/public/quotes/abc"), "public quote excluded");
assert(isBreadcrumbExcluded("/maintenance-feedback/tok"), "public feedback excluded");
assert(!isBreadcrumbExcluded("/properties"), "properties not excluded");
assert(
  buildBreadcrumbs({ pathname: "/auth" }).length === 0,
  "excluded path returns empty crumbs",
);

// Match routes
assert(matchRoute("/properties/abc-123")?.params.propertyId === "abc-123", "property match");
assert(
  matchRoute("/inspections/abc/capture")?.params.inspectionId === "abc",
  "inspection capture match",
);
assert(matchRoute("/admin/feedback/xyz")?.shell === "admin", "admin feedback shell");
assert(resourceKeyFromPath("/properties/p1") === "property:p1", "resource key property");

// Hierarchy fallback — property without trail
{
  const crumbs = buildBreadcrumbs({
    pathname: "/properties/p1",
    meta: { propertyName: "Green Villa" },
    trailOverride: null,
  });
  assert(
    crumbs.some((c) => c.label === "Green Villa" && c.current),
    "property name as current",
  );
  assert(
    crumbs.some((c) => c.label === "Properties" && c.href === "/properties"),
    "properties list parent",
  );
}

// Hierarchy with block
{
  const crumbs = defaultHierarchy("/properties/p1", {
    propertyName: "Unit 2",
    blockId: "b1",
    blockName: "Oak Court",
  });
  assert(
    crumbs.some((c) => c.label === "Oak Court" && c.href === "/blocks/b1"),
    "block in hierarchy",
  );
  assert(
    crumbs.some((c) => c.label === "Unit 2" && c.current),
    "property current with block",
  );
}

// Inspection nested
{
  const crumbs = buildBreadcrumbs({
    pathname: "/inspections/i1/capture",
    meta: { inspectionLabel: "Flat A Check-in" },
    trailOverride: null,
  });
  assert(
    crumbs.some((c) => c.label === "Capture" && c.current),
    "capture current",
  );
  assert(
    crumbs.some(
      (c) => c.label === "Flat A Check-in" && c.href === "/inspections/i1",
    ),
    "inspection parent link",
  );
}

// Trail with returnTo
{
  const key = "property:p-trail";
  clearNavContext(key);
  setNavContext({
    resourceKey: key,
    trail: [{ href: "/properties", label: "Properties" }],
    returnTo: "/properties?tag=hmo&page=3",
    updatedAt: Date.now(),
  });
  const crumbs = buildBreadcrumbs({
    pathname: "/properties/p-trail",
    meta: { propertyName: "Trail House" },
  });
  const propsCrumb = crumbs.find((c) => c.label === "Properties");
  assert(
    propsCrumb?.href === "/properties?tag=hmo&page=3",
    "returnTo preserved on list crumb",
  );
  assert(
    crumbs.some((c) => c.label === "Trail House" && c.current),
    "trail leaf current",
  );
  clearNavContext(key);
}

// Invalid trail discarded (auth path)
{
  const key = "property:p-bad";
  setNavContext({
    resourceKey: key,
    trail: [{ href: "/auth", label: "Auth" }],
    returnTo: "/auth",
    updatedAt: Date.now(),
  });
  const crumbs = buildBreadcrumbs({
    pathname: "/properties/p-bad",
    meta: { propertyName: "Safe" },
  });
  assert(
    !crumbs.some((c) => c.href === "/auth"),
    "invalid auth trail discarded",
  );
  clearNavContext(key);
}

// Collapse
{
  const long = [
    { label: "Workspace", href: "/dashboard" },
    { label: "A", href: "/a" },
    { label: "B", href: "/b" },
    { label: "C", href: "/c" },
    { label: "D", href: "/d" },
    { label: "Current", current: true },
  ];
  const { visible, overflow } = collapseBreadcrumbs(long, 4);
  assert(overflow.length > 0, "overflow populated");
  assert(visible.some((c) => c.label === "…"), "ellipsis present");
  assert(visible[visible.length - 1].label === "Current", "current kept");
}

// resolveParentHref
{
  assert(
    resolveParentHref("/inspections/i1", {}) === "/inspections" ||
      resolveParentHref("/inspections/i1", {})?.startsWith("/"),
    "parent href for inspection",
  );
}

console.log(`\nbuildBreadcrumbs tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
