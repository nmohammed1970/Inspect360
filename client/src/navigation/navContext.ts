import type { NavContextRecord, NavTrailEntry } from "./types";
import { isAllowedParentHref, resourceKeyFromPath } from "./breadcrumbRegistry";

const STORAGE_KEY = "inspect360.navContext.v1";
const MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8 hours

function readAll(): Record<string, NavContextRecord> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, NavContextRecord>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, NavContextRecord>) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota / private mode — ignore
  }
}

export function getNavContext(resourceKey: string): NavContextRecord | null {
  const map = readAll();
  const rec = map[resourceKey];
  if (!rec) return null;
  if (Date.now() - rec.updatedAt > MAX_AGE_MS) {
    delete map[resourceKey];
    writeAll(map);
    return null;
  }
  return rec;
}

export function setNavContext(record: NavContextRecord) {
  const map = readAll();
  map[record.resourceKey] = { ...record, updatedAt: Date.now() };
  writeAll(map);
}

export function clearNavContext(resourceKey: string) {
  const map = readAll();
  delete map[resourceKey];
  writeAll(map);
}

/**
 * Record navigation from a list/parent into a detail resource.
 */
export function recordNavigationToDetail(opts: {
  targetHref: string;
  fromPath: string;
  fromLabel: string;
  trail?: NavTrailEntry[];
}) {
  const key = resourceKeyFromPath(opts.targetHref);
  if (!key) return;

  const returnTo = opts.fromPath;
  if (!isAllowedParentHref(returnTo)) return;

  const trail: NavTrailEntry[] =
    opts.trail && opts.trail.length > 0
      ? opts.trail
      : [{ href: returnTo.split("?")[0], label: opts.fromLabel }];

  setNavContext({
    resourceKey: key,
    trail,
    returnTo,
    updatedAt: Date.now(),
  });
}

/**
 * Validate stored trail for current resource; discard if invalid.
 */
export function getValidNavContext(resourceKey: string): NavContextRecord | null {
  const rec = getNavContext(resourceKey);
  if (!rec) return null;
  if (rec.resourceKey !== resourceKey) return null;
  if (!rec.trail?.length) return null;
  const parentsOk = rec.trail.every((t) => isAllowedParentHref(t.href));
  if (!parentsOk) {
    clearNavContext(resourceKey);
    return null;
  }
  if (rec.returnTo && !isAllowedParentHref(rec.returnTo)) {
    return { ...rec, returnTo: undefined };
  }
  return rec;
}
