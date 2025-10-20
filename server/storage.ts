import {
  users,
  organizations,
  properties,
  units,
  inspections,
  inspectionItems,
  complianceDocuments,
  maintenanceRequests,
  comparisonReports,
  creditTransactions,
  type User,
  type UpsertUser,
  type Organization,
  type InsertOrganization,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
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
  getUnit(id: string): Promise<Unit | undefined>;
  updateUnitTenant(id: string, tenantId: string | null): Promise<Unit>;
  
  // Inspection operations
  createInspection(inspection: InsertInspection): Promise<Inspection>;
  getInspectionsByUnit(unitId: string): Promise<Inspection[]>;
  getInspectionsByInspector(inspectorId: string): Promise<Inspection[]>;
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
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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

  async getInspectionsByInspector(inspectorId: string): Promise<Inspection[]> {
    return await db
      .select()
      .from(inspections)
      .where(eq(inspections.inspectorId, inspectorId))
      .orderBy(desc(inspections.scheduledDate));
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
}

export const storage = new DatabaseStorage();
