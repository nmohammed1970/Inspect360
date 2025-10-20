import {
  users,
  organizations,
  blocks,
  properties,
  units,
  inspections,
  inspectionItems,
  complianceDocuments,
  maintenanceRequests,
  comparisonReports,
  creditTransactions,
  inventoryTemplates,
  inventories,
  inventoryItems,
  workOrders,
  workLogs,
  type User,
  type UpsertUser,
  type Organization,
  type InsertOrganization,
  type Block,
  type InsertBlock,
  type Property,
  type InsertProperty,
  type Unit,
  type InsertUnit,
  type Inspection,
  type InsertInspection,
  type InspectionItem,
  type InsertInspectionItem,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

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
  
  // Property operations
  createProperty(property: InsertProperty): Promise<Property>;
  getPropertiesByOrganization(organizationId: string): Promise<Property[]>;
  getProperty(id: string): Promise<Property | undefined>;
  
  // Unit operations
  createUnit(unit: InsertUnit): Promise<Unit>;
  getUnitsByProperty(propertyId: string): Promise<Unit[]>;
  getUnitsByOrganization(organizationId: string): Promise<Unit[]>;
  getUnit(id: string): Promise<Unit | undefined>;
  updateUnitTenant(id: string, tenantId: string | null): Promise<Unit>;
  
  // Inspection operations
  createInspection(inspection: InsertInspection): Promise<Inspection>;
  getInspectionsByUnit(unitId: string): Promise<Inspection[]>;
  getInspectionsByInspector(inspectorId: string): Promise<any[]>; // Returns inspections with unit and property
  getInspectionsByOrganization(organizationId: string): Promise<any[]>; // Returns inspections with unit and property
  getInspection(id: string): Promise<Inspection | undefined>;
  updateInspectionStatus(id: string, status: string, completedDate?: Date): Promise<Inspection>;
  
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
  getMaintenanceRequests(unitId: string): Promise<MaintenanceRequest[]>;
  getMaintenanceByOrganization(organizationId: string): Promise<MaintenanceRequest[]>;
  updateMaintenanceStatus(id: string, status: string, assignedTo?: string): Promise<MaintenanceRequest>;
  
  // Comparison Report operations
  createComparisonReport(report: InsertComparisonReport): Promise<ComparisonReport>;
  getComparisonReportsByUnit(unitId: string): Promise<ComparisonReport[]>;
  getComparisonReport(id: string): Promise<ComparisonReport | undefined>;
  
  // Credit Transaction operations
  createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction>;
  getCreditTransactions(organizationId: string): Promise<CreditTransaction[]>;

  // Block operations
  createBlock(block: InsertBlock): Promise<Block>;
  getBlocksByOrganization(organizationId: string): Promise<Block[]>;
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
  getInventoriesByUnit(unitId: string): Promise<Inventory[]>;
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

  async getProperty(id: string): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property;
  }

  // Unit operations
  async createUnit(unitData: InsertUnit): Promise<Unit> {
    const [unit] = await db.insert(units).values(unitData).returning();
    return unit;
  }

  async getUnitsByProperty(propertyId: string): Promise<Unit[]> {
    return await db
      .select()
      .from(units)
      .where(eq(units.propertyId, propertyId))
      .orderBy(units.unitNumber);
  }

  async getUnitsByOrganization(organizationId: string): Promise<Unit[]> {
    return await db
      .select({
        id: units.id,
        propertyId: units.propertyId,
        unitNumber: units.unitNumber,
        bedrooms: units.bedrooms,
        bathrooms: units.bathrooms,
        floor: units.floor,
        sqft: units.sqft,
        status: units.status,
        tenantId: units.tenantId,
        createdAt: units.createdAt,
        updatedAt: units.updatedAt,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(properties.organizationId, organizationId))
      .orderBy(units.unitNumber);
  }

  async getUnit(id: string): Promise<Unit | undefined> {
    const [unit] = await db.select().from(units).where(eq(units.id, id));
    return unit;
  }

  async updateUnitTenant(id: string, tenantId: string | null): Promise<Unit> {
    const [unit] = await db
      .update(units)
      .set({ tenantId, updatedAt: new Date() })
      .where(eq(units.id, id))
      .returning();
    return unit;
  }

  // Inspection operations
  async createInspection(inspectionData: InsertInspection): Promise<Inspection> {
    const [inspection] = await db.insert(inspections).values(inspectionData).returning();
    return inspection;
  }

  async getInspectionsByUnit(unitId: string): Promise<Inspection[]> {
    return await db
      .select()
      .from(inspections)
      .where(eq(inspections.unitId, unitId))
      .orderBy(desc(inspections.scheduledDate));
  }

  async getInspectionsByInspector(inspectorId: string): Promise<any[]> {
    const results = await db
      .select({
        inspection: inspections,
        unit: units,
        property: properties,
        clerk: users,
      })
      .from(inspections)
      .innerJoin(units, eq(inspections.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .leftJoin(users, eq(inspections.inspectorId, users.id))
      .where(eq(inspections.inspectorId, inspectorId))
      .orderBy(desc(inspections.scheduledDate));
    
    // Flatten the structure to match frontend expectations
    return results.map(r => ({
      ...r.inspection,
      propertyId: r.unit.propertyId,
      unit: r.unit,
      property: r.property,
      clerk: r.clerk,
    }));
  }

  async getInspectionsByOrganization(organizationId: string): Promise<any[]> {
    const results = await db
      .select({
        inspection: inspections,
        unit: units,
        property: properties,
        clerk: users,
      })
      .from(inspections)
      .innerJoin(units, eq(inspections.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .leftJoin(users, eq(inspections.inspectorId, users.id))
      .where(eq(properties.organizationId, organizationId))
      .orderBy(desc(inspections.scheduledDate));
    
    // Flatten the structure to match frontend expectations
    return results.map(r => ({
      ...r.inspection,
      propertyId: r.unit.propertyId,
      unit: r.unit,
      property: r.property,
      clerk: r.clerk,
    }));
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

  async getMaintenanceRequests(unitId: string): Promise<MaintenanceRequest[]> {
    return await db
      .select()
      .from(maintenanceRequests)
      .where(eq(maintenanceRequests.unitId, unitId))
      .orderBy(desc(maintenanceRequests.createdAt));
  }

  async getMaintenanceByOrganization(organizationId: string): Promise<MaintenanceRequest[]> {
    return await db
      .select({
        id: maintenanceRequests.id,
        unitId: maintenanceRequests.unitId,
        reportedBy: maintenanceRequests.reportedBy,
        assignedTo: maintenanceRequests.assignedTo,
        title: maintenanceRequests.title,
        description: maintenanceRequests.description,
        status: maintenanceRequests.status,
        priority: maintenanceRequests.priority,
        photoUrl: maintenanceRequests.photoUrl,
        createdAt: maintenanceRequests.createdAt,
        updatedAt: maintenanceRequests.updatedAt,
      })
      .from(maintenanceRequests)
      .innerJoin(units, eq(maintenanceRequests.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
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

  async getComparisonReportsByUnit(unitId: string): Promise<ComparisonReport[]> {
    return await db
      .select()
      .from(comparisonReports)
      .where(eq(comparisonReports.unitId, unitId))
      .orderBy(desc(comparisonReports.createdAt));
  }

  async getComparisonReport(id: string): Promise<ComparisonReport | undefined> {
    const [report] = await db.select().from(comparisonReports).where(eq(comparisonReports.id, id));
    return report;
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
  async createBlock(blockData: InsertBlock): Promise<Block> {
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

  async getInventoriesByUnit(unitId: string): Promise<Inventory[]> {
    return await db
      .select()
      .from(inventories)
      .where(eq(inventories.unitId, unitId))
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
          unitId: maintenanceRequests.unitId,
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
          unitId: maintenanceRequests.unitId,
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
}

export const storage = new DatabaseStorage();
