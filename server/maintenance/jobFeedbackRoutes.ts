import type { Express, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, requireCompanyModule, requireRole } from "../auth";

const submitSchema = z.object({
  rating: z.number().int().min(1).max(5),
  improvementNotes: z.string().max(4000).optional().nullable(),
  email: z.string().email().optional().nullable(),
});

export function registerMaintenanceJobFeedbackRoutes(app: Express) {
  app.get("/api/public/maintenance-feedback/:token", async (req, res: Response) => {
    try {
      const row = await storage.getMaintenanceJobFeedbackByToken(req.params.token);
      if (!row) {
        return res.status(404).json({ message: "Feedback link invalid or expired" });
      }
      const detailed = await storage.getWorkOrderDetailed(row.workOrderId);
      const contractor = detailed?.contractor;
      const contractorName = contractor
        ? [contractor.firstName, contractor.lastName].filter(Boolean).join(" ") ||
          contractor.companyName ||
          null
        : detailed?.team?.name || null;

      res.json({
        jobTitle: detailed?.maintenanceRequest?.title || "Maintenance job",
        propertyName: detailed?.property?.name || null,
        contractorName,
        alreadySubmitted: !!row.submittedAt,
        rating: row.rating,
        improvementNotes: row.improvementNotes,
      });
    } catch (error: any) {
      console.error("[jobFeedback] public get failed:", error);
      res.status(500).json({ message: "Failed to load feedback form" });
    }
  });

  app.post("/api/public/maintenance-feedback/:token", async (req, res: Response) => {
    try {
      const row = await storage.getMaintenanceJobFeedbackByToken(req.params.token);
      if (!row) {
        return res.status(404).json({ message: "Feedback link invalid or expired" });
      }
      if (row.submittedAt) {
        return res.status(409).json({ message: "Feedback already submitted" });
      }

      const parsed = submitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid rating or notes" });
      }

      const updated = await storage.submitMaintenanceJobFeedback(req.params.token, {
        rating: parsed.data.rating,
        improvementNotes: parsed.data.improvementNotes ?? null,
        submittedByEmail: parsed.data.email ?? null,
      });

      res.json({
        ok: true,
        rating: updated.rating,
        submittedAt: updated.submittedAt,
      });
    } catch (error: any) {
      console.error("[jobFeedback] public submit failed:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  app.get(
    "/api/maintenance/job-feedback",
    isAuthenticated,
    requireCompanyModule("maintenance"),
    requireRole("owner", "maintenance_admin", "clerk"),
    async (req: any, res: Response) => {
      try {
        const user = await storage.getUser(req.user.id);
        if (!user?.organizationId) {
          return res.status(403).json({ error: "No organization found" });
        }
        const rows = await storage.listMaintenanceJobFeedbackByOrganization(user.organizationId);
        res.json(rows);
      } catch (error: any) {
        console.error("[jobFeedback] list failed:", error);
        res.status(500).json({ error: "Failed to list maintenance feedback" });
      }
    },
  );
}
