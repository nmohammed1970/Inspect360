// Backend API routes for Inspect360
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, requireRole } from "./auth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import Stripe from "stripe";
import OpenAI from "openai";
import {
  insertBlockSchema,
  insertInventoryTemplateSchema,
  insertInventorySchema,
  insertInventoryItemSchema,
  insertWorkOrderSchema,
  insertWorkLogSchema
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

  // ==================== UNIT ROUTES (Properties ARE units) ====================
  
  // Get properties/units by block
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
        description: `AI comparison report for unit`,
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

      // Get user to check role
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // If tenant, verify they own the property (unit)
      if (user.role === "tenant") {
        const property = await storage.getProperty(propertyId);
        if (!property) {
          return res.status(404).json({ message: "Property not found" });
        }
        if (property.tenantId !== userId) {
          return res.status(403).json({ message: "Access denied: You can only create requests for your own property" });
        }
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
