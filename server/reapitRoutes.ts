import type { Express, Request, Response } from "express";
import express from "express";
import { requireRole } from "./auth";
import { storage } from "./storage";
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  extractCustomerIdFromAccessToken,
  parseOAuthState,
} from "./reapit/auth";
import {
  enqueueJob,
  findMappingByLocal,
  getConnectionByOrg,
  insertWebhookEvent,
  listSyncRuns,
  mappingCounts,
  upsertConnection,
} from "./reapit/repository";
import { enqueueInitialSync } from "./reapit/sync";
import { parseWebhookBody, verifyReapitWebhook } from "./reapit/webhook";

type Guard = (req: any, res: any, next: any) => void;

async function orgId(req: any, res: Response): Promise<string | null> {
  const user = await storage.getUser(req.user.id);
  if (!user?.organizationId) {
    res.status(403).json({ message: "Organisation required" });
    return null;
  }
  return user.organizationId;
}

export function registerReapitRoutes(app: Express, isAuthenticated: Guard) {
  app.get("/api/reapit/connection", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const organizationId = await orgId(req, res);
      if (!organizationId) return;
      const connection = await getConnectionByOrg(organizationId);
      const runs = await listSyncRuns(organizationId, 1);
      const counts = await mappingCounts(organizationId);
      res.json({
        status: connection?.status || "disconnected",
        reapitCustomerId: connection?.reapitCustomerId || null,
        lastError: connection?.lastError || null,
        connectedAt: connection?.connectedAt || null,
        lastSync: runs[0] || null,
        counts,
        configured: Boolean(process.env.REAPIT_CLIENT_ID),
      });
    } catch (error: any) {
      console.error("[Reapit] connection status failed:", error.message);
      res.status(500).json({ message: "Failed to load Reapit connection" });
    }
  });

  app.get("/api/reapit/connect", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const organizationId = await orgId(req, res);
      if (!organizationId) return;
      const url = buildAuthorizeUrl(organizationId);
      res.json({ url });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Reapit is not configured" });
    }
  });

  app.get("/api/reapit/oauth/callback", async (req: Request, res: Response) => {
    try {
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      if (!code || !state) return res.status(400).send("Missing OAuth code or state");
      const { organizationId } = parseOAuthState(state);
      const tokens = await exchangeAuthorizationCode(code);
      const customerId = extractCustomerIdFromAccessToken(tokens.accessToken);
      await upsertConnection({
        organizationId,
        reapitCustomerId: customerId,
        status: "connected",
        tokens,
        lastError: customerId ? null : "Connected but customer id was not in the token. Complete AppMarket install or reconnect.",
      });
      await enqueueInitialSync(organizationId, "initial");
      res.redirect("/settings?section=integrations&reapit=connected");
    } catch (error: any) {
      console.error("[Reapit] OAuth callback failed:", error.message);
      res.redirect("/settings?section=integrations&reapit=error");
    }
  });

  app.post("/api/reapit/sync", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const organizationId = await orgId(req, res);
      if (!organizationId) return;
      const connection = await getConnectionByOrg(organizationId);
      if (!connection || connection.status !== "connected") {
        return res.status(400).json({ message: "Connect Reapit before syncing" });
      }
      const run = await enqueueInitialSync(organizationId, "manual");
      res.status(202).json(run);
    } catch (error: any) {
      console.error("[Reapit] enqueue sync failed:", error.message);
      res.status(500).json({ message: "Failed to start sync" });
    }
  });

  app.get("/api/reapit/sync-runs", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const organizationId = await orgId(req, res);
      if (!organizationId) return;
      res.json(await listSyncRuns(organizationId, 25));
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load sync history" });
    }
  });

  app.get("/api/reapit/mappings/property/:propertyId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const organizationId = await orgId(req, res);
      if (!organizationId) return;
      const mapping = await findMappingByLocal(organizationId, "property", "properties", req.params.propertyId);
      res.json(mapping || null);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load Reapit mapping" });
    }
  });

  app.post("/api/reapit/disconnect", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const organizationId = await orgId(req, res);
      if (!organizationId) return;
      const existing = await getConnectionByOrg(organizationId);
      await upsertConnection({
        organizationId,
        reapitCustomerId: existing?.reapitCustomerId,
        status: "disconnected",
        tokens: null,
      });
      res.json({ status: "disconnected" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to disconnect Reapit" });
    }
  });

  app.post("/api/webhooks/reapit", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
      const ok = await verifyReapitWebhook(raw, req.headers["x-signature"]);
      if (!ok) return res.status(401).json({ message: "Invalid signature" });
      const payload = parseWebhookBody(raw);
      if (!payload.eventId || !payload.topicId) return res.status(400).json({ message: "Invalid payload" });
      const { inserted } = await insertWebhookEvent({
        eventId: payload.eventId,
        topicId: payload.topicId,
        reapitEntityId: payload.entityId,
        reapitCustomerId: payload.customerId,
        payloadJson: JSON.parse(raw.toString("utf8")),
      });
      if (!inserted) return res.status(200).json({ duplicate: true });
      await enqueueJob({
        kind: "webhook",
        payloadJson: {
          eventId: payload.eventId,
          topicId: payload.topicId,
          customerId: payload.customerId,
          entityId: payload.entityId,
        },
      });
      res.status(200).json({ accepted: true });
    } catch (error: any) {
      console.error("[Reapit] webhook failed:", error.message);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });
}
