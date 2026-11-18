import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { storage as appStorage } from "../storage";
import { maintenanceRequests, type HmoFinding } from "@shared/schema";
import { isCompanyModuleEnabled } from "@shared/companyModules";
import { getCompanyModulePlanContext } from "../billing/companyModulePlanLocks";
import { notifyCriticalHmoMaintenance } from "./maintenanceVerification";

const ACTIONABLE = new Set([
  "CONFIRMED_NON_COMPLIANT",
  "EVIDENCE_MISSING",
  "POTENTIAL_RISK",
  "REQUIRES_HUMAN_REVIEW",
]);

const CRITICAL_CHECK = /^(SAF-|GAS-|FIRE-|ELEC-|OCC-)/i;

function priorityForFinding(f: HmoFinding): "urgent" | "high" | "medium" | "low" {
  const sev = String(f.severity || "").toUpperCase();
  if (sev === "CRITICAL") return "urgent";
  if (sev === "HIGH") return "high";
  if (CRITICAL_CHECK.test(String(f.checkId || ""))) return "high";
  if (sev === "MEDIUM") return "medium";
  return "low";
}

export async function isMaintenanceModuleEnabled(organizationId: string): Promise<boolean> {
  try {
    const org = await appStorage.getOrganization(organizationId);
    const plan = await getCompanyModulePlanContext(organizationId);
    return isCompanyModuleEnabled(org, "maintenance", {
      planCode: plan.planCode,
      planStatus: plan.planStatus,
    });
  } catch {
    return false;
  }
}

export async function findOpenMaintenanceForFinding(
  organizationId: string,
  finding: Pick<HmoFinding, "id" | "fingerprint">,
) {
  const rows = await db
    .select()
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.organizationId, organizationId),
        inArray(maintenanceRequests.status, ["open", "in_progress"]),
        sql`${maintenanceRequests.aiAnalysisJson}->>'source' = 'hmo_finding'`,
        sql`(
          ${maintenanceRequests.aiAnalysisJson}->>'hmoFindingId' = ${finding.id}
          OR ${maintenanceRequests.aiAnalysisJson}->>'fingerprint' = ${finding.fingerprint}
        )`,
      ),
    )
    .limit(1);
  return rows[0] || null;
}

export async function createOrReuseMaintenanceForFinding(input: {
  organizationId: string;
  propertyId: string;
  userId: string;
  finding: HmoFinding;
  force?: boolean;
}): Promise<{
  created: boolean;
  skippedReason?: string;
  maintenanceRequest?: Awaited<ReturnType<typeof appStorage.createMaintenanceRequest>>;
  maintenanceDisabled?: boolean;
}> {
  const enabled = await isMaintenanceModuleEnabled(input.organizationId);
  if (!enabled) {
    return { created: false, maintenanceDisabled: true, skippedReason: "maintenance_module_disabled" };
  }

  if (!input.force && !ACTIONABLE.has(String(input.finding.status || ""))) {
    return { created: false, skippedReason: "not_actionable" };
  }

  const existing = await findOpenMaintenanceForFinding(input.organizationId, input.finding);
  if (existing) {
    return { created: false, maintenanceRequest: existing as any, skippedReason: "already_open" };
  }

  const title = `HMO: ${input.finding.checkId} — ${String(input.finding.explanation || "Finding").slice(0, 120)}`;
  const description = [
    input.finding.explanation || "HMO compliance finding",
    `Check: ${input.finding.checkId}`,
    `Status: ${input.finding.status}`,
    `Severity: ${input.finding.severity}`,
    input.finding.suggestedActionCode
      ? `Suggested action: ${input.finding.suggestedActionCode}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const priority = priorityForFinding(input.finding);
  const maintenanceRequest = await appStorage.createMaintenanceRequest({
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    blockId: null,
    reportedBy: input.userId,
    title,
    description,
    priority,
    photoUrls: null,
    aiSuggestedFixes: null,
    aiAnalysisJson: {
      source: "hmo_finding",
      hmoFindingId: input.finding.id,
      fingerprint: input.finding.fingerprint,
      checkId: input.finding.checkId,
      findingStatus: input.finding.status,
      severity: input.finding.severity,
    },
    source: "hmo_finding" as any,
    inspectionId: null,
    inspectionEntryId: null,
    dueDate: null,
    verificationStatus: "none",
  } as any);

  await notifyCriticalHmoMaintenance({
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    maintenanceRequestId: maintenanceRequest.id,
    title,
    priority,
    severity: input.finding.severity,
  });

  return { created: true, maintenanceRequest };
}

/** After assessment: raise MRs for confirmed / critical / evidence-missing findings. */
export async function raiseMaintenanceForAssessmentFindings(input: {
  organizationId: string;
  propertyId: string;
  userId: string;
  findings: HmoFinding[];
}) {
  const enabled = await isMaintenanceModuleEnabled(input.organizationId);
  if (!enabled) {
    return { maintenanceDisabled: true as const, results: [] as Awaited<ReturnType<typeof createOrReuseMaintenanceForFinding>>[] };
  }

  const auto = input.findings.filter((f) => {
    const status = String(f.status || "");
    const sev = String(f.severity || "").toUpperCase();
    return (
      status === "CONFIRMED_NON_COMPLIANT" ||
      status === "EVIDENCE_MISSING" ||
      sev === "CRITICAL"
    );
  });

  const results = [];
  for (const finding of auto) {
    results.push(
      await createOrReuseMaintenanceForFinding({
        organizationId: input.organizationId,
        propertyId: input.propertyId,
        userId: input.userId,
        finding,
      }),
    );
  }
  return { maintenanceDisabled: false as const, results };
}
