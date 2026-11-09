import type { Express, Response, NextFunction } from "express";
import { createHash, randomBytes, randomUUID } from "crypto";
import multer from "multer";
import { isAuthenticated, requireCompanyModule } from "../auth";
import { storage as appStorage } from "../storage";
import { ObjectStorageService } from "../objectStorage";
import { hasHmoPermission, evaluatePreTenancyCheck, type HmoPermission } from "@shared/hmo";
import { extractLicenceFromText } from "./extraction";
import { runAssessment } from "./assessmentRunner";
import * as hmoStorage from "./storage";
import { buildOccupancyFromTenancies, evaluateRooms } from "./occupancy";
import {
  approveRuleAndQueueImpact,
  runWeeklySourceWatcher,
  seedBaselineRules,
  summariseSourceDiff,
} from "./regulatory";
import { bulkImportLicences } from "./bulk";
import { preAggregateDashboardMetrics } from "./metrics";
import {
  assertAllowedMime,
  assertUploadSize,
  buildImmutableUploadMeta,
  extractTextFromLicenceBuffer,
  hashContent,
  HMO_MAX_UPLOAD_BYTES,
  malwareScanHook,
} from "./documentPipeline";
import { scoreAddressMatch } from "./addressMatcher";
import { dispatchHmoNotification } from "./notificationDispatcher";
import { fetchReapitOccupancyHint } from "./reapitAdapter";
import {
  buildEvidenceRequestCopy,
  hmoChecksForTask,
} from "./evidenceCopy";

const hmoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HMO_MAX_UPLOAD_BYTES },
});

function requireHmoPermission(permission: HmoPermission) {
  return (req: any, res: Response, next: NextFunction) => {
    if (!hasHmoPermission(req.user?.role, permission)) {
      return res.status(403).json({ message: "Insufficient HMO permission", permission });
    }
    next();
  };
}

function orgId(req: any): string {
  return req.user.organizationId as string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function assertPropertyInOrg(propertyId: string, organizationId: string) {
  const property = await appStorage.getProperty(propertyId);
  if (!property || property.organizationId !== organizationId) {
    return null;
  }
  return property;
}

export function registerHmoRoutes(app: Express) {
  const moduleGate = requireCompanyModule("hmo_compliance");

  // -------- Public evidence token routes (no auth / no module gate) --------
  app.get("/api/hmo/evidence/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "");
      if (!token || token.length < 16) {
        return res.status(400).json({ message: "Invalid token" });
      }
      const request = await hmoStorage.getEvidenceRequestByTokenHash(hashToken(token));
      if (!request) return res.status(404).json({ message: "Evidence request not found" });
      if (request.expiryAt && new Date(request.expiryAt).getTime() < Date.now()) {
        return res.status(410).json({ message: "Evidence request expired" });
      }
      return res.json({
        id: request.id,
        status: request.status,
        expiryAt: request.expiryAt,
        requestTemplate: request.requestTemplate,
        taskId: request.taskId,
      });
    } catch (error) {
      console.error("[hmo] public evidence get failed:", error);
      return res.status(500).json({ message: "Failed to load evidence request" });
    }
  });

  app.post("/api/hmo/evidence/:token", hmoUpload.single("file"), async (req: any, res) => {
    try {
      const token = String(req.params.token || "");
      const request = await hmoStorage.getEvidenceRequestByTokenHash(hashToken(token));
      if (!request) return res.status(404).json({ message: "Evidence request not found" });
      if (request.expiryAt && new Date(request.expiryAt).getTime() < Date.now()) {
        return res.status(410).json({ message: "Evidence request expired" });
      }

      const file = req.file as Express.Multer.File | undefined;
      let objectUrl =
        typeof req.body?.objectUrl === "string" && req.body.objectUrl
          ? req.body.objectUrl
          : null;
      let fileName =
        typeof req.body?.fileName === "string" && req.body.fileName
          ? req.body.fileName
          : file?.originalname || null;
      let contentHash: string | null = null;

      if (file) {
        const mime = assertAllowedMime(file.mimetype, file.originalname || fileName);
        assertUploadSize(file.size);
        contentHash = hashContent(file.buffer);
        await malwareScanHook({
          contentHash,
          mime,
          byteLength: file.size,
        });

        const objectStorageService = new ObjectStorageService();
        const objectId = randomUUID();
        const normalizedPath = await objectStorageService.saveUploadedFile(
          objectId,
          file.buffer,
          mime,
        );
        objectUrl = normalizedPath;
        fileName = file.originalname || fileName;

        try {
          await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
            owner: `evidence:${request.id}`,
            visibility: "private",
          });
        } catch (aclErr) {
          console.warn("[hmo] public evidence ACL set failed:", aclErr);
        }
      }

      if (!objectUrl) {
        console.warn("[hmo] public evidence missing file/url", {
          hasFile: Boolean(file),
          contentType: req.headers["content-type"],
          bodyKeys: req.body ? Object.keys(req.body) : [],
        });
        return res.status(400).json({
          message: "Please choose a PDF or image file, then submit again",
        });
      }

      const review = await hmoStorage.createEvidenceReview({
        organizationId: request.organizationId,
        taskId: request.taskId,
        evidenceObjectUrl: objectUrl,
        decision: null,
        aiResult: {
          fileName,
          contentHash,
          source: file ? "public_token_file_upload" : "public_token_url_upload",
          mime: file?.mimetype || null,
          size: file?.size || null,
        },
      });

      return res.status(201).json({
        ok: true,
        reviewId: review.id,
        status: "RECEIVED",
        objectUrl,
        fileName,
      });
    } catch (error: any) {
      console.error("[hmo] public evidence post failed:", error);
      if (String(error?.message || "").includes("MIME type not allowed")) {
        return res.status(400).json({ message: error.message });
      }
      if (
        String(error?.message || "").includes("Upload exceeds") ||
        String(error?.message || "").includes("Empty upload")
      ) {
        return res.status(400).json({ message: error.message });
      }
      return res.status(500).json({ message: "Failed to submit evidence" });
    }
  });

  // -------- Authenticated module routes --------
  app.get(
    "/api/hmo/dashboard",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const metrics = await preAggregateDashboardMetrics(orgId(req));
        res.json(metrics);
      } catch (error) {
        console.error("[hmo] dashboard failed:", error);
        res.status(500).json({ message: "Failed to load HMO dashboard" });
      }
    },
  );

  app.get(
    "/api/hmo/settings",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const settings = await hmoStorage.getOrCreateOrgSettings(orgId(req), req.user.id);
        res.json(settings);
      } catch (error) {
        console.error("[hmo] settings failed:", error);
        res.status(500).json({ message: "Failed to load HMO settings" });
      }
    },
  );

  app.get(
    "/api/hmo/properties/:propertyId/overview",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });
        const overview = await hmoStorage.getOverview(orgId(req), property.id);
        res.json(overview);
      } catch (error) {
        console.error("[hmo] overview failed:", error);
        res.status(500).json({ message: "Failed to load property HMO overview" });
      }
    },
  );

  app.get(
    "/api/hmo/properties/:propertyId/licences",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });
        const licences = await hmoStorage.listLicences(orgId(req), property.id);
        res.json(licences);
      } catch (error) {
        console.error("[hmo] list licences failed:", error);
        res.status(500).json({ message: "Failed to list licences" });
      }
    },
  );

  app.post(
    "/api/hmo/properties/:propertyId/licences/uploads",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.licence.upload"),
    hmoUpload.single("file"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });

        const file = req.file as Express.Multer.File | undefined;
        let objectUrl =
          typeof req.body?.objectUrl === "string" && req.body.objectUrl
            ? req.body.objectUrl
            : null;
        let fileName =
          typeof req.body?.fileName === "string" && req.body.fileName
            ? req.body.fileName
            : file?.originalname || null;
        let contentHash =
          typeof req.body?.contentHash === "string" && req.body.contentHash
            ? req.body.contentHash
            : null;
        let extractedText =
          typeof req.body?.extractedText === "string" ? req.body.extractedText : "";
        let pageCount: number | null = null;
        let extractWarning: string | null = null;
        const documentId =
          typeof req.body?.documentId === "string"
            ? req.body.documentId
            : `doc_${randomBytes(8).toString("hex")}`;

        if (file) {
          const mime = assertAllowedMime(file.mimetype, file.originalname);
          assertUploadSize(file.size);
          contentHash = hashContent(file.buffer);
          await malwareScanHook({
            contentHash,
            mime,
            byteLength: file.size,
          });

          const objectStorageService = new ObjectStorageService();
          const objectId = randomUUID();
          const normalizedPath = await objectStorageService.saveUploadedFile(
            objectId,
            file.buffer,
            mime,
          );
          objectUrl = normalizedPath;
          fileName = file.originalname || fileName || `licence${mime === "application/pdf" ? ".pdf" : ".bin"}`;

          try {
            await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
              owner: req.user.id,
              visibility: "private",
            });
          } catch (aclErr) {
            console.warn("[hmo] ACL set failed:", aclErr);
          }

          const textResult = await extractTextFromLicenceBuffer(file.buffer, mime);
          extractedText = textResult.text || extractedText;
          pageCount = textResult.pageCount ?? null;
          extractWarning = textResult.warning || null;
          if (!extractedText.trim()) {
            return res.status(422).json({
              message:
                extractWarning ||
                "Could not extract text from file. Use a text PDF or clear photo of the licence.",
              contentHash,
              objectUrl,
              extractSource: textResult.source,
            });
          }
        } else if (!extractedText.trim()) {
          return res.status(400).json({
            message: "Upload a PDF/image file (field name: file), or provide extractedText",
          });
        } else if (!contentHash) {
          contentHash = hashContent(extractedText);
        }

        if (contentHash) {
          const existing = await hmoStorage.findLicenceVersionByHash(orgId(req), contentHash);
          if (existing) {
            const job = await hmoStorage.createJob({
              organizationId: orgId(req),
              propertyId: property.id,
              jobType: "LICENCE_EXTRACT",
              userId: req.user.id,
              licenceVersionId: existing.id,
              idempotencyKey: `upload:${contentHash}`,
              status: "COMPLETED",
              progress: 100,
              resultJson: { deduped: true, licenceVersionId: existing.id },
            });
            return res.status(200).json({
              jobId: job.id,
              licenceVersionId: existing.id,
              deduped: true,
              objectUrl,
              contentHash,
            });
          }
        }

        const job = await hmoStorage.createJob({
          organizationId: orgId(req),
          propertyId: property.id,
          jobType: "LICENCE_EXTRACT",
          userId: req.user.id,
          idempotencyKey: contentHash ? `upload:${contentHash}` : undefined,
          status: "RUNNING",
          progress: 10,
        });

        const extraction = await extractLicenceFromText(extractedText || "", documentId);
        const { licence, version } = await hmoStorage.createLicenceWithVersion({
          organizationId: orgId(req),
          propertyId: property.id,
          userId: req.user.id,
          objectUrl,
          fileName,
          contentHash,
          documentId,
          extraction,
          pageCount,
        });

        const updated = await hmoStorage.updateJob(orgId(req), job.id, {
          status: "COMPLETED",
          progress: 100,
          licenceVersionId: version.id,
          resultJson: {
            licenceId: licence.id,
            licenceVersionId: version.id,
            extraction,
            extractWarning,
            objectUrl,
            contentHash,
          },
        });

        res.status(201).json({
          jobId: updated?.id || job.id,
          licenceId: licence.id,
          licenceVersionId: version.id,
          extraction,
          objectUrl,
          contentHash,
          extractWarning,
        });
      } catch (error: any) {
        console.error("[hmo] upload failed:", error);
        if (String(error?.message || "").includes("MIME type not allowed")) {
          return res.status(400).json({ message: error.message });
        }
        if (String(error?.message || "").includes("Upload exceeds") || String(error?.message || "").includes("Empty upload")) {
          return res.status(400).json({ message: error.message });
        }
        if (String(error?.message || "").includes("unique") || error?.code === "23505") {
          return res.status(409).json({ message: "Duplicate licence document hash" });
        }
        res.status(500).json({ message: "Failed to upload licence" });
      }
    },
  );

  app.get(
    "/api/hmo/uploads/:jobId",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const job = await hmoStorage.getJob(orgId(req), req.params.jobId);
        if (!job) return res.status(404).json({ message: "Job not found" });
        res.json(job);
      } catch (error) {
        console.error("[hmo] get job failed:", error);
        res.status(500).json({ message: "Failed to load upload job" });
      }
    },
  );

  app.post(
    "/api/hmo/licence-versions/:id/confirm",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.licence.confirm"),
    async (req: any, res) => {
      try {
        const updated = await hmoStorage.confirmLicenceVersion({
          organizationId: orgId(req),
          versionId: req.params.id,
          userId: req.user.id,
          extraction: req.body?.extraction || null,
        });
        if (!updated) return res.status(404).json({ message: "Licence version not found" });
        res.json(updated);
      } catch (error) {
        console.error("[hmo] confirm failed:", error);
        res.status(500).json({ message: "Failed to confirm licence version" });
      }
    },
  );

  app.post(
    "/api/hmo/properties/:propertyId/assessments",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.assessment.run"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });

        const licenceVersionId = String(req.body?.licenceVersionId || "");
        if (!licenceVersionId) {
          return res.status(400).json({ message: "licenceVersionId is required" });
        }

        const idempotencyKey =
          typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : null;

        let job =
          idempotencyKey != null
            ? await hmoStorage.createJob({
                organizationId: orgId(req),
                propertyId: property.id,
                jobType: "ASSESSMENT",
                userId: req.user.id,
                licenceVersionId,
                idempotencyKey,
                status: "RUNNING",
                progress: 10,
              })
            : null;

        if (job?.status === "COMPLETED" && job.resultJson) {
          return res.json(job.resultJson);
        }

        const result = await runAssessment({
          orgId: orgId(req),
          propertyId: property.id,
          licenceVersionId,
          userId: req.user.id,
          reason: typeof req.body?.reason === "string" ? req.body.reason : "manual",
        });

        if (job) {
          await hmoStorage.updateJob(orgId(req), job.id, {
            status: "COMPLETED",
            progress: 100,
            assessmentId: result.assessment.id,
            resultJson: result as any,
          });
        }

        res.status(201).json(result);
      } catch (error: any) {
        console.error("[hmo] assessment failed:", error);
        const status = error?.status || 500;
        res.status(status).json({ message: error?.message || "Assessment failed" });
      }
    },
  );

  app.get(
    "/api/hmo/properties/:propertyId/findings",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });
        const findings = await hmoStorage.listFindings(orgId(req), property.id, {
          assessmentId: typeof req.query.assessmentId === "string" ? req.query.assessmentId : undefined,
          status: typeof req.query.status === "string" ? req.query.status : undefined,
          severity: typeof req.query.severity === "string" ? req.query.severity : undefined,
        });
        res.json(findings);
      } catch (error) {
        console.error("[hmo] findings failed:", error);
        res.status(500).json({ message: "Failed to list findings" });
      }
    },
  );

  app.post(
    "/api/hmo/properties/:propertyId/occupancy-check",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.occupancy.read"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });

        const maxPersons =
          typeof req.body?.maxPersons === "number" ? req.body.maxPersons : null;
        const confirmedPersons =
          typeof req.body?.confirmedPersons === "number" ? req.body.confirmedPersons : null;
        const proposedAdditional =
          typeof req.body?.proposedAdditional === "number" ? req.body.proposedAdditional : 0;
        const roomEvidenceComplete = req.body?.roomEvidenceComplete === true;

        const result = evaluatePreTenancyCheck({
          maxPersons,
          confirmedPersons,
          proposedAdditional,
          roomEvidenceComplete,
        });
        res.json(result);
      } catch (error) {
        console.error("[hmo] occupancy-check failed:", error);
        res.status(500).json({ message: "Occupancy check failed" });
      }
    },
  );

  app.get(
    "/api/hmo/cases",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const cases = await hmoStorage.listCases(orgId(req), {
          propertyId: typeof req.query.propertyId === "string" ? req.query.propertyId : undefined,
          status: typeof req.query.status === "string" ? req.query.status : undefined,
        });
        res.json(cases);
      } catch (error) {
        console.error("[hmo] list cases failed:", error);
        res.status(500).json({ message: "Failed to list cases" });
      }
    },
  );

  app.post(
    "/api/hmo/cases",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.write"),
    async (req: any, res) => {
      try {
        const propertyId = String(req.body?.propertyId || "");
        const property = await assertPropertyInOrg(propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });

        const created = await hmoStorage.createCaseWithTasks({
          organizationId: orgId(req),
          propertyId: property.id,
          userId: req.user.id,
          severity: typeof req.body?.severity === "string" ? req.body.severity : "HIGH",
          assessmentId: req.body?.assessmentId || null,
          findingIds: Array.isArray(req.body?.findingIds) ? req.body.findingIds : [],
          seedParkViewTasks: req.body?.seedTasks !== false,
        });
        res.status(201).json(created);
      } catch (error) {
        console.error("[hmo] create case failed:", error);
        res.status(500).json({ message: "Failed to create case" });
      }
    },
  );

  app.get(
    "/api/hmo/cases/:id",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const detail = await hmoStorage.getCase(orgId(req), req.params.id);
        if (!detail) return res.status(404).json({ message: "Case not found" });
        res.json(detail);
      } catch (error) {
        console.error("[hmo] get case failed:", error);
        res.status(500).json({ message: "Failed to load case" });
      }
    },
  );

  app.patch(
    "/api/hmo/cases/:id/assign",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.assign"),
    async (req: any, res) => {
      try {
        const ownerUserId = String(req.body?.ownerUserId || "");
        if (!ownerUserId) return res.status(400).json({ message: "ownerUserId is required" });
        const updated = await hmoStorage.assignCase({
          organizationId: orgId(req),
          caseId: req.params.id,
          ownerUserId,
          actorUserId: req.user.id,
        });
        if (!updated) return res.status(404).json({ message: "Case not found" });
        await dispatchHmoNotification({
          organizationId: orgId(req),
          userId: ownerUserId,
          title: "HMO case assigned",
          message: `You were assigned HMO case ${updated.caseReference || updated.id}`,
          link: `/hmo/cases/${updated.id}`,
        });
        res.json(updated);
      } catch (error) {
        console.error("[hmo] assign case failed:", error);
        res.status(500).json({ message: "Failed to assign case" });
      }
    },
  );

  app.post(
    "/api/hmo/cases/:id/signoff",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.critical.close"),
    async (req: any, res) => {
      try {
        const updated = await hmoStorage.signoffCase({
          organizationId: orgId(req),
          caseId: req.params.id,
          approverId: req.user.id,
          closureReason:
            typeof req.body?.closureReason === "string" ? req.body.closureReason : null,
        });
        if (!updated) return res.status(404).json({ message: "Case not found" });
        res.json(updated);
      } catch (error) {
        console.error("[hmo] signoff failed:", error);
        res.status(500).json({ message: "Failed to sign off case" });
      }
    },
  );

  app.get(
    "/api/hmo/cases/:id/tasks",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const detail = await hmoStorage.getCase(orgId(req), req.params.id);
        if (!detail) return res.status(404).json({ message: "Case not found" });
        res.json(detail.tasks);
      } catch (error) {
        console.error("[hmo] list tasks failed:", error);
        res.status(500).json({ message: "Failed to list tasks" });
      }
    },
  );

  app.post(
    "/api/hmo/tasks/:id/evidence-requests",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.notification.send"),
    async (req: any, res) => {
      try {
        const task = await hmoStorage.getTask(orgId(req), req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });

        const rawToken = randomBytes(24).toString("hex");
        const expiryAt = new Date();
        expiryAt.setDate(expiryAt.getDate() + (Number(req.body?.expiryDays) || 14));

        const recipientEmail =
          typeof req.body?.recipientEmail === "string" && req.body.recipientEmail.trim()
            ? req.body.recipientEmail.trim()
            : null;

        let propertyName = "Property";
        let propertyAddress: string | null = null;
        let neededCheckIds = hmoChecksForTask(task.taskCode);
        if (task.caseId) {
          const detail = await hmoStorage.getCase(orgId(req), task.caseId);
          if (detail?.property) {
            propertyName = detail.property.name || propertyName;
            propertyAddress = detail.property.address || null;
          }
          const linkedIds = (detail?.findings || [])
            .map((f: any) => f?.checkId as string)
            .filter(Boolean);
          const related = hmoChecksForTask(task.taskCode);
          const preferred = related.filter((id) => linkedIds.includes(id));
          if (preferred.length > 0) neededCheckIds = preferred;
          else if (related.length > 0) neededCheckIds = related;
        }

        const copy = buildEvidenceRequestCopy({
          propertyName,
          propertyAddress,
          taskCode: task.taskCode,
          taskTitle: task.title,
          neededCheckIds,
        });
        const requestTemplate =
          typeof req.body?.requestTemplate === "string" && req.body.requestTemplate.trim()
            ? req.body.requestTemplate.trim()
            : copy.requestTemplate;

        const request = await hmoStorage.createEvidenceRequest({
          organizationId: orgId(req),
          taskId: task.id,
          userId: req.user.id,
          recipientEmail,
          recipientContactId:
            typeof req.body?.recipientContactId === "string"
              ? req.body.recipientContactId
              : null,
          requestTemplate,
          secureTokenHash: hashToken(rawToken),
          expiryAt,
        });

        const publicPath = `/hmo/evidence/${rawToken}`;
        const baseUrl = (
          process.env.BASE_URL ||
          req.headers.origin ||
          `${req.protocol}://${req.get("host")}` ||
          `http://localhost:${process.env.PORT || 5005}`
        ).replace(/\/$/, "");
        const publicUrl = `${baseUrl}${publicPath}`;

        let emailSent = false;
        let emailError: string | null = null;
        if (recipientEmail) {
          try {
            const { sendEmail } = await import("../resend");
            const expiryLabel = expiryAt.toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            const escapedTemplate = requestTemplate
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/\n/g, "<br/>");
            await sendEmail({
              to: recipientEmail,
              subject: copy.subject,
              text: [
                requestTemplate,
                "",
                `Upload your document here (secure one-off link):`,
                publicUrl,
                "",
                `This link expires on ${expiryLabel}.`,
                "You will only be able to upload the requested file — no other property information is visible.",
              ].join("\n"),
              html: `
                <p>${escapedTemplate}</p>
                <p><a href="${publicUrl}">Upload evidence for ${copy.neededSummary.replace(/</g, "&lt;")}</a></p>
                <p style="color:#64748b;font-size:13px;">This secure one-off link expires on ${expiryLabel}. You only upload the requested file — other property information is not visible.</p>
              `,
            });
            emailSent = true;
          } catch (err: any) {
            emailError = err?.message || "Failed to send email";
            console.error("[hmo] evidence request email failed:", err);
          }
        }

        res.status(201).json({
          request,
          // Returned once so the caller can share the secure link
          token: rawToken,
          publicPath,
          publicUrl,
          emailSent,
          emailError,
          propertyName,
          neededSummary: copy.neededSummary,
          requestTemplate,
        });
      } catch (error) {
        console.error("[hmo] evidence request failed:", error);
        res.status(500).json({ message: "Failed to create evidence request" });
      }
    },
  );

  app.post(
    "/api/hmo/tasks/:id/evidence-reviews",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.write"),
    hmoUpload.single("file"),
    async (req: any, res) => {
      try {
        const task = await hmoStorage.getTask(orgId(req), req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });

        const file = req.file as Express.Multer.File | undefined;
        let objectUrl =
          typeof req.body?.evidenceObjectUrl === "string" && req.body.evidenceObjectUrl
            ? req.body.evidenceObjectUrl
            : typeof req.body?.objectUrl === "string" && req.body.objectUrl
              ? req.body.objectUrl
              : null;
        let fileName =
          typeof req.body?.fileName === "string" && req.body.fileName
            ? req.body.fileName
            : file?.originalname || null;
        let contentHash: string | null = null;
        let mime: string | null = null;

        if (file) {
          mime = assertAllowedMime(file.mimetype, file.originalname || fileName);
          assertUploadSize(file.size);
          contentHash = hashContent(file.buffer);
          await malwareScanHook({
            contentHash,
            mime,
            byteLength: file.size,
          });

          const objectStorageService = new ObjectStorageService();
          const objectId = randomUUID();
          const normalizedPath = await objectStorageService.saveUploadedFile(
            objectId,
            file.buffer,
            mime,
          );
          objectUrl = normalizedPath;
          fileName = file.originalname || fileName;

          try {
            await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
              owner: `user:${req.user.id}`,
              visibility: "private",
            });
          } catch (aclErr) {
            console.warn("[hmo] staff evidence ACL set failed:", aclErr);
          }
        }

        if (!objectUrl && !req.body?.decision) {
          return res.status(400).json({
            message: "Upload a PDF or image file, or provide evidenceObjectUrl",
          });
        }

        const review = await hmoStorage.createEvidenceReview({
          organizationId: orgId(req),
          taskId: task.id,
          reviewerUserId: req.user.id,
          evidenceObjectUrl: objectUrl,
          evidenceId: typeof req.body?.evidenceId === "string" ? req.body.evidenceId : null,
          decision: typeof req.body?.decision === "string" ? req.body.decision : null,
          rejectionReason:
            typeof req.body?.rejectionReason === "string" ? req.body.rejectionReason : null,
          aiResult: file
            ? {
                fileName,
                contentHash,
                source: "staff_direct_upload",
                mime,
                size: file.size,
              }
            : null,
        });
        res.status(201).json(review);
      } catch (error: any) {
        console.error("[hmo] evidence review failed:", error);
        if (String(error?.message || "").includes("MIME type not allowed")) {
          return res.status(400).json({ message: error.message });
        }
        if (
          String(error?.message || "").includes("Upload exceeds") ||
          String(error?.message || "").includes("Empty upload")
        ) {
          return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Failed to record evidence review" });
      }
    },
  );

  app.get(
    "/api/hmo/evidence-reviews/:id/file",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const review = await hmoStorage.getEvidenceReview(orgId(req), req.params.id);
        if (!review?.evidenceObjectUrl) {
          return res.status(404).json({ message: "Evidence file not found" });
        }
        const objectStorageService = new ObjectStorageService();
        const objectFile = await objectStorageService.getObjectEntityFile(review.evidenceObjectUrl);
        const ai = (review.aiResult || {}) as Record<string, unknown>;
        const fileName =
          typeof ai.fileName === "string" && ai.fileName ? ai.fileName : "evidence";
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${fileName.replace(/"/g, "")}"`,
        );
        objectStorageService.downloadObject(objectFile, res);
      } catch (error) {
        console.error("[hmo] evidence file download failed:", error);
        res.status(500).json({ message: "Failed to download evidence" });
      }
    },
  );

  app.patch(
    "/api/hmo/evidence-reviews/:id",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.write"),
    async (req: any, res) => {
      try {
        const decisionRaw = typeof req.body?.decision === "string" ? req.body.decision : "";
        if (decisionRaw !== "ACCEPTED" && decisionRaw !== "REJECTED") {
          return res.status(400).json({ message: "decision must be ACCEPTED or REJECTED" });
        }
        const review = await hmoStorage.decideEvidenceReview({
          organizationId: orgId(req),
          reviewId: req.params.id,
          reviewerUserId: req.user.id,
          decision: decisionRaw,
          rejectionReason:
            typeof req.body?.rejectionReason === "string" ? req.body.rejectionReason : null,
        });
        if (!review) return res.status(404).json({ message: "Evidence review not found" });
        res.json(review);
      } catch (error) {
        console.error("[hmo] evidence decision failed:", error);
        res.status(500).json({ message: "Failed to update evidence review" });
      }
    },
  );

  app.post(
    "/api/hmo/properties/:propertyId/occupancy-snapshots",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.occupancy.read"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });
        const maxPersons =
          typeof req.body?.maxPersons === "number" ? req.body.maxPersons : null;
        const result = await buildOccupancyFromTenancies({
          organizationId: orgId(req),
          propertyId: property.id,
          userId: req.user.id,
          maxPersons,
        });
        res.status(201).json(result);
      } catch (error) {
        console.error("[hmo] occupancy snapshot failed:", error);
        res.status(500).json({ message: "Failed to create occupancy snapshot" });
      }
    },
  );

  app.get(
    "/api/hmo/properties/:propertyId/rooms",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.occupancy.read"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });
        const rooms = await hmoStorage.listRoomProfiles(orgId(req), property.id);
        const findings = evaluateRooms({
          propertyId: property.id,
          rooms: rooms.map((r) => ({
            roomId: r.id,
            usableAreaM2: r.measuredUsableAreaM2,
            ceilingHeightM: r.ceilingHeightM,
            occupantsAged10OrAbove: r.declaredPermittedOccupancy ?? 1,
            occupantsUnder10: 0,
          })),
        });
        res.json({ rooms, findings });
      } catch (error) {
        console.error("[hmo] rooms failed:", error);
        res.status(500).json({ message: "Failed to list room profiles" });
      }
    },
  );

  app.post(
    "/api/hmo/properties/:propertyId/rooms",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.write"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });
        const row = await hmoStorage.upsertRoomProfile({
          organizationId: orgId(req),
          propertyId: property.id,
          existingRoomId: req.body?.existingRoomId || null,
          roomType: req.body?.roomType || null,
          measuredUsableAreaM2:
            typeof req.body?.measuredUsableAreaM2 === "number"
              ? req.body.measuredUsableAreaM2
              : null,
          ceilingHeightM:
            typeof req.body?.ceilingHeightM === "number" ? req.body.ceilingHeightM : null,
          declaredPermittedOccupancy:
            typeof req.body?.declaredPermittedOccupancy === "number"
              ? req.body.declaredPermittedOccupancy
              : null,
          userId: req.user.id,
          id: req.body?.id || null,
        });
        res.status(201).json(row);
      } catch (error) {
        console.error("[hmo] upsert room failed:", error);
        res.status(500).json({ message: "Failed to save room profile" });
      }
    },
  );

  app.post(
    "/api/hmo/address-match",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.licence.confirm"),
    async (req: any, res) => {
      try {
        const result = scoreAddressMatch({
          propertyAddress: req.body?.propertyAddress,
          extractedAddress: req.body?.extractedAddress,
          propertyUprn: req.body?.propertyUprn,
          extractedUprn: req.body?.extractedUprn,
        });
        res.json(result);
      } catch (error) {
        console.error("[hmo] address match failed:", error);
        res.status(500).json({ message: "Address match failed" });
      }
    },
  );

  app.get(
    "/api/hmo/regulatory/sources",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        await seedBaselineRules(null);
        const sources = await hmoStorage.listRegulatorySources(orgId(req));
        const rules = await hmoStorage.listRuleVersions(orgId(req));
        res.json({ sources, rules });
      } catch (error) {
        console.error("[hmo] regulatory sources failed:", error);
        res.status(500).json({ message: "Failed to load regulatory sources" });
      }
    },
  );

  app.post(
    "/api/hmo/regulatory/sources/check",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.rule.approve"),
    async (req: any, res) => {
      try {
        const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
        const results = await runWeeklySourceWatcher({
          organizationId: orgId(req),
          sources,
        });
        res.json({ results });
      } catch (error) {
        console.error("[hmo] source check failed:", error);
        res.status(500).json({ message: "Source check failed" });
      }
    },
  );

  app.post(
    "/api/hmo/regulatory/rules/:id/approve",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.rule.approve"),
    async (req: any, res) => {
      try {
        const propertyIds = Array.isArray(req.body?.propertyIds)
          ? req.body.propertyIds.filter((id: unknown) => typeof id === "string")
          : [];
        const result = await approveRuleAndQueueImpact({
          organizationId: orgId(req),
          ruleVersionId: req.params.id,
          approverId: req.user.id,
          propertyIds,
        });
        res.json(result);
      } catch (error: any) {
        console.error("[hmo] rule approve failed:", error);
        res.status(400).json({ message: error?.message || "Rule approve failed" });
      }
    },
  );

  app.post(
    "/api/hmo/regulatory/diff-preview",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const diff = summariseSourceDiff({
          previousHash: req.body?.previousHash || null,
          nextContent: String(req.body?.nextContent || ""),
          sourceType: req.body?.sourceType || null,
        });
        res.json(diff);
      } catch (error) {
        console.error("[hmo] diff preview failed:", error);
        res.status(500).json({ message: "Diff preview failed" });
      }
    },
  );

  app.post(
    "/api/hmo/licences/bulk-import",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.licence.upload"),
    async (req: any, res) => {
      try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const result = await bulkImportLicences({
          organizationId: orgId(req),
          userId: req.user.id,
          items,
        });
        res.status(201).json(result);
      } catch (error) {
        console.error("[hmo] bulk import failed:", error);
        res.status(500).json({ message: "Bulk import failed" });
      }
    },
  );

  app.get(
    "/api/hmo/integrations/reapit/occupancy-hint",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.occupancy.read"),
    async (req: any, res) => {
      try {
        const externalId = String(req.query.externalId || "");
        const hint = await fetchReapitOccupancyHint({ propertyExternalId: externalId });
        res.json(hint);
      } catch (error) {
        console.error("[hmo] reapit hint failed:", error);
        res.status(500).json({ message: "Reapit hint failed" });
      }
    },
  );

  app.post(
    "/api/hmo/uploads/meta",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.licence.upload"),
    async (req: any, res) => {
      try {
        const meta = buildImmutableUploadMeta({
          content: String(req.body?.content || ""),
          mime: req.body?.mime || "text/plain",
          fileName: req.body?.fileName,
          objectUrl: req.body?.objectUrl,
        });
        res.json(meta);
      } catch (error: any) {
        res.status(400).json({ message: error?.message || "Invalid upload meta" });
      }
    },
  );

}
