import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as hmoStorage from "./storage";
import { writeHmoAuditEvent } from "./auditWriter";
import {
  assertSelectiveImpactCohort,
  summariseSourceDiff,
} from "./regulatoryPure";

export { assertSelectiveImpactCohort, summariseSourceDiff } from "./regulatoryPure";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): Record<string, unknown> {
  const raw = readFileSync(join(__dirname, "fixtures", name), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Seed national + Ealing baselines (idempotent by ruleCode + APPROVED). */
export async function seedBaselineRules(organizationId?: string | null) {
  const existing = await hmoStorage.listRuleVersions(organizationId ?? null);
  const codes = new Set(existing.map((r) => `${r.ruleCode}:${r.status}`));

  const national = loadFixture("rules-national-room-sizes.json");
  const ealing = loadFixture("rules-ealing-local.json");
  const created: string[] = [];

  for (const fixture of [national, ealing]) {
    const ruleCode = String(fixture.ruleCode);
    if (codes.has(`${ruleCode}:APPROVED`) || codes.has(`${ruleCode}:DRAFT`)) continue;
    const row = await hmoStorage.insertRuleVersion({
      organizationId: organizationId ?? null,
      ruleCode,
      authorityId: fixture.authorityId ? String(fixture.authorityId) : null,
      jurisdiction: String(fixture.jurisdiction || "England"),
      classification: fixture.classification ? String(fixture.classification) : null,
      requirementsJson: (fixture.requirements as Record<string, unknown>) || {},
      status: String(fixture.status || "APPROVED"),
      effectiveFrom: new Date("2018-10-01"),
    });
    created.push(row.id);
  }
  return { created, total: existing.length + created.length };
}

export async function approveRuleAndQueueImpact(params: {
  organizationId: string;
  ruleVersionId: string;
  approverId: string;
  /** Selective cohort only — never whole estate by default */
  propertyIds: string[];
}) {
  assertSelectiveImpactCohort(params.propertyIds);
  const approved = await hmoStorage.approveRuleVersion({
    organizationId: params.organizationId,
    ruleVersionId: params.ruleVersionId,
    approverId: params.approverId,
  });
  const impact = await hmoStorage.createRuleImpactRun({
    organizationId: params.organizationId,
    ruleVersionId: params.ruleVersionId,
    propertyIds: params.propertyIds,
    createdBy: params.approverId,
  });
  await writeHmoAuditEvent({
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.approverId,
    action: "hmo.rule.impact_queued",
    entityType: "hmo_rule_impact_run",
    entityId: impact.id,
    metadata: {
      ruleVersionId: params.ruleVersionId,
      propertyCount: params.propertyIds.length,
      selective: true,
    },
  });
  return { approved, impact };
}

export async function runWeeklySourceWatcher(params: {
  organizationId?: string | null;
  sources: Array<{ authorityName: string; sourceUrl: string; fetchedText: string; sourceType?: string }>;
}) {
  const results = [];
  for (const source of params.sources) {
    const diff = summariseSourceDiff({
      previousHash: null,
      nextContent: source.fetchedText,
      sourceType: source.sourceType,
    });
    const row = await hmoStorage.upsertRegulatorySource({
      organizationId: params.organizationId ?? null,
      authorityName: source.authorityName,
      sourceUrl: source.sourceUrl,
      sourceType: source.sourceType || "web",
      contentHash: diff.contentHash,
      status: diff.informationalOnly ? "INFORMATIONAL" : "ANALYST_QUEUE",
    });
    results.push({ sourceId: row.id, ...diff });
  }
  return results;
}
