import type { Express } from "express";
import {
  CreditRequestError,
  countOpenCreditRequests,
  getCreditRequest,
  grantCreditRequest,
  listCreditRequests,
} from "./creditRequestService";

type Guard = (req: any, res: any, next: any) => void;

/**
 * Customer credit-request submission is retired (self-serve Pricing / Stripe).
 * Admin list/grant endpoints remain for clearing any legacy open requests.
 */
export function registerCreditRequestRoutes(app: Express, isAuthenticated: Guard, isAdminAuthenticated: Guard) {
  app.post("/api/credit-requests", isAuthenticated, async (_req: any, res) => {
    return res.status(410).json({
      message: "Credit requests are no longer used. Please buy credits or subscribe from Pricing.",
      code: "CREDIT_REQUESTS_RETIRED",
      pricingPath: "/pricing",
    });
  });

  app.get("/api/admin/credit-requests/open-count", isAdminAuthenticated, async (_req, res) => {
    try {
      const count = await countOpenCreditRequests();
      res.json({ count });
    } catch (error) {
      console.error("[CreditRequest] open count failed:", error);
      res.status(500).json({ message: "Failed to load credit requests" });
    }
  });

  app.get("/api/admin/credit-requests", isAdminAuthenticated, async (req, res) => {
    try {
      const page = Number(req.query.page);
      const result = await listCreditRequests({
        q: typeof req.query.q === "string" ? req.query.q : "",
        status: typeof req.query.status === "string" ? req.query.status : "",
        page: Number.isFinite(page) ? page : 1,
      });
      res.json(result);
    } catch (error) {
      console.error("[CreditRequest] list failed:", error);
      res.status(500).json({ message: "Failed to load credit requests" });
    }
  });

  app.get("/api/admin/credit-requests/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const request = await getCreditRequest(req.params.id);
      res.json(request);
    } catch (error) {
      if (error instanceof CreditRequestError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("[CreditRequest] detail failed:", error);
      res.status(500).json({ message: "Failed to load credit request" });
    }
  });

  app.post("/api/admin/credit-requests/:id/grant", isAdminAuthenticated, async (req: any, res) => {
    try {
      const adminId = req.session?.adminUser?.id;
      if (!adminId) {
        return res.status(403).json({ message: "Admin session required" });
      }
      const request = await grantCreditRequest(req.params.id, adminId);
      res.json(request);
    } catch (error) {
      if (error instanceof CreditRequestError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("[CreditRequest] grant failed:", error);
      res.status(500).json({ message: "Failed to update credit request" });
    }
  });
}
