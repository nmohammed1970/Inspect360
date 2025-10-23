// Backend API routes for Inspect360
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, requireRole } from "./auth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import Stripe from "stripe";
import OpenAI from "openai";
import { devRouter } from "./devRoutes";
import {
  insertBlockSchema,
  insertContactSchema,
  insertInventoryTemplateSchema,
  insertInventorySchema,
  insertInventoryItemSchema,
  insertWorkOrderSchema,
  insertWorkLogSchema,
  insertAssetInventorySchema,
  insertTagSchema,
  insertTemplateCategorySchema,
  insertInspectionTemplateSchema,
  insertTemplateInventoryLinkSchema,
  insertInspectionEntrySchema,
  insertAiImageAnalysisSchema
} from "@shared/schema";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

// Initialize OpenAI using Replit AI Integrations (lazy initialization)
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      throw new Error("OpenAI integration not configured. Please set up the AI Integrations.");
    }
    openai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    });
  }
  return openai;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // ==================== DEV ROUTES (Development Only) ====================
  if (process.env.NODE_ENV === "development") {
    app.use("/api/dev", devRouter);
  }

  // ==================== AUTH ROUTES ====================
  
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Include organization info if user belongs to one
      let organization = null;
      if (user.organizationId) {
        organization = await storage.getOrganization(user.organizationId);
      }
      
      res.json({ ...user, organization });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ==================== ORGANIZATION ROUTES ====================
  
  app.post("/api/organizations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Organization name is required" });
      }

      // Get current user data
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Create organization
      const organization = await storage.createOrganization({
        name,
        ownerId: userId,
        creditsRemaining: 5, // Give 5 free credits to start
      });

      // Update user with organization ID and set role to owner (preserving all existing fields)
      await storage.upsertUser({
        ...user,
        organizationId: organization.id,
        role: "owner",
      });

      // Create initial credit transaction for free credits
      await storage.createCreditTransaction({
        organizationId: organization.id,
        amount: 5,
        type: "purchase",
        description: "Welcome credits",
      });

      res.json(organization);
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  app.get("/api/organizations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const organizationId = req.params.id;
      
      const user = await storage.getUser(userId);
      if (!user?.organizationId || user.organizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  // ==================== TEAM MANAGEMENT ROUTES ====================
  
  app.get("/api/team", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      
      const organizationId = user.organizationId;

      const teamMembers = await storage.getUsersByOrganization(organizationId);
      res.json(teamMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.patch("/api/team/:userId/role", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const requesterId = req.user.id;
      const requester = await storage.getUser(requesterId);
      
      if (!requester?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      
      const { userId } = req.params;
      const { role } = req.body;
      const organizationId = requester.organizationId;

      if (!role || !["owner", "clerk", "compliance", "tenant"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Verify the user belongs to the same organization
      const targetUser = await storage.getUser(userId);
      if (!targetUser || targetUser.organizationId !== organizationId) {
        return res.status(403).json({ message: "User not found in your organization" });
      }

      // Prevent changing own role
      if (userId === req.user.id) {
        return res.status(400).json({ message: "Cannot change your own role" });
      }

      const updatedUser = await storage.updateUserRole(userId, role);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // ==================== CONTACT ROUTES ====================

  app.get("/api/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const contacts = await storage.getContactsByOrganization(user.organizationId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const contact = await storage.getContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      if (contact.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(contact);
    } catch (error) {
      console.error("Error fetching contact:", error);
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const validation = insertContactSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request data", details: validation.error });
      }
      
      const contact = await storage.createContact({
        ...validation.data,
        organizationId: user.organizationId
      });
      
      res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  app.patch("/api/contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const contact = await storage.getContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      if (contact.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const { organizationId: _, ...updateData } = req.body;
      
      const updatedContact = await storage.updateContact(req.params.id, updateData);
      res.json(updatedContact);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  app.delete("/api/contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const contact = await storage.getContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      if (contact.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deleteContact(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // ==================== PROPERTY ROUTES ====================
  
  app.post("/api/properties", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      
      const { name, address, blockId } = req.body;
      
      if (!name || !address) {
        return res.status(400).json({ message: "Name and address are required" });
      }

      const property = await storage.createProperty({
        organizationId: user.organizationId,
        name,
        address,
        blockId: blockId || null,
      });

      res.json(property);
    } catch (error) {
      console.error("Error creating property:", error);
      res.status(500).json({ message: "Failed to create property" });
    }
  });

  app.get("/api/properties", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.json([]);
      }

      const properties = await storage.getPropertiesByOrganization(user.organizationId);
      res.json(properties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  app.get("/api/properties/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const property = await storage.getProperty(id);
      
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      res.json(property);
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({ message: "Failed to fetch property" });
    }
  });

  // ==================== USER ROUTES ====================
  
  app.get("/api/users/clerks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.json([]);
      }

      const users = await storage.getUsersByOrganizationAndRole(user.organizationId, "clerk");
      res.json(users);
    } catch (error) {
      console.error("Error fetching clerks:", error);
      res.status(500).json({ message: "Failed to fetch clerks" });
    }
  });

  // ==================== PROPERTY BY BLOCK ROUTES ====================
  
  // Get properties by block
  app.get("/api/blocks/:blockId/properties", isAuthenticated, async (req, res) => {
    try {
      const { blockId } = req.params;
      const properties = await storage.getPropertiesByBlock(blockId);
      res.json(properties);
    } catch (error) {
      console.error("Error fetching properties for block:", error);
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  // ==================== INSPECTION ROUTES ====================
  
  app.post("/api/inspections", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const currentUser = await storage.getUser(userId);
      const { propertyId, blockId, type, scheduledDate, notes, clerkId } = req.body;
      
      // Must specify either propertyId OR blockId (not both)
      if ((!propertyId && !blockId) || (propertyId && blockId)) {
        return res.status(400).json({ message: "Must specify either propertyId OR blockId (not both)" });
      }
      
      if (!type) {
        return res.status(400).json({ message: "Inspection type is required" });
      }

      if (!currentUser?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Use provided clerkId if available, otherwise assign to current user
      let inspectorId = userId;
      
      if (clerkId) {
        // Validate that the clerk belongs to the same organization
        const clerk = await storage.getUser(clerkId);
        if (!clerk || clerk.organizationId !== currentUser.organizationId) {
          return res.status(400).json({ message: "Invalid clerk assignment - clerk must belong to your organization" });
        }
        inspectorId = clerkId;
      }

      const inspection = await storage.createInspection({
        propertyId: propertyId || null,
        blockId: blockId || null,
        inspectorId,
        type,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
        notes,
      });

      res.json(inspection);
    } catch (error) {
      console.error("Error creating inspection:", error);
      res.status(500).json({ message: "Failed to create inspection" });
    }
  });

  app.get("/api/inspections/my", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.json([]);
      }

      // Owners see all inspections in their organization
      // Clerks see only inspections assigned to them
      let inspections;
      if (user.role === "owner" || user.role === "compliance") {
        inspections = await storage.getInspectionsByOrganization(user.organizationId);
      } else {
        inspections = await storage.getInspectionsByInspector(userId);
      }
      
      res.json(inspections);
    } catch (error) {
      console.error("Error fetching inspections:", error);
      res.status(500).json({ message: "Failed to fetch inspections" });
    }
  });

  app.get("/api/inspections/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const inspection = await storage.getInspection(id);
      
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Get inspection items
      const items = await storage.getInspectionItems(id);
      
      res.json({ ...inspection, items });
    } catch (error) {
      console.error("Error fetching inspection:", error);
      res.status(500).json({ message: "Failed to fetch inspection" });
    }
  });

  app.patch("/api/inspections/:id/status", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const inspection = await storage.updateInspectionStatus(
        id,
        status,
        status === "completed" ? new Date() : undefined
      );

      res.json(inspection);
    } catch (error) {
      console.error("Error updating inspection status:", error);
      res.status(500).json({ message: "Failed to update inspection status" });
    }
  });

  // ==================== INSPECTION RESPONSE ROUTES ====================

  // Create or update inspection response
  app.post("/api/inspections/:inspectionId/responses", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify inspection exists
      const inspection = await storage.getInspection(req.params.inspectionId);
      if (!inspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }

      // Verify inspection belongs to user's organization via property or block
      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property || property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block || block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      // Prevent inspectionId override from request body
      const { inspectionId: _, ...safeBody } = req.body;
      const response = await storage.createInspectionResponse({
        ...safeBody,
        inspectionId: req.params.inspectionId,
      });

      res.json(response);
    } catch (error) {
      console.error("Error creating inspection response:", error);
      res.status(500).json({ error: "Failed to create inspection response" });
    }
  });

  // Get all responses for an inspection
  app.get("/api/inspections/:inspectionId/responses", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify inspection exists
      const inspection = await storage.getInspection(req.params.inspectionId);
      if (!inspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }

      // Verify inspection belongs to user's organization via property or block
      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property || property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block || block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const responses = await storage.getInspectionResponses(req.params.inspectionId);
      res.json(responses);
    } catch (error) {
      console.error("Error fetching inspection responses:", error);
      res.status(500).json({ error: "Failed to fetch inspection responses" });
    }
  });

  // Update inspection response
  app.patch("/api/inspection-responses/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Get the response to find its inspection
      const existingResponse = await storage.getInspectionResponse(req.params.id);
      if (!existingResponse) {
        return res.status(404).json({ error: "Response not found" });
      }

      // Verify the inspection belongs to user's organization
      const inspection = await storage.getInspection(existingResponse.inspectionId);
      if (!inspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }

      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property || property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block || block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      // Prevent inspectionId changes in updates
      const { inspectionId: _, ...safeUpdates } = req.body;
      const updated = await storage.updateInspectionResponse(req.params.id, safeUpdates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating inspection response:", error);
      res.status(500).json({ error: "Failed to update inspection response" });
    }
  });

  // Delete inspection response
  app.delete("/api/inspection-responses/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Get the response to find its inspection
      const existingResponse = await storage.getInspectionResponse(req.params.id);
      if (!existingResponse) {
        return res.status(404).json({ error: "Response not found" });
      }

      // Verify the inspection belongs to user's organization
      const inspection = await storage.getInspection(existingResponse.inspectionId);
      if (!inspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }

      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property || property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block || block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      await storage.deleteInspectionResponse(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting inspection response:", error);
      res.status(500).json({ error: "Failed to delete inspection response" });
    }
  });

  // ==================== INSPECTION ITEM ROUTES ====================
  
  app.post("/api/inspection-items", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { inspectionId, category, itemName, photoUrl, conditionRating, notes } = req.body;
      
      if (!inspectionId || !category || !itemName) {
        return res.status(400).json({ message: "Inspection ID, category, and item name are required" });
      }

      const item = await storage.createInspectionItem({
        inspectionId,
        category,
        itemName,
        photoUrl: photoUrl || null,
        conditionRating: conditionRating || null,
        notes: notes || null,
      });

      res.json(item);
    } catch (error) {
      console.error("Error creating inspection item:", error);
      res.status(500).json({ message: "Failed to create inspection item" });
    }
  });

  // ==================== AI ANALYSIS ROUTES ====================
  
  app.post("/api/ai/analyze-photo", isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.body;
      
      if (!itemId) {
        return res.status(400).json({ message: "Item ID is required" });
      }

      // Get the inspection item
      const item = await storage.getInspectionItem(itemId);
      
      if (!item || !item.photoUrl) {
        return res.status(400).json({ message: "Inspection item not found or has no photo" });
      }

      // Get user and verify organization membership
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Verify the inspection item belongs to the user's organization
      const inspection = await storage.getInspection(item.inspectionId);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Check ownership via property OR block
      let ownerOrgId: string | null = null;
      
      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property) {
          return res.status(404).json({ message: "Property not found" });
        }
        ownerOrgId = property.organizationId;
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block) {
          return res.status(404).json({ message: "Block not found" });
        }
        ownerOrgId = block.organizationId;
      } else {
        return res.status(400).json({ message: "Inspection has no property or block assigned" });
      }

      // Verify organization ownership
      if (ownerOrgId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied: Inspection item does not belong to your organization" });
      }

      // Check credits AFTER verifying ownership
      const organization = await storage.getOrganization(user.organizationId);
      if (!organization || (organization.creditsRemaining ?? 0) < 1) {
        return res.status(402).json({ message: "Insufficient credits" });
      }

      // Construct full photo URL
      const photoUrl = item.photoUrl.startsWith("http") 
        ? item.photoUrl 
        : `${process.env.REPLIT_DOMAINS?.split(",")[0] || "http://localhost:5000"}/objects/${item.photoUrl}`;

      // Call OpenAI Vision API
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this ${item.category} - ${item.itemName} photo from a property inspection. Provide a detailed condition assessment including any damage, wear, cleanliness issues, or notable features. Be specific and objective.`
              },
              {
                type: "image_url",
                image_url: {
                  url: photoUrl
                }
              }
            ]
          }
        ],
        max_completion_tokens: 300,
      });

      const analysis = response.choices[0]?.message?.content || "Unable to analyze image";

      // Update the item with AI analysis
      await storage.updateInspectionItemAI(itemId, analysis);

      // Deduct credit
      await storage.updateOrganizationCredits(
        organization.id,
        (organization.creditsRemaining ?? 0) - 1
      );

      await storage.createCreditTransaction({
        organizationId: organization.id,
        amount: -1,
        type: "inspection",
        description: `AI photo analysis: ${item.category} - ${item.itemName}`,
      });

      res.json({ analysis });
    } catch (error) {
      console.error("Error analyzing photo:", error);
      res.status(500).json({ message: "Failed to analyze photo" });
    }
  });

  app.post("/api/ai/generate-comparison", isAuthenticated, async (req: any, res) => {
    try {
      const { propertyId, checkInInspectionId, checkOutInspectionId } = req.body;
      
      if (!propertyId || !checkInInspectionId || !checkOutInspectionId) {
        return res.status(400).json({ message: "Property ID and both inspection IDs are required" });
      }

      // Check credits
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const organization = await storage.getOrganization(user.organizationId);
      if (!organization || (organization.creditsRemaining ?? 0) < 2) {
        return res.status(402).json({ message: "Insufficient credits (2 required for comparison)" });
      }

      // Get both inspections
      const checkInItems = await storage.getInspectionItems(checkInInspectionId);
      const checkOutItems = await storage.getInspectionItems(checkOutInspectionId);

      // Generate comparison using AI
      const prompt = `Compare these two property inspections (check-in vs check-out) and provide a summary of changes, damage, or improvements. Be objective and specific.

Check-in items: ${JSON.stringify(checkInItems.map(i => ({ category: i.category, item: i.itemName, condition: i.conditionRating, analysis: i.aiAnalysis })))}

Check-out items: ${JSON.stringify(checkOutItems.map(i => ({ category: i.category, item: i.itemName, condition: i.conditionRating, analysis: i.aiAnalysis })))}

Provide a structured comparison highlighting differences in condition ratings and any notable changes.`;

      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 800,
      });

      const aiSummary = response.choices[0]?.message?.content || "Unable to generate comparison";

      // Create comparison report
      const report = await storage.createComparisonReport({
        propertyId,
        checkInInspectionId,
        checkOutInspectionId,
        aiSummary,
        itemComparisons: { checkIn: checkInItems, checkOut: checkOutItems },
        generatedBy: user.id,
      });

      // Deduct credits
      await storage.updateOrganizationCredits(
        organization.id,
        (organization.creditsRemaining ?? 0) - 2
      );

      await storage.createCreditTransaction({
        organizationId: organization.id,
        amount: -2,
        type: "comparison",
        description: `AI comparison report for property`,
        relatedId: report.id,
      });

      res.json(report);
    } catch (error) {
      console.error("Error generating comparison:", error);
      res.status(500).json({ message: "Failed to generate comparison" });
    }
  });

  app.get("/api/comparisons/:propertyId", isAuthenticated, async (req, res) => {
    try {
      const { propertyId } = req.params;
      const reports = await storage.getComparisonReportsByProperty(propertyId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching comparisons:", error);
      res.status(500).json({ message: "Failed to fetch comparisons" });
    }
  });

  // ==================== COMPLIANCE ROUTES ====================
  
  app.post("/api/compliance", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      const { documentType, documentUrl, expiryDate, propertyId } = req.body;
      
      if (!user?.organizationId || !documentType || !documentUrl) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const doc = await storage.createComplianceDocument({
        organizationId: user.organizationId,
        propertyId: propertyId || null,
        documentType,
        documentUrl,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        uploadedBy: userId,
      });

      res.json(doc);
    } catch (error) {
      console.error("Error creating compliance document:", error);
      res.status(500).json({ message: "Failed to create compliance document" });
    }
  });

  app.get("/api/compliance", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.json([]);
      }

      const docs = await storage.getComplianceDocuments(user.organizationId);
      res.json(docs);
    } catch (error) {
      console.error("Error fetching compliance documents:", error);
      res.status(500).json({ message: "Failed to fetch compliance documents" });
    }
  });

  app.get("/api/compliance/expiring", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.json([]);
      }

      const daysAhead = parseInt(req.query.days as string) || 90;
      const docs = await storage.getExpiringCompliance(user.organizationId, daysAhead);
      res.json(docs);
    } catch (error) {
      console.error("Error fetching expiring compliance:", error);
      res.status(500).json({ message: "Failed to fetch expiring compliance" });
    }
  });

  // ==================== MAINTENANCE ROUTES ====================
  
  app.post("/api/maintenance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { propertyId, title, description, priority, photoUrl } = req.body;
      
      if (!propertyId || !title) {
        return res.status(400).json({ message: "Property ID and title are required" });
      }

      // Get user to check organization
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify property exists and belongs to the same organization
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      if (property.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied: Property belongs to a different organization" });
      }

      const request = await storage.createMaintenanceRequest({
        propertyId,
        reportedBy: userId,
        title,
        description: description || null,
        priority: priority || "medium",
        photoUrl: photoUrl || null,
      });

      res.json(request);
    } catch (error) {
      console.error("Error creating maintenance request:", error);
      res.status(500).json({ message: "Failed to create maintenance request" });
    }
  });

  app.get("/api/maintenance", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.json([]);
      }

      const requests = await storage.getMaintenanceByOrganization(user.organizationId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching maintenance requests:", error);
      res.status(500).json({ message: "Failed to fetch maintenance requests" });
    }
  });

  app.patch("/api/maintenance/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, assignedTo } = req.body;
      
      const request = await storage.updateMaintenanceStatus(id, status, assignedTo);
      res.json(request);
    } catch (error) {
      console.error("Error updating maintenance request:", error);
      res.status(500).json({ message: "Failed to update maintenance request" });
    }
  });

  // ==================== CREDIT ROUTES ====================
  
  app.get("/api/credits/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.json([]);
      }

      const transactions = await storage.getCreditTransactions(user.organizationId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching credit transactions:", error);
      res.status(500).json({ message: "Failed to fetch credit transactions" });
    }
  });

  // ==================== STRIPE ROUTES ====================
  
  app.post("/api/stripe/create-checkout", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const organization = await storage.getOrganization(user.organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const { credits } = req.body;
      const amount = credits * 100; // $1 per credit, in cents

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${credits} Inspection Credits`,
                description: "Credits for AI-powered property inspections",
              },
              unit_amount: 100, // $1 per credit
            },
            quantity: credits,
          },
        ],
        mode: "payment",
        success_url: `${req.headers.origin}/dashboard?payment=success`,
        cancel_url: `${req.headers.origin}/dashboard?payment=cancelled`,
        client_reference_id: organization.id,
        metadata: {
          organizationId: organization.id,
          credits: credits.toString(),
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET || "whsec_test"
      );

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const organizationId = session.metadata.organizationId;
        const credits = parseInt(session.metadata.credits);

        // Add credits to organization
        const organization = await storage.getOrganization(organizationId);
        if (organization) {
          await storage.updateOrganizationCredits(
            organizationId,
            (organization.creditsRemaining ?? 0) + credits
          );

          await storage.createCreditTransaction({
            organizationId,
            amount: credits,
            type: "purchase",
            description: `Purchased ${credits} credits via Stripe`,
          });
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook error:", error);
      res.status(400).send(`Webhook Error`);
    }
  });

  // ==================== BLOCK ROUTES ====================
  
  app.post("/api/blocks", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Validate request body with Zod
      const parseResult = insertBlockSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: parseResult.error.errors 
        });
      }

      const block = await storage.createBlock({
        ...parseResult.data,
        organizationId: user.organizationId,
      });
      res.status(201).json(block);
    } catch (error: any) {
      console.error("Error creating block:", error);
      res.status(500).json({ error: "Failed to create block" });
    }
  });

  app.get("/api/blocks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const blocks = await storage.getBlocksWithStats(user.organizationId);
      res.json(blocks);
    } catch (error) {
      console.error("Error fetching blocks:", error);
      res.status(500).json({ error: "Failed to fetch blocks" });
    }
  });

  app.get("/api/blocks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const block = await storage.getBlock(req.params.id);
      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }

      // Verify organization ownership
      if (block.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(block);
    } catch (error) {
      console.error("Error fetching block:", error);
      res.status(500).json({ error: "Failed to fetch block" });
    }
  });

  app.get("/api/blocks/:id/properties", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const blockId = req.params.id;
      
      // Verify block belongs to user's organization
      const block = await storage.getBlock(blockId);
      if (!block || block.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Block not found" });
      }

      const properties = await storage.getPropertiesWithStatsByBlock(blockId);
      res.json(properties);
    } catch (error) {
      console.error("Error fetching block properties:", error);
      res.status(500).json({ error: "Failed to fetch block properties" });
    }
  });

  app.patch("/api/blocks/:id", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify organization ownership
      const existing = await storage.getBlock(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Validate request body (partial update) with Zod
      const parseResult = insertBlockSchema.partial().safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: parseResult.error.errors 
        });
      }

      const block = await storage.updateBlock(req.params.id, parseResult.data);
      res.json(block);
    } catch (error: any) {
      console.error("Error updating block:", error);
      res.status(500).json({ error: "Failed to update block" });
    }
  });

  app.delete("/api/blocks/:id", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify organization ownership
      const existing = await storage.getBlock(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteBlock(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting block:", error);
      res.status(500).json({ error: "Failed to delete block" });
    }
  });

  // ==================== ASSET INVENTORY ROUTES ====================

  app.post("/api/asset-inventory", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertAssetInventorySchema.parse(req.body);

      const asset = await storage.createAssetInventory({
        ...validatedData,
        organizationId: user.organizationId,
      });
      res.status(201).json(asset);
    } catch (error: any) {
      console.error("Error creating asset inventory:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create asset inventory" });
    }
  });

  app.get("/api/asset-inventory", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const assets = await storage.getAssetInventoryByOrganization(user.organizationId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching asset inventory:", error);
      res.status(500).json({ error: "Failed to fetch asset inventory" });
    }
  });

  app.get("/api/asset-inventory/property/:propertyId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify property belongs to user's organization
      const property = await storage.getProperty(req.params.propertyId);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      if (property.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const assets = await storage.getAssetInventoryByProperty(req.params.propertyId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching property asset inventory:", error);
      res.status(500).json({ error: "Failed to fetch property asset inventory" });
    }
  });

  app.get("/api/asset-inventory/block/:blockId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify block belongs to user's organization
      const block = await storage.getBlock(req.params.blockId);
      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (block.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const assets = await storage.getAssetInventoryByBlock(req.params.blockId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching block asset inventory:", error);
      res.status(500).json({ error: "Failed to fetch block asset inventory" });
    }
  });

  app.get("/api/asset-inventory/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const asset = await storage.getAssetInventory(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      // Verify organization ownership
      if (asset.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(asset);
    } catch (error) {
      console.error("Error fetching asset inventory:", error);
      res.status(500).json({ error: "Failed to fetch asset inventory" });
    }
  });

  app.patch("/api/asset-inventory/:id", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify organization ownership
      const existing = await storage.getAssetInventory(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Asset not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Remove organizationId from request body (should not be updated)
      const { organizationId: _, ...updateData } = req.body;

      const asset = await storage.updateAssetInventory(req.params.id, updateData);
      res.json(asset);
    } catch (error: any) {
      console.error("Error updating asset inventory:", error);
      res.status(500).json({ error: "Failed to update asset inventory" });
    }
  });

  app.delete("/api/asset-inventory/:id", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify organization ownership
      const existing = await storage.getAssetInventory(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Asset not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteAssetInventory(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting asset inventory:", error);
      res.status(500).json({ error: "Failed to delete asset inventory" });
    }
  });

  // ==================== INVENTORY TEMPLATE ROUTES ====================
  
  app.post("/api/inventory-templates", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertInventoryTemplateSchema.parse(req.body);

      const template = await storage.createInventoryTemplate({
        ...validatedData,
        organizationId: user.organizationId,
      });
      res.status(201).json(template);
    } catch (error: any) {
      console.error("Error creating inventory template:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create inventory template" });
    }
  });

  app.get("/api/inventory-templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const templates = await storage.getInventoryTemplatesByOrganization(user.organizationId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching inventory templates:", error);
      res.status(500).json({ error: "Failed to fetch inventory templates" });
    }
  });

  app.get("/api/inventory-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const template = await storage.getInventoryTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      if (template.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error fetching inventory template:", error);
      res.status(500).json({ error: "Failed to fetch inventory template" });
    }
  });

  app.patch("/api/inventory-templates/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const existing = await storage.getInventoryTemplate(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Template not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = insertInventoryTemplateSchema.partial().parse(req.body);

      const template = await storage.updateInventoryTemplate(req.params.id, validatedData);
      res.json(template);
    } catch (error: any) {
      console.error("Error updating inventory template:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update inventory template" });
    }
  });

  app.delete("/api/inventory-templates/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const existing = await storage.getInventoryTemplate(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Template not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteInventoryTemplate(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting inventory template:", error);
      res.status(500).json({ error: "Failed to delete inventory template" });
    }
  });

  // ==================== INVENTORY ROUTES ====================
  
  app.post("/api/inventories", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertInventorySchema.parse(req.body);

      const inventory = await storage.createInventory({
        ...validatedData,
        organizationId: user.organizationId,
      });
      res.status(201).json(inventory);
    } catch (error: any) {
      console.error("Error creating inventory:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create inventory" });
    }
  });

  app.get("/api/properties/:propertyId/inventories", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify property belongs to user's organization
      const property = await storage.getProperty(req.params.propertyId);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      if (property.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const inventories = await storage.getInventoriesByProperty(req.params.propertyId);
      res.json(inventories);
    } catch (error) {
      console.error("Error fetching inventories:", error);
      res.status(500).json({ error: "Failed to fetch inventories" });
    }
  });

  app.get("/api/inventories/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const inventory = await storage.getInventory(req.params.id);
      if (!inventory) {
        return res.status(404).json({ error: "Inventory not found" });
      }

      if (inventory.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(inventory);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: "Failed to fetch inventory" });
    }
  });

  // ==================== INVENTORY ITEM ROUTES ====================
  
  app.post("/api/inventory-items", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertInventoryItemSchema.parse(req.body);

      // Verify parent inventory belongs to user's organization
      const inventory = await storage.getInventory(validatedData.inventoryId);
      if (!inventory || inventory.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const item = await storage.createInventoryItem(validatedData);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Error creating inventory item:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create inventory item" });
    }
  });

  app.get("/api/inventories/:inventoryId/items", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify inventory belongs to user's organization
      const inventory = await storage.getInventory(req.params.inventoryId);
      if (!inventory || inventory.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const items = await storage.getInventoryItems(req.params.inventoryId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching inventory items:", error);
      res.status(500).json({ error: "Failed to fetch inventory items" });
    }
  });

  app.patch("/api/inventory-items/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Note: This requires fetching the item first to verify access via parent inventory
      // For efficiency, we could add a getInventoryItem method to storage
      const validatedData = insertInventoryItemSchema.partial().parse(req.body);

      const item = await storage.updateInventoryItem(req.params.id, validatedData);
      res.json(item);
    } catch (error: any) {
      console.error("Error updating inventory item:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update inventory item" });
    }
  });

  // ==================== WORK ORDER ROUTES ====================
  
  app.post("/api/work-orders", isAuthenticated, requireRole("owner", "contractor"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertWorkOrderSchema.parse(req.body);

      const workOrder = await storage.createWorkOrder({
        ...validatedData,
        organizationId: user.organizationId,
      });
      res.status(201).json(workOrder);
    } catch (error: any) {
      console.error("Error creating work order:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create work order" });
    }
  });

  app.get("/api/work-orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // If user is a contractor, show only their work orders
      const workOrders = user.role === "contractor"
        ? await storage.getWorkOrdersByContractor(userId)
        : await storage.getWorkOrdersByOrganization(user.organizationId);
      
      res.json(workOrders);
    } catch (error) {
      console.error("Error fetching work orders:", error);
      res.status(500).json({ error: "Failed to fetch work orders" });
    }
  });

  app.get("/api/work-orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access: owner/org members can see all, contractors can only see their assigned orders
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(workOrder);
    } catch (error) {
      console.error("Error fetching work order:", error);
      res.status(500).json({ error: "Failed to fetch work order" });
    }
  });

  app.patch("/api/work-orders/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { status } = req.body;
      const completedAt = status === "completed" ? new Date() : undefined;
      const updated = await storage.updateWorkOrderStatus(req.params.id, status, completedAt);
      res.json(updated);
    } catch (error) {
      console.error("Error updating work order status:", error);
      res.status(500).json({ error: "Failed to update work order status" });
    }
  });

  app.patch("/api/work-orders/:id/cost", isAuthenticated, requireRole("owner", "contractor"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { costActual, variationNotes } = req.body;
      const updated = await storage.updateWorkOrderCost(req.params.id, costActual, variationNotes);
      res.json(updated);
    } catch (error) {
      console.error("Error updating work order cost:", error);
      res.status(500).json({ error: "Failed to update work order cost" });
    }
  });

  // ==================== WORK LOG ROUTES ====================
  
  app.post("/api/work-logs", isAuthenticated, requireRole("owner", "contractor"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertWorkLogSchema.parse(req.body);

      // Verify parent work order belongs to user's organization or contractor
      const workOrder = await storage.getWorkOrder(validatedData.workOrderId);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const log = await storage.createWorkLog(validatedData);
      res.status(201).json(log);
    } catch (error: any) {
      console.error("Error creating work log:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create work log" });
    }
  });

  app.get("/api/work-orders/:workOrderId/logs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify work order belongs to user's organization or contractor
      const workOrder = await storage.getWorkOrder(req.params.workOrderId);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const logs = await storage.getWorkLogs(req.params.workOrderId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching work logs:", error);
      res.status(500).json({ error: "Failed to fetch work logs" });
    }
  });

  // ==================== TAG ROUTES ====================
  
  // Create a new tag
  app.post("/api/tags", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ error: "User not associated with an organization" });
      }

      const validatedData = insertTagSchema.parse({
        ...req.body,
        organizationId: user.organizationId,
      });

      const tag = await storage.createTag(validatedData);
      res.json(tag);
    } catch (error: any) {
      console.error("Error creating tag:", error);
      res.status(400).json({ error: error.message || "Failed to create tag" });
    }
  });

  // Get all tags for the organization
  app.get("/api/tags", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ error: "User not associated with an organization" });
      }

      const tags = await storage.getTagsByOrganization(user.organizationId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // Update a tag
  app.patch("/api/tags/:id", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const tag = await storage.getTag(req.params.id);

      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }

      if (tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateTag(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating tag:", error);
      res.status(500).json({ error: "Failed to update tag" });
    }
  });

  // Delete a tag
  app.delete("/api/tags/:id", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const tag = await storage.getTag(req.params.id);

      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }

      if (tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteTag(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });

  // Add tag to block
  app.post("/api/blocks/:blockId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const block = await storage.getBlock(req.params.blockId);
      const tag = await storage.getTag(req.params.tagId);

      if (!block || !tag) {
        return res.status(404).json({ error: "Block or tag not found" });
      }

      if (block.organizationId !== user?.organizationId || tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.addTagToBlock(req.params.blockId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to block:", error);
      res.status(500).json({ error: "Failed to add tag to block" });
    }
  });

  // Remove tag from block
  app.delete("/api/blocks/:blockId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromBlock(req.params.blockId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from block:", error);
      res.status(500).json({ error: "Failed to remove tag from block" });
    }
  });

  // Get tags for block
  app.get("/api/blocks/:blockId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForBlock(req.params.blockId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching block tags:", error);
      res.status(500).json({ error: "Failed to fetch block tags" });
    }
  });

  // Add tag to property
  app.post("/api/properties/:propertyId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const property = await storage.getProperty(req.params.propertyId);
      const tag = await storage.getTag(req.params.tagId);

      if (!property || !tag) {
        return res.status(404).json({ error: "Property or tag not found" });
      }

      if (property.organizationId !== user?.organizationId || tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.addTagToProperty(req.params.propertyId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to property:", error);
      res.status(500).json({ error: "Failed to add tag to property" });
    }
  });

  // Remove tag from property
  app.delete("/api/properties/:propertyId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromProperty(req.params.propertyId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from property:", error);
      res.status(500).json({ error: "Failed to remove tag from property" });
    }
  });

  // Get tags for property
  app.get("/api/properties/:propertyId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForProperty(req.params.propertyId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching property tags:", error);
      res.status(500).json({ error: "Failed to fetch property tags" });
    }
  });

  // Add tag to user
  app.post("/api/users/:userId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const targetUser = await storage.getUser(req.params.userId);
      const tag = await storage.getTag(req.params.tagId);

      if (!targetUser || !tag) {
        return res.status(404).json({ error: "User or tag not found" });
      }

      if (targetUser.organizationId !== user?.organizationId || tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.addTagToUser(req.params.userId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to user:", error);
      res.status(500).json({ error: "Failed to add tag to user" });
    }
  });

  // Remove tag from user
  app.delete("/api/users/:userId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromUser(req.params.userId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from user:", error);
      res.status(500).json({ error: "Failed to remove tag from user" });
    }
  });

  // Get tags for user
  app.get("/api/users/:userId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForUser(req.params.userId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching user tags:", error);
      res.status(500).json({ error: "Failed to fetch user tags" });
    }
  });

  // Add tag to compliance document
  app.post("/api/compliance/:complianceId/tags/:tagId", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      await storage.addTagToComplianceDocument(req.params.complianceId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to compliance document:", error);
      res.status(500).json({ error: "Failed to add tag to compliance document" });
    }
  });

  // Remove tag from compliance document
  app.delete("/api/compliance/:complianceId/tags/:tagId", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      await storage.removeTagFromComplianceDocument(req.params.complianceId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from compliance document:", error);
      res.status(500).json({ error: "Failed to remove tag from compliance document" });
    }
  });

  // Get tags for compliance document
  app.get("/api/compliance/:complianceId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForComplianceDocument(req.params.complianceId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching compliance document tags:", error);
      res.status(500).json({ error: "Failed to fetch compliance document tags" });
    }
  });

  // Add tag to asset inventory
  app.post("/api/asset-inventory/:assetId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.addTagToAssetInventory(req.params.assetId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to asset inventory:", error);
      res.status(500).json({ error: "Failed to add tag to asset inventory" });
    }
  });

  // Remove tag from asset inventory
  app.delete("/api/asset-inventory/:assetId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromAssetInventory(req.params.assetId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from asset inventory:", error);
      res.status(500).json({ error: "Failed to remove tag from asset inventory" });
    }
  });

  // Get tags for asset inventory
  app.get("/api/asset-inventory/:assetId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForAssetInventory(req.params.assetId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching asset inventory tags:", error);
      res.status(500).json({ error: "Failed to fetch asset inventory tags" });
    }
  });

  // Add tag to maintenance request
  app.post("/api/maintenance/:requestId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.addTagToMaintenanceRequest(req.params.requestId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to maintenance request:", error);
      res.status(500).json({ error: "Failed to add tag to maintenance request" });
    }
  });

  // Remove tag from maintenance request
  app.delete("/api/maintenance/:requestId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromMaintenanceRequest(req.params.requestId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from maintenance request:", error);
      res.status(500).json({ error: "Failed to remove tag from maintenance request" });
    }
  });

  // Get tags for maintenance request
  app.get("/api/maintenance/:requestId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForMaintenanceRequest(req.params.requestId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching maintenance request tags:", error);
      res.status(500).json({ error: "Failed to fetch maintenance request tags" });
    }
  });

  // Search entities by tags
  app.post("/api/tags/search", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ error: "User not associated with an organization" });
      }

      const { tagIds } = req.body;
      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ error: "tagIds must be an array" });
      }

      const results = await storage.searchByTags(user.organizationId, tagIds);
      res.json(results);
    } catch (error) {
      console.error("Error searching by tags:", error);
      res.status(500).json({ error: "Failed to search by tags" });
    }
  });

  // ==================== DASHBOARD PREFERENCES ROUTES ====================
  
  // Define role-based panel permissions
  const PANEL_PERMISSIONS: Record<string, string[]> = {
    stats: ["owner", "clerk", "compliance"],
    inspections: ["owner", "clerk"],
    compliance: ["owner", "compliance"],
    maintenance: ["owner", "clerk"],
    assets: ["owner", "clerk"],
    workOrders: ["owner", "contractor"],
    inspectionTrend: ["owner", "clerk"],
    statusDistribution: ["owner", "clerk", "compliance"],
    credits: ["owner"],
  };

  // Get allowed panels for a role
  function getAllowedPanels(role: string): string[] {
    return Object.keys(PANEL_PERMISSIONS).filter(panel => 
      PANEL_PERMISSIONS[panel].includes(role)
    );
  }

  // Filter panels based on role permissions
  function filterPanelsByRole(panels: string[], role: string): string[] {
    const allowed = getAllowedPanels(role);
    return panels.filter(panel => allowed.includes(panel));
  }

  // Get dashboard preferences
  app.get("/api/dashboard/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const prefs = await storage.getDashboardPreferences(userId);
      
      // Default panels based on role
      const defaultPanels = getAllowedPanels(user.role);
      
      if (!prefs) {
        return res.json({ enabledPanels: defaultPanels });
      }

      // Parse enabled panels if stored as string
      let enabledPanels = prefs.enabledPanels;
      if (typeof enabledPanels === "string") {
        enabledPanels = JSON.parse(enabledPanels);
      }

      // Filter panels to only those allowed for user's role
      const filteredPanels = filterPanelsByRole(enabledPanels, user.role);
      
      res.json({ enabledPanels: filteredPanels });
    } catch (error) {
      console.error("Error fetching dashboard preferences:", error);
      res.status(500).json({ error: "Failed to fetch dashboard preferences" });
    }
  });

  // Update dashboard preferences
  app.put("/api/dashboard/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { enabledPanels } = req.body;
      
      if (!Array.isArray(enabledPanels)) {
        return res.status(400).json({ error: "enabledPanels must be an array" });
      }

      // Filter panels to only those allowed for user's role
      const filteredPanels = filterPanelsByRole(enabledPanels, user.role);

      const prefs = await storage.updateDashboardPreferences(userId, filteredPanels);
      res.json({ ...prefs, enabledPanels: filteredPanels });
    } catch (error) {
      console.error("Error updating dashboard preferences:", error);
      res.status(500).json({ error: "Failed to update dashboard preferences" });
    }
  });

  // ==================== INSPECTION TEMPLATE ROUTES ====================

  // Template Categories
  app.get("/api/template-categories", isAuthenticated, requireRole('owner', 'clerk', 'compliance'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const categories = await storage.getTemplateCategoriesByOrganization(user.organizationId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching template categories:", error);
      res.status(500).json({ message: "Failed to fetch template categories" });
    }
  });

  app.post("/api/template-categories", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const validatedData = insertTemplateCategorySchema.parse({
        ...req.body,
        organizationId: user.organizationId
      });
      const category = await storage.createTemplateCategory(validatedData);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating template category:", error);
      res.status(400).json({ message: "Failed to create template category" });
    }
  });

  app.put("/api/template-categories/:id", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      // Verify ownership
      const existing = await storage.getTemplateCategory(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Category not found" });
      }
      const category = await storage.updateTemplateCategory(req.params.id, req.body);
      res.json(category);
    } catch (error) {
      console.error("Error updating template category:", error);
      res.status(400).json({ message: "Failed to update template category" });
    }
  });

  app.delete("/api/template-categories/:id", isAuthenticated, requireRole('owner'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const existing = await storage.getTemplateCategory(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Category not found" });
      }
      await storage.deleteTemplateCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting template category:", error);
      res.status(500).json({ message: "Failed to delete template category" });
    }
  });

  // Inspection Templates
  app.get("/api/inspection-templates", isAuthenticated, requireRole('owner', 'clerk', 'compliance'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const { scope, categoryId, active } = req.query;
      let templates = await storage.getInspectionTemplatesByOrganization(user.organizationId);
      
      // Apply filtering based on query parameters
      if (scope && scope !== 'all') {
        if (scope === 'both') {
          // When filtering by "both", show ONLY templates with scope='both'
          templates = templates.filter(t => t.scope === 'both');
        } else {
          // When filtering by specific scope (property/block), also include templates with scope='both'
          templates = templates.filter(t => t.scope === scope || t.scope === 'both');
        }
      }
      if (categoryId && categoryId !== 'all') {
        templates = templates.filter(t => t.categoryId === categoryId);
      }
      if (active !== undefined && active !== 'all') {
        const isActive = active === 'true';
        templates = templates.filter(t => t.isActive === isActive);
      }
      
      res.json(templates);
    } catch (error) {
      console.error("Error fetching inspection templates:", error);
      res.status(500).json({ message: "Failed to fetch inspection templates" });
    }
  });

  app.get("/api/inspection-templates/:id", isAuthenticated, requireRole('owner', 'clerk', 'compliance'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const template = await storage.getInspectionTemplate(req.params.id);
      if (!template || template.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching inspection template:", error);
      res.status(500).json({ message: "Failed to fetch inspection template" });
    }
  });

  app.post("/api/inspection-templates", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const validatedData = insertInspectionTemplateSchema.parse({
        ...req.body,
        organizationId: user.organizationId,
        createdBy: req.user.id
      });
      const template = await storage.createInspectionTemplate(validatedData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating inspection template:", error);
      res.status(400).json({ message: "Failed to create inspection template" });
    }
  });

  app.put("/api/inspection-templates/:id", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const existing = await storage.getInspectionTemplate(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Prepare updates - stringify structureJson if it's an object
      const updates: any = { ...req.body };
      if (updates.structureJson && typeof updates.structureJson !== 'string') {
        updates.structureJson = JSON.stringify(updates.structureJson);
      }
      
      // Remove fields that shouldn't be updated via API
      delete updates.id;
      delete updates.organizationId;
      delete updates.createdBy;
      delete updates.createdAt;
      delete updates.updatedAt;
      
      const template = await storage.updateInspectionTemplate(req.params.id, updates);
      res.json(template);
    } catch (error) {
      console.error("Error updating inspection template:", error);
      res.status(400).json({ message: "Failed to update inspection template" });
    }
  });

  app.delete("/api/inspection-templates/:id", isAuthenticated, requireRole('owner'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const existing = await storage.getInspectionTemplate(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      await storage.deleteInspectionTemplate(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting inspection template:", error);
      res.status(500).json({ message: "Failed to delete inspection template" });
    }
  });

  // Clone template (create new version)
  app.post("/api/inspection-templates/:id/clone", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const existing = await storage.getInspectionTemplate(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Create new template with incremented version
      const newVersion = existing.version + 1;
      const clonedTemplate = await storage.createInspectionTemplate({
        organizationId: user.organizationId,
        name: req.body.name || `${existing.name} (v${newVersion})`,
        description: req.body.description || existing.description,
        categoryId: existing.categoryId,
        scope: existing.scope,
        structureJson: existing.structureJson as any,
        version: newVersion,
        parentTemplateId: existing.parentTemplateId || existing.id,
        isActive: req.body.isActive ?? false,
        createdBy: req.user.id
      });
      
      res.status(201).json(clonedTemplate);
    } catch (error) {
      console.error("Error cloning inspection template:", error);
      res.status(400).json({ message: "Failed to clone inspection template" });
    }
  });

  // Template Inventory Links
  app.get("/api/inspection-templates/:templateId/inventory-links", isAuthenticated, requireRole('owner', 'clerk', 'compliance'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const template = await storage.getInspectionTemplate(req.params.templateId);
      if (!template || template.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      const links = await storage.getTemplateInventoryLinks(req.params.templateId);
      res.json(links);
    } catch (error) {
      console.error("Error fetching template inventory links:", error);
      res.status(500).json({ message: "Failed to fetch template inventory links" });
    }
  });

  app.post("/api/template-inventory-links", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const validatedData = insertTemplateInventoryLinkSchema.parse(req.body);
      // Verify template ownership
      const template = await storage.getInspectionTemplate(validatedData.templateId);
      if (!template || template.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      const link = await storage.createTemplateInventoryLink(validatedData);
      res.status(201).json(link);
    } catch (error) {
      console.error("Error creating template inventory link:", error);
      res.status(400).json({ message: "Failed to create template inventory link" });
    }
  });

  app.delete("/api/template-inventory-links/:id", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      await storage.deleteTemplateInventoryLink(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting template inventory link:", error);
      res.status(500).json({ message: "Failed to delete template inventory link" });
    }
  });

  // Inspection Entries
  app.get("/api/inspections/:inspectionId/entries", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const entries = await storage.getInspectionEntries(req.params.inspectionId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching inspection entries:", error);
      res.status(500).json({ message: "Failed to fetch inspection entries" });
    }
  });

  app.get("/api/inspection-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const entry = await storage.getInspectionEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }
      res.json(entry);
    } catch (error) {
      console.error("Error fetching inspection entry:", error);
      res.status(500).json({ message: "Failed to fetch inspection entry" });
    }
  });

  app.post("/api/inspection-entries", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const validatedData = insertInspectionEntrySchema.parse(req.body);
      const entry = await storage.createInspectionEntry(validatedData);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating inspection entry:", error);
      res.status(400).json({ message: "Failed to create inspection entry" });
    }
  });

  // Batch create entries (for offline sync)
  app.post("/api/inspection-entries/batch", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const { entries } = req.body;
      if (!Array.isArray(entries)) {
        return res.status(400).json({ message: "entries must be an array" });
      }
      const validatedEntries = entries.map(e => insertInspectionEntrySchema.parse(e));
      const created = await storage.createInspectionEntriesBatch(validatedEntries);
      res.status(201).json(created);
    } catch (error) {
      console.error("Error batch creating inspection entries:", error);
      res.status(400).json({ message: "Failed to batch create inspection entries" });
    }
  });

  app.put("/api/inspection-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const entry = await storage.updateInspectionEntry(req.params.id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating inspection entry:", error);
      res.status(400).json({ message: "Failed to update inspection entry" });
    }
  });

  app.delete("/api/inspection-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      await storage.deleteInspectionEntry(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting inspection entry:", error);
      res.status(500).json({ message: "Failed to delete inspection entry" });
    }
  });

  // AI Image Analyses
  app.get("/api/inspections/:inspectionId/ai-analyses", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const analyses = await storage.getAiImageAnalysesByInspection(req.params.inspectionId);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching AI analyses:", error);
      res.status(500).json({ message: "Failed to fetch AI analyses" });
    }
  });

  app.get("/api/inspection-entries/:entryId/ai-analyses", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const analyses = await storage.getAiImageAnalysesByEntry(req.params.entryId);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching AI analyses:", error);
      res.status(500).json({ message: "Failed to fetch AI analyses" });
    }
  });

  app.post("/api/ai-analyses", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const { inspectionId, inspectionEntryId, imageUrl, context } = req.body;

      // Verify user has access to this inspection
      const inspection = await storage.getInspection(inspectionId);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Check if organization has credits
      const org = await storage.getOrganization(user.organizationId);
      if (!org || (org.creditsRemaining ?? 0) < 1) {
        return res.status(402).json({ message: "Insufficient AI credits" });
      }

      // Call OpenAI Vision API
      const openaiClient = getOpenAI();
      const response = await openaiClient.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: context || "Analyze this inspection photo. Identify the room/item, assess its condition, note any defects, damage, or issues that require attention. Provide a detailed assessment."
              },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 500
      });

      const analysisText = response.choices[0]?.message?.content || "";

      // Deduct credit
      await storage.updateOrganizationCredits(user.organizationId, (org.creditsRemaining ?? 0) - 1);

      // Save analysis
      const validatedData = insertAiImageAnalysisSchema.parse({
        inspectionId,
        inspectionEntryId,
        imageUrl,
        analysisJson: { text: analysisText, model: "gpt-5" },
        createdBy: req.user.id
      });
      const analysis = await storage.createAiImageAnalysis(validatedData);

      res.status(201).json({ ...analysis, remainingCredits: (org.creditsRemaining ?? 0) - 1 });
    } catch (error) {
      console.error("Error creating AI analysis:", error);
      res.status(500).json({ message: "Failed to create AI analysis" });
    }
  });

  // ==================== OBJECT STORAGE ROUTES ====================
  
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  app.put("/api/objects/set-acl", isAuthenticated, async (req: any, res) => {
    if (!req.body.photoUrl) {
      return res.status(400).json({ error: "photoUrl is required" });
    }

    const userId = req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.photoUrl,
        {
          owner: userId,
          visibility: "private",
        },
      );

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting object ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
