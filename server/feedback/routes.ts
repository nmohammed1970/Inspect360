import type { Express } from "express";
import multer from "multer";
import { isAuthenticated, isAdminAuthenticated } from "../auth";
import { storage as appStorage } from "../storage";
import { ObjectStorageService } from "../objectStorage";
import { sanitizeFeedbackSourcePage } from "@shared/feedbackLabels";
import { FEEDBACK_TYPES, FEEDBACK_STATUSES } from "@shared/feedbackSchema";
import * as feedbackStorage from "./storage";
import {
  canAccessFeedbackCase,
  ensureFeedbackActorUser,
  isFeatureAdminActor,
  requireFeatureAdmin,
  requireFeatureAdminTeamManager,
} from "./auth";
import {
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_IMAGES,
  feedbackStorageObjectName,
  validateFeedbackImage,
} from "./attachments";
import {
  notifyReporterPublicReply,
  notifyTeamFollowUp,
  notifyTeamNewFeedback,
} from "./notifications";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FEEDBACK_MAX_IMAGE_BYTES, files: FEEDBACK_MAX_IMAGES },
});

function appOrigin(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5005";
  return `${proto}://${host}`;
}

function displayName(user: any): string {
  return (
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.username ||
    user?.email ||
    "User"
  );
}

async function saveBuffersAsAttachments(params: {
  feedbackRequestId: string;
  messageId?: string | null;
  userId: string;
  files: Express.Multer.File[];
}) {
  if (!params.files?.length) return [];
  if (params.files.length > FEEDBACK_MAX_IMAGES) {
    throw Object.assign(new Error(`Maximum ${FEEDBACK_MAX_IMAGES} images allowed`), { status: 400 });
  }
  const objectStorage = new ObjectStorageService();
  const created = [];
  for (const file of params.files) {
    const check = validateFeedbackImage(file.buffer, file.mimetype);
    if (!check.ok) {
      throw Object.assign(new Error(check.message), { status: 400 });
    }
    const objectPath = await objectStorage.saveUploadedFile(
      feedbackStorageObjectName(file.originalname),
      file.buffer,
      check.mime,
    );
    try {
      await objectStorage.trySetObjectEntityAclPolicy(objectPath, {
        owner: params.userId,
        visibility: "private",
      } as any);
    } catch {
      /* best-effort */
    }
    const row = await feedbackStorage.createAttachment({
      feedbackRequestId: params.feedbackRequestId,
      messageId: params.messageId ?? null,
      uploadedByUserId: params.userId,
      originalFilename: file.originalname || null,
      mimeType: check.mime,
      fileSizeBytes: file.buffer.length,
      storageKey: objectPath,
    });
    created.push(row);
  }
  return created;
}

export function registerFeedbackRoutes(app: Express) {
  // -------- Portal --------
  app.post(
    "/api/feedback",
    isAuthenticated,
    upload.array("images", FEEDBACK_MAX_IMAGES),
    async (req: any, res) => {
      try {
        await feedbackStorage.ensureFeedbackCounter();
        const user = await appStorage.getUser(req.user.id);
        if (!user) return res.status(401).json({ message: "User not found" });
        if ((user as any).status === "suspended") {
          return res.status(403).json({ message: "Account suspended" });
        }

        const type = String(req.body?.type || "");
        const subject = String(req.body?.subject || "").trim();
        const description = String(req.body?.description || "").trim();
        if (!FEEDBACK_TYPES.includes(type as any)) {
          return res.status(400).json({ message: "Select a feedback type" });
        }
        if (!subject) return res.status(400).json({ message: "Subject is required" });
        if (subject.length > 150) return res.status(400).json({ message: "Subject max 150 characters" });
        if (!description) return res.status(400).json({ message: "Description is required" });
        if (description.length > 10_000) {
          return res.status(400).json({ message: "Description max 10,000 characters" });
        }

        let organizationName: string | null = null;
        if (user.organizationId) {
          const org = await appStorage.getOrganization(user.organizationId);
          organizationName = org?.name || null;
        }

        let clientContext: Record<string, unknown> | null = null;
        try {
          if (typeof req.body?.clientContext === "string" && req.body.clientContext) {
            clientContext = JSON.parse(req.body.clientContext);
          } else if (req.body?.clientContext && typeof req.body.clientContext === "object") {
            clientContext = req.body.clientContext;
          }
        } catch {
          clientContext = null;
        }
        if (!clientContext) {
          clientContext = {
            userAgent: req.headers["user-agent"] || null,
          };
        }

        const feedback = await feedbackStorage.createFeedbackRequest({
          type,
          subject,
          description,
          reporterUserId: user.id,
          reporterNameSnapshot: displayName(user),
          reporterEmailSnapshot: user.email,
          organizationId: user.organizationId || null,
          organizationNameSnapshot: organizationName,
          sourcePage: sanitizeFeedbackSourcePage(req.body?.sourcePage || req.headers.referer),
          clientContext,
        });

        const files = (req.files as Express.Multer.File[]) || [];
        let attachments: Awaited<ReturnType<typeof saveBuffersAsAttachments>> = [];
        try {
          attachments = await saveBuffersAsAttachments({
            feedbackRequestId: feedback.id,
            userId: user.id,
            files,
          });
        } catch (attachErr: any) {
          console.error("[feedback] attachment save failed after create:", attachErr);
          // Case already saved — report partial success
          return res.status(201).json({
            ...feedback,
            attachments: [],
            attachmentWarning: attachErr?.message || "Images failed to attach",
          });
        }

        const origin = appOrigin(req);
        void notifyTeamNewFeedback({
          reference: feedback.reference,
          type: feedback.type,
          subject: feedback.subject,
          organizationName,
          reporterName: feedback.reporterNameSnapshot,
          reporterEmail: feedback.reporterEmailSnapshot,
          description: feedback.description,
          adminUrl: `${origin}/admin/feedback/${feedback.id}`,
        });

        res.status(201).json({ ...feedback, attachments });
      } catch (error: any) {
        console.error("[feedback] create failed:", error);
        res.status(error?.status || 500).json({ message: error?.message || "Failed to submit feedback" });
      }
    },
  );

  app.get("/api/feedback/mine", isAuthenticated, async (req: any, res) => {
    try {
      const rows = await feedbackStorage.listMyFeedback(req.user.id);
      res.json(rows);
    } catch (error) {
      console.error("[feedback] list mine failed:", error);
      res.status(500).json({ message: "Failed to load feedback" });
    }
  });

  // Attachments before /:id so "attachments" is not captured as an id
  app.get("/api/feedback/attachments/:id", isAuthenticated, async (req: any, res) => {
    try {
      ensureFeedbackActorUser(req);
      const attachment = await feedbackStorage.getAttachment(req.params.id);
      if (!attachment) return res.status(404).json({ message: "Not found" });
      const feedback = await feedbackStorage.getFeedbackById(attachment.feedbackRequestId);
      if (!feedback || !(await canAccessFeedbackCase(req, feedback))) {
        return res.status(403).json({ message: "Access denied" });
      }
      const objectStorage = new ObjectStorageService();
      const objectFile = await objectStorage.getObjectEntityFile(attachment.storageKey);
      res.setHeader("Content-Type", attachment.mimeType);
      if (attachment.originalFilename) {
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${attachment.originalFilename.replace(/"/g, "")}"`,
        );
      }
      objectStorage.downloadObject(objectFile, res);
    } catch (error) {
      console.error("[feedback] attachment download failed:", error);
      res.status(404).json({ message: "Attachment not found" });
    }
  });

  app.get("/api/feedback/:id", isAuthenticated, async (req: any, res) => {
    try {
      const feedback = await feedbackStorage.getFeedbackById(req.params.id);
      if (!feedback) return res.status(404).json({ message: "Not found" });
      if (!(await canAccessFeedbackCase(req, feedback))) {
        return res.status(403).json({ message: "Access denied" });
      }
      const actor = await isFeatureAdminActor(req);
      const includeInternal = Boolean(actor.ok);
      const messages = await feedbackStorage.listMessages(feedback.id, { includeInternal });
      const attachments = await feedbackStorage.listAttachments(feedback.id);
      const audit = includeInternal ? await feedbackStorage.listAudit(feedback.id) : [];
      res.json({ feedback, messages, attachments, audit });
    } catch (error) {
      console.error("[feedback] get failed:", error);
      res.status(500).json({ message: "Failed to load feedback" });
    }
  });

  async function handleAddMessage(req: any, res: any) {
    try {
      ensureFeedbackActorUser(req);
      const feedback = await feedbackStorage.getFeedbackById(req.params.id);
      if (!feedback) return res.status(404).json({ message: "Not found" });

      const actor = await isFeatureAdminActor(req);
      const isReporter = feedback.reporterUserId === req.user?.id;
      if (!isReporter && !actor.ok) return res.status(403).json({ message: "Access denied" });

      const body = String(req.body?.body || "").trim();
      if (!body) return res.status(400).json({ message: "Message body is required" });
      if (body.length > 10_000) return res.status(400).json({ message: "Message too long" });

      let visibility: "public" | "internal" = "public";
      if (actor.ok && !isReporter) {
        visibility = req.body?.visibility === "internal" ? "internal" : "public";
      } else {
        visibility = "public";
      }

      let authorName = displayName(req.user);
      try {
        const user = await appStorage.getUser(req.user.id);
        if (user) authorName = displayName(user);
      } catch {
        /* Eco-Admin actor may not be an org user */
      }
      if (actor.ok && !isReporter) {
        authorName = displayName(req.user) || "Inspect360 team";
      }

      const msg = await feedbackStorage.addMessage({
        feedbackRequestId: feedback.id,
        authorUserId: req.user.id,
        authorNameSnapshot: authorName,
        body,
        visibility,
      });

      const files = (req.files as Express.Multer.File[]) || [];
      const attachments = await saveBuffersAsAttachments({
        feedbackRequestId: feedback.id,
        messageId: msg.id,
        userId: req.user.id,
        files,
      });

      const origin = appOrigin(req);
      let updated = feedback;

      if (isReporter && (feedback.status === "resolved" || feedback.status === "closed")) {
        updated =
          (await feedbackStorage.updateFeedbackRequest(
            feedback.id,
            { status: "in_review" },
            req.user.id,
          )) || feedback;
        void notifyTeamFollowUp({
          reference: feedback.reference,
          subject: feedback.subject,
          excerpt: body,
          adminUrl: `${origin}/admin/feedback/${feedback.id}`,
          assigneeUserId: feedback.assignedToUserId,
          reopened: true,
        });
      } else if (isReporter) {
        void notifyTeamFollowUp({
          reference: feedback.reference,
          subject: feedback.subject,
          excerpt: body,
          adminUrl: `${origin}/admin/feedback/${feedback.id}`,
          assigneeUserId: feedback.assignedToUserId,
        });
      } else if (visibility === "public" && actor.ok) {
        void notifyReporterPublicReply({
          toEmail: feedback.reporterEmailSnapshot || "",
          reference: feedback.reference,
          subject: feedback.subject,
          portalUrl: `${origin}/feedback/${feedback.id}`,
          reporterUserId: feedback.reporterUserId,
          organizationId: feedback.organizationId,
        });
      }

      res.status(201).json({ message: msg, attachments, feedback: updated });
    } catch (error: any) {
      console.error("[feedback] message failed:", error);
      res.status(error?.status || 500).json({ message: error?.message || "Failed to add message" });
    }
  }

  app.post(
    "/api/feedback/:id/messages",
    isAuthenticated,
    upload.array("images", FEEDBACK_MAX_IMAGES),
    handleAddMessage,
  );

  // -------- Eco-Admin / Feature Admin --------
  app.get(
    "/api/admin/feedback/attachments/:id",
    isAdminAuthenticated,
    requireFeatureAdmin(),
    async (req: any, res) => {
      try {
        ensureFeedbackActorUser(req);
        const attachment = await feedbackStorage.getAttachment(req.params.id);
        if (!attachment) return res.status(404).json({ message: "Not found" });
        const objectStorage = new ObjectStorageService();
        const objectFile = await objectStorage.getObjectEntityFile(attachment.storageKey);
        res.setHeader("Content-Type", attachment.mimeType);
        if (attachment.originalFilename) {
          res.setHeader(
            "Content-Disposition",
            `inline; filename="${attachment.originalFilename.replace(/"/g, "")}"`,
          );
        }
        objectStorage.downloadObject(objectFile, res);
      } catch (error) {
        console.error("[feedback] admin attachment download failed:", error);
        res.status(404).json({ message: "Attachment not found" });
      }
    },
  );

  app.get(
    "/api/admin/feedback",
    isAdminAuthenticated,
    requireFeatureAdmin(),
    async (req: any, res) => {
      try {
        const openOnly = req.query.open !== "false";
        const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
        const result = await feedbackStorage.listAdminFeedback({
          q: typeof req.query.q === "string" ? req.query.q : undefined,
          type: typeof req.query.type === "string" ? req.query.type : undefined,
          status: statusParam && statusParam !== "all" ? statusParam : undefined,
          organizationId:
            typeof req.query.organizationId === "string" ? req.query.organizationId : undefined,
          assignedToUserId:
            req.query.assigned === "unassigned"
              ? null
              : typeof req.query.assignedTo === "string"
                ? req.query.assignedTo
                : undefined,
          openOnly: !statusParam || statusParam === "all" ? openOnly : false,
          limit: Math.min(200, Number(req.query.limit) || 100),
          offset: Number(req.query.offset) || 0,
        });
        const counters = await feedbackStorage.getInboxCounters();
        res.json({ ...result, counters });
      } catch (error) {
        console.error("[feedback] admin list failed:", error);
        res.status(500).json({ message: "Failed to load inbox" });
      }
    },
  );

  app.get(
    "/api/admin/feedback/feature-report",
    isAdminAuthenticated,
    requireFeatureAdmin(),
    async (req: any, res) => {
      try {
        const from = req.query.from ? new Date(String(req.query.from)) : undefined;
        const to = req.query.to ? new Date(String(req.query.to)) : undefined;
        const report = await feedbackStorage.getFeatureRequestReport({
          from: from && !Number.isNaN(from.getTime()) ? from : undefined,
          to: to && !Number.isNaN(to.getTime()) ? to : undefined,
          organizationId:
            typeof req.query.organizationId === "string" ? req.query.organizationId : undefined,
        });
        res.json(report);
      } catch (error) {
        console.error("[feedback] feature report failed:", error);
        res.status(500).json({ message: "Failed to load feature report" });
      }
    },
  );

  app.get(
    "/api/admin/feedback/feature-report/export",
    isAdminAuthenticated,
    requireFeatureAdmin(),
    async (req: any, res) => {
      try {
        const report = await feedbackStorage.getFeatureRequestReport({
          organizationId:
            typeof req.query.organizationId === "string" ? req.query.organizationId : undefined,
        });
        const header = [
          "reference",
          "subject",
          "status",
          "organization",
          "submitter",
          "email",
          "assignee",
          "created_at",
          "updated_at",
        ];
        const lines = [header.join(",")];
        for (const r of report.rows) {
          const cells = [
            r.reference,
            r.subject,
            r.status,
            r.organizationNameSnapshot || "",
            r.reporterNameSnapshot || "",
            r.reporterEmailSnapshot || "",
            r.assignedToUserId || "",
            r.createdAt ? new Date(r.createdAt).toISOString() : "",
            r.updatedAt ? new Date(r.updatedAt).toISOString() : "",
          ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
          lines.push(cells.join(","));
        }
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="feature-requests.csv"');
        res.send(lines.join("\n"));
      } catch (error) {
        console.error("[feedback] csv export failed:", error);
        res.status(500).json({ message: "Export failed" });
      }
    },
  );

  app.get(
    "/api/admin/feedback/team",
    isAdminAuthenticated,
    requireFeatureAdmin(),
    async (_req: any, res) => {
      try {
        const members = await feedbackStorage.listFeatureAdminMembers(false);
        res.json(members);
      } catch (error) {
        console.error("[feedback] team list failed:", error);
        res.status(500).json({ message: "Failed to load team" });
      }
    },
  );

  app.post(
    "/api/admin/feedback/team",
    isAdminAuthenticated,
    requireFeatureAdminTeamManager(),
    async (req: any, res) => {
      try {
        ensureFeedbackActorUser(req);
        const email = String(req.body?.email || "").trim().toLowerCase();
        if (!email || !email.includes("@")) {
          return res.status(400).json({ message: "Valid email required" });
        }
        const canManageTeam = Boolean(req.body?.canManageTeam);
        let userId: string | null = null;
        try {
          const existingUser = await appStorage.getUserByEmail(email);
          if (existingUser?.id) userId = existingUser.id;
        } catch {
          /* optional */
        }
        const member = await feedbackStorage.addFeatureAdminMember({
          email,
          userId,
          canManageTeam,
          invitedByUserId: req.user.id,
          activate: true,
        });
        res.status(201).json(member);
      } catch (error: any) {
        console.error("[feedback] team add failed:", error);
        res.status(error?.status || 500).json({ message: error?.message || "Failed to add member" });
      }
    },
  );

  app.delete(
    "/api/admin/feedback/team/:memberId",
    isAdminAuthenticated,
    requireFeatureAdminTeamManager(),
    async (req: any, res) => {
      try {
        const row = await feedbackStorage.removeFeatureAdminMember(req.params.memberId);
        if (!row) return res.status(404).json({ message: "Member not found" });
        res.json(row);
      } catch (error: any) {
        console.error("[feedback] team remove failed:", error);
        res.status(error?.status || 500).json({ message: error?.message || "Failed to remove member" });
      }
    },
  );

  app.post(
    "/api/admin/feedback/:id/messages",
    isAdminAuthenticated,
    requireFeatureAdmin(),
    upload.array("images", FEEDBACK_MAX_IMAGES),
    handleAddMessage,
  );

  app.get(
    "/api/admin/feedback/:id",
    isAdminAuthenticated,
    requireFeatureAdmin(),
    async (req: any, res) => {
      try {
        const feedback = await feedbackStorage.getFeedbackById(req.params.id);
        if (!feedback) return res.status(404).json({ message: "Not found" });
        const messages = await feedbackStorage.listMessages(feedback.id, { includeInternal: true });
        const attachments = await feedbackStorage.listAttachments(feedback.id);
        const audit = await feedbackStorage.listAudit(feedback.id);
        const team = await feedbackStorage.listActiveFeatureAdmins();
        res.json({ feedback, messages, attachments, audit, assignees: team });
      } catch (error) {
        console.error("[feedback] admin get failed:", error);
        res.status(500).json({ message: "Failed to load feedback" });
      }
    },
  );

  app.patch(
    "/api/admin/feedback/:id",
    isAdminAuthenticated,
    requireFeatureAdmin(),
    async (req: any, res) => {
      try {
        ensureFeedbackActorUser(req);
        const updates: any = {};
        if (req.body?.type && FEEDBACK_TYPES.includes(req.body.type)) updates.type = req.body.type;
        if (req.body?.status && FEEDBACK_STATUSES.includes(req.body.status)) {
          updates.status = req.body.status;
        }
        if (req.body?.assignedToUserId !== undefined) {
          updates.assignedToUserId = req.body.assignedToUserId || null;
        }
        const updated = await feedbackStorage.updateFeedbackRequest(
          req.params.id,
          updates,
          req.user.id,
        );
        if (!updated) return res.status(404).json({ message: "Not found" });
        res.json(updated);
      } catch (error) {
        console.error("[feedback] admin patch failed:", error);
        res.status(500).json({ message: "Failed to update feedback" });
      }
    },
  );
}
