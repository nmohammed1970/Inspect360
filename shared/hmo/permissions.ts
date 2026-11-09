import type { HmoPermission } from "./types";

type Role = string | null | undefined;

const ROLE_PERMISSIONS: Record<string, readonly HmoPermission[]> = {
  owner: [
    "hmo.case.read",
    "hmo.case.assign",
    "hmo.case.write",
    "hmo.critical.close",
    "hmo.rule.approve",
    "hmo.occupancy.read",
    "hmo.notification.send",
    "hmo.licence.upload",
    "hmo.licence.confirm",
    "hmo.assessment.run",
  ],
  compliance: [
    "hmo.case.read",
    "hmo.case.assign",
    "hmo.case.write",
    "hmo.critical.close",
    "hmo.occupancy.read",
    "hmo.notification.send",
    "hmo.licence.upload",
    "hmo.licence.confirm",
    "hmo.assessment.run",
  ],
  clerk: [
    "hmo.case.read",
    "hmo.case.write",
    "hmo.occupancy.read",
    "hmo.licence.upload",
    "hmo.assessment.run",
  ],
};

export function hmoPermissionsForRole(role: Role): readonly HmoPermission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] || [];
}

export function hasHmoPermission(role: Role, permission: HmoPermission): boolean {
  return hmoPermissionsForRole(role).includes(permission);
}
