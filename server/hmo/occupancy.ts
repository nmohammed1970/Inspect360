import {
  evaluateOccupancyTotal,
  evaluatePreTenancyCheck,
  evaluateSleepingRoomArea,
  type HmoFindingDraft,
} from "@shared/hmo";
import { storage as appStorage } from "../storage";
import * as hmoStorage from "./storage";
import { writeHmoAuditEvent } from "./auditWriter";

export async function buildOccupancyFromTenancies(params: {
  organizationId: string;
  propertyId: string;
  userId: string;
  maxPersons: number | null;
}) {
  let confirmedPersons: number | null = null;
  try {
    const getAssignments = (appStorage as any).getTenantAssignmentsByProperty;
    if (typeof getAssignments === "function") {
      const rows = await getAssignments.call(appStorage, params.propertyId);
      const active = Array.isArray(rows)
        ? rows.filter((r: any) => !r.endDate || new Date(r.endDate).getTime() > Date.now())
        : [];
      confirmedPersons = active.length;
    }
  } catch {
    confirmedPersons = null;
  }

  const finding = evaluateOccupancyTotal({
    propertyId: params.propertyId,
    maxPersons: params.maxPersons,
    confirmedPersons,
  });

  const snapshot = await hmoStorage.createOccupancySnapshot({
    organizationId: params.organizationId,
    propertyId: params.propertyId,
    sourceSystem: "tenant_assignments",
    personCount: confirmedPersons,
    verifiedBy: params.userId,
    createdBy: params.userId,
    confidence: confirmedPersons == null ? 0 : 0.85,
  });

  await writeHmoAuditEvent({
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.userId,
    action: "hmo.occupancy.snapshot",
    entityType: "property",
    entityId: params.propertyId,
    metadata: { confirmedPersons, maxPersons: params.maxPersons, status: finding.status },
  });

  return { snapshot, finding, confirmedPersons };
}

export function evaluateRooms(params: {
  propertyId: string;
  rooms: Array<{
    roomId: string;
    usableAreaM2: number | null;
    ceilingHeightM?: number | null;
    occupantsAged10OrAbove?: number;
    occupantsUnder10?: number;
    localMinM2?: number | null;
  }>;
}): HmoFindingDraft[] {
  return params.rooms
    .map((room) =>
      evaluateSleepingRoomArea({
        usableAreaM2: room.usableAreaM2,
        ceilingHeightM: room.ceilingHeightM,
        occupantsAged10OrAbove: room.occupantsAged10OrAbove ?? 1,
        occupantsUnder10: room.occupantsUnder10 ?? 0,
        localMinM2: room.localMinM2,
      }),
    )
    .filter((f): f is HmoFindingDraft => Boolean(f));
}

export function runPreTenancyGate(params: {
  maxPersons: number | null;
  confirmedPersons: number | null;
  proposedAdditional: number;
  roomEvidenceComplete: boolean;
}) {
  return evaluatePreTenancyCheck({
    maxPersons: params.maxPersons,
    confirmedPersons: params.confirmedPersons,
    proposedAdditional: params.proposedAdditional,
    roomEvidenceComplete: params.roomEvidenceComplete,
  });
}
