import type { Express, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { isAuthenticated } from "../auth";
import { ObjectStorageService } from "../objectStorage";
import {
  createConversationBodySchema,
  editMessageBodySchema,
  ensureMaintenanceDiscussionBodySchema,
  forwardMessageBodySchema,
  isMessagingMimeAllowed,
  messagingMaxBytesForMime,
  MESSAGING_FILE_MAX_BYTES,
  MESSAGING_MAX_ATTACHMENTS,
  reactionBodySchema,
  sendMessageBodySchema,
} from "@shared/messagingSchema";
import { MessagingHttpError, requireMessagingUser } from "./access";
import {
  MESSAGING_SEND_LIMIT,
  MESSAGING_SEND_WINDOW_MS,
  MESSAGING_UPLOAD_LIMIT,
  MESSAGING_UPLOAD_WINDOW_MS,
  takeRateLimit,
} from "./rateLimit";
import * as messaging from "./service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MESSAGING_FILE_MAX_BYTES, files: MESSAGING_MAX_ATTACHMENTS },
});

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof MessagingHttpError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(`[messaging] ${fallback}:`, error);
  return res.status(500).json({ message: fallback });
}

export function registerMessagingRoutes(app: Express) {
  app.get("/api/messaging/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireMessagingUser(req.user.id);
      const count = await messaging.getUnreadCount(user.id);
      res.json({ count });
    } catch (error) {
      handleError(res, error, "Failed to load unread count");
    }
  });

  app.get("/api/messaging/directory", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireMessagingUser(req.user.id);
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const people = await messaging.getDirectory(user.organizationId, user.id, q);
      res.json(people);
    } catch (error) {
      handleError(res, error, "Failed to load directory");
    }
  });

  app.get("/api/messaging/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireMessagingUser(req.user.id);
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const rawCategory =
        typeof req.query.category === "string" ? req.query.category : "all";
      const category =
        rawCategory === "direct" || rawCategory === "maintenance"
          ? rawCategory
          : "all";
      const list = await messaging.listConversations(
        user.organizationId,
        user.id,
        q,
        category,
      );
      res.json(list);
    } catch (error) {
      handleError(res, error, "Failed to load conversations");
    }
  });

  app.post(
    "/api/messaging/maintenance-discussions",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const parsed = ensureMaintenanceDiscussionBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "maintenanceRequestId required" });
        }
        const conversation = await messaging.ensureMaintenanceDiscussion({
          organizationId: user.organizationId,
          maintenanceRequestId: parsed.data.maintenanceRequestId,
          createdById: user.id,
          actorRole: user.role,
        });
        res.status(201).json(conversation);
      } catch (error) {
        handleError(res, error, "Failed to open maintenance discussion");
      }
    },
  );

  app.post("/api/messaging/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireMessagingUser(req.user.id);
      const parsed = createConversationBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid conversation payload" });
      }
      const conversation = await messaging.createOrGetConversation({
        organizationId: user.organizationId,
        createdById: user.id,
        participantIds: parsed.data.participantIds,
        title: parsed.data.title,
      });
      res.status(201).json(conversation);
    } catch (error) {
      handleError(res, error, "Failed to create conversation");
    }
  });

  app.get("/api/messaging/conversations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireMessagingUser(req.user.id);
      const conversation = await messaging.getConversationDetail(
        user.organizationId,
        user.id,
        req.params.id,
      );
      res.json(conversation);
    } catch (error) {
      handleError(res, error, "Failed to load conversation");
    }
  });

  app.get(
    "/api/messaging/conversations/:id/messages",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const page = await messaging.listMessages({
          organizationId: user.organizationId,
          userId: user.id,
          conversationId: req.params.id,
          cursor,
          limit: Number.isFinite(limit) ? limit : undefined,
        });
        res.json(page);
      } catch (error) {
        handleError(res, error, "Failed to load messages");
      }
    },
  );

  app.post(
    "/api/messaging/conversations/:id/messages",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const limit = takeRateLimit(
          `send:${user.id}`,
          MESSAGING_SEND_LIMIT,
          MESSAGING_SEND_WINDOW_MS,
        );
        if (!limit.allowed) {
          res.setHeader("Retry-After", String(limit.retryAfterSec));
          return res.status(429).json({ message: "Too many messages. Try again shortly." });
        }
        const parsed = sendMessageBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid message payload" });
        }
        const message = await messaging.sendMessage({
          organizationId: user.organizationId,
          userId: user.id,
          conversationId: req.params.id,
          body: parsed.data.body,
          clientMessageId: parsed.data.clientMessageId,
          replyToMessageId: parsed.data.replyToMessageId,
          attachments: parsed.data.attachments,
        });
        res.status(201).json(message);
      } catch (error) {
        handleError(res, error, "Failed to send message");
      }
    },
  );

  app.post(
    "/api/messaging/conversations/:id/read",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const result = await messaging.markConversationRead({
          organizationId: user.organizationId,
          userId: user.id,
          conversationId: req.params.id,
        });
        res.json(result);
      } catch (error) {
        handleError(res, error, "Failed to mark conversation read");
      }
    },
  );

  app.get(
    "/api/messaging/conversations/:id/search",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const q = typeof req.query.q === "string" ? req.query.q : "";
        const results = await messaging.searchInConversation({
          organizationId: user.organizationId,
          userId: user.id,
          conversationId: req.params.id,
          q,
        });
        res.json(results);
      } catch (error) {
        handleError(res, error, "Failed to search messages");
      }
    },
  );

  app.patch("/api/messaging/messages/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireMessagingUser(req.user.id);
      const parsed = editMessageBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid edit payload" });
      }
      const message = await messaging.editMessage({
        organizationId: user.organizationId,
        userId: user.id,
        messageId: req.params.id,
        body: parsed.data.body,
      });
      res.json(message);
    } catch (error) {
      handleError(res, error, "Failed to edit message");
    }
  });

  app.delete("/api/messaging/messages/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireMessagingUser(req.user.id);
      const message = await messaging.deleteMessage({
        organizationId: user.organizationId,
        userId: user.id,
        messageId: req.params.id,
      });
      res.json(message);
    } catch (error) {
      handleError(res, error, "Failed to delete message");
    }
  });

  app.post(
    "/api/messaging/messages/:id/reactions",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const parsed = reactionBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid reaction" });
        }
        const message = await messaging.addReaction({
          organizationId: user.organizationId,
          userId: user.id,
          messageId: req.params.id,
          emoji: parsed.data.emoji,
        });
        res.json(message);
      } catch (error) {
        handleError(res, error, "Failed to add reaction");
      }
    },
  );

  app.delete(
    "/api/messaging/messages/:id/reactions",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const emoji =
          typeof req.body?.emoji === "string"
            ? req.body.emoji
            : typeof req.query.emoji === "string"
              ? req.query.emoji
              : "";
        if (!emoji) return res.status(400).json({ message: "emoji required" });
        const message = await messaging.removeReaction({
          organizationId: user.organizationId,
          userId: user.id,
          messageId: req.params.id,
          emoji,
        });
        res.json(message);
      } catch (error) {
        handleError(res, error, "Failed to remove reaction");
      }
    },
  );

  app.post(
    "/api/messaging/messages/:id/forward",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const parsed = forwardMessageBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid forward payload" });
        }
        const message = await messaging.forwardMessage({
          organizationId: user.organizationId,
          userId: user.id,
          messageId: req.params.id,
          targetConversationId: parsed.data.targetConversationId,
          clientMessageId: parsed.data.clientMessageId,
        });
        res.status(201).json(message);
      } catch (error) {
        handleError(res, error, "Failed to forward message");
      }
    },
  );

  app.post(
    "/api/messaging/attachments/upload",
    isAuthenticated,
    upload.array("files", MESSAGING_MAX_ATTACHMENTS),
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const limit = takeRateLimit(
          `upload:${user.id}`,
          MESSAGING_UPLOAD_LIMIT,
          MESSAGING_UPLOAD_WINDOW_MS,
        );
        if (!limit.allowed) {
          res.setHeader("Retry-After", String(limit.retryAfterSec));
          return res.status(429).json({ message: "Too many uploads. Try again shortly." });
        }

        const files = (req.files as Express.Multer.File[]) || [];
        if (!files.length) {
          return res.status(400).json({ message: "No files uploaded" });
        }
        if (files.length > MESSAGING_MAX_ATTACHMENTS) {
          return res.status(400).json({
            message: `Maximum ${MESSAGING_MAX_ATTACHMENTS} files per upload`,
          });
        }

        const objectStorage = new ObjectStorageService();
        const uploaded = [];
        for (const file of files) {
          const mime = file.mimetype || "application/octet-stream";
          if (!isMessagingMimeAllowed(mime)) {
            return res.status(400).json({ message: `Unsupported file type: ${mime}` });
          }
          const maxBytes = messagingMaxBytesForMime(mime);
          if (file.size > maxBytes) {
            return res.status(400).json({
              message: `File ${file.originalname} exceeds size limit`,
            });
          }
          const objectId = `msg-${createHash("sha256")
            .update(`${Date.now()}-${Math.random()}-${file.originalname}`)
            .digest("hex")
            .slice(0, 24)}`;
          const objectPath = await objectStorage.saveUploadedFile(
            objectId,
            file.buffer,
            mime,
          );
          try {
            await objectStorage.trySetObjectEntityAclPolicy(objectPath, {
              owner: user.id,
              visibility: "private",
            } as any);
          } catch {
            /* best-effort */
          }
          uploaded.push({
            objectPath,
            fileName: file.originalname || "file",
            mimeType: mime,
            byteSize: file.size,
          });
        }
        res.status(201).json({ files: uploaded });
      } catch (error) {
        handleError(res, error, "Failed to upload attachments");
      }
    },
  );

  app.get(
    "/api/messaging/attachments/:id/download",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const user = await requireMessagingUser(req.user.id);
        const attachment = await messaging.getAttachmentForParticipant({
          organizationId: user.organizationId,
          userId: user.id,
          attachmentId: req.params.id,
        });
        const objectStorage = new ObjectStorageService();
        const file = await objectStorage.getObjectEntityFile(attachment.objectPath);
        await objectStorage.downloadObject(
          file,
          res,
          3600,
          attachment.fileName,
        );
      } catch (error) {
        handleError(res, error, "Failed to download attachment");
      }
    },
  );
}
