import type { Express, Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import {
  isAuthenticated,
  requireCompanyModule,
  requireRole,
} from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { organizations } from "@shared/schema";
import { listCaseAudit } from "./audit";
import {
  listCategories,
  seedCommunicationCategories,
  updateCategory,
} from "./categories";
import {
  addAction,
  addMessage,
  activityForProperty,
  activityForTenant,
  assignCase,
  createCase,
  decideApproval,
  ensureCommunicationsReady,
  escalateCase,
  getCaseDetail,
  inboxMetrics,
  linkEntity,
  listCases,
  listCasesLinkedToEntity,
  logManualChannelMessage,
  markCaseTerminal,
  patchAction,
  patchCase,
  reopenCase,
  requestApproval,
  resolveCase,
  toPublicCase,
} from "./service";
import {
  linkWorkOrderFromCase,
  scheduleMaintenanceCaseBridge,
} from "./maintenanceBridge";
import { generateTriageSuggestion, shouldForceHumanTriage } from "./ai";
import { getCommunicationsAnalytics } from "./analytics";
import {
  getChannelAdapter,
  ingestChannelWebhook,
  listDeadLetterEvents,
  listIdentityReviewQueue,
  markChannelEventProcessed,
  updateMessageDeliveryStatus,
  type ChannelProvider,
} from "./channels";
import { pauseSlaTimer, resumeSlaTimer } from "./sla";
import { writeCommunicationAudit } from "./audit";

function orgId(req: any): string {
  return req.user?.organizationId || "";
}

function handleErr(res: Response, error: unknown, fallback: string) {
  const err = error as { status?: number; message?: string };
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error(`[communications] ${fallback}`, error);
  return res.status(status).json({ message: err?.message || fallback });
}

async function loadStaffUser(req: any, res: Response) {
  const user = await storage.getUser(req.user.id);
  if (!user) {
    res.status(401).json({ message: "User not found" });
    return null;
  }
  if (!user.organizationId) {
    res.status(400).json({ message: "Organization required" });
    return null;
  }
  return user;
}

/** When Communications is enabled, seed categories once. */
async function maybeSeedOnEnable(organizationId: string, enabled: boolean) {
  if (enabled) await seedCommunicationCategories(organizationId);
}

export function registerCommunicationsRoutes(app: Express) {
  const staffGate = [
    isAuthenticated,
    requireCompanyModule("communications"),
    requireRole("owner", "clerk", "maintenance_admin"),
  ];
  const tenantGate = [isAuthenticated, requireCompanyModule("communications")];

  // ---- Categories / workflows ----
  app.get(
    "/api/communications/categories",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        await ensureCommunicationsReady(user.organizationId!);
        const items = await listCategories(user.organizationId!, {
          activeOnly: req.query.all !== "1",
        });
        res.json(items);
      } catch (error) {
        handleErr(res, error, "Failed to list categories");
      }
    },
  );

  app.patch(
    "/api/communications/categories/:id",
    ...staffGate,
    requireRole("owner"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const version = Number(req.body?.version);
        if (!Number.isFinite(version)) {
          return res.status(400).json({ message: "version is required" });
        }
        const row = await updateCategory(user.organizationId!, req.params.id, {
          ...req.body,
          version,
        });
        if (!row) return res.status(404).json({ message: "Category not found" });
        res.json(row);
      } catch (error) {
        handleErr(res, error, "Failed to update category");
      }
    },
  );

  // ---- Metrics / analytics ----
  app.get("/api/communications/metrics", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const metrics = await inboxMetrics(user.organizationId!, user.id);
      res.json(metrics);
    } catch (error) {
      handleErr(res, error, "Failed to load metrics");
    }
  });

  app.get(
    "/api/communications/analytics",
    ...staffGate,
    requireRole("owner", "clerk"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const days = req.query.days ? Number(req.query.days) : 30;
        const data = await getCommunicationsAnalytics(user.organizationId!, { days });
        res.json(data);
      } catch (error) {
        handleErr(res, error, "Failed to load analytics");
      }
    },
  );

  app.post(
    "/api/communications/analytics/export",
    ...staffGate,
    requireRole("owner"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const days = req.body?.days ? Number(req.body.days) : 30;
        const data = await getCommunicationsAnalytics(user.organizationId!, { days });
        console.info(
          `[communications] analytics export org=${user.organizationId} user=${user.id} days=${days}`,
        );
        res.json({ exportedAt: new Date().toISOString(), data });
      } catch (error) {
        handleErr(res, error, "Failed to export analytics");
      }
    },
  );

  /** Spec §3: bulk assign with confirmation + per-case audit (no bulk safety/approval closure). */
  app.post(
    "/api/communications/cases/bulk-assign",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const caseIds: string[] = Array.isArray(req.body?.caseIds) ? req.body.caseIds : [];
        const ownerUserId = req.body?.ownerUserId ?? null;
        const confirmed = req.body?.confirmed === true;
        if (!confirmed) {
          return res.status(400).json({ message: "Bulk assign requires confirmed=true" });
        }
        if (!caseIds.length) {
          return res.status(400).json({ message: "caseIds required" });
        }
        if (caseIds.length > 50) {
          return res.status(400).json({ message: "Maximum 50 cases per bulk assign" });
        }
        const versions: Record<string, number> = req.body?.versions || {};
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const id of caseIds) {
          try {
            const version = Number(versions[id]);
            if (!Number.isFinite(version)) {
              results.push({ id, ok: false, error: "version required" });
              continue;
            }
            const updated = await assignCase({
              organizationId: user.organizationId!,
              caseId: id,
              version,
              actorUserId: user.id,
              ownerUserId,
            });
            results.push({ id, ok: !!updated, error: updated ? undefined : "not found" });
          } catch (e: any) {
            results.push({ id, ok: false, error: e?.message || "failed" });
          }
        }
        res.json({ results });
      } catch (error) {
        handleErr(res, error, "Failed to bulk assign");
      }
    },
  );

  // ---- Cases list / create ----
  app.get("/api/communications/cases", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const result = await listCases({
        organizationId: user.organizationId!,
        view: String(req.query.view || "all"),
        status: req.query.status as string | undefined,
        priority: req.query.priority as string | undefined,
        categoryId: req.query.categoryId as string | undefined,
        propertyId: req.query.propertyId as string | undefined,
        tenantId: req.query.tenantId as string | undefined,
        q: req.query.q as string | undefined,
        cursor: req.query.cursor as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        includeClosed: req.query.includeClosed === "1",
        ownerUserId: user.id,
      });
      res.json(result);
    } catch (error) {
      handleErr(res, error, "Failed to list cases");
    }
  });

  app.post("/api/communications/cases", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const subject = String(req.body?.subject || "").trim();
      const body = String(req.body?.body || "").trim();
      if (!subject) return res.status(400).json({ message: "Subject is required" });

      const result = await createCase({
        organizationId: user.organizationId!,
        subject,
        body: body || subject,
        categoryKey: req.body?.categoryKey,
        categoryId: req.body?.categoryId,
        priority: req.body?.priority,
        source: req.body?.source || "app",
        tenantId: req.body?.tenantId,
        tenancyId: req.body?.tenancyId,
        propertyId: req.body?.propertyId,
        blockId: req.body?.blockId,
        unitLabel: req.body?.unitLabel,
        ownerUserId: req.body?.ownerUserId,
        ownerTeamId: req.body?.ownerTeamId,
        createdByUserId: user.id,
        actorType: "user",
        channel: req.body?.channel,
        runAiSuggest: req.body?.runAiSuggest !== false,
      });
      res.status(201).json(result);
    } catch (error) {
      handleErr(res, error, "Failed to create case");
    }
  });

  app.get("/api/communications/cases/:id", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const detail = await getCaseDetail(user.organizationId!, req.params.id);
      if (!detail) return res.status(404).json({ message: "Case not found" });
      res.json(detail);
    } catch (error) {
      handleErr(res, error, "Failed to load case");
    }
  });

  app.patch("/api/communications/cases/:id", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const version = Number(req.body?.version);
      if (!Number.isFinite(version)) {
        return res.status(400).json({ message: "version is required for optimistic locking" });
      }
      const {
        version: _v,
        reason,
        ...patch
      } = req.body || {};
      const updated = await patchCase({
        organizationId: user.organizationId!,
        caseId: req.params.id,
        version,
        actorUserId: user.id,
        patch,
        reason,
      });
      if (!updated) return res.status(404).json({ message: "Case not found" });
      res.json(updated);
    } catch (error) {
      handleErr(res, error, "Failed to update case");
    }
  });

  app.post(
    "/api/communications/cases/:id/messages",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const body = String(req.body?.body || "").trim();
        if (!body) return res.status(400).json({ message: "Message body required" });
        const result = await addMessage({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          body,
          visibility: "tenant",
          direction: "outbound",
          channel: req.body?.channel || "app",
          authorUserId: user.id,
          authorNameSnapshot:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
          attachments: req.body?.attachments,
          actorType: "user",
        });
        if (!result) return res.status(404).json({ message: "Case not found" });
        res.status(201).json(result);
      } catch (error) {
        handleErr(res, error, "Failed to add message");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/notes",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const body = String(req.body?.body || "").trim();
        if (!body) return res.status(400).json({ message: "Note body required" });
        const result = await addMessage({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          body,
          visibility: "internal",
          direction: "outbound",
          channel: "app",
          authorUserId: user.id,
          authorNameSnapshot:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
          actorType: "user",
        });
        if (!result) return res.status(404).json({ message: "Case not found" });
        res.status(201).json(result);
      } catch (error) {
        handleErr(res, error, "Failed to add note");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/log-channel",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const channel = String(req.body?.channel || "");
        if (!["phone", "email", "whatsapp"].includes(channel)) {
          return res.status(400).json({ message: "channel must be phone, email, or whatsapp" });
        }
        const summary = String(req.body?.summary || "").trim();
        if (!summary) return res.status(400).json({ message: "summary required" });
        const result = await logManualChannelMessage({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          channel: channel as "phone" | "email" | "whatsapp",
          summary,
          authorUserId: user.id,
          direction: req.body?.direction === "inbound" ? "inbound" : "outbound",
        });
        if (!result) return res.status(404).json({ message: "Case not found" });
        res.status(201).json(result);
      } catch (error) {
        handleErr(res, error, "Failed to log channel message");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/assign",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const version = Number(req.body?.version);
        if (!Number.isFinite(version)) {
          return res.status(400).json({ message: "version required" });
        }
        const updated = await assignCase({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          version,
          actorUserId: user.id,
          ownerUserId: req.body?.ownerUserId ?? null,
          ownerTeamId: req.body?.ownerTeamId ?? null,
        });
        if (!updated) return res.status(404).json({ message: "Case not found" });
        res.json(updated);
      } catch (error) {
        handleErr(res, error, "Failed to assign case");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/actions",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const title = String(req.body?.title || "").trim();
        if (!title) return res.status(400).json({ message: "title required" });
        const action = await addAction({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          title,
          description: req.body?.description,
          assigneeId: req.body?.assigneeId,
          dueAt: req.body?.dueAt ? new Date(req.body.dueAt) : null,
          required: !!req.body?.required,
          actorUserId: user.id,
        });
        res.status(201).json(action);
      } catch (error) {
        handleErr(res, error, "Failed to add action");
      }
    },
  );

  app.patch(
    "/api/communications/cases/:id/actions/:actionId",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const row = await patchAction({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          actionId: req.params.actionId,
          actorUserId: user.id,
          patch: req.body || {},
        });
        if (!row) return res.status(404).json({ message: "Action not found" });
        res.json(row);
      } catch (error) {
        handleErr(res, error, "Failed to update action");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/approvals",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const version = Number(req.body?.version);
        if (!Number.isFinite(version)) {
          return res.status(400).json({ message: "version required" });
        }
        const result = await requestApproval({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          version,
          actorUserId: user.id,
          type: req.body?.type,
          eligibleTeamId: req.body?.eligibleTeamId,
          eligibleUserId: req.body?.eligibleUserId,
          termsJson: req.body?.termsJson,
        });
        if (!result) return res.status(404).json({ message: "Case not found" });
        res.status(201).json(result);
      } catch (error) {
        handleErr(res, error, "Failed to request approval");
      }
    },
  );

  app.post(
    "/api/communications/approvals/:id/decision",
    ...staffGate,
    requireRole("owner", "clerk"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const decision = req.body?.decision;
        if (decision !== "approved" && decision !== "rejected") {
          return res.status(400).json({ message: "decision must be approved or rejected" });
        }
        const caseVersion = Number(req.body?.caseVersion);
        if (!Number.isFinite(caseVersion)) {
          return res.status(400).json({ message: "caseVersion required" });
        }
        const result = await decideApproval({
          organizationId: user.organizationId!,
          approvalId: req.params.id,
          actorUserId: user.id,
          decision,
          reason: req.body?.reason,
          caseVersion,
        });
        if (!result) return res.status(404).json({ message: "Approval not found" });
        res.json(result);
      } catch (error) {
        handleErr(res, error, "Failed to decide approval");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/links",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const entityType = String(req.body?.entityType || "");
        const entityId = String(req.body?.entityId || "");
        if (!entityType || !entityId) {
          return res.status(400).json({ message: "entityType and entityId required" });
        }
        if (entityType === "work_order" && req.body?.relationship === "created_from_case") {
          const result = await linkWorkOrderFromCase({
            organizationId: user.organizationId!,
            caseId: req.params.id,
            workOrderId: entityId,
            actorUserId: user.id,
          });
          return res.status(result.created ? 201 : 200).json(result);
        }
        const result = await linkEntity({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          entityType,
          entityId,
          relationship: req.body?.relationship,
          actorUserId: user.id,
        });
        res.status(result.created ? 201 : 200).json(result);
      } catch (error) {
        handleErr(res, error, "Failed to link entity");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/escalate",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const version = Number(req.body?.version);
        if (!Number.isFinite(version)) {
          return res.status(400).json({ message: "version required" });
        }
        const updated = await escalateCase({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          version,
          actorUserId: user.id,
          reason: req.body?.reason,
          escalateToUserId: req.body?.escalateToUserId,
        });
        if (!updated) return res.status(404).json({ message: "Case not found" });
        res.json(updated);
      } catch (error) {
        handleErr(res, error, "Failed to escalate");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/resolve",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const version = Number(req.body?.version);
        if (!Number.isFinite(version)) {
          return res.status(400).json({ message: "version required" });
        }
        const updated = await resolveCase({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          version,
          actorUserId: user.id,
          resolutionSummary: req.body?.resolutionSummary,
          close: !!req.body?.close,
          managerExceptionReason: req.body?.managerExceptionReason || null,
        });
        if (!updated) return res.status(404).json({ message: "Case not found" });
        res.json(updated);
      } catch (error) {
        handleErr(res, error, "Failed to resolve case");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/cancel",
    ...staffGate,
    requireRole("owner", "clerk"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const version = Number(req.body?.version);
        const reason = String(req.body?.reason || "").trim();
        if (!Number.isFinite(version)) {
          return res.status(400).json({ message: "version required" });
        }
        const updated = await markCaseTerminal({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          version,
          actorUserId: user.id,
          status: "cancelled",
          reason,
        });
        if (!updated) return res.status(404).json({ message: "Case not found" });
        res.json(updated);
      } catch (error) {
        handleErr(res, error, "Failed to cancel case");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/duplicate",
    ...staffGate,
    requireRole("owner", "clerk"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const version = Number(req.body?.version);
        const reason = String(req.body?.reason || "").trim();
        const canonicalCaseId = String(req.body?.canonicalCaseId || "");
        if (!Number.isFinite(version)) {
          return res.status(400).json({ message: "version required" });
        }
        const updated = await markCaseTerminal({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          version,
          actorUserId: user.id,
          status: "duplicate",
          reason,
          canonicalCaseId,
        });
        if (!updated) return res.status(404).json({ message: "Case not found" });
        res.json(updated);
      } catch (error) {
        handleErr(res, error, "Failed to mark duplicate");
      }
    },
  );

  app.get("/api/communications/links", ...staffGate, async (req: any, res) => {
    try {
      const user = await loadStaffUser(req, res);
      if (!user) return;
      const entityType = String(req.query.entityType || "");
      const entityId = String(req.query.entityId || "");
      if (!entityType || !entityId) {
        return res.status(400).json({ message: "entityType and entityId required" });
      }
      const items = await listCasesLinkedToEntity({
        organizationId: user.organizationId!,
        entityType,
        entityId,
      });
      res.json({ items });
    } catch (error) {
      handleErr(res, error, "Failed to list linked cases");
    }
  });

  app.post(
    "/api/communications/cases/:id/reopen",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const version = Number(req.body?.version);
        const reason = String(req.body?.reason || "").trim();
        if (!Number.isFinite(version)) {
          return res.status(400).json({ message: "version required" });
        }
        if (!reason) return res.status(400).json({ message: "reason required" });
        const updated = await reopenCase({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          version,
          actorUserId: user.id,
          reason,
        });
        if (!updated) return res.status(404).json({ message: "Case not found" });
        res.json(updated);
      } catch (error) {
        handleErr(res, error, "Failed to reopen case");
      }
    },
  );

  app.get(
    "/api/communications/cases/:id/audit",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const detail = await getCaseDetail(user.organizationId!, req.params.id);
        if (!detail) return res.status(404).json({ message: "Case not found" });
        const events = await listCaseAudit(user.organizationId!, req.params.id);
        res.json(events);
      } catch (error) {
        handleErr(res, error, "Failed to load audit");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/sla/pause",
    ...staffGate,
    requireRole("owner", "clerk"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const reason = String(req.body?.reason || "").trim();
        if (!reason) return res.status(400).json({ message: "Audited pause reason required" });
        const timerType = String(req.body?.timerType || "resolution");
        const row = await pauseSlaTimer({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          timerType,
          reason,
        });
        await writeCommunicationAudit({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          eventType: "sla_paused",
          after: { timerType, reason },
          reason,
          actor: { actorType: "user", actorId: user.id },
        });
        res.json(row);
      } catch (error) {
        handleErr(res, error, "Failed to pause SLA");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/sla/resume",
    ...staffGate,
    requireRole("owner", "clerk"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const timerType = String(req.body?.timerType || "resolution");
        const row = await resumeSlaTimer({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          timerType,
        });
        await writeCommunicationAudit({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          eventType: "sla_resumed",
          after: { timerType },
          actor: { actorType: "user", actorId: user.id },
        });
        res.json(row);
      } catch (error) {
        handleErr(res, error, "Failed to resume SLA");
      }
    },
  );

  // ---- AI triage (suggestion only) ----
  app.post(
    "/api/communications/ai/suggest",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const subject = String(req.body?.subject || "");
        const body = String(req.body?.body || "");
        const suggestion = await generateTriageSuggestion({
          subject,
          body,
          shortcut: req.body?.shortcut,
        });
        res.json({
          suggestion,
          forceHumanTriage: shouldForceHumanTriage(suggestion),
          autoApply: false,
          autoSend: false,
        });
      } catch (error) {
        handleErr(res, error, "Failed to generate suggestion");
      }
    },
  );

  app.post(
    "/api/communications/cases/:id/ai/accept",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const version = Number(req.body?.version);
        if (!Number.isFinite(version)) {
          return res.status(400).json({ message: "version required" });
        }
        const suggestion = req.body?.suggestion;
        if (!suggestion) return res.status(400).json({ message: "suggestion required" });

        const patch: Record<string, unknown> = {
          aiSuggestionJson: {
            ...suggestion,
            humanDecision: req.body?.edited ? "edited" : "accepted",
            decidedBy: user.id,
            decidedAt: new Date().toISOString(),
          },
        };
        if (req.body?.applyCategoryId) patch.categoryId = req.body.applyCategoryId;
        if (req.body?.applyPriority) patch.priority = req.body.applyPriority;
        if (req.body?.applySummary) patch.summary = req.body.applySummary;

        const updated = await patchCase({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          version,
          actorUserId: user.id,
          patch: patch as any,
          reason: "ai_suggestion_applied",
        });
        if (!updated) return res.status(404).json({ message: "Case not found" });
        res.json(updated);
      } catch (error) {
        handleErr(res, error, "Failed to accept AI suggestion");
      }
    },
  );

  // ---- Activity timelines ----
  app.get(
    "/api/communications/tenants/:id/activity",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const items = await activityForTenant(user.organizationId!, req.params.id);
        res.json({ items });
      } catch (error) {
        handleErr(res, error, "Failed to load tenant activity");
      }
    },
  );

  app.get(
    "/api/communications/properties/:id/activity",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const items = await activityForProperty(user.organizationId!, req.params.id);
        res.json({ items });
      } catch (error) {
        handleErr(res, error, "Failed to load property activity");
      }
    },
  );

  /** Spec §2: activity on tenancy records (via tenancy_id on cases). */
  app.get(
    "/api/communications/tenancies/:id/activity",
    ...staffGate,
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const result = await listCases({
          organizationId: user.organizationId!,
          tenancyId: req.params.id,
          includeClosed: true,
          limit: 100,
        });
        res.json({
          items: result.items.map((c) => ({
            type: "case" as const,
            id: c.id,
            reference: c.reference,
            subject: c.subject,
            status: c.status,
            priority: c.priority,
            at: c.updatedAt,
          })),
        });
      } catch (error) {
        handleErr(res, error, "Failed to load tenancy activity");
      }
    },
  );

  // ---- Channel webhooks / identity review ----
  app.post(
    "/api/communications/webhooks/:provider",
    async (req: any, res) => {
      try {
        const provider = String(req.params.provider || "") as ChannelProvider;
        if (!["email", "whatsapp", "stub"].includes(provider)) {
          return res.status(404).json({ message: "Unknown provider" });
        }
        const adapter = getChannelAdapter(provider);
        const signature =
          req.headers["x-communications-signature"] ||
          req.headers["x-hub-signature-256"];
        const rawBody =
          typeof req.rawBody === "string"
            ? req.rawBody
            : JSON.stringify(req.body || {});
        if (!adapter.verifyWebhookSignature(rawBody, signature as string | undefined)) {
          return res.status(401).json({ message: "Invalid signature" });
        }

        const externalEventId = String(
          req.body?.externalEventId || req.body?.id || req.headers["x-event-id"] || "",
        );
        if (!externalEventId) {
          return res.status(400).json({ message: "externalEventId required" });
        }

        const organizationId = req.body?.organizationId || null;
        const { event, duplicate } = await ingestChannelWebhook({
          provider,
          externalEventId,
          payload: {
            ...req.body,
            needsIdentityReview: !req.body?.tenantId,
            fromAddress: req.body?.fromAddress || req.body?.from || null,
            tenantId: req.body?.tenantId || null,
          },
          organizationId,
        });

        if (duplicate) {
          return res.status(200).json({ ok: true, duplicate: true, eventId: event.id });
        }

        // Delivery status updates
        if (req.body?.providerMessageId && req.body?.deliveryStatus && organizationId) {
          await updateMessageDeliveryStatus(
            organizationId,
            String(req.body.providerMessageId),
            String(req.body.deliveryStatus),
          );
        }

        await markChannelEventProcessed(event.id, "processed");
        res.status(202).json({ ok: true, eventId: event.id });
      } catch (error) {
        handleErr(res, error, "Webhook processing failed");
      }
    },
  );

  app.get(
    "/api/communications/channels/dead-letter",
    ...staffGate,
    requireRole("owner"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const items = await listDeadLetterEvents(user.organizationId!);
        res.json(items);
      } catch (error) {
        handleErr(res, error, "Failed to list dead-letter events");
      }
    },
  );

  app.get(
    "/api/communications/channels/identity-review",
    ...staffGate,
    requireRole("owner", "clerk"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const items = await listIdentityReviewQueue(user.organizationId!);
        res.json(items);
      } catch (error) {
        handleErr(res, error, "Failed to list identity review queue");
      }
    },
  );

  app.patch(
    "/api/communications/settings",
    ...staffGate,
    requireRole("owner"),
    async (req: any, res) => {
      try {
        const user = await loadStaffUser(req, res);
        if (!user) return;
        const patch: Record<string, unknown> = {};
        if (typeof req.body?.communicationsEmergencyGuidance === "string") {
          patch.communicationsEmergencyGuidance = req.body.communicationsEmergencyGuidance;
        }
        if (typeof req.body?.communicationsDefaultLanding === "boolean") {
          patch.communicationsDefaultLanding = req.body.communicationsDefaultLanding;
        }
        const organization = await storage.updateOrganization(user.organizationId!, patch as any);
        res.json(organization);
      } catch (error) {
        handleErr(res, error, "Failed to update settings");
      }
    },
  );

  // ---- Tenant portal ----
  app.get(
    "/api/communications/tenant/cases",
    ...tenantGate,
    async (req: any, res) => {
      try {
        const user = await storage.getUser(req.user.id);
        if (!user || user.role !== "tenant") {
          return res.status(403).json({ message: "Tenant access only" });
        }
        const result = await listCases({
          organizationId: user.organizationId!,
          tenantId: user.id,
          includeClosed: true,
          limit: 100,
        });
        res.json({
          items: result.items.map((c) => toPublicCase(c)),
        });
      } catch (error) {
        handleErr(res, error, "Failed to list tenant cases");
      }
    },
  );

  app.get(
    "/api/communications/tenant/cases/:id",
    ...tenantGate,
    async (req: any, res) => {
      try {
        const user = await storage.getUser(req.user.id);
        if (!user || user.role !== "tenant") {
          return res.status(403).json({ message: "Tenant access only" });
        }
        const detail = await getCaseDetail(user.organizationId!, req.params.id);
        if (!detail || detail.case.tenantId !== user.id) {
          return res.status(404).json({ message: "Case not found" });
        }
        res.json(toPublicCase(detail.case, detail.messages));
      } catch (error) {
        handleErr(res, error, "Failed to load tenant case");
      }
    },
  );

  app.post(
    "/api/communications/tenant/cases",
    ...tenantGate,
    async (req: any, res) => {
      try {
        const user = await storage.getUser(req.user.id);
        if (!user || user.role !== "tenant") {
          return res.status(403).json({ message: "Tenant access only" });
        }
        const subject = String(req.body?.subject || "").trim();
        const body = String(req.body?.body || "").trim();
        if (!subject || !body) {
          return res.status(400).json({ message: "Subject and description required" });
        }

        const shortcut = String(req.body?.shortcut || req.body?.categoryKey || "general");

        // Repair shortcut → create maintenance request + bridge
        if (shortcut === "maintenance" || shortcut === "repair") {
          const propertyId = req.body?.propertyId || null;
          const blockId = req.body?.blockId || null;
          if (!propertyId && !blockId) {
            return res
              .status(400)
              .json({ message: "Property or block required for repair requests" });
          }
          const request = await storage.createMaintenanceRequest({
            organizationId: user.organizationId!,
            propertyId,
            blockId,
            reportedBy: user.id,
            title: subject,
            description: body,
            priority: req.body?.priority || "medium",
            photoUrls: req.body?.photoUrls || null,
            source: "tenant_portal",
          } as any);

          scheduleMaintenanceCaseBridge({
            organizationId: user.organizationId!,
            maintenanceRequestId: request.id,
            title: request.title,
            description: request.description,
            priority: request.priority,
            propertyId: request.propertyId,
            blockId: request.blockId,
            reportedByUserId: user.id,
            source: "tenant_portal",
          });

          // Wait briefly for bridge so tenant gets a case reference
          const bridged = await (
            await import("./maintenanceBridge")
          ).ensureCaseLinkedToMaintenanceRequest({
            organizationId: user.organizationId!,
            maintenanceRequestId: request.id,
            title: request.title,
            description: request.description,
            priority: request.priority,
            propertyId: request.propertyId,
            blockId: request.blockId,
            reportedByUserId: user.id,
            tenantId: user.id,
            source: "tenant_portal",
          });

          return res.status(201).json({
            maintenanceRequest: request,
            case: bridged?.case ? toPublicCase(bridged.case) : null,
          });
        }

        const result = await createCase({
          organizationId: user.organizationId!,
          subject,
          body,
          categoryKey: shortcut,
          priority: req.body?.priority,
          source: "tenant_portal",
          tenantId: user.id,
          tenancyId: req.body?.tenancyId,
          propertyId: req.body?.propertyId,
          blockId: req.body?.blockId,
          createdByUserId: user.id,
          actorType: "tenant",
          attachments: req.body?.attachments,
          runAiSuggest: true,
        });

        res.status(201).json({ case: toPublicCase(result.case) });
      } catch (error) {
        handleErr(res, error, "Failed to create tenant case");
      }
    },
  );

  app.post(
    "/api/communications/tenant/cases/:id/messages",
    ...tenantGate,
    async (req: any, res) => {
      try {
        const user = await storage.getUser(req.user.id);
        if (!user || user.role !== "tenant") {
          return res.status(403).json({ message: "Tenant access only" });
        }
        const detail = await getCaseDetail(user.organizationId!, req.params.id);
        if (!detail || detail.case.tenantId !== user.id) {
          return res.status(404).json({ message: "Case not found" });
        }
        const body = String(req.body?.body || "").trim();
        if (!body) return res.status(400).json({ message: "Message required" });
        const result = await addMessage({
          organizationId: user.organizationId!,
          caseId: req.params.id,
          body,
          visibility: "tenant",
          direction: "inbound",
          channel: "tenant_portal",
          authorUserId: user.id,
          authorNameSnapshot:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Tenant",
          attachments: req.body?.attachments,
          actorType: "tenant",
        });
        res.status(201).json({
          message: result?.message,
          case: result?.case ? toPublicCase(result.case) : null,
        });
      } catch (error) {
        handleErr(res, error, "Failed to reply");
      }
    },
  );

  // Expose seed helper for company-modules enable path
  (registerCommunicationsRoutes as any).maybeSeedOnEnable = maybeSeedOnEnable;
}

export { scheduleMaintenanceCaseBridge, maybeSeedOnEnable };
