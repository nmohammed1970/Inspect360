import type { Express } from "express";
import { storage } from "./storage";
import {
  copyTemplateToOrganizations,
  createPlatformTemplate,
  ensurePlatformCatalogSeeded,
  getPlatformTemplate,
  listAdminOrganizationsLite,
  listAdminTemplates,
  promoteTemplateToBuiltin,
  updateCustomOrgTemplate,
  updatePlatformTemplate,
} from "./platformTemplatesService";

type Guard = (req: any, res: any, next: any) => void;

function statusFromError(error: any): number {
  if (typeof error?.status === "number") return error.status;
  return 500;
}

function adminIdFromReq(req: any): string {
  return (req.session as any)?.adminUser?.id || "admin";
}

export function registerAdminInspectionTemplateRoutes(app: Express, isAdminAuthenticated: Guard) {
  app.get("/api/admin/inspection-templates/organizations", isAdminAuthenticated, async (_req, res) => {
    try {
      const orgs = await listAdminOrganizationsLite();
      res.json(orgs);
    } catch (error) {
      console.error("[AdminTemplates] list orgs failed:", error);
      res.status(500).json({ message: "Failed to load organizations" });
    }
  });

  app.post("/api/admin/inspection-templates/ensure-seed", isAdminAuthenticated, async (_req, res) => {
    try {
      const result = await ensurePlatformCatalogSeeded();
      res.json(result);
    } catch (error) {
      console.error("[AdminTemplates] ensure-seed failed:", error);
      res.status(500).json({ message: "Failed to seed platform catalog" });
    }
  });

  app.get("/api/admin/inspection-templates", isAdminAuthenticated, async (req, res) => {
    try {
      const result = await listAdminTemplates({
        type: typeof req.query.type === "string" ? (req.query.type as any) : "all",
        organizationId:
          typeof req.query.organizationId === "string" ? req.query.organizationId : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        scope: typeof req.query.scope === "string" ? req.query.scope : undefined,
        status: typeof req.query.status === "string" ? (req.query.status as any) : "all",
      });
      res.json(result);
    } catch (error) {
      console.error("[AdminTemplates] list failed:", error);
      res.status(500).json({ message: "Failed to list inspection templates" });
    }
  });

  app.get("/api/admin/inspection-templates/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const source = typeof req.query.source === "string" ? req.query.source : "org";
      if (source === "platform") {
        const template = await getPlatformTemplate(req.params.id);
        if (!template) return res.status(404).json({ message: "Built-in template not found" });
        return res.json({ source: "platform", template });
      }
      const template = await storage.getInspectionTemplate(req.params.id);
      if (!template) return res.status(404).json({ message: "Template not found" });
      return res.json({ source: "org", template });
    } catch (error) {
      console.error("[AdminTemplates] get failed:", error);
      res.status(500).json({ message: "Failed to load template" });
    }
  });

  app.post("/api/admin/inspection-templates/platform", isAdminAuthenticated, async (req: any, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.structureJson) {
        return res.status(400).json({ message: "name and structureJson are required" });
      }
      const template = await createPlatformTemplate(
        {
          name: body.name,
          description: body.description,
          scope: body.scope || "property",
          version: body.version,
          isActive: body.isActive,
          structureJson: body.structureJson,
          aiMaxWords: body.aiMaxWords,
          aiInstruction: body.aiInstruction,
          aiIncludeRecommendedActions: body.aiIncludeRecommendedActions,
          aiIncludeMaintenanceIssues: body.aiIncludeMaintenanceIssues,
          reportConfig: body.reportConfig,
        },
        adminIdFromReq(req),
      );
      res.status(201).json(template);
    } catch (error: any) {
      console.error("[AdminTemplates] create platform failed:", error);
      const status = statusFromError(error);
      if (status === 500 && String(error?.message || "").includes("unique")) {
        return res.status(409).json({ message: "A built-in template with this name and scope already exists" });
      }
      res.status(status === 500 ? 400 : status).json({ message: error?.message || "Failed to create built-in template" });
    }
  });

  app.patch("/api/admin/inspection-templates/platform/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const template = await updatePlatformTemplate(req.params.id, req.body || {});
      res.json(template);
    } catch (error: any) {
      console.error("[AdminTemplates] update platform failed:", error);
      res.status(statusFromError(error)).json({ message: error?.message || "Failed to update built-in template" });
    }
  });

  // Alias PUT for TemplateBuilder compatibility
  app.put("/api/admin/inspection-templates/platform/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const template = await updatePlatformTemplate(req.params.id, req.body || {});
      res.json(template);
    } catch (error: any) {
      console.error("[AdminTemplates] update platform failed:", error);
      res.status(statusFromError(error)).json({ message: error?.message || "Failed to update built-in template" });
    }
  });

  app.patch("/api/admin/inspection-templates/org/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const template = await updateCustomOrgTemplate(req.params.id, req.body || {});
      res.json(template);
    } catch (error: any) {
      console.error("[AdminTemplates] update org failed:", error);
      res.status(statusFromError(error)).json({ message: error?.message || "Failed to update template" });
    }
  });

  app.put("/api/admin/inspection-templates/org/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const template = await updateCustomOrgTemplate(req.params.id, req.body || {});
      res.json(template);
    } catch (error: any) {
      console.error("[AdminTemplates] update org failed:", error);
      res.status(statusFromError(error)).json({ message: error?.message || "Failed to update template" });
    }
  });

  app.post("/api/admin/inspection-templates/promote", isAdminAuthenticated, async (req: any, res) => {
    try {
      const templateId = req.body?.templateId;
      if (!templateId || typeof templateId !== "string") {
        return res.status(400).json({ message: "templateId is required" });
      }
      const result = await promoteTemplateToBuiltin(templateId, adminIdFromReq(req));
      res.json(result);
    } catch (error: any) {
      console.error("[AdminTemplates] promote failed:", error);
      res.status(statusFromError(error)).json({ message: error?.message || "Failed to promote template" });
    }
  });

  app.post("/api/admin/inspection-templates/copy", isAdminAuthenticated, async (req: any, res) => {
    try {
      const templateId = req.body?.templateId;
      const targetOrganizationIds = req.body?.targetOrganizationIds;
      if (!templateId || typeof templateId !== "string") {
        return res.status(400).json({ message: "templateId is required" });
      }
      if (!Array.isArray(targetOrganizationIds)) {
        return res.status(400).json({ message: "targetOrganizationIds must be an array" });
      }
      const result = await copyTemplateToOrganizations(
        templateId,
        targetOrganizationIds,
        adminIdFromReq(req),
      );
      res.json(result);
    } catch (error: any) {
      console.error("[AdminTemplates] copy failed:", error);
      res.status(statusFromError(error)).json({ message: error?.message || "Failed to copy template" });
    }
  });
}
