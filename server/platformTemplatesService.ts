/**
 * Platform (built-in) inspection template catalog.
 * Seeds new orgs, supports admin promote/copy/edit flows.
 */
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { DEFAULT_TEMPLATES, DEFAULT_REPORT_CONFIG } from "./defaultTemplates";
import {
  inspectionTemplates,
  organizations,
  platformInspectionTemplates,
  type InsertInspectionTemplate,
  type InsertPlatformInspectionTemplate,
  type InspectionTemplate,
  type InspectionTemplateReportConfig,
  type PlatformInspectionTemplate,
} from "@shared/schema";

export type AdminTemplateListItem = {
  id: string;
  source: "platform" | "org";
  name: string;
  description: string | null;
  scope: string;
  version: number;
  isActive: boolean | null;
  updatedAt: Date | null;
  createdAt: Date | null;
  organizationId: string | null;
  organizationName: string | null;
  origin: "builtin" | "custom" | "from_builtin";
  platformTemplateId: string | null;
  sourceOrganizationId: string | null;
};

export type AdminTemplateFilters = {
  type?: "builtin" | "custom" | "all";
  organizationId?: string;
  search?: string;
  scope?: string;
  status?: "active" | "inactive" | "all";
};

type TemplatePayload = {
  name: string;
  description?: string | null;
  scope: "block" | "property" | "both";
  version?: number;
  isActive?: boolean | null;
  structureJson: unknown;
  aiMaxWords?: number | null;
  aiInstruction?: string | null;
  aiIncludeRecommendedActions?: boolean | null;
  aiIncludeMaintenanceIssues?: boolean | null;
  reportConfig?: InspectionTemplateReportConfig | null;
};

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function resolveUniqueName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName.toLowerCase())) return baseName;
  let n = 1;
  while (existingNames.has(`${baseName} (Copy${n > 1 ? ` ${n}` : ""})`.toLowerCase())) {
    n += 1;
  }
  return n === 1 ? `${baseName} (Copy)` : `${baseName} (Copy ${n})`;
}

function orgInsertFromPlatform(
  platform: PlatformInspectionTemplate,
  organizationId: string,
  createdBy: string,
): InsertInspectionTemplate {
  return {
    organizationId,
    name: platform.name,
    description: platform.description,
    scope: platform.scope,
    version: platform.version ?? 1,
    isActive: platform.isActive ?? true,
    structureJson: deepCloneJson(platform.structureJson),
    aiMaxWords: platform.aiMaxWords ?? 150,
    aiInstruction: platform.aiInstruction,
    aiIncludeRecommendedActions: platform.aiIncludeRecommendedActions ?? false,
    aiIncludeMaintenanceIssues: platform.aiIncludeMaintenanceIssues ?? false,
    reportConfig: platform.reportConfig
      ? deepCloneJson(platform.reportConfig)
      : deepCloneJson(DEFAULT_REPORT_CONFIG as InspectionTemplateReportConfig),
    categoryId: null,
    completionChecklistId: null,
    platformTemplateId: platform.id,
    createdBy,
  };
}

function orgInsertFromCustom(
  source: InspectionTemplate,
  organizationId: string,
  createdBy: string,
  name: string,
): InsertInspectionTemplate {
  return {
    organizationId,
    name,
    description: source.description,
    scope: source.scope,
    version: 1,
    isActive: source.isActive ?? true,
    structureJson: deepCloneJson(source.structureJson),
    aiMaxWords: source.aiMaxWords ?? 150,
    aiInstruction: source.aiInstruction,
    aiIncludeRecommendedActions: source.aiIncludeRecommendedActions ?? false,
    aiIncludeMaintenanceIssues: source.aiIncludeMaintenanceIssues ?? false,
    reportConfig: source.reportConfig
      ? deepCloneJson(source.reportConfig)
      : deepCloneJson(DEFAULT_REPORT_CONFIG as InspectionTemplateReportConfig),
    categoryId: null,
    completionChecklistId: null,
    platformTemplateId: null,
    parentTemplateId: null,
    createdBy,
  };
}

/** Bootstrap catalog from DEFAULT_TEMPLATES when empty; best-effort backfill lineage. */
export async function ensurePlatformCatalogSeeded(): Promise<{ seeded: number; backfilled: number }> {
  const existing = await db.select({ id: platformInspectionTemplates.id }).from(platformInspectionTemplates).limit(1);
  let seeded = 0;

  if (existing.length === 0) {
    for (const template of DEFAULT_TEMPLATES) {
      await db.insert(platformInspectionTemplates).values({
        name: template.name,
        description: template.description,
        scope: template.scope,
        version: 1,
        isActive: true,
        structureJson: template.structureJson,
        reportConfig: (template.reportConfig ?? DEFAULT_REPORT_CONFIG) as InspectionTemplateReportConfig,
        aiMaxWords: 150,
        aiIncludeRecommendedActions: false,
        aiIncludeMaintenanceIssues: false,
        createdByAdminId: null,
        sourceOrganizationId: null,
        sourceTemplateId: null,
      });
      seeded += 1;
    }
    console.log(`✓ Seeded ${seeded} platform inspection templates from DEFAULT_TEMPLATES`);
  }

  // Best-effort: link unmatched org templates that share name+scope with a catalog row
  const catalog = await db.select().from(platformInspectionTemplates);
  let backfilled = 0;
  for (const platform of catalog) {
    const result = await db.execute(sql`
      UPDATE inspection_templates
      SET platform_template_id = ${platform.id}
      WHERE platform_template_id IS NULL
        AND name = ${platform.name}
        AND scope = ${platform.scope}
        AND NOT EXISTS (
          SELECT 1 FROM inspection_templates t2
          WHERE t2.organization_id = inspection_templates.organization_id
            AND t2.platform_template_id = ${platform.id}
        )
    `);
    const rowCount = typeof (result as any)?.rowCount === "number" ? (result as any).rowCount : 0;
    backfilled += rowCount;
  }

  return { seeded, backfilled };
}

export async function listPlatformTemplates(): Promise<PlatformInspectionTemplate[]> {
  await ensurePlatformCatalogSeeded();
  return db
    .select()
    .from(platformInspectionTemplates)
    .orderBy(platformInspectionTemplates.name);
}

export async function getPlatformTemplate(id: string): Promise<PlatformInspectionTemplate | undefined> {
  const [row] = await db
    .select()
    .from(platformInspectionTemplates)
    .where(eq(platformInspectionTemplates.id, id));
  return row;
}

export async function createPlatformTemplate(
  data: TemplatePayload,
  adminId?: string | null,
): Promise<PlatformInspectionTemplate> {
  await ensurePlatformCatalogSeeded();
  const [row] = await db
    .insert(platformInspectionTemplates)
    .values({
      name: data.name,
      description: data.description ?? null,
      scope: data.scope,
      version: data.version ?? 1,
      isActive: data.isActive ?? true,
      structureJson: data.structureJson,
      aiMaxWords: data.aiMaxWords ?? 150,
      aiInstruction: data.aiInstruction ?? null,
      aiIncludeRecommendedActions: data.aiIncludeRecommendedActions ?? false,
      aiIncludeMaintenanceIssues: data.aiIncludeMaintenanceIssues ?? false,
      reportConfig: data.reportConfig
        ? deepCloneJson(data.reportConfig)
        : deepCloneJson(DEFAULT_REPORT_CONFIG as InspectionTemplateReportConfig),
      createdByAdminId: adminId ?? null,
    } satisfies InsertPlatformInspectionTemplate)
    .returning();
  return row;
}

export async function updatePlatformTemplate(
  id: string,
  updates: Partial<TemplatePayload>,
): Promise<PlatformInspectionTemplate> {
  const existing = await getPlatformTemplate(id);
  if (!existing) {
    throw Object.assign(new Error("Built-in template not found"), { status: 404 });
  }

  const [row] = await db
    .update(platformInspectionTemplates)
    .set({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.scope !== undefined ? { scope: updates.scope } : {}),
      ...(updates.version !== undefined ? { version: updates.version } : {}),
      ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
      ...(updates.structureJson !== undefined ? { structureJson: updates.structureJson } : {}),
      ...(updates.aiMaxWords !== undefined ? { aiMaxWords: updates.aiMaxWords } : {}),
      ...(updates.aiInstruction !== undefined ? { aiInstruction: updates.aiInstruction } : {}),
      ...(updates.aiIncludeRecommendedActions !== undefined
        ? { aiIncludeRecommendedActions: updates.aiIncludeRecommendedActions }
        : {}),
      ...(updates.aiIncludeMaintenanceIssues !== undefined
        ? { aiIncludeMaintenanceIssues: updates.aiIncludeMaintenanceIssues }
        : {}),
      ...(updates.reportConfig !== undefined ? { reportConfig: updates.reportConfig } : {}),
      updatedAt: new Date(),
    })
    .where(eq(platformInspectionTemplates.id, id))
    .returning();
  return row;
}

/** Seed an organization from active platform catalog rows. */
export async function seedOrganizationFromCatalog(
  organizationId: string,
  createdBy: string,
): Promise<number> {
  await ensurePlatformCatalogSeeded();
  const catalog = await db
    .select()
    .from(platformInspectionTemplates)
    .where(eq(platformInspectionTemplates.isActive, true));

  let created = 0;
  for (const platform of catalog) {
    const [already] = await db
      .select({ id: inspectionTemplates.id })
      .from(inspectionTemplates)
      .where(
        and(
          eq(inspectionTemplates.organizationId, organizationId),
          eq(inspectionTemplates.platformTemplateId, platform.id),
        ),
      )
      .limit(1);
    if (already) continue;

    await storage.createInspectionTemplate(orgInsertFromPlatform(platform, organizationId, createdBy));
    created += 1;
  }
  return created;
}

async function listOrganizationIds(): Promise<string[]> {
  const rows = await db.select({ id: organizations.id }).from(organizations);
  return rows.map((r) => r.id);
}

/** Promote a custom org template into the platform catalog and distribute missing copies. */
export async function promoteTemplateToBuiltin(
  orgTemplateId: string,
  adminId: string,
): Promise<{
  platform: PlatformInspectionTemplate;
  distributed: number;
  skipped: number;
}> {
  const source = await storage.getInspectionTemplate(orgTemplateId);
  if (!source) {
    throw Object.assign(new Error("Template not found"), { status: 404 });
  }
  if (source.platformTemplateId) {
    throw Object.assign(
      new Error("This template already comes from the built-in catalog. Edit the catalog entry instead."),
      { status: 400 },
    );
  }

  const [nameClash] = await db
    .select({ id: platformInspectionTemplates.id })
    .from(platformInspectionTemplates)
    .where(
      and(
        eq(platformInspectionTemplates.name, source.name),
        eq(platformInspectionTemplates.scope, source.scope),
      ),
    )
    .limit(1);
  if (nameClash) {
    throw Object.assign(
      new Error(
        `A built-in template named "${source.name}" (${source.scope}) already exists. Rename the custom template first.`,
      ),
      { status: 409 },
    );
  }

  const [platform] = await db
    .insert(platformInspectionTemplates)
    .values({
      name: source.name,
      description: source.description,
      scope: source.scope,
      version: source.version ?? 1,
      isActive: source.isActive ?? true,
      structureJson: deepCloneJson(source.structureJson),
      aiMaxWords: source.aiMaxWords ?? 150,
      aiInstruction: source.aiInstruction,
      aiIncludeRecommendedActions: source.aiIncludeRecommendedActions ?? false,
      aiIncludeMaintenanceIssues: source.aiIncludeMaintenanceIssues ?? false,
      reportConfig: source.reportConfig
        ? deepCloneJson(source.reportConfig)
        : deepCloneJson(DEFAULT_REPORT_CONFIG as InspectionTemplateReportConfig),
      createdByAdminId: adminId,
      sourceOrganizationId: source.organizationId,
      sourceTemplateId: source.id,
    })
    .returning();

  // Link the source custom template to the new catalog entry
  await storage.updateInspectionTemplate(source.id, {
    platformTemplateId: platform.id,
  });

  const orgIds = await listOrganizationIds();
  let distributed = 0;
  let skipped = 0;

  for (const orgId of orgIds) {
    if (orgId === source.organizationId) {
      skipped += 1;
      continue;
    }
    const [already] = await db
      .select({ id: inspectionTemplates.id })
      .from(inspectionTemplates)
      .where(
        and(
          eq(inspectionTemplates.organizationId, orgId),
          eq(inspectionTemplates.platformTemplateId, platform.id),
        ),
      )
      .limit(1);
    if (already) {
      skipped += 1;
      continue;
    }
    await storage.createInspectionTemplate(orgInsertFromPlatform(platform, orgId, adminId));
    distributed += 1;
  }

  return { platform, distributed, skipped };
}

/** Deep-clone a custom org template into one or more target organizations. */
export async function copyTemplateToOrganizations(
  sourceTemplateId: string,
  targetOrganizationIds: string[],
  adminId: string,
): Promise<{ created: InspectionTemplate[]; errors: Array<{ organizationId: string; message: string }> }> {
  const source = await storage.getInspectionTemplate(sourceTemplateId);
  if (!source) {
    throw Object.assign(new Error("Template not found"), { status: 404 });
  }
  if (source.platformTemplateId) {
    throw Object.assign(
      new Error("Only custom templates can be copied between instances. Use promote for built-in distribution."),
      { status: 400 },
    );
  }

  const uniqueTargets = Array.from(new Set(targetOrganizationIds.filter(Boolean)));
  if (uniqueTargets.length === 0) {
    throw Object.assign(new Error("Select at least one target instance"), { status: 400 });
  }

  const created: InspectionTemplate[] = [];
  const errors: Array<{ organizationId: string; message: string }> = [];

  for (const orgId of uniqueTargets) {
    try {
      if (orgId === source.organizationId) {
        errors.push({ organizationId: orgId, message: "Cannot copy to the same instance" });
        continue;
      }
      const org = await storage.getOrganization(orgId);
      if (!org) {
        errors.push({ organizationId: orgId, message: "Organization not found" });
        continue;
      }

      const existing = await storage.getInspectionTemplatesByOrganization(orgId);
      const nameSet = new Set(existing.map((t) => t.name.toLowerCase()));
      const name = resolveUniqueName(source.name, nameSet);
      const row = await storage.createInspectionTemplate(
        orgInsertFromCustom(source, orgId, adminId, name),
      );
      created.push(row);
    } catch (err: any) {
      errors.push({ organizationId: orgId, message: err?.message || "Copy failed" });
    }
  }

  return { created, errors };
}

export async function updateCustomOrgTemplate(
  id: string,
  updates: Partial<TemplatePayload>,
): Promise<InspectionTemplate> {
  const existing = await storage.getInspectionTemplate(id);
  if (!existing) {
    throw Object.assign(new Error("Template not found"), { status: 404 });
  }
  if (existing.platformTemplateId) {
    throw Object.assign(
      new Error("Built-in instance copies are view-only here. Edit the Built-in catalog entry instead."),
      { status: 403 },
    );
  }

  return storage.updateInspectionTemplate(id, {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    ...(updates.scope !== undefined ? { scope: updates.scope } : {}),
    ...(updates.version !== undefined ? { version: updates.version } : {}),
    ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
    ...(updates.structureJson !== undefined ? { structureJson: updates.structureJson as any } : {}),
    ...(updates.aiMaxWords !== undefined ? { aiMaxWords: updates.aiMaxWords } : {}),
    ...(updates.aiInstruction !== undefined ? { aiInstruction: updates.aiInstruction } : {}),
    ...(updates.aiIncludeRecommendedActions !== undefined
      ? { aiIncludeRecommendedActions: updates.aiIncludeRecommendedActions }
      : {}),
    ...(updates.aiIncludeMaintenanceIssues !== undefined
      ? { aiIncludeMaintenanceIssues: updates.aiIncludeMaintenanceIssues }
      : {}),
    ...(updates.reportConfig !== undefined ? { reportConfig: updates.reportConfig } : {}),
  });
}

export async function listAdminTemplates(filters: AdminTemplateFilters = {}): Promise<{
  items: AdminTemplateListItem[];
  counts: { builtin: number; custom: number; fromBuiltin: number; instances: number };
}> {
  await ensurePlatformCatalogSeeded();

  const type = filters.type || "all";
  const status = filters.status || "all";
  const search = filters.search?.trim();
  const scope = filters.scope && filters.scope !== "all" ? filters.scope : undefined;
  const organizationId = filters.organizationId || undefined;

  const items: AdminTemplateListItem[] = [];

  if (type === "builtin" || type === "all") {
    const platformRows = await db.select().from(platformInspectionTemplates).orderBy(platformInspectionTemplates.name);
    for (const row of platformRows) {
      if (scope && row.scope !== scope) continue;
      if (status === "active" && row.isActive === false) continue;
      if (status === "inactive" && row.isActive !== false) continue;
      if (search) {
        const hay = `${row.name} ${row.description || ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) continue;
      }
      // organization filter does not apply to pure catalog rows when type=builtin;
      // when type=all and org filter set, skip catalog rows (instance view).
      if (organizationId && type === "all") continue;

      items.push({
        id: row.id,
        source: "platform",
        name: row.name,
        description: row.description,
        scope: row.scope,
        version: row.version,
        isActive: row.isActive,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        organizationId: null,
        organizationName: null,
        origin: "builtin",
        platformTemplateId: row.id,
        sourceOrganizationId: row.sourceOrganizationId,
      });
    }
  }

  if (type === "custom" || type === "all") {
    const orgConditions = [];
    if (organizationId) {
      orgConditions.push(eq(inspectionTemplates.organizationId, organizationId));
    }
    if (type === "custom") {
      orgConditions.push(isNull(inspectionTemplates.platformTemplateId));
    }
    if (scope) {
      orgConditions.push(eq(inspectionTemplates.scope, scope as any));
    }
    if (status === "active") {
      orgConditions.push(eq(inspectionTemplates.isActive, true));
    } else if (status === "inactive") {
      orgConditions.push(eq(inspectionTemplates.isActive, false));
    }
    if (search) {
      orgConditions.push(
        or(
          ilike(inspectionTemplates.name, `%${search}%`),
          ilike(inspectionTemplates.description, `%${search}%`),
        )!,
      );
    }

    const orgRows = await db
      .select({
        template: inspectionTemplates,
        organizationName: organizations.name,
      })
      .from(inspectionTemplates)
      .leftJoin(organizations, eq(inspectionTemplates.organizationId, organizations.id))
      .where(orgConditions.length ? and(...orgConditions) : undefined)
      .orderBy(desc(inspectionTemplates.updatedAt));

    for (const { template, organizationName } of orgRows) {
      const origin: AdminTemplateListItem["origin"] = template.platformTemplateId
        ? "from_builtin"
        : "custom";
      if (type === "custom" && origin !== "custom") continue;

      items.push({
        id: template.id,
        source: "org",
        name: template.name,
        description: template.description,
        scope: template.scope,
        version: template.version,
        isActive: template.isActive,
        updatedAt: template.updatedAt,
        createdAt: template.createdAt,
        organizationId: template.organizationId,
        organizationName: organizationName || null,
        origin,
        platformTemplateId: template.platformTemplateId,
        sourceOrganizationId: null,
      });
    }
  }

  const [orgCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(organizations);
  const builtinCount = (
    await db.select({ count: sql<number>`count(*)::int` }).from(platformInspectionTemplates)
  )[0]?.count ?? 0;
  const customCount = (
    await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inspectionTemplates)
      .where(isNull(inspectionTemplates.platformTemplateId))
  )[0]?.count ?? 0;
  const fromBuiltinCount = (
    await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inspectionTemplates)
      .where(sql`${inspectionTemplates.platformTemplateId} IS NOT NULL`)
  )[0]?.count ?? 0;

  return {
    items,
    counts: {
      builtin: builtinCount,
      custom: customCount,
      fromBuiltin: fromBuiltinCount,
      instances: orgCountRow?.count ?? 0,
    },
  };
}

export async function listAdminOrganizationsLite(): Promise<
  Array<{ id: string; name: string }>
> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
    })
    .from(organizations)
    .orderBy(organizations.name);
  return rows;
}
