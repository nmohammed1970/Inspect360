import type { Response, NextFunction } from "express";
import { isOrgReadOnly } from "./planLimits";

/**
 * Blocks mutating billing actions when org is in payment-failure read-only.
 * View/export routes should not use this middleware.
 */
export async function blockIfBillingReadOnly(req: any, res: Response, next: NextFunction) {
  try {
    const orgId = req.user?.organizationId as string | undefined;
    if (!orgId) return next();
    if (await isOrgReadOnly(orgId)) {
      return res.status(403).json({
        message: "Account is read-only due to payment failure. Update billing to continue.",
        code: "BILLING_READ_ONLY",
      });
    }
    return next();
  } catch {
    return next();
  }
}
