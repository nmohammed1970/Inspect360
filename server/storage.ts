import {
  users,
  adminUsers,
  organizations,
  contacts,
  blocks,
  properties,
  inspections,
  inspectionItems,
  inspectionCategories,
  inspectionTemplates,
  inspectionTemplatePoints,
  inspectionResponses,
  templateCategories,
  templateInventoryLinks,
  inspectionEntries,
  aiImageAnalyses,
  complianceDocuments,
  maintenanceRequests,
  comparisonReports,
  creditTransactions,
  inventoryTemplates,
  inventories,
  inventoryItems,
  workOrders,
  workLogs,
  assetInventory,
  tags,
  blockTags,
  propertyTags,
  userTags,
  complianceDocumentTags,
  assetInventoryTags,
  maintenanceRequestTags,
  dashboardPreferences,
  type User,
  type UpsertUser,
  type AdminUser,
  type InsertAdminUser,
  type Organization,
  type InsertOrganization,
  type Contact,
  type InsertContact,
  type Block,
  type InsertBlock,
  type Property,
  type InsertProperty,
  type Inspection,
  type InsertInspection,
  type InspectionItem,
  type InsertInspectionItem,
  type InspectionCategory,
  type InsertInspectionCategory,
  type InspectionTemplate,
  type InsertInspectionTemplate,
  type InspectionTemplatePoint,
  type InsertInspectionTemplatePoint,
  type InspectionResponse,
  type InsertInspectionResponse,
  type TemplateCategory,
  type InsertTemplateCategory,
  type TemplateInventoryLink,
  type InsertTemplateInventoryLink,
  type InspectionEntry,
  type InsertInspectionEntry,
  type AiImageAnalysis,
  type InsertAiImageAnalysis,
  type ComplianceDocument,
  type InsertComplianceDocument,
  type MaintenanceRequest,
  type InsertMaintenanceRequest,
  type ComparisonReport,
  type InsertComparisonReport,
  type CreditTransaction,
  type InsertCreditTransaction,
  type InventoryTemplate,
  type InsertInventoryTemplate,
  type Inventory,
  type InsertInventory,
  type InventoryItem,
  type InsertInventoryItem,
  type WorkOrder,
  type InsertWorkOrder,
  type WorkLog,
  type InsertWorkLog,
  type AssetInventory,
  type InsertAssetInventory,
  type Tag,
  type InsertTag,
  type DashboardPreferences,
  type InsertDashboardPreferences,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte, ne } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUsersByOrganization(organizationId: string): Promise<User[]>;
  getUsersByOrganizationAndRole(organizationId: string, role: string): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User>;
  updatePassword(id: string, hashedPassword: string): Promise<User>;
  setResetToken(id: string, token: string, expiry: Date): Promise<User>;
  clearResetToken(id: string): Promise<User>;
  
  // Organization operations
  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  updateOrganizationCredits(id: string, credits: number): Promise<Organization>;
  updateOrganizationStripe(id: string, customerId: string, status: string): Promise<Organization>;
  
  // Contact operations
  createContact(contact: InsertContact & { organizationId: string }): Promise<Contact>;
  getContactsByOrganization(organizationId: string): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  updateContact(id: string, updates: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: string): Promise<void>;
  
  // Property operations
  createProperty(property: InsertProperty): Promise<Property>;
  getPropertiesByOrganization(organizationId: string): Promise<Property[]>;
  getPropertiesByBlock(blockId: string): Promise<Property[]>;
  getProperty(id: string): Promise<Property | undefined>;
  updateProperty(id: string, updates: Partial<InsertProperty>): Promise<Property>;
  
  // Inspection operations (Inspections can be on blocks OR properties)
  createInspection(inspection: InsertInspection): Promise<Inspection>;
  getInspectionsByProperty(propertyId: string): Promise<Inspection[]>;
  getInspectionsByBlock(blockId: string): Promise<Inspection[]>;
  getInspectionsByInspector(inspectorId: string): Promise<any[]>; // Returns inspections with property/block
  getInspectionsByOrganization(organizationId: string): Promise<any[]>; // Returns inspections with property/block
  getInspection(id: string): Promise<Inspection | undefined>;
  updateInspectionStatus(id: string, status: string, completedDate?: Date): Promise<Inspection>;
  
  // Inspection Category operations
  createInspectionCategory(category: InsertInspectionCategory): Promise<InspectionCategory>;
  getInspectionCategories(organizationId: string): Promise<InspectionCategory[]>;
  getInspectionCategory(id: string): Promise<InspectionCategory | undefined>;
  updateInspectionCategory(id: string, updates: Partial<InsertInspectionCategory>): Promise<InspectionCategory>;
  deleteInspectionCategory(id: string): Promise<void>;
  
  // Inspection Item operations
  createInspectionItem(item: InsertInspectionItem): Promise<InspectionItem>;
  getInspectionItems(inspectionId: string): Promise<InspectionItem[]>;
  updateInspectionItemAI(id: string, aiAnalysis: string): Promise<InspectionItem>;
  
  // Compliance operations
  createComplianceDocument(doc: InsertComplianceDocument): Promise<ComplianceDocument>;
  getComplianceDocuments(organizationId: string): Promise<ComplianceDocument[]>;
  updateComplianceStatus(id: string, status: string): Promise<ComplianceDocument>;
  getExpiringCompliance(organizationId: string, daysAhead: number): Promise<ComplianceDocument[]>;
  
  // Maintenance operations
  createMaintenanceRequest(request: InsertMaintenanceRequest): Promise<MaintenanceRequest>;
  getMaintenanceRequestsByProperty(propertyId: string): Promise<MaintenanceRequest[]>;
  getMaintenanceByOrganization(organizationId: string): Promise<any[]>;
  updateMaintenanceStatus(id: string, status: string, assignedTo?: string): Promise<MaintenanceRequest>;
  
  // Comparison Report operations
  createComparisonReport(report: InsertComparisonReport): Promise<ComparisonReport>;
  getComparisonReportsByProperty(propertyId: string): Promise<ComparisonReport[]>;
  getComparisonReport(id: string): Promise<ComparisonReport | undefined>;
  
  // Credit Transaction operations
  createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction>;
  getCreditTransactions(organizationId: string): Promise<CreditTransaction[]>;

  // Block operations
  createBlock(block: InsertBlock & { organizationId: string }): Promise<Block>;
  getBlocksByOrganization(organizationId: string): Promise<Block[]>;
  getBlocksWithStats(organizationId: string): Promise<any[]>;
  getBlock(id: string): Promise<Block | undefined>;
  updateBlock(id: string, updates: Partial<InsertBlock>): Promise<Block>;
  deleteBlock(id: string): Promise<void>;

  // Inventory Template operations
  createInventoryTemplate(template: InsertInventoryTemplate): Promise<InventoryTemplate>;
  getInventoryTemplatesByOrganization(organizationId: string): Promise<InventoryTemplate[]>;
  getInventoryTemplate(id: string): Promise<InventoryTemplate | undefined>;
  updateInventoryTemplate(id: string, updates: Partial<InsertInventoryTemplate>): Promise<InventoryTemplate>;
  deleteInventoryTemplate(id: string): Promise<void>;

  // Inventory operations
  createInventory(inventory: InsertInventory): Promise<Inventory>;
  getInventoriesByProperty(propertyId: string): Promise<Inventory[]>;
  getInventoriesByOrganization(organizationId: string): Promise<Inventory[]>;
  getInventory(id: string): Promise<Inventory | undefined>;

  // Inventory Item operations
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  getInventoryItems(inventoryId: string): Promise<InventoryItem[]>;
  updateInventoryItem(id: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem>;

  // Work Order operations
  createWorkOrder(workOrder: InsertWorkOrder): Promise<WorkOrder>;
  getWorkOrdersByOrganization(organizationId: string): Promise<any[]>; // Returns with related data
  getWorkOrdersByContractor(contractorId: string): Promise<any[]>; // Returns with related data
  getWorkOrder(id: string): Promise<WorkOrder | undefined>;
  updateWorkOrderStatus(id: string, status: string, completedAt?: Date): Promise<WorkOrder>;
  updateWorkOrderCost(id: string, costActual: number, variationNotes?: string): Promise<WorkOrder>;

  // Work Log operations
  createWorkLog(log: InsertWorkLog): Promise<WorkLog>;
  getWorkLogs(workOrderId: string): Promise<WorkLog[]>;

  // Asset Inventory operations
  createAssetInventory(asset: InsertAssetInventory): Promise<AssetInventory>;
  getAssetInventoryByOrganization(organizationId: string): Promise<AssetInventory[]>;
  getAssetInventoryByProperty(propertyId: string): Promise<AssetInventory[]>;
  getAssetInventoryByBlock(blockId: string): Promise<AssetInventory[]>;
  getAssetInventory(id: string): Promise<AssetInventory | undefined>;
  updateAssetInventory(id: string, updates: Partial<InsertAssetInventory>): Promise<AssetInventory>;
  deleteAssetInventory(id: string): Promise<void>;

  // Inspection Template operations
  createInspectionTemplate(template: InsertInspectionTemplate): Promise<InspectionTemplate>;
  getInspectionTemplatesByOrganization(organizationId: string): Promise<InspectionTemplate[]>;
  getInspectionTemplate(id: string): Promise<InspectionTemplate | undefined>;
  updateInspectionTemplate(id: string, updates: Partial<InsertInspectionTemplate>): Promise<InspectionTemplate>;
  deleteInspectionTemplate(id: string): Promise<void>;

  // Inspection Template Point operations
  createInspectionTemplatePoint(point: InsertInspectionTemplatePoint): Promise<InspectionTemplatePoint>;
  getInspectionTemplatePoints(templateId: string): Promise<InspectionTemplatePoint[]>;
  getInspectionTemplatePoint(id: string): Promise<InspectionTemplatePoint | undefined>;
  updateInspectionTemplatePoint(id: string, updates: Partial<InsertInspectionTemplatePoint>): Promise<InspectionTemplatePoint>;
  deleteInspectionTemplatePoint(id: string): Promise<void>;

  // Inspection Response operations (Legacy - kept for backward compatibility)
  createInspectionResponse(response: InsertInspectionResponse): Promise<InspectionResponse>;
  getInspectionResponses(inspectionId: string): Promise<InspectionResponse[]>;
  getInspectionResponse(id: string): Promise<InspectionResponse | undefined>;
  updateInspectionResponse(id: string, updates: Partial<InsertInspectionResponse>): Promise<InspectionResponse>;
  deleteInspectionResponse(id: string): Promise<void>;

  // Template Category operations
  createTemplateCategory(category: InsertTemplateCategory): Promise<TemplateCategory>;
  getTemplateCategoriesByOrganization(organizationId: string): Promise<TemplateCategory[]>;
  getTemplateCategory(id: string): Promise<TemplateCategory | undefined>;
  updateTemplateCategory(id: string, updates: Partial<InsertTemplateCategory>): Promise<TemplateCategory>;
  deleteTemplateCategory(id: string): Promise<void>;

  // Template Inventory Link operations
  createTemplateInventoryLink(link: InsertTemplateInventoryLink): Promise<TemplateInventoryLink>;
  getTemplateInventoryLinks(templateId: string): Promise<TemplateInventoryLink[]>;
  deleteTemplateInventoryLink(id: string): Promise<void>;

  // Inspection Entry operations (New JSON-based system)
  createInspectionEntry(entry: InsertInspectionEntry): Promise<InspectionEntry>;
  createInspectionEntriesBatch(entries: InsertInspectionEntry[]): Promise<InspectionEntry[]>;
  getInspectionEntries(inspectionId: string): Promise<InspectionEntry[]>;
  getInspectionEntry(id: string): Promise<InspectionEntry | undefined>;
  updateInspectionEntry(id: string, updates: Partial<InsertInspectionEntry>): Promise<InspectionEntry>;
  deleteInspectionEntry(id: string): Promise<void>;
  getEntriesByOfflineId(offlineId: string): Promise<InspectionEntry | undefined>;

  // AI Image Analysis operations
  createAiImageAnalysis(analysis: InsertAiImageAnalysis): Promise<AiImageAnalysis>;
  getAiImageAnalysesByInspection(inspectionId: string): Promise<AiImageAnalysis[]>;
  getAiImageAnalysesByEntry(entryId: string): Promise<AiImageAnalysis[]>;
  getAiImageAnalysis(id: string): Promise<AiImageAnalysis | undefined>;

  // Inspection Snapshot operations
  updateInspectionSnapshots(id: string, templateSnapshot: any, inventorySnapshot: any, version: number): Promise<Inspection>;
  getInspectionWithSnapshots(id: string): Promise<Inspection | undefined>;

  // Tag operations
  createTag(tag: InsertTag): Promise<Tag>;
  getTagsByOrganization(organizationId: string): Promise<Tag[]>;
  getTag(id: string): Promise<Tag | undefined>;
  updateTag(id: string, updates: Partial<InsertTag>): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  
  // Tag entity association operations
  addTagToBlock(blockId: string, tagId: string): Promise<void>;
  removeTagFromBlock(blockId: string, tagId: string): Promise<void>;
  getTagsForBlock(blockId: string): Promise<Tag[]>;
  
  addTagToProperty(propertyId: string, tagId: string): Promise<void>;
  removeTagFromProperty(propertyId: string, tagId: string): Promise<void>;
  getTagsForProperty(propertyId: string): Promise<Tag[]>;
  
  addTagToUser(userId: string, tagId: string): Promise<void>;
  removeTagFromUser(userId: string, tagId: string): Promise<void>;
  getTagsForUser(userId: string): Promise<Tag[]>;
  
  addTagToComplianceDocument(complianceDocumentId: string, tagId: string): Promise<void>;
  removeTagFromComplianceDocument(complianceDocumentId: string, tagId: string): Promise<void>;
  getTagsForComplianceDocument(complianceDocumentId: string): Promise<Tag[]>;
  
  addTagToAssetInventory(assetInventoryId: string, tagId: string): Promise<void>;
  removeTagFromAssetInventory(assetInventoryId: string, tagId: string): Promise<void>;
  getTagsForAssetInventory(assetInventoryId: string): Promise<Tag[]>;
  
  addTagToMaintenanceRequest(maintenanceRequestId: string, tagId: string): Promise<void>;
  removeTagFromMaintenanceRequest(maintenanceRequestId: string, tagId: string): Promise<void>;
  getTagsForMaintenanceRequest(maintenanceRequestId: string): Promise<Tag[]>;
  
  // Tag search operations
  searchByTags(organizationId: string, tagIds: string[]): Promise<{
    blocks: any[];
    properties: any[];
    users: any[];
    complianceDocuments: any[];
    assetInventory: any[];
    maintenanceRequests: any[];
  }>;
  
  // Dashboard preferences operations
  getDashboardPreferences(userId: string): Promise<any | undefined>;
  updateDashboardPreferences(userId: string, enabledPanels: string[]): Promise<any>;

  // Admin operations
  getAdminByEmail(email: string): Promise<AdminUser | undefined>;
  getAllAdmins(): Promise<AdminUser[]>;
  createAdmin(admin: InsertAdminUser): Promise<AdminUser>;
  updateAdmin(id: string, updates: Partial<AdminUser>): Promise<AdminUser>;
  deleteAdmin(id: string): Promise<void>;
  getAllOrganizationsWithOwners(): Promise<any[]>;
  getOrganizationWithOwner(id: string): Promise<any | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUsersByOrganization(organizationId: string): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.organizationId, organizationId))
      .orderBy(users.role, users.email);
  }

  async getUsersByOrganizationAndRole(organizationId: string, role: string): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.role, role as any)));
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role: role as any, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updatePassword(id: string, hashedPassword: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async setResetToken(id: string, token: string, expiry: Date): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ resetToken: token, resetTokenExpiry: expiry, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async clearResetToken(id: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ resetToken: null, resetTokenExpiry: null, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Organization operations
  async createOrganization(orgData: InsertOrganization): Promise<Organization> {
    const [org] = await db.insert(organizations).values(orgData).returning();
    return org;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async updateOrganizationCredits(id: string, credits: number): Promise<Organization> {
    const [org] = await db
      .update(organizations)
      .set({ creditsRemaining: credits, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return org;
  }

  async updateOrganizationStripe(id: string, customerId: string, status: string): Promise<Organization> {
    const [org] = await db
      .update(organizations)
      .set({ 
        stripeCustomerId: customerId, 
        subscriptionStatus: status as any,
        updatedAt: new Date() 
      })
      .where(eq(organizations.id, id))
      .returning();
    return org;
  }

  // Contact operations
  async createContact(contactData: InsertContact & { organizationId: string }): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(contactData).returning();
    return contact;
  }

  async getContactsByOrganization(organizationId: string): Promise<Contact[]> {
    return await db
      .select()
      .from(contacts)
      .where(eq(contacts.organizationId, organizationId))
      .orderBy(contacts.lastName, contacts.firstName);
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async updateContact(id: string, updates: Partial<InsertContact>): Promise<Contact> {
    const [contact] = await db
      .update(contacts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    return contact;
  }

  async deleteContact(id: string): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  // Property operations
  async createProperty(propertyData: InsertProperty): Promise<Property> {
    const [property] = await db.insert(properties).values(propertyData).returning();
    return property;
  }

  async getPropertiesByOrganization(organizationId: string): Promise<Property[]> {
    return await db
      .select()
      .from(properties)
      .where(eq(properties.organizationId, organizationId))
      .orderBy(desc(properties.createdAt));
  }

  async getPropertiesWithStatsByBlock(blockId: string): Promise<any[]> {
    // Get all properties for this block (properties ARE units in new schema)
    const blockProperties = await db
      .select()
      .from(properties)
      .where(eq(properties.blockId, blockId));

    if (blockProperties.length === 0) {
      return [];
    }

    const propertyIds = blockProperties.map(p => p.id);

    // Batch fetch all inspections for these properties
    let allInspections: any[] = [];
    if (propertyIds.length > 0) {
      allInspections = await db
        .select()
        .from(inspections)
        .where(sql`${inspections.propertyId} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`);
    }

    // Group inspections by property
    const inspectionsByProperty = new Map<string, typeof allInspections>();
    allInspections.forEach(inspection => {
      if (inspection.propertyId && !inspectionsByProperty.has(inspection.propertyId)) {
        inspectionsByProperty.set(inspection.propertyId, []);
      }
      if (inspection.propertyId) {
        inspectionsByProperty.get(inspection.propertyId)!.push(inspection);
      }
    });

    // Calculate date ranges once
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(now.getDate() - 90);

    // Build stats for each property
    const propertiesWithStats = blockProperties.map(property => {
      // Get all inspections for this property
      const propertyInspections = inspectionsByProperty.get(property.id) || [];

      // Count inspections due in next 30 days
      const inspectionsDue = propertyInspections.filter(insp => {
        const scheduledDate = new Date(insp.scheduledDate);
        return scheduledDate >= now && 
               scheduledDate <= thirtyDaysFromNow && 
               insp.status !== 'completed';
      }).length;

      // Count overdue inspections
      const inspectionsOverdue = propertyInspections.filter(insp => {
        const scheduledDate = new Date(insp.scheduledDate);
        return scheduledDate < now && insp.status !== 'completed';
      }).length;

      // Calculate compliance rate (has recent completed inspection)
      let complianceRate = 0;
      let complianceStatus = 'No data';
      const hasRecentInspection = propertyInspections.some(insp => {
        const scheduledDate = new Date(insp.scheduledDate);
        return scheduledDate >= ninetyDaysAgo && insp.status === 'completed';
      });
      complianceRate = hasRecentInspection ? 100 : 0;
      complianceStatus = hasRecentInspection ? 'Compliant' : 'Needs inspection';

      return {
        ...property,
        stats: {
          complianceRate,
          complianceStatus,
          inspectionsDue,
          inspectionsOverdue,
        },
      };
    });

    return propertiesWithStats;
  }

  async getProperty(id: string): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property;
  }

  async getPropertiesByBlock(blockId: string): Promise<Property[]> {
    return await db
      .select()
      .from(properties)
      .where(eq(properties.blockId, blockId))
      .orderBy(properties.name);
  }

  async updateProperty(id: string, updates: Partial<InsertProperty>): Promise<Property> {
    const [property] = await db
      .update(properties)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(properties.id, id))
      .returning();
    return property;
  }

  // Inspection operations
  async createInspection(inspectionData: InsertInspection): Promise<Inspection> {
    const [inspection] = await db.insert(inspections).values(inspectionData).returning();
    return inspection;
  }

  async getInspectionsByProperty(propertyId: string): Promise<Inspection[]> {
    return await db
      .select()
      .from(inspections)
      .where(eq(inspections.propertyId, propertyId))
      .orderBy(desc(inspections.scheduledDate));
  }

  async getInspectionsByBlock(blockId: string): Promise<Inspection[]> {
    return await db
      .select()
      .from(inspections)
      .where(eq(inspections.blockId, blockId))
      .orderBy(desc(inspections.scheduledDate));
  }

  async getInspectionsByInspector(inspectorId: string): Promise<any[]> {
    const results = await db
      .select({
        inspection: inspections,
        property: properties,
        block: blocks,
        clerk: users,
      })
      .from(inspections)
      .leftJoin(properties, eq(inspections.propertyId, properties.id))
      .leftJoin(blocks, eq(inspections.blockId, blocks.id))
      .leftJoin(users, eq(inspections.inspectorId, users.id))
      .where(eq(inspections.inspectorId, inspectorId))
      .orderBy(desc(inspections.scheduledDate));
    
    // Flatten the structure to match frontend expectations
    return results.map(r => ({
      ...r.inspection,
      property: r.property,
      block: r.block,
      clerk: r.clerk,
    }));
  }

  async getInspectionsByOrganization(organizationId: string): Promise<any[]> {
    // Get all inspections for properties in this organization
    const propertyResults = await db
      .select({
        inspection: inspections,
        property: properties,
        clerk: users,
      })
      .from(inspections)
      .innerJoin(properties, eq(inspections.propertyId, properties.id))
      .leftJoin(users, eq(inspections.inspectorId, users.id))
      .where(eq(properties.organizationId, organizationId))
      .orderBy(desc(inspections.scheduledDate));
    
    // Get all inspections for blocks in this organization
    const blockResults = await db
      .select({
        inspection: inspections,
        block: blocks,
        clerk: users,
      })
      .from(inspections)
      .innerJoin(blocks, eq(inspections.blockId, blocks.id))
      .leftJoin(users, eq(inspections.inspectorId, users.id))
      .where(eq(blocks.organizationId, organizationId))
      .orderBy(desc(inspections.scheduledDate));
    
    // Combine and flatten the structure
    const combined = [
      ...propertyResults.map(r => ({
        ...r.inspection,
        property: r.property,
        block: null,
        clerk: r.clerk,
      })),
      ...blockResults.map(r => ({
        ...r.inspection,
        property: null,
        block: r.block,
        clerk: r.clerk,
      })),
    ];
    
    // Sort by scheduled date
    return combined.sort((a, b) => {
      const dateA = new Date(a.scheduledDate || 0).getTime();
      const dateB = new Date(b.scheduledDate || 0).getTime();
      return dateB - dateA;
    });
  }

  async getInspection(id: string): Promise<Inspection | undefined> {
    const [inspection] = await db.select().from(inspections).where(eq(inspections.id, id));
    return inspection;
  }

  async updateInspectionStatus(id: string, status: string, completedDate?: Date): Promise<Inspection> {
    const [inspection] = await db
      .update(inspections)
      .set({ 
        status: status as any, 
        completedDate: completedDate || new Date(),
        updatedAt: new Date() 
      })
      .where(eq(inspections.id, id))
      .returning();
    return inspection;
  }

  // Inspection Item operations
  async createInspectionItem(itemData: InsertInspectionItem): Promise<InspectionItem> {
    const [item] = await db.insert(inspectionItems).values(itemData).returning();
    return item;
  }

  async getInspectionItems(inspectionId: string): Promise<InspectionItem[]> {
    return await db
      .select()
      .from(inspectionItems)
      .where(eq(inspectionItems.inspectionId, inspectionId))
      .orderBy(inspectionItems.category, inspectionItems.itemName);
  }

  async getInspectionItem(id: string): Promise<InspectionItem | undefined> {
    const [item] = await db.select().from(inspectionItems).where(eq(inspectionItems.id, id));
    return item;
  }

  async updateInspectionItemAI(id: string, aiAnalysis: string): Promise<InspectionItem> {
    const [item] = await db
      .update(inspectionItems)
      .set({ aiAnalysis })
      .where(eq(inspectionItems.id, id))
      .returning();
    return item;
  }

  // Compliance operations
  async createComplianceDocument(docData: InsertComplianceDocument): Promise<ComplianceDocument> {
    const [doc] = await db.insert(complianceDocuments).values(docData).returning();
    return doc;
  }

  async getComplianceDocuments(organizationId: string): Promise<ComplianceDocument[]> {
    return await db
      .select()
      .from(complianceDocuments)
      .where(eq(complianceDocuments.organizationId, organizationId))
      .orderBy(desc(complianceDocuments.expiryDate));
  }

  async updateComplianceStatus(id: string, status: string): Promise<ComplianceDocument> {
    const [doc] = await db
      .update(complianceDocuments)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(complianceDocuments.id, id))
      .returning();
    return doc;
  }

  async getExpiringCompliance(organizationId: string, daysAhead: number): Promise<ComplianceDocument[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    
    return await db
      .select()
      .from(complianceDocuments)
      .where(
        and(
          eq(complianceDocuments.organizationId, organizationId),
          lte(complianceDocuments.expiryDate, futureDate)
        )
      )
      .orderBy(complianceDocuments.expiryDate);
  }

  // Maintenance operations
  async createMaintenanceRequest(requestData: InsertMaintenanceRequest): Promise<MaintenanceRequest> {
    const [request] = await db.insert(maintenanceRequests).values(requestData).returning();
    return request;
  }

  async getMaintenanceRequestsByProperty(propertyId: string): Promise<MaintenanceRequest[]> {
    return await db
      .select()
      .from(maintenanceRequests)
      .where(eq(maintenanceRequests.propertyId, propertyId))
      .orderBy(desc(maintenanceRequests.createdAt));
  }

  async getMaintenanceByOrganization(organizationId: string): Promise<any[]> {
    return await db
      .select({
        id: maintenanceRequests.id,
        propertyId: maintenanceRequests.propertyId,
        reportedBy: maintenanceRequests.reportedBy,
        assignedTo: maintenanceRequests.assignedTo,
        title: maintenanceRequests.title,
        description: maintenanceRequests.description,
        status: maintenanceRequests.status,
        priority: maintenanceRequests.priority,
        photoUrls: maintenanceRequests.photoUrls,
        aiSuggestedFixes: maintenanceRequests.aiSuggestedFixes,
        aiAnalysisJson: maintenanceRequests.aiAnalysisJson,
        createdAt: maintenanceRequests.createdAt,
        updatedAt: maintenanceRequests.updatedAt,
        property: {
          id: properties.id,
          name: properties.name,
          address: properties.address,
        },
      })
      .from(maintenanceRequests)
      .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
      .where(eq(properties.organizationId, organizationId))
      .orderBy(desc(maintenanceRequests.createdAt));
  }

  async updateMaintenanceStatus(id: string, status: string, assignedTo?: string): Promise<MaintenanceRequest> {
    const updateData: any = { status: status as any, updatedAt: new Date() };
    if (assignedTo !== undefined) {
      updateData.assignedTo = assignedTo;
    }
    
    const [request] = await db
      .update(maintenanceRequests)
      .set(updateData)
      .where(eq(maintenanceRequests.id, id))
      .returning();
    return request;
  }

  // Comparison Report operations
  async createComparisonReport(reportData: InsertComparisonReport): Promise<ComparisonReport> {
    const [report] = await db.insert(comparisonReports).values(reportData).returning();
    return report;
  }

  async getComparisonReportsByProperty(propertyId: string): Promise<ComparisonReport[]> {
    return await db
      .select()
      .from(comparisonReports)
      .where(eq(comparisonReports.propertyId, propertyId))
      .orderBy(desc(comparisonReports.createdAt));
  }

  async getComparisonReport(id: string): Promise<ComparisonReport | undefined> {
    const [report] = await db.select().from(comparisonReports).where(eq(comparisonReports.id, id));
    return report;
  }
  
  // Inspection Category operations
  async createInspectionCategory(categoryData: InsertInspectionCategory): Promise<InspectionCategory> {
    const [category] = await db.insert(inspectionCategories).values(categoryData).returning();
    return category;
  }

  async getInspectionCategories(organizationId: string): Promise<InspectionCategory[]> {
    return await db
      .select()
      .from(inspectionCategories)
      .where(eq(inspectionCategories.organizationId, organizationId))
      .orderBy(inspectionCategories.sortOrder, inspectionCategories.name);
  }

  async getInspectionCategory(id: string): Promise<InspectionCategory | undefined> {
    const [category] = await db.select().from(inspectionCategories).where(eq(inspectionCategories.id, id));
    return category;
  }

  async updateInspectionCategory(id: string, updates: Partial<InsertInspectionCategory>): Promise<InspectionCategory> {
    const [category] = await db
      .update(inspectionCategories)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inspectionCategories.id, id))
      .returning();
    return category;
  }

  async deleteInspectionCategory(id: string): Promise<void> {
    await db.delete(inspectionCategories).where(eq(inspectionCategories.id, id));
  }

  // Credit Transaction operations
  async createCreditTransaction(transactionData: InsertCreditTransaction): Promise<CreditTransaction> {
    const [transaction] = await db.insert(creditTransactions).values(transactionData).returning();
    return transaction;
  }

  async getCreditTransactions(organizationId: string): Promise<CreditTransaction[]> {
    return await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.organizationId, organizationId))
      .orderBy(desc(creditTransactions.createdAt));
  }

  // Block operations
  async createBlock(blockData: InsertBlock & { organizationId: string }): Promise<Block> {
    const [block] = await db.insert(blocks).values(blockData).returning();
    return block;
  }

  async getBlocksByOrganization(organizationId: string): Promise<Block[]> {
    return await db
      .select()
      .from(blocks)
      .where(eq(blocks.organizationId, organizationId))
      .orderBy(blocks.name);
  }

  async getBlocksWithStats(organizationId: string): Promise<any[]> {
    const allBlocks = await this.getBlocksByOrganization(organizationId);
    
    if (allBlocks.length === 0) {
      return [];
    }
    
    const blockIds = allBlocks.map(b => b.id);
    
    // Batch fetch all properties for all blocks at once (properties ARE units)
    const allProperties = await db
      .select()
      .from(properties)
      .where(and(
        eq(properties.organizationId, organizationId),
        sql`${properties.blockId} IN (${sql.join(blockIds.map(id => sql`${id}`), sql`, `)})`
      ));
    
    // Group properties by block
    const propertiesByBlock = new Map<string, typeof allProperties>();
    allProperties.forEach(prop => {
      if (prop.blockId) {
        if (!propertiesByBlock.has(prop.blockId)) {
          propertiesByBlock.set(prop.blockId, []);
        }
        propertiesByBlock.get(prop.blockId)!.push(prop);
      }
    });
    
    // Batch fetch all property-level inspections
    const propertyIds = allProperties.map(p => p.id);
    let propertyInspections: any[] = [];
    if (propertyIds.length > 0) {
      propertyInspections = await db
        .select()
        .from(inspections)
        .where(sql`${inspections.propertyId} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`);
    }
    
    // Batch fetch all block-level inspections
    let blockInspections: any[] = [];
    if (blockIds.length > 0) {
      blockInspections = await db
        .select()
        .from(inspections)
        .where(sql`${inspections.blockId} IN (${sql.join(blockIds.map(id => sql`${id}`), sql`, `)})`);
    }
    
    // Group inspections by property
    const inspectionsByProperty = new Map<string, typeof propertyInspections>();
    propertyInspections.forEach(inspection => {
      if (inspection.propertyId && !inspectionsByProperty.has(inspection.propertyId)) {
        inspectionsByProperty.set(inspection.propertyId, []);
      }
      if (inspection.propertyId) {
        inspectionsByProperty.get(inspection.propertyId)!.push(inspection);
      }
    });
    
    // Group inspections by block
    const inspectionsByBlock = new Map<string, typeof blockInspections>();
    blockInspections.forEach(inspection => {
      if (inspection.blockId && !inspectionsByBlock.has(inspection.blockId)) {
        inspectionsByBlock.set(inspection.blockId, []);
      }
      if (inspection.blockId) {
        inspectionsByBlock.get(inspection.blockId)!.push(inspection);
      }
    });
    
    // Calculate date ranges once
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(now.getDate() - 90);
    
    // Build stats for each block
    const blocksWithStats = allBlocks.map(block => {
      const blockProperties = propertiesByBlock.get(block.id) || [];
      const totalProperties = blockProperties.length;
      
      // Get all inspections for this block (both property-level and block-level)
      const blockPropertyInspections = blockProperties.flatMap(prop => 
        inspectionsByProperty.get(prop.id) || []
      );
      const directBlockInspections = inspectionsByBlock.get(block.id) || [];
      const allBlockInspections = [...blockPropertyInspections, ...directBlockInspections];
      
      // Count inspections due in next 30 days
      const inspectionsDue = allBlockInspections.filter(insp => {
        const scheduledDate = new Date(insp.scheduledDate);
        return scheduledDate >= now && 
               scheduledDate <= thirtyDaysFromNow && 
               insp.status !== 'completed';
      }).length;
      
      // Count overdue inspections
      const overdueInspections = allBlockInspections.filter(insp => {
        const scheduledDate = new Date(insp.scheduledDate);
        return scheduledDate < now && insp.status !== 'completed';
      }).length;
      
      // Calculate compliance rate (properties with recent completed inspections)
      let complianceRate = 0;
      if (totalProperties > 0) {
        const propertiesWithRecentInspections = new Set<string>();
        blockPropertyInspections.forEach(insp => {
          const scheduledDate = new Date(insp.scheduledDate);
          if (scheduledDate >= ninetyDaysAgo && insp.status === 'completed' && insp.propertyId) {
            propertiesWithRecentInspections.add(insp.propertyId);
          }
        });
        complianceRate = Math.round((propertiesWithRecentInspections.size / totalProperties) * 100);
      }
      
      return {
        ...block,
        stats: {
          totalProperties,
          complianceRate,
          inspectionsDue,
          overdueInspections,
        },
      };
    });
    
    return blocksWithStats;
  }

  async getBlock(id: string): Promise<Block | undefined> {
    const [block] = await db.select().from(blocks).where(eq(blocks.id, id));
    return block;
  }

  async updateBlock(id: string, updates: Partial<InsertBlock>): Promise<Block> {
    const [block] = await db
      .update(blocks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(blocks.id, id))
      .returning();
    return block;
  }

  async deleteBlock(id: string): Promise<void> {
    await db.delete(blocks).where(eq(blocks.id, id));
  }

  // Inventory Template operations
  async createInventoryTemplate(templateData: InsertInventoryTemplate): Promise<InventoryTemplate> {
    const [template] = await db.insert(inventoryTemplates).values(templateData).returning();
    return template;
  }

  async getInventoryTemplatesByOrganization(organizationId: string): Promise<InventoryTemplate[]> {
    return await db
      .select()
      .from(inventoryTemplates)
      .where(eq(inventoryTemplates.organizationId, organizationId))
      .orderBy(inventoryTemplates.name);
  }

  async getInventoryTemplate(id: string): Promise<InventoryTemplate | undefined> {
    const [template] = await db.select().from(inventoryTemplates).where(eq(inventoryTemplates.id, id));
    return template;
  }

  async updateInventoryTemplate(id: string, updates: Partial<InsertInventoryTemplate>): Promise<InventoryTemplate> {
    const [template] = await db
      .update(inventoryTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inventoryTemplates.id, id))
      .returning();
    return template;
  }

  async deleteInventoryTemplate(id: string): Promise<void> {
    await db.delete(inventoryTemplates).where(eq(inventoryTemplates.id, id));
  }

  // Inventory operations
  async createInventory(inventoryData: InsertInventory): Promise<Inventory> {
    const [inventory] = await db.insert(inventories).values(inventoryData).returning();
    return inventory;
  }

  async getInventoriesByProperty(propertyId: string): Promise<Inventory[]> {
    return await db
      .select()
      .from(inventories)
      .where(eq(inventories.propertyId, propertyId))
      .orderBy(desc(inventories.version));
  }

  async getInventoriesByOrganization(organizationId: string): Promise<Inventory[]> {
    return await db
      .select()
      .from(inventories)
      .where(eq(inventories.organizationId, organizationId))
      .orderBy(desc(inventories.createdAt));
  }

  async getInventory(id: string): Promise<Inventory | undefined> {
    const [inventory] = await db.select().from(inventories).where(eq(inventories.id, id));
    return inventory;
  }

  // Inventory Item operations
  async createInventoryItem(itemData: InsertInventoryItem): Promise<InventoryItem> {
    const [item] = await db.insert(inventoryItems).values(itemData).returning();
    return item;
  }

  async getInventoryItems(inventoryId: string): Promise<InventoryItem[]> {
    return await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.inventoryId, inventoryId))
      .orderBy(inventoryItems.path);
  }

  async updateInventoryItem(id: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem> {
    const [item] = await db
      .update(inventoryItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();
    return item;
  }

  // Work Order operations
  async createWorkOrder(workOrderData: InsertWorkOrder): Promise<WorkOrder> {
    const [workOrder] = await db.insert(workOrders).values(workOrderData).returning();
    return workOrder;
  }

  async getWorkOrdersByOrganization(organizationId: string): Promise<any[]> {
    return await db
      .select({
        id: workOrders.id,
        organizationId: workOrders.organizationId,
        maintenanceRequestId: workOrders.maintenanceRequestId,
        contractorId: workOrders.contractorId,
        status: workOrders.status,
        slaDue: workOrders.slaDue,
        costEstimate: workOrders.costEstimate,
        costActual: workOrders.costActual,
        variationNotes: workOrders.variationNotes,
        completedAt: workOrders.completedAt,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
        maintenanceRequest: {
          id: maintenanceRequests.id,
          title: maintenanceRequests.title,
          description: maintenanceRequests.description,
          priority: maintenanceRequests.priority,
          propertyId: maintenanceRequests.propertyId,
        },
        contractor: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(workOrders)
      .innerJoin(maintenanceRequests, eq(workOrders.maintenanceRequestId, maintenanceRequests.id))
      .innerJoin(users, eq(workOrders.contractorId, users.id))
      .where(eq(workOrders.organizationId, organizationId))
      .orderBy(desc(workOrders.createdAt));
  }

  async getWorkOrdersByContractor(contractorId: string): Promise<any[]> {
    return await db
      .select({
        id: workOrders.id,
        organizationId: workOrders.organizationId,
        maintenanceRequestId: workOrders.maintenanceRequestId,
        contractorId: workOrders.contractorId,
        status: workOrders.status,
        slaDue: workOrders.slaDue,
        costEstimate: workOrders.costEstimate,
        costActual: workOrders.costActual,
        variationNotes: workOrders.variationNotes,
        completedAt: workOrders.completedAt,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
        maintenanceRequest: {
          id: maintenanceRequests.id,
          title: maintenanceRequests.title,
          description: maintenanceRequests.description,
          priority: maintenanceRequests.priority,
          propertyId: maintenanceRequests.propertyId,
        },
      })
      .from(workOrders)
      .innerJoin(maintenanceRequests, eq(workOrders.maintenanceRequestId, maintenanceRequests.id))
      .where(eq(workOrders.contractorId, contractorId))
      .orderBy(desc(workOrders.createdAt));
  }

  async getWorkOrder(id: string): Promise<WorkOrder | undefined> {
    const [workOrder] = await db.select().from(workOrders).where(eq(workOrders.id, id));
    return workOrder;
  }

  async updateWorkOrderStatus(id: string, status: string, completedAt?: Date): Promise<WorkOrder> {
    const updateData: any = { status: status as any, updatedAt: new Date() };
    if (completedAt !== undefined) {
      updateData.completedAt = completedAt;
    }
    
    const [workOrder] = await db
      .update(workOrders)
      .set(updateData)
      .where(eq(workOrders.id, id))
      .returning();
    return workOrder;
  }

  async updateWorkOrderCost(id: string, costActual: number, variationNotes?: string): Promise<WorkOrder> {
    const updateData: any = { costActual, updatedAt: new Date() };
    if (variationNotes !== undefined) {
      updateData.variationNotes = variationNotes;
    }
    
    const [workOrder] = await db
      .update(workOrders)
      .set(updateData)
      .where(eq(workOrders.id, id))
      .returning();
    return workOrder;
  }

  // Work Log operations
  async createWorkLog(logData: InsertWorkLog): Promise<WorkLog> {
    const [log] = await db.insert(workLogs).values(logData).returning();
    return log;
  }

  async getWorkLogs(workOrderId: string): Promise<WorkLog[]> {
    return await db
      .select()
      .from(workLogs)
      .where(eq(workLogs.workOrderId, workOrderId))
      .orderBy(desc(workLogs.createdAt));
  }

  // Asset Inventory operations
  async createAssetInventory(assetData: InsertAssetInventory): Promise<AssetInventory> {
    const [asset] = await db.insert(assetInventory).values(assetData).returning();
    return asset;
  }

  async getAssetInventoryByOrganization(organizationId: string): Promise<AssetInventory[]> {
    return await db
      .select()
      .from(assetInventory)
      .where(eq(assetInventory.organizationId, organizationId))
      .orderBy(desc(assetInventory.createdAt));
  }

  async getAssetInventoryByProperty(propertyId: string): Promise<AssetInventory[]> {
    return await db
      .select()
      .from(assetInventory)
      .where(eq(assetInventory.propertyId, propertyId))
      .orderBy(desc(assetInventory.createdAt));
  }

  async getAssetInventoryByBlock(blockId: string): Promise<AssetInventory[]> {
    return await db
      .select()
      .from(assetInventory)
      .where(eq(assetInventory.blockId, blockId))
      .orderBy(desc(assetInventory.createdAt));
  }

  async getAssetInventory(id: string): Promise<AssetInventory | undefined> {
    const [asset] = await db
      .select()
      .from(assetInventory)
      .where(eq(assetInventory.id, id));
    return asset;
  }

  async updateAssetInventory(id: string, updates: Partial<InsertAssetInventory>): Promise<AssetInventory> {
    const [asset] = await db
      .update(assetInventory)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(assetInventory.id, id))
      .returning();
    return asset;
  }

  async deleteAssetInventory(id: string): Promise<void> {
    await db.delete(assetInventory).where(eq(assetInventory.id, id));
  }

  // Inspection Template operations
  async createInspectionTemplate(templateData: InsertInspectionTemplate): Promise<InspectionTemplate> {
    const [template] = await db.insert(inspectionTemplates).values(templateData).returning();
    return template;
  }

  async getInspectionTemplatesByOrganization(organizationId: string): Promise<InspectionTemplate[]> {
    return await db
      .select()
      .from(inspectionTemplates)
      .where(eq(inspectionTemplates.organizationId, organizationId))
      .orderBy(desc(inspectionTemplates.createdAt));
  }

  async getInspectionTemplate(id: string): Promise<InspectionTemplate | undefined> {
    const [template] = await db
      .select()
      .from(inspectionTemplates)
      .where(eq(inspectionTemplates.id, id));
    return template;
  }

  async updateInspectionTemplate(id: string, updates: Partial<InsertInspectionTemplate>): Promise<InspectionTemplate> {
    const [template] = await db
      .update(inspectionTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inspectionTemplates.id, id))
      .returning();
    return template;
  }

  async deleteInspectionTemplate(id: string): Promise<void> {
    // First delete all template points associated with this template
    await db.delete(inspectionTemplatePoints).where(eq(inspectionTemplatePoints.templateId, id));
    // Then delete the template itself
    await db.delete(inspectionTemplates).where(eq(inspectionTemplates.id, id));
  }

  // Inspection Template Point operations
  async createInspectionTemplatePoint(pointData: InsertInspectionTemplatePoint): Promise<InspectionTemplatePoint> {
    const [point] = await db.insert(inspectionTemplatePoints).values(pointData).returning();
    return point;
  }

  async getInspectionTemplatePoints(templateId: string): Promise<InspectionTemplatePoint[]> {
    return await db
      .select()
      .from(inspectionTemplatePoints)
      .where(eq(inspectionTemplatePoints.templateId, templateId))
      .orderBy(inspectionTemplatePoints.sortOrder);
  }

  async getInspectionTemplatePoint(id: string): Promise<InspectionTemplatePoint | undefined> {
    const [point] = await db
      .select()
      .from(inspectionTemplatePoints)
      .where(eq(inspectionTemplatePoints.id, id));
    return point;
  }

  async updateInspectionTemplatePoint(id: string, updates: Partial<InsertInspectionTemplatePoint>): Promise<InspectionTemplatePoint> {
    const [point] = await db
      .update(inspectionTemplatePoints)
      .set(updates)
      .where(eq(inspectionTemplatePoints.id, id))
      .returning();
    return point;
  }

  async deleteInspectionTemplatePoint(id: string): Promise<void> {
    await db.delete(inspectionTemplatePoints).where(eq(inspectionTemplatePoints.id, id));
  }

  // Inspection Response operations
  async createInspectionResponse(responseData: InsertInspectionResponse): Promise<InspectionResponse> {
    const [response] = await db.insert(inspectionResponses).values(responseData).returning();
    return response;
  }

  async getInspectionResponses(inspectionId: string): Promise<InspectionResponse[]> {
    return await db
      .select()
      .from(inspectionResponses)
      .where(eq(inspectionResponses.inspectionId, inspectionId))
      .orderBy(inspectionResponses.createdAt);
  }

  async getInspectionResponse(id: string): Promise<InspectionResponse | undefined> {
    const [response] = await db
      .select()
      .from(inspectionResponses)
      .where(eq(inspectionResponses.id, id));
    return response;
  }

  async updateInspectionResponse(id: string, updates: Partial<InsertInspectionResponse>): Promise<InspectionResponse> {
    const [response] = await db
      .update(inspectionResponses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inspectionResponses.id, id))
      .returning();
    return response;
  }

  async deleteInspectionResponse(id: string): Promise<void> {
    await db.delete(inspectionResponses).where(eq(inspectionResponses.id, id));
  }

  // Tag operations
  async createTag(tagData: InsertTag): Promise<Tag> {
    const [tag] = await db.insert(tags).values(tagData).returning();
    return tag;
  }

  async getTagsByOrganization(organizationId: string): Promise<Tag[]> {
    return await db
      .select()
      .from(tags)
      .where(eq(tags.organizationId, organizationId))
      .orderBy(tags.name);
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db
      .select()
      .from(tags)
      .where(eq(tags.id, id));
    return tag;
  }

  async updateTag(id: string, updates: Partial<InsertTag>): Promise<Tag> {
    const [tag] = await db
      .update(tags)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tags.id, id))
      .returning();
    return tag;
  }

  async deleteTag(id: string): Promise<void> {
    // Delete all tag associations first
    await db.delete(blockTags).where(eq(blockTags.tagId, id));
    await db.delete(propertyTags).where(eq(propertyTags.tagId, id));
    await db.delete(userTags).where(eq(userTags.tagId, id));
    await db.delete(complianceDocumentTags).where(eq(complianceDocumentTags.tagId, id));
    await db.delete(assetInventoryTags).where(eq(assetInventoryTags.tagId, id));
    await db.delete(maintenanceRequestTags).where(eq(maintenanceRequestTags.tagId, id));
    // Delete the tag itself
    await db.delete(tags).where(eq(tags.id, id));
  }

  // Block tag operations
  async addTagToBlock(blockId: string, tagId: string): Promise<void> {
    await db.insert(blockTags).values({ blockId, tagId });
  }

  async removeTagFromBlock(blockId: string, tagId: string): Promise<void> {
    await db.delete(blockTags).where(
      and(eq(blockTags.blockId, blockId), eq(blockTags.tagId, tagId))
    );
  }

  async getTagsForBlock(blockId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(blockTags)
      .innerJoin(tags, eq(blockTags.tagId, tags.id))
      .where(eq(blockTags.blockId, blockId));
    return result.map(r => r.tag);
  }

  // Property tag operations
  async addTagToProperty(propertyId: string, tagId: string): Promise<void> {
    await db.insert(propertyTags).values({ propertyId, tagId });
  }

  async removeTagFromProperty(propertyId: string, tagId: string): Promise<void> {
    await db.delete(propertyTags).where(
      and(eq(propertyTags.propertyId, propertyId), eq(propertyTags.tagId, tagId))
    );
  }

  async getTagsForProperty(propertyId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(propertyTags)
      .innerJoin(tags, eq(propertyTags.tagId, tags.id))
      .where(eq(propertyTags.propertyId, propertyId));
    return result.map(r => r.tag);
  }

  // User tag operations
  async addTagToUser(userId: string, tagId: string): Promise<void> {
    await db.insert(userTags).values({ userId, tagId });
  }

  async removeTagFromUser(userId: string, tagId: string): Promise<void> {
    await db.delete(userTags).where(
      and(eq(userTags.userId, userId), eq(userTags.tagId, tagId))
    );
  }

  async getTagsForUser(userId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(userTags)
      .innerJoin(tags, eq(userTags.tagId, tags.id))
      .where(eq(userTags.userId, userId));
    return result.map(r => r.tag);
  }

  // Compliance document tag operations
  async addTagToComplianceDocument(complianceDocumentId: string, tagId: string): Promise<void> {
    await db.insert(complianceDocumentTags).values({ complianceDocumentId, tagId });
  }

  async removeTagFromComplianceDocument(complianceDocumentId: string, tagId: string): Promise<void> {
    await db.delete(complianceDocumentTags).where(
      and(
        eq(complianceDocumentTags.complianceDocumentId, complianceDocumentId),
        eq(complianceDocumentTags.tagId, tagId)
      )
    );
  }

  async getTagsForComplianceDocument(complianceDocumentId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(complianceDocumentTags)
      .innerJoin(tags, eq(complianceDocumentTags.tagId, tags.id))
      .where(eq(complianceDocumentTags.complianceDocumentId, complianceDocumentId));
    return result.map(r => r.tag);
  }

  // Asset inventory tag operations
  async addTagToAssetInventory(assetInventoryId: string, tagId: string): Promise<void> {
    await db.insert(assetInventoryTags).values({ assetInventoryId, tagId });
  }

  async removeTagFromAssetInventory(assetInventoryId: string, tagId: string): Promise<void> {
    await db.delete(assetInventoryTags).where(
      and(
        eq(assetInventoryTags.assetInventoryId, assetInventoryId),
        eq(assetInventoryTags.tagId, tagId)
      )
    );
  }

  async getTagsForAssetInventory(assetInventoryId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(assetInventoryTags)
      .innerJoin(tags, eq(assetInventoryTags.tagId, tags.id))
      .where(eq(assetInventoryTags.assetInventoryId, assetInventoryId));
    return result.map(r => r.tag);
  }

  // Maintenance request tag operations
  async addTagToMaintenanceRequest(maintenanceRequestId: string, tagId: string): Promise<void> {
    await db.insert(maintenanceRequestTags).values({ maintenanceRequestId, tagId });
  }

  async removeTagFromMaintenanceRequest(maintenanceRequestId: string, tagId: string): Promise<void> {
    await db.delete(maintenanceRequestTags).where(
      and(
        eq(maintenanceRequestTags.maintenanceRequestId, maintenanceRequestId),
        eq(maintenanceRequestTags.tagId, tagId)
      )
    );
  }

  async getTagsForMaintenanceRequest(maintenanceRequestId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(maintenanceRequestTags)
      .innerJoin(tags, eq(maintenanceRequestTags.tagId, tags.id))
      .where(eq(maintenanceRequestTags.maintenanceRequestId, maintenanceRequestId));
    return result.map(r => r.tag);
  }

  // Tag search operations
  async searchByTags(organizationId: string, tagIds: string[]): Promise<{
    blocks: any[];
    properties: any[];
    users: any[];
    complianceDocuments: any[];
    assetInventory: any[];
    maintenanceRequests: any[];
  }> {
    const results = {
      blocks: [] as any[],
      properties: [] as any[],
      users: [] as any[],
      complianceDocuments: [] as any[],
      assetInventory: [] as any[],
      maintenanceRequests: [] as any[],
    };

    if (tagIds.length === 0) {
      return results;
    }

    // Search blocks with these tags
    const blocksResult = await db
      .select({ block: blocks })
      .from(blockTags)
      .innerJoin(blocks, eq(blockTags.blockId, blocks.id))
      .where(
        and(
          sql`${blockTags.tagId} = ANY(${tagIds})`,
          eq(blocks.organizationId, organizationId)
        )
      );
    results.blocks = blocksResult.map(r => r.block);

    // Search properties with these tags
    const propertiesResult = await db
      .select({ property: properties })
      .from(propertyTags)
      .innerJoin(properties, eq(propertyTags.propertyId, properties.id))
      .where(
        and(
          sql`${propertyTags.tagId} = ANY(${tagIds})`,
          eq(properties.organizationId, organizationId)
        )
      );
    results.properties = propertiesResult.map(r => r.property);

    // Search users with these tags
    const usersResult = await db
      .select({ user: users })
      .from(userTags)
      .innerJoin(users, eq(userTags.userId, users.id))
      .where(
        and(
          sql`${userTags.tagId} = ANY(${tagIds})`,
          eq(users.organizationId, organizationId)
        )
      );
    results.users = usersResult.map(r => r.user);

    // Search compliance documents with these tags
    const complianceResult = await db
      .select({ doc: complianceDocuments })
      .from(complianceDocumentTags)
      .innerJoin(complianceDocuments, eq(complianceDocumentTags.complianceDocumentId, complianceDocuments.id))
      .where(
        and(
          sql`${complianceDocumentTags.tagId} = ANY(${tagIds})`,
          eq(complianceDocuments.organizationId, organizationId)
        )
      );
    results.complianceDocuments = complianceResult.map(r => r.doc);

    // Search asset inventory with these tags
    const assetResult = await db
      .select({ asset: assetInventory })
      .from(assetInventoryTags)
      .innerJoin(assetInventory, eq(assetInventoryTags.assetInventoryId, assetInventory.id))
      .where(
        and(
          sql`${assetInventoryTags.tagId} = ANY(${tagIds})`,
          eq(assetInventory.organizationId, organizationId)
        )
      );
    results.assetInventory = assetResult.map(r => r.asset);

    // Search maintenance requests with these tags
    const maintenanceResult = await db
      .select({ request: maintenanceRequests })
      .from(maintenanceRequestTags)
      .innerJoin(maintenanceRequests, eq(maintenanceRequestTags.maintenanceRequestId, maintenanceRequests.id))
      .where(
        and(
          sql`${maintenanceRequestTags.tagId} = ANY(${tagIds})`,
          eq(maintenanceRequests.organizationId, organizationId)
        )
      );
    results.maintenanceRequests = maintenanceResult.map(r => r.request);

    return results;
  }

  // Dashboard preferences operations
  async getDashboardPreferences(userId: string): Promise<DashboardPreferences | undefined> {
    const [prefs] = await db
      .select()
      .from(dashboardPreferences)
      .where(eq(dashboardPreferences.userId, userId));
    return prefs;
  }

  async updateDashboardPreferences(userId: string, enabledPanels: string[]): Promise<DashboardPreferences> {
    const existing = await this.getDashboardPreferences(userId);
    
    if (existing) {
      const [updated] = await db
        .update(dashboardPreferences)
        .set({ 
          enabledPanels: JSON.stringify(enabledPanels),
          updatedAt: new Date()
        })
        .where(eq(dashboardPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(dashboardPreferences)
        .values({
          userId,
          enabledPanels: JSON.stringify(enabledPanels)
        })
        .returning();
      return created;
    }
  }

  // Template Category operations
  async createTemplateCategory(categoryData: InsertTemplateCategory): Promise<TemplateCategory> {
    const [category] = await db.insert(templateCategories).values(categoryData).returning();
    return category;
  }

  async getTemplateCategoriesByOrganization(organizationId: string): Promise<TemplateCategory[]> {
    return await db
      .select()
      .from(templateCategories)
      .where(eq(templateCategories.organizationId, organizationId))
      .orderBy(desc(templateCategories.createdAt));
  }

  async getTemplateCategory(id: string): Promise<TemplateCategory | undefined> {
    const [category] = await db.select().from(templateCategories).where(eq(templateCategories.id, id));
    return category;
  }

  async updateTemplateCategory(id: string, updates: Partial<InsertTemplateCategory>): Promise<TemplateCategory> {
    const [updated] = await db
      .update(templateCategories)
      .set(updates)
      .where(eq(templateCategories.id, id))
      .returning();
    return updated;
  }

  async deleteTemplateCategory(id: string): Promise<void> {
    await db.delete(templateCategories).where(eq(templateCategories.id, id));
  }

  // Template Inventory Link operations
  async createTemplateInventoryLink(linkData: InsertTemplateInventoryLink): Promise<TemplateInventoryLink> {
    const [link] = await db.insert(templateInventoryLinks).values(linkData).returning();
    return link;
  }

  async getTemplateInventoryLinks(templateId: string): Promise<TemplateInventoryLink[]> {
    return await db
      .select()
      .from(templateInventoryLinks)
      .where(eq(templateInventoryLinks.templateId, templateId));
  }

  async deleteTemplateInventoryLink(id: string): Promise<void> {
    await db.delete(templateInventoryLinks).where(eq(templateInventoryLinks.id, id));
  }

  // Inspection Entry operations (New JSON-based system)
  async createInspectionEntry(entryData: InsertInspectionEntry): Promise<InspectionEntry> {
    const [entry] = await db.insert(inspectionEntries).values(entryData).returning();
    return entry;
  }

  async createInspectionEntriesBatch(entriesData: InsertInspectionEntry[]): Promise<InspectionEntry[]> {
    if (entriesData.length === 0) return [];
    // Use onConflictDoUpdate to handle offline sync retries idempotently
    // If offlineId exists, update the entry; otherwise insert new
    const entries = await db
      .insert(inspectionEntries)
      .values(entriesData)
      .onConflictDoUpdate({
        target: inspectionEntries.offlineId,
        set: {
          sectionRef: sql`EXCLUDED.section_ref`,
          itemRef: sql`EXCLUDED.item_ref`,
          fieldKey: sql`EXCLUDED.field_key`,
          fieldType: sql`EXCLUDED.field_type`,
          valueJson: sql`EXCLUDED.value_json`,
          note: sql`EXCLUDED.note`,
          photos: sql`EXCLUDED.photos`,
          videos: sql`EXCLUDED.videos`,
          maintenanceFlag: sql`EXCLUDED.maintenance_flag`,
          defectsJson: sql`EXCLUDED.defects_json`,
          updatedAt: new Date()
        }
      })
      .returning();
    return entries;
  }

  async getInspectionEntries(inspectionId: string): Promise<InspectionEntry[]> {
    return await db
      .select()
      .from(inspectionEntries)
      .where(eq(inspectionEntries.inspectionId, inspectionId))
      .orderBy(inspectionEntries.createdAt);
  }

  async getInspectionEntry(id: string): Promise<InspectionEntry | undefined> {
    const [entry] = await db.select().from(inspectionEntries).where(eq(inspectionEntries.id, id));
    return entry;
  }

  async updateInspectionEntry(id: string, updates: Partial<InsertInspectionEntry>): Promise<InspectionEntry> {
    const [updated] = await db
      .update(inspectionEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inspectionEntries.id, id))
      .returning();
    return updated;
  }

  async deleteInspectionEntry(id: string): Promise<void> {
    await db.delete(inspectionEntries).where(eq(inspectionEntries.id, id));
  }

  async getEntriesByOfflineId(offlineId: string): Promise<InspectionEntry | undefined> {
    const [entry] = await db
      .select()
      .from(inspectionEntries)
      .where(eq(inspectionEntries.offlineId, offlineId));
    return entry;
  }

  // AI Image Analysis operations
  async createAiImageAnalysis(analysisData: InsertAiImageAnalysis): Promise<AiImageAnalysis> {
    const [analysis] = await db.insert(aiImageAnalyses).values(analysisData).returning();
    return analysis;
  }

  async getAiImageAnalysesByInspection(inspectionId: string): Promise<AiImageAnalysis[]> {
    return await db
      .select()
      .from(aiImageAnalyses)
      .where(eq(aiImageAnalyses.inspectionId, inspectionId))
      .orderBy(desc(aiImageAnalyses.createdAt));
  }

  async getAiImageAnalysesByEntry(entryId: string): Promise<AiImageAnalysis[]> {
    return await db
      .select()
      .from(aiImageAnalyses)
      .where(eq(aiImageAnalyses.inspectionEntryId, entryId))
      .orderBy(desc(aiImageAnalyses.createdAt));
  }

  async getAiImageAnalysis(id: string): Promise<AiImageAnalysis | undefined> {
    const [analysis] = await db.select().from(aiImageAnalyses).where(eq(aiImageAnalyses.id, id));
    return analysis;
  }

  // Inspection Snapshot operations
  async updateInspectionSnapshots(
    id: string,
    templateSnapshot: any,
    inventorySnapshot: any,
    version: number
  ): Promise<Inspection> {
    const [updated] = await db
      .update(inspections)
      .set({
        templateSnapshotJson: templateSnapshot,
        inventorySnapshotJson: inventorySnapshot,
        templateVersion: version,
        startedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(inspections.id, id))
      .returning();
    return updated;
  }

  async getInspectionWithSnapshots(id: string): Promise<Inspection | undefined> {
    const [inspection] = await db.select().from(inspections).where(eq(inspections.id, id));
    return inspection;
  }

  // Admin operations
  async getAdminByEmail(email: string): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
    return admin;
  }

  async getAllAdmins(): Promise<AdminUser[]> {
    return await db.select().from(adminUsers).orderBy(desc(adminUsers.createdAt));
  }

  async createAdmin(adminData: InsertAdminUser): Promise<AdminUser> {
    const [admin] = await db.insert(adminUsers).values(adminData).returning();
    return admin;
  }

  async updateAdmin(id: string, updates: Partial<AdminUser>): Promise<AdminUser> {
    const [admin] = await db
      .update(adminUsers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(adminUsers.id, id))
      .returning();
    return admin;
  }

  async deleteAdmin(id: string): Promise<void> {
    await db.delete(adminUsers).where(eq(adminUsers.id, id));
  }

  async getAllOrganizationsWithOwners(): Promise<any[]> {
    return await db
      .select({
        id: organizations.id,
        name: organizations.name,
        subscriptionStatus: organizations.subscriptionStatus,
        subscriptionLevel: organizations.subscriptionLevel,
        isActive: organizations.isActive,
        creditsRemaining: organizations.creditsRemaining,
        stripeCustomerId: organizations.stripeCustomerId,
        createdAt: organizations.createdAt,
        owner: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
        },
      })
      .from(organizations)
      .leftJoin(users, eq(organizations.ownerId, users.id))
      .orderBy(desc(organizations.createdAt));
  }

  async getOrganizationWithOwner(id: string): Promise<any | undefined> {
    const [result] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        subscriptionStatus: organizations.subscriptionStatus,
        subscriptionLevel: organizations.subscriptionLevel,
        isActive: organizations.isActive,
        creditsRemaining: organizations.creditsRemaining,
        stripeCustomerId: organizations.stripeCustomerId,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        owner: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
        },
      })
      .from(organizations)
      .leftJoin(users, eq(organizations.ownerId, users.id))
      .where(eq(organizations.id, id));
    return result;
  }
}

export const storage = new DatabaseStorage();
