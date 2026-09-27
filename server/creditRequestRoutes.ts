import type { Express } from "express";
import { CreditRequestError, countOpenCreditRequests, createCreditRequest, getCreditRequest, grantCreditRequest, listCreditRequests } from "./creditRequestService";

type Guard = (req: any, res: any, next: any) => void;

function sendError(res: any, error: any) {
  if (error instanceof CreditRequestError) {
    return res.status(error.status).json({ message: error.message, field: error.field });
  }
  console.error("[CreditRequest]", error);
  return res.status(500).json({ message: "Unable to submit your credit request. Please try again." });
}

export function registerCreditRequestRoutes(app: Express, isAuthenticated: Guard, isAdminAuthenticated: Guard) {
  app.post("/api/credit-requests", isAuthenticated, async (req: any, res) => {
    try {
      const result = await createCreditRequest(req.user.id, req.body);
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      sendError(res, error);
    }
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
