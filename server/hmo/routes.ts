import type { Express, Response, NextFunction } from "express";
import { randomBytes, randomUUID } from "crypto";
import multer from "multer";
import { isAuthenticated, requireCompanyModule } from "../auth";
import { storage as appStorage } from "../storage";
import { ObjectStorageService } from "../objectStorage";
import { hasHmoPermission, evaluatePreTenancyCheck, type HmoPermission } from "@shared/hmo";
import { extractLicenceFromText } from "./extraction";
import { runAssessment } from "./assessmentRunner";
import * as hmoStorage from "./storage";
import { buildOccupancyFromTenancies, evaluateRooms } from "./occupancy";
import { preAggregateDashboardMetrics } from "./metrics";
import { triggerPropertyReassessment } from "./reassessmentTriggers";
import { processRenewalAlertsForOrg } from "./renewalAlerts";
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
import {
  createOrReuseMaintenanceForFinding,
  findOpenMaintenanceForFinding,
  isMaintenanceModuleEnabled,
} from "./maintenanceFromFindings";
import {
  approveRuleAndQueueImpact,
  runWeeklySourceWatcher,
  seedBaselineRules,
  summariseSourceDiff,
} from "./regulatory";
import { processQueuedRuleImpactRuns } from "./impactWorker";

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

async function assertPropertyInOrg(propertyId: string, organizationId: string) {
  const property = await appStorage.getProperty(propertyId);
  if (!property || property.organizationId !== organizationId) {
    return null;
  }
  return property;
}

export function registerHmoRoutes(app: Express) {
  const moduleGate = requireCompanyModule("hmo_compliance");

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
          // Dedupe only within this property — same file is allowed on other properties.
          const existing = await hmoStorage.findLicenceVersionByHash(
            orgId(req),
            contentHash,
            property.id,
          );
          if (existing) {
            const extraction = await extractLicenceFromText(extractedText || "", documentId);
            const refreshed = await hmoStorage.refreshLicenceVersionExtraction({
              organizationId: orgId(req),
              versionId: existing.id,
              extraction,
              userId: req.user.id,
              pageCount,
              objectUrl,
              fileName,
            });
            const job = await hmoStorage.createJob({
              organizationId: orgId(req),
              propertyId: property.id,
              jobType: "LICENCE_EXTRACT",
              userId: req.user.id,
              licenceVersionId: existing.id,
              idempotencyKey: `upload:${property.id}:${contentHash}:rextract:${Date.now()}`,
              status: "COMPLETED",
              progress: 100,
              resultJson: {
                deduped: true,
                reextracted: true,
                licenceVersionId: existing.id,
              },
            });
            return res.status(200).json({
              jobId: job.id,
              licenceVersionId: refreshed?.id || existing.id,
              deduped: true,
              reextracted: true,
              objectUrl: refreshed?.originalObjectUrl || objectUrl,
              contentHash,
              message:
                "Identical file already stored on this property — extraction refreshed. Review fields and save again.",
            });
          }
        }

        const job = await hmoStorage.createJob({
          organizationId: orgId(req),
          propertyId: property.id,
          jobType: "LICENCE_EXTRACT",
          userId: req.user.id,
          idempotencyKey: contentHash
            ? `upload:${property.id}:${contentHash}:${Date.now()}`
            : undefined,
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
    "/api/hmo/properties/:propertyId/licences/manual",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.licence.confirm"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });

        const extraction = req.body?.extraction;
        if (!extraction || typeof extraction !== "object") {
          return res.status(400).json({ message: "extraction is required" });
        }

        const existing = await hmoStorage.listLicences(orgId(req), property.id);
        const primary = existing[0];
        const currentVersionId = primary?.currentVersionId || primary?.versions?.[0]?.id || null;

        if (currentVersionId) {
          const updated = await hmoStorage.confirmLicenceVersion({
            organizationId: orgId(req),
            versionId: currentVersionId,
            userId: req.user.id,
            extraction,
          });
          if (!updated) return res.status(404).json({ message: "Licence version not found" });
          return res.json({
            licenceId: primary!.id,
            licenceVersionId: updated.id,
            manual: true,
            updated: true,
          });
        }

        const created = await hmoStorage.createLicenceWithVersion({
          organizationId: orgId(req),
          propertyId: property.id,
          userId: req.user.id,
          fileName: "Manual entry",
          extraction,
        });
        const confirmed = await hmoStorage.confirmLicenceVersion({
          organizationId: orgId(req),
          versionId: created.version.id,
          userId: req.user.id,
          extraction,
        });

        return res.status(201).json({
          licenceId: created.licence.id,
          licenceVersionId: confirmed?.id || created.version.id,
          manual: true,
          created: true,
        });
      } catch (error) {
        console.error("[hmo] manual licence save failed:", error);
        res.status(500).json({ message: "Failed to save licence details" });
      }
    },
  );

  app.patch(
    "/api/hmo/properties/:propertyId/summary",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.licence.confirm"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });

        const parseOptionalInt = (value: unknown): number | null | undefined => {
          if (value === undefined) return undefined;
          if (value === null || value === "") return null;
          const n = Number(value);
          return Number.isFinite(n) ? Math.trunc(n) : null;
        };

        const result = await hmoStorage.upsertPropertySummary({
          organizationId: orgId(req),
          propertyId: property.id,
          userId: req.user.id,
          borough:
            req.body?.borough === undefined
              ? undefined
              : req.body?.borough
                ? String(req.body.borough).trim()
                : null,
          lifecycleStatus:
            typeof req.body?.lifecycleStatus === "string" ? req.body.lifecycleStatus : null,
          expiryDate:
            req.body?.expiryDate === undefined
              ? undefined
              : req.body?.expiryDate
                ? String(req.body.expiryDate).slice(0, 10)
                : null,
          maxPersons: parseOptionalInt(req.body?.maxPersons),
          occupantsNow: parseOptionalInt(req.body?.occupantsNow),
        });

        let profile = null;
        if (
          req.body?.licenceEvidenceStatus !== undefined ||
          req.body?.licenceEvidenceNotes !== undefined
        ) {
          profile = await hmoStorage.updateLicenceEvidenceStatus({
            organizationId: orgId(req),
            propertyId: property.id,
            userId: req.user.id,
            licenceEvidenceStatus:
              req.body?.licenceEvidenceStatus === undefined
                ? undefined
                : req.body?.licenceEvidenceStatus
                  ? String(req.body.licenceEvidenceStatus)
                  : "UNKNOWN",
            licenceEvidenceNotes:
              req.body?.licenceEvidenceNotes === undefined
                ? undefined
                : req.body?.licenceEvidenceNotes == null
                  ? null
                  : String(req.body.licenceEvidenceNotes),
          });
        }

        res.json({ ...result, profile });
      } catch (error) {
        console.error("[hmo] summary update failed:", error);
        res.status(500).json({ message: "Failed to update property summary" });
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

        const licence = await hmoStorage.getLicence(orgId(req), updated.licenceId);
        let reassessment = null;
        if (licence?.propertyId) {
          try {
            reassessment = await triggerPropertyReassessment({
              organizationId: orgId(req),
              propertyId: licence.propertyId,
              userId: req.user.id,
              reason: "licence_confirmed",
            });
          } catch (reErr: any) {
            console.warn("[hmo] post-confirm reassessment:", reErr?.message || reErr);
          }
        }
        res.json({ ...updated, reassessment });
      } catch (error) {
        console.error("[hmo] confirm failed:", error);
        res.status(500).json({ message: "Failed to confirm licence version" });
      }
    },
  );

  app.post(
    "/api/hmo/findings/:id/alert-action",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.write"),
    async (req: any, res) => {
      try {
        const action = req.body?.action === "snooze" ? "snooze" : "dismiss";
        const reason = String(req.body?.reason || "").trim();
        if (!reason) return res.status(400).json({ message: "reason is required" });
        const updated = await hmoStorage.dismissOrSnoozeFinding({
          organizationId: orgId(req),
          findingId: req.params.id,
          userId: req.user.id,
          action,
          reason,
          snoozeDays: typeof req.body?.snoozeDays === "number" ? req.body.snoozeDays : 7,
          reviewerDecision:
            typeof req.body?.reviewerDecision === "string" ? req.body.reviewerDecision : null,
        });
        if (!updated) return res.status(404).json({ message: "Finding not found" });
        res.json(updated);
      } catch (error: any) {
        console.error("[hmo] alert action failed:", error);
        const status = error?.status || 500;
        res.status(status).json({ message: error?.message || "Alert action failed" });
      }
    },
  );

  app.post(
    "/api/hmo/findings/:id/maintenance-request",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.write"),
    async (req: any, res) => {
      try {
        const finding = await hmoStorage.getFinding(orgId(req), req.params.id);
        if (!finding) return res.status(404).json({ message: "Finding not found" });
        if (!finding.propertyId) {
          return res.status(400).json({ message: "Finding is not linked to a property" });
        }
        const result = await createOrReuseMaintenanceForFinding({
          organizationId: orgId(req),
          propertyId: finding.propertyId,
          userId: req.user.id,
          finding,
          force: true,
        });
        if (result.maintenanceDisabled) {
          return res.status(403).json({
            code: "COMPANY_MODULE_DISABLED",
            module: "maintenance",
            message:
              "Maintenance module is required to raise work orders from HMO findings. The finding remains visible.",
          });
        }
        res.status(result.created ? 201 : 200).json(result);
      } catch (error: any) {
        console.error("[hmo] finding maintenance failed:", error);
        res.status(500).json({ message: error?.message || "Failed to create maintenance request" });
      }
    },
  );

  app.get(
    "/api/hmo/findings/:id/maintenance-request",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const finding = await hmoStorage.getFinding(orgId(req), req.params.id);
        if (!finding) return res.status(404).json({ message: "Finding not found" });
        const enabled = await isMaintenanceModuleEnabled(orgId(req));
        const existing = await findOpenMaintenanceForFinding(orgId(req), finding);
        res.json({ maintenanceEnabled: enabled, maintenanceRequest: existing });
      } catch (error) {
        console.error("[hmo] finding maintenance lookup failed:", error);
        res.status(500).json({ message: "Failed to look up maintenance request" });
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

        const result = evaluatePreTenancyCheck({
          maxPersons,
          confirmedPersons,
          proposedAdditional,
        });
        res.json(result);
      } catch (error) {
        console.error("[hmo] occupancy-check failed:", error);
        res.status(500).json({ message: "Occupancy check failed" });
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
        let reassessment = null;
        try {
          reassessment = await triggerPropertyReassessment({
            organizationId: orgId(req),
            propertyId: property.id,
            userId: req.user.id,
            reason: "occupancy_changed",
          });
        } catch (reErr: any) {
          console.warn("[hmo] post-occupancy reassessment:", reErr?.message || reErr);
        }
        res.status(201).json({ ...result, reassessment });
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
          roomName: req.body?.roomName != null ? String(req.body.roomName) : null,
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
          sleepingApproved:
            typeof req.body?.sleepingApproved === "boolean" ? req.body.sleepingApproved : true,
          measurementSource:
            typeof req.body?.measurementSource === "string"
              ? req.body.measurementSource
              : undefined,
          humanConfirmed:
            typeof req.body?.humanConfirmed === "boolean" ? req.body.humanConfirmed : undefined,
          userId: req.user.id,
          id: req.body?.id || null,
        });
        let reassessment = null;
        try {
          reassessment = await triggerPropertyReassessment({
            organizationId: orgId(req),
            propertyId: property.id,
            userId: req.user.id,
            reason: "rooms_updated",
          });
        } catch (reErr: any) {
          console.warn("[hmo] post-room reassessment:", reErr?.message || reErr);
        }
        res.status(201).json({ ...row, reassessment });
      } catch (error) {
        console.error("[hmo] upsert room failed:", error);
        res.status(500).json({ message: "Failed to save room profile" });
      }
    },
  );

  app.post(
    "/api/hmo/properties/:propertyId/rooms/import-from-property",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.write"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });
        const result = await hmoStorage.importPropertyRoomsIntoHmo({
          organizationId: orgId(req),
          propertyId: property.id,
          userId: req.user.id,
        });
        res.status(201).json({
          ...result,
          note: "Imported measurements are suggested until you confirm them on each room.",
        });
      } catch (error: any) {
        console.error("[hmo] import property rooms failed:", error);
        res.status(500).json({ message: error?.message || "Failed to import rooms" });
      }
    },
  );

  app.get(
    "/api/hmo/properties/:propertyId/export",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.case.read"),
    async (req: any, res) => {
      try {
        const property = await assertPropertyInOrg(req.params.propertyId, orgId(req));
        if (!property) return res.status(404).json({ message: "Property not found" });
        const overview = await hmoStorage.getOverview(orgId(req), property.id);
        const { buildHmoAssessmentPdf } = await import("../hmoReportPdf");
        const pdf = await buildHmoAssessmentPdf({
          propertyAddress: property.address || property.name || property.id,
          overallStatus: overview.profile?.overallStatus || "NOT_ASSESSED",
          evidenceCompleteness: overview.profile?.evidenceCompleteness || 0,
          findings: (overview.recentFindings || []).map((f: any) => ({
            checkId: f.checkId,
            status: f.status,
            severity: f.severity,
            reason: f.explanation || undefined,
          })),
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="hmo-evidence-${property.id.slice(0, 8)}.pdf"`,
        );
        res.send(Buffer.from(pdf));
      } catch (error) {
        console.error("[hmo] export failed:", error);
        res.status(500).json({ message: "Failed to export HMO evidence pack" });
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
        // Drain impact queue immediately for small cohorts
        let impactResults = null;
        try {
          impactResults = await processQueuedRuleImpactRuns(10);
        } catch (wErr) {
          console.warn("[hmo] impact worker after approve:", wErr);
        }
        res.json({ ...result, impactResults });
      } catch (error: any) {
        console.error("[hmo] rule approve failed:", error);
        res.status(400).json({ message: error?.message || "Rule approve failed" });
      }
    },
  );

  app.post(
    "/api/hmo/regulatory/impact-runs/process",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.rule.approve"),
    async (_req: any, res) => {
      try {
        const results = await processQueuedRuleImpactRuns(20);
        res.json({ results });
      } catch (error) {
        console.error("[hmo] impact process failed:", error);
        res.status(500).json({ message: "Failed to process impact runs" });
      }
    },
  );

  app.post(
    "/api/hmo/regulatory/sources/watch",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.rule.approve"),
    async (req: any, res) => {
      try {
        const results = await runScheduledSourceWatcher(orgId(req));
        res.json({ results });
      } catch (error) {
        console.error("[hmo] source watch failed:", error);
        res.status(500).json({ message: "Source watch failed" });
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
        const { summariseSourceDiff } = await import("./regulatoryPure");
        const preview = summariseSourceDiff({
          previousHash: req.body?.previousHash || null,
          nextContent: String(req.body?.nextContent || ""),
          sourceType: req.body?.sourceType || "web",
        });
        res.json(preview);
      } catch (error: any) {
        console.error("[hmo] diff-preview failed:", error);
        res.status(400).json({ message: error?.message || "Diff preview failed" });
      }
    },
  );

  app.post(
    "/api/hmo/renewals/process",
    isAuthenticated,
    moduleGate,
    requireHmoPermission("hmo.notification.send"),
    async (req: any, res) => {
      try {
        const result = await processRenewalAlertsForOrg(orgId(req));
        const { processHmoInspectionRemindersForOrg } = await import("./inspectionReminders");
        const inspections = await processHmoInspectionRemindersForOrg(orgId(req));
        res.json({ ...result, inspections });
      } catch (error) {
        console.error("[hmo] renewal process failed:", error);
        res.status(500).json({ message: "Renewal processing failed" });
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
