import type { Response, NextFunction } from "express";
import { storage as appStorage } from "../storage";
import * as feedbackStorage from "./storage";

/** Normalize Eco-Admin session onto req.user for shared handlers. */
export function ensureFeedbackActorUser(req: any) {
  const adminUser = (req.session as any)?.adminUser;
  if (adminUser?.email) {
    req.user = {
      id: adminUser.id || req.user?.id || `admin:${adminUser.email}`,
      email: adminUser.email,
      firstName: adminUser.firstName || "",
      lastName: adminUser.lastName || "",
      username: adminUser.email,
    };
  }
  return req.user;
}

/** Platform Eco-Admin (admins table) OR active Feature Admin membership. */
export async function isFeatureAdminActor(req: any): Promise<{
  ok: boolean;
  isPlatformAdmin: boolean;
  canManageTeam: boolean;
  email: string | null;
}> {
  ensureFeedbackActorUser(req);
  const email = String(req.user?.email || (req.session as any)?.adminUser?.email || "")
    .trim()
    .toLowerCase();
  if (!email) return { ok: false, isPlatformAdmin: false, canManageTeam: false, email: null };

  let isPlatformAdmin = false;
  try {
    const adminUser = await appStorage.getAdminByEmail(email);
    isPlatformAdmin = Boolean(adminUser);
  } catch {
    isPlatformAdmin = false;
  }

  const isMember = await feedbackStorage.isActiveFeatureAdmin(email);
  const canManageTeam =
    isPlatformAdmin || (await feedbackStorage.canManageFeatureAdminTeam(email));

  return {
    ok: isPlatformAdmin || isMember,
    isPlatformAdmin,
    canManageTeam,
    email,
  };
}

export function requireFeatureAdmin() {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      ensureFeedbackActorUser(req);
      const actor = await isFeatureAdminActor(req);
      if (!actor.ok) {
        return res.status(403).json({ message: "Feature Admin access required" });
      }
      req.featureAdmin = actor;
      next();
    } catch (error) {
      console.error("[feedback] requireFeatureAdmin:", error);
      res.status(500).json({ message: "Authorization failed" });
    }
  };
}

export function requireFeatureAdminTeamManager() {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      ensureFeedbackActorUser(req);
      const actor = await isFeatureAdminActor(req);
      if (!actor.ok || !actor.canManageTeam) {
        return res.status(403).json({ message: "Team manager access required" });
      }
      req.featureAdmin = actor;
      next();
    } catch (error) {
      console.error("[feedback] requireFeatureAdminTeamManager:", error);
      res.status(500).json({ message: "Authorization failed" });
    }
  };
}

export async function canAccessFeedbackCase(
  req: any,
  feedback: { reporterUserId: string },
): Promise<boolean> {
  if (!req.user?.id) return false;
  if (feedback.reporterUserId === req.user.id) return true;
  const actor = await isFeatureAdminActor(req);
  return actor.ok;
}
