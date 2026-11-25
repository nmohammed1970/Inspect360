import type { Express, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { teamMembers } from "@shared/schema";
import {
  acceptWorkOrderOffer,
  loadAcceptOfferContext,
  type TeamMemberOfferRow,
} from "./workOrderAcceptOffers";
import { storage } from "../storage";

export function registerPublicWorkOrderAcceptRoutes(app: Express) {
  app.get("/api/public/work-orders/accept/:token", async (req, res: Response) => {
    try {
      const loaded = await loadAcceptOfferContext(req.params.token);
      if (!loaded) {
        return res.status(404).json({ message: "Link is invalid or expired" });
      }

      const { workOrder, request, propertyName, propertyAddress, canAccept, alreadyAssigned } =
        loaded;

      res.json({
        workOrderId: workOrder.id,
        status: workOrder.status,
        title: request.title,
        description: request.description || null,
        priority: request.priority,
        propertyName,
        propertyAddress,
        photoUrls: Array.isArray(request.photoUrls) ? request.photoUrls : [],
        slaDue: workOrder.slaDue,
        canAccept,
        alreadyAssigned,
      });
    } catch (error: any) {
      console.error("[public wo accept GET]", error);
      res.status(500).json({ message: "Failed to load work order" });
    }
  });

  app.post("/api/public/work-orders/accept/:token", async (req, res: Response) => {
    try {
      const loaded = await loadAcceptOfferContext(req.params.token);
      if (!loaded) {
        return res.status(404).json({ message: "Link is invalid or expired" });
      }

      if (!loaded.canAccept) {
        return res.status(409).json({
          message: "This work order has already been assigned to another team member.",
          alreadyAssigned: true,
        });
      }

      const members = (await storage.getTeamMembers(
        loaded.workOrder.teamId || "",
      )) as TeamMemberOfferRow[];
      let member = members.find((m) => m.id === loaded.tokenRow.teamMemberId);

      if (!member) {
        const [row] = await db
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.id, loaded.tokenRow.teamMemberId))
          .limit(1);
        if (!row) {
          return res.status(403).json({ message: "You are no longer on this team." });
        }
        member = {
          id: row.id,
          userId: row.userId,
          contactId: row.contactId,
          contact: row.contactId
            ? await storage.getContact(row.contactId).then((c) =>
                c
                  ? {
                      firstName: c.firstName,
                      lastName: c.lastName,
                      email: c.email,
                      phone: c.phone,
                      linkedUserId: c.linkedUserId,
                    }
                  : null,
              )
            : null,
        };
      }

      const result = await acceptWorkOrderOffer({
        tokenRow: loaded.tokenRow,
        member,
      });

      if (!result.ok) {
        return res.status(409).json({
          message: "This work order has already been assigned to another team member.",
          alreadyAssigned: true,
          reason: result.reason,
        });
      }

      res.json({
        status: "assigned",
        workOrderId: result.workOrder.id,
        assignedToId: result.workOrder.assignedToId,
      });
    } catch (error: any) {
      console.error("[public wo accept POST]", error);
      res.status(500).json({ message: "Failed to accept work order" });
    }
  });
}
