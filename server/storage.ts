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
  complianceDocumentTypes,
  maintenanceRequests,
  comparisonReports,
  comparisonReportItems,
  comparisonComments,
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
  contactTags,
  dashboardPreferences,
  tenantAssignments,
  tenantAssignmentTags,
  tenancyAttachments,
  messageTemplates,
  fixfloConfig,
  fixfloWebhookLogs,
  fixfloSyncState,
  teams,
  teamMembers,
  teamCategories,
  type User,
  type UpsertUser,
  type AdminUser,
  type InsertAdminUser,
  type FixfloConfig,
  type InsertFixfloConfig,
  type FixfloWebhookLog,
  type InsertFixfloWebhookLog,
  type FixfloSyncState,
  type InsertFixfloSyncState,
  type Organization,
  type InsertOrganization,
  type Contact,
  type InsertContact,
  type Block,
  type InsertBlock,
  type Property,
  type InsertProperty,
  type MessageTemplate,
  type InsertMessageTemplate,
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
  type ComplianceDocumentType,
  type InsertComplianceDocumentType,
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
  type Team,
  type InsertTeam,
  type TeamMember,
  type InsertTeamMember,
  type TeamCategory,
  type InsertTeamCategory,
  type AssetInventory,
  type InsertAssetInventory,
  type Tag,
  type InsertTag,
  type DashboardPreferences,
  type InsertDashboardPreferences,
  type TenantAssignment,
  type InsertTenantAssignment,
  type TenancyAttachment,
  type InsertTenancyAttachment,
  plans,
  type Plan,
  type InsertPlan,
  subscriptions,
  type Subscription,
  type InsertSubscription,
  creditBatches,
  type CreditBatch,
  type InsertCreditBatch,
  creditLedger,
  type CreditLedger,
  type InsertCreditLedger,
  topupOrders,
  type TopupOrder,
  type InsertTopupOrder,
  countryPricingOverrides,
  type CountryPricingOverride,
  type InsertCountryPricingOverride,
  creditBundles,
  type CreditBundle,
  type InsertCreditBundle,
  bundleTierPricing,
  type BundleTierPricing,
  knowledgeBaseDocuments,
  type KnowledgeBaseDocument,
  type InsertKnowledgeBaseDocument,
  chatConversations,
  type ChatConversation,
  type InsertChatConversation,
  chatMessages,
  type ChatMessage,
  type InsertChatMessage,
  tenantMaintenanceChats,
  type TenantMaintenanceChat,
  type InsertTenantMaintenanceChat,
  tenantMaintenanceChatMessages,
  type TenantMaintenanceChatMessage,
  type InsertTenantMaintenanceChatMessage,
  feedbackSubmissions,
  type FeedbackSubmission,
  type InsertFeedback,
  type UpdateFeedback,
  centralTeamConfig,
  type CentralTeamConfig,
  type InsertCentralTeamConfig,
  notifications,
  type Notification,
  type InsertNotification,
  organizationTrademarks,
  type OrganizationTrademark,
  type InsertOrganizationTrademark,
  userDocuments,
  type UserDocument,
  type InsertUserDocument,
  communityRules,
  type CommunityRules,
  type InsertCommunityRules,
  communityRuleAcceptances,
  type CommunityRuleAcceptance,
  type InsertCommunityRuleAcceptance,
  communityGroups,
  type CommunityGroup,
  type InsertCommunityGroup,
  type UpdateCommunityGroup,
  communityGroupMembers,
  type CommunityGroupMember,
  type InsertCommunityGroupMember,
  communityThreads,
  type CommunityThread,
  type InsertCommunityThread,
  type UpdateCommunityThread,
  communityPosts,
  type CommunityPost,
  type InsertCommunityPost,
  type UpdateCommunityPost,
  communityAttachments,
  type CommunityAttachment,
  type InsertCommunityAttachment,
  communityPostFlags,
  type CommunityPostFlag,
  type InsertCommunityPostFlag,
  communityModerationLog,
  type CommunityModerationLog,
  type InsertCommunityModerationLog,
  communityTenantBlocks,
  type CommunityTenantBlock,
  type InsertCommunityTenantBlock,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, gte, lte, ne, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUsersByOrganization(organizationId: string): Promise<User[]>;
  getUsersByOrganizationAndRole(organizationId: string, role: string): Promise<User[]>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User>;
  updateUserRole(id: string, role: string): Promise<User>;
  updatePassword(id: string, hashedPassword: string): Promise<User>;
  setResetToken(id: string, token: string, expiry: Date): Promise<User>;
  clearResetToken(id: string): Promise<User>;

  // Organization operations
  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationsByNormalizedEmail(email: string): Promise<Array<{ organizationId: string; organizationName: string; userRole: string }>>;
  updateOrganization(id: string, updates: Partial<InsertOrganization>): Promise<Organization>;
  updateOrganizationCredits(id: string, credits: number): Promise<Organization>;
  updateOrganizationStripe(id: string, customerId: string, status: string): Promise<Organization>;
  deductCredit(organizationId: string, amount: number, description: string): Promise<Organization>;

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
  getMostRecentCheckInInspection(propertyId: string): Promise<Inspection | undefined>;
  getInspectionsByInspector(inspectorId: string): Promise<any[]>; // Returns inspections with property/block
  getInspectionsByOrganization(organizationId: string): Promise<any[]>; // Returns inspections with property/block
  getInspection(id: string): Promise<Inspection | undefined>;
  updateInspectionStatus(id: string, status: string, completedDate?: Date): Promise<Inspection>;
  updateInspection(id: string, updates: Partial<InsertInspection>): Promise<Inspection>;
  deleteInspection(id: string): Promise<void>;

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

  // Compliance Document Types
  createComplianceDocumentType(type: InsertComplianceDocumentType): Promise<ComplianceDocumentType>;
  getComplianceDocumentTypes(organizationId: string): Promise<ComplianceDocumentType[]>;
  updateComplianceDocumentType(id: string, updates: Partial<InsertComplianceDocumentType>): Promise<ComplianceDocumentType>;
  deleteComplianceDocumentType(id: string): Promise<void>;

  // Maintenance operations
  createMaintenanceRequest(request: InsertMaintenanceRequest): Promise<MaintenanceRequest>;
  getMaintenanceRequestsByProperty(propertyId: string): Promise<MaintenanceRequest[]>;
  getMaintenanceByOrganization(organizationId: string): Promise<any[]>;
  updateMaintenanceStatus(id: string, status: string, assignedTo?: string): Promise<MaintenanceRequest>;
  updateMaintenanceRequest(id: string, updates: Partial<InsertMaintenanceRequest>): Promise<MaintenanceRequest>;

  // Comparison Report operations
  createComparisonReport(report: InsertComparisonReport): Promise<ComparisonReport>;
  getComparisonReportsByProperty(propertyId: string): Promise<ComparisonReport[]>;
  getComparisonReportsByOrganization(organizationId: string): Promise<ComparisonReport[]>;
  getComparisonReportsByTenant(tenantId: string): Promise<ComparisonReport[]>;
  getComparisonReport(id: string): Promise<ComparisonReport | undefined>;
  updateComparisonReport(id: string, updates: Partial<InsertComparisonReport>): Promise<ComparisonReport>;
  deleteComparisonReport(id: string): Promise<void>;
  createComparisonReportItem(item: any): Promise<any>;
  getComparisonReportItems(reportId: string): Promise<any[]>;
  updateComparisonReportItem(id: string, updates: any): Promise<any>;
  createComparisonComment(comment: any): Promise<any>;
  getComparisonComments(reportId: string): Promise<any[]>;

  // Credit Transaction operations
  createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction>;
  getCreditTransactions(organizationId: string): Promise<CreditTransaction[]>;

  // Subscription Plan operations
  getPlans(): Promise<Plan[]>;
  getActivePlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  getPlanByCode(code: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, updates: Partial<InsertPlan>): Promise<Plan>;

  // Country Pricing Override operations
  getCountryPricingOverride(countryCode: string, planId: string): Promise<CountryPricingOverride | undefined>;
  getCountryPricingOverridesByCountry(countryCode: string): Promise<CountryPricingOverride[]>;
  getAllCountryPricingOverrides(): Promise<CountryPricingOverride[]>;
  createCountryPricingOverride(override: InsertCountryPricingOverride): Promise<CountryPricingOverride>;
  updateCountryPricingOverride(id: string, updates: Partial<InsertCountryPricingOverride>): Promise<CountryPricingOverride>;
  deleteCountryPricingOverride(id: string): Promise<void>;

  // Credit Bundle operations
  getCreditBundles(): Promise<CreditBundle[]>;
  getActiveCreditBundles(): Promise<CreditBundle[]>;
  getCreditBundle(id: string): Promise<CreditBundle | undefined>;
  createCreditBundle(bundle: InsertCreditBundle): Promise<CreditBundle>;
  updateCreditBundle(id: string, updates: Partial<InsertCreditBundle>): Promise<CreditBundle>;
  deleteCreditBundle(id: string): Promise<void>;

  // Bundle Tier Pricing operations
  getBundleTierPricing(bundleId: string, planCode: string): Promise<BundleTierPricing | undefined>;
  getBundleTierPricingByBundle(bundleId: string): Promise<BundleTierPricing[]>;
  getAllBundleTierPricing(): Promise<BundleTierPricing[]>;

  // Subscription operations
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  getSubscription(id: string): Promise<Subscription | undefined>;
  getSubscriptionByOrganization(organizationId: string): Promise<Subscription | undefined>;
  getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined>;
  updateSubscription(id: string, updates: Partial<InsertSubscription>): Promise<Subscription>;
  cancelSubscription(id: string): Promise<Subscription>;

  // Credit Batch operations
  createCreditBatch(batch: InsertCreditBatch): Promise<CreditBatch>;
  getCreditBatch(id: string): Promise<CreditBatch | undefined>;
  getCreditBatchesByOrganization(organizationId: string): Promise<CreditBatch[]>;
  getAvailableCreditBatches(organizationId: string): Promise<CreditBatch[]>;
  updateCreditBatch(id: string, updates: Partial<InsertCreditBatch>): Promise<CreditBatch>;
  expireCreditBatch(id: string): Promise<CreditBatch>;

  // Credit Ledger operations
  createCreditLedgerEntry(entry: InsertCreditLedger): Promise<CreditLedger>;
  getCreditLedgerByOrganization(organizationId: string, limit?: number): Promise<CreditLedger[]>;
  getCreditBalance(organizationId: string): Promise<{ total: number; rolled: number; current: number; expiresOn: Date | null }>;

  // Top-up Order operations
  createTopupOrder(order: InsertTopupOrder): Promise<TopupOrder>;
  getTopupOrder(id: string): Promise<TopupOrder | undefined>;
  getTopupOrdersByOrganization(organizationId: string): Promise<TopupOrder[]>;
  updateTopupOrder(id: string, updates: Partial<InsertTopupOrder>): Promise<TopupOrder>;

  // Block operations
  createBlock(block: InsertBlock & { organizationId: string }): Promise<Block>;
  getBlocksByOrganization(organizationId: string): Promise<Block[]>;
  getBlocksWithStats(organizationId: string): Promise<any[]>;
  getBlock(id: string): Promise<Block | undefined>;
  updateBlock(id: string, updates: Partial<InsertBlock>): Promise<Block>;
  deleteBlock(id: string): Promise<void>;
  getTenantAssignmentsByBlock(blockId: string): Promise<any[]>;
  getBlockTenantStats(blockId: string): Promise<{ totalUnits: number; occupiedUnits: number; occupancyRate: number; totalMonthlyRent: number }>;

  // Tenant Assignment operations
  createTenantAssignment(assignment: InsertTenantAssignment & { organizationId: string }): Promise<TenantAssignment>;
  getTenantAssignment(id: string): Promise<TenantAssignment | undefined>;
  updateTenantAssignment(id: string, updates: Partial<InsertTenantAssignment>): Promise<TenantAssignment>;
  deleteTenantAssignment(id: string): Promise<void>;
  getTenantAssignmentsByOrganization(organizationId: string): Promise<any[]>;
  getTenantAssignmentsByProperty(propertyId: string, organizationId: string): Promise<any[]>;
  getTenantAssignmentTags(tenantAssignmentId: string, organizationId: string): Promise<any[]>;
  updateTenantAssignmentTags(tenantAssignmentId: string, tagIds: string[], organizationId: string): Promise<void>;

  // Tenancy Attachment operations
  createTenancyAttachment(attachment: InsertTenancyAttachment & { organizationId: string }): Promise<TenancyAttachment>;
  getTenancyAttachment(id: string, organizationId: string): Promise<TenancyAttachment | undefined>;
  getTenancyAttachments(tenantAssignmentId: string, organizationId: string): Promise<TenancyAttachment[]>;
  deleteTenancyAttachment(id: string, organizationId: string): Promise<{ fileUrl: string } | null>;

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

  // Team operations
  createTeam(team: InsertTeam & { organizationId: string }): Promise<Team>;
  getTeamsByOrganization(organizationId: string): Promise<any[]>; // Returns with member count
  getTeam(id: string): Promise<Team | undefined>;
  updateTeam(id: string, updates: Partial<InsertTeam>): Promise<Team>;
  deleteTeam(id: string): Promise<void>;

  // Team Member operations
  addTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  getTeamMembers(teamId: string): Promise<any[]>; // Returns with user/contact details
  removeTeamMember(id: string): Promise<void>;

  // Team Category operations
  addTeamCategory(category: InsertTeamCategory): Promise<TeamCategory>;
  getTeamCategories(teamId: string): Promise<TeamCategory[]>;
  removeTeamCategory(id: string): Promise<void>;
  getTeamByCategory(organizationId: string, category: string): Promise<Team | undefined>;

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
  deleteAiImageAnalysesByEntry(entryId: string): Promise<void>;

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

  // Message Template operations
  createMessageTemplate(template: any): Promise<any>;
  getMessageTemplatesByOrganization(organizationId: string): Promise<any[]>;
  getMessageTemplate(id: string): Promise<any | undefined>;
  updateMessageTemplate(id: string, updates: any): Promise<any>;
  deleteMessageTemplate(id: string): Promise<void>;
  getBlockTenantsEmails(blockId: string, organizationId: string): Promise<{ email: string; firstName?: string; lastName?: string; }[]>;

  // Fixflo Integration operations
  getFixfloConfig(organizationId: string): Promise<FixfloConfig | undefined>;
  upsertFixfloConfig(config: InsertFixfloConfig): Promise<FixfloConfig>;
  updateFixfloHealthCheck(organizationId: string, updates: { lastHealthCheck: Date; healthCheckStatus: string; lastError: string | null; }): Promise<void>;
  getFixfloSyncStates(organizationId: string): Promise<FixfloSyncState[]>;
  upsertFixfloSyncState(syncState: InsertFixfloSyncState): Promise<FixfloSyncState>;
  getFixfloWebhookLogs(organizationId: string, limit?: number): Promise<FixfloWebhookLog[]>;
  createFixfloWebhookLog(log: InsertFixfloWebhookLog): Promise<FixfloWebhookLog>;
  updateFixfloWebhookLog(id: string, updates: Partial<FixfloWebhookLog>): Promise<void>;

  // Knowledge Base operations (for AI chatbot)
  createKnowledgeBaseDocument(doc: InsertKnowledgeBaseDocument): Promise<KnowledgeBaseDocument>;
  getKnowledgeBaseDocuments(activeOnly?: boolean): Promise<KnowledgeBaseDocument[]>;
  getKnowledgeBaseDocument(id: string): Promise<KnowledgeBaseDocument | undefined>;
  updateKnowledgeBaseDocument(id: string, updates: Partial<InsertKnowledgeBaseDocument>): Promise<KnowledgeBaseDocument>;
  deleteKnowledgeBaseDocument(id: string): Promise<void>;
  searchKnowledgeBase(query: string): Promise<KnowledgeBaseDocument[]>;

  // Chat operations (for AI chatbot)
  createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation>;
  getChatConversationsByUser(userId: string): Promise<ChatConversation[]>;
  getChatConversation(id: string): Promise<ChatConversation | undefined>;
  updateChatConversation(id: string, updates: Partial<InsertChatConversation>): Promise<ChatConversation>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(conversationId: string): Promise<ChatMessage[]>;

  // Tenant operations
  getTenancyByTenantId(tenantId: string): Promise<any>;
  getTenantMaintenanceChats(tenantId: string): Promise<any[]>;
  getMaintenanceChatById(chatId: string): Promise<any>;
  getTenantMaintenanceChatMessages(chatId: string): Promise<any[]>;
  createTenantMaintenanceChat(chat: any): Promise<any>;
  createTenantMaintenanceChatMessage(message: any): Promise<any>;
  updateTenantMaintenanceChat(chatId: string, updates: any): Promise<any>;
  getMaintenanceRequestsByReporter(reporterId: string): Promise<MaintenanceRequest[]>;

  // Feedback system operations
  createFeedback(feedback: InsertFeedback): Promise<FeedbackSubmission>;
  getFeedbackById(id: string): Promise<FeedbackSubmission | undefined>;
  getFeedbackByUser(userId: string): Promise<FeedbackSubmission[]>;
  getAllFeedback(filters?: { status?: string; category?: string; priority?: string; }): Promise<FeedbackSubmission[]>;
  updateFeedback(id: string, updates: UpdateFeedback): Promise<FeedbackSubmission>;

  // Central team config operations
  getCentralTeamConfig(): Promise<CentralTeamConfig[]>;
  addCentralTeamEmail(email: string): Promise<CentralTeamConfig>;
  removeCentralTeamEmail(id: string): Promise<void>;
  updateCentralTeamEmail(id: string, isActive: boolean): Promise<CentralTeamConfig>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUser(userId: string, unreadOnly?: boolean): Promise<Notification[]>;
  markNotificationAsRead(id: string): Promise<Notification>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Organization Trademark operations
  getOrganizationTrademarks(organizationId: string): Promise<OrganizationTrademark[]>;
  createOrganizationTrademark(trademark: InsertOrganizationTrademark): Promise<OrganizationTrademark>;
  updateOrganizationTrademark(id: string, updates: Partial<InsertOrganizationTrademark>): Promise<OrganizationTrademark>;
  deleteOrganizationTrademark(id: string): Promise<void>;
  reorderOrganizationTrademarks(organizationId: string, orderedIds: string[]): Promise<void>;

  // User Document operations
  getUserDocuments(userId: string): Promise<UserDocument[]>;
  getUserDocument(id: string): Promise<UserDocument | undefined>;
  createUserDocument(document: InsertUserDocument): Promise<UserDocument>;
  updateUserDocument(id: string, updates: Partial<InsertUserDocument>): Promise<UserDocument>;
  deleteUserDocument(id: string): Promise<void>;

  // Community Discussion operations
  // Rules
  getCommunityRules(organizationId: string): Promise<CommunityRules | undefined>;
  createCommunityRules(rules: InsertCommunityRules): Promise<CommunityRules>;
  getActiveRuleVersion(organizationId: string): Promise<number>;
  
  // Rule Acceptances
  hasAcceptedLatestRules(tenantId: string, organizationId: string): Promise<boolean>;
  acceptCommunityRules(acceptance: InsertCommunityRuleAcceptance): Promise<CommunityRuleAcceptance>;
  
  // Groups
  getCommunityGroups(blockId: string, status?: string): Promise<CommunityGroup[]>;
  getCommunityGroupsByOrganization(organizationId: string, status?: string): Promise<CommunityGroup[]>;
  getCommunityGroup(id: string): Promise<CommunityGroup | undefined>;
  createCommunityGroup(group: InsertCommunityGroup): Promise<CommunityGroup>;
  updateCommunityGroup(id: string, updates: UpdateCommunityGroup): Promise<CommunityGroup>;
  deleteCommunityGroup(id: string): Promise<void>;
  getPendingGroupsCount(organizationId: string): Promise<number>;
  
  // Group Members
  getGroupMembers(groupId: string): Promise<CommunityGroupMember[]>;
  isGroupMember(groupId: string, tenantId: string): Promise<boolean>;
  joinGroup(membership: InsertCommunityGroupMember): Promise<CommunityGroupMember>;
  leaveGroup(groupId: string, tenantId: string): Promise<void>;
  
  // Threads
  getCommunityThreads(groupId: string): Promise<CommunityThread[]>;
  getCommunityThread(id: string): Promise<CommunityThread | undefined>;
  createCommunityThread(thread: InsertCommunityThread): Promise<CommunityThread>;
  updateCommunityThread(id: string, updates: UpdateCommunityThread): Promise<CommunityThread>;
  deleteCommunityThread(id: string): Promise<void>;
  incrementThreadViewCount(id: string): Promise<void>;
  
  // Posts
  getCommunityPosts(threadId: string): Promise<CommunityPost[]>;
  getCommunityPost(id: string): Promise<CommunityPost | undefined>;
  createCommunityPost(post: InsertCommunityPost): Promise<CommunityPost>;
  updateCommunityPost(id: string, updates: UpdateCommunityPost): Promise<CommunityPost>;
  deleteCommunityPost(id: string): Promise<void>;
  
  // Attachments
  getThreadAttachments(threadId: string): Promise<CommunityAttachment[]>;
  getPostAttachments(postId: string): Promise<CommunityAttachment[]>;
  createCommunityAttachment(attachment: InsertCommunityAttachment): Promise<CommunityAttachment>;
  deleteCommunityAttachment(id: string): Promise<void>;
  
  // Flags
  getCommunityFlags(organizationId: string, unresolvedOnly?: boolean): Promise<CommunityPostFlag[]>;
  createCommunityFlag(flag: InsertCommunityPostFlag): Promise<CommunityPostFlag>;
  resolveCommunityFlag(id: string, resolvedBy: string, notes: string): Promise<CommunityPostFlag>;
  
  // Moderation Log
  getCommunityModerationLog(organizationId: string): Promise<CommunityModerationLog[]>;
  createCommunityModerationLog(log: InsertCommunityModerationLog): Promise<CommunityModerationLog>;
  
  // Tenant Blocks
  getCommunityTenantBlocks(organizationId: string): Promise<CommunityTenantBlock[]>;
  getCommunityTenantBlock(organizationId: string, tenantUserId: string): Promise<CommunityTenantBlock | undefined>;
  createCommunityTenantBlock(block: InsertCommunityTenantBlock): Promise<CommunityTenantBlock>;
  deleteCommunityTenantBlock(organizationId: string, tenantUserId: string): Promise<void>;
  isTenantBlocked(organizationId: string, tenantUserId: string): Promise<boolean>;
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
    // Use case-insensitive comparison for email lookup, ordered by creation date for determinism
    const results = await db.select().from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${email})`)
      .orderBy(users.createdAt);

    if (results.length > 1) {
      console.warn(`[getUserByEmail] Multiple users found for normalized email ${email.toLowerCase()}: returning oldest (${results.length} total)`);
    }

    return results[0];
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

  async updateUser(id: string, updates: Partial<UpsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
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

  async getOrganizationsByNormalizedEmail(email: string): Promise<Array<{ organizationId: string; organizationName: string; userRole: string }>> {
    const results = await db
      .select({
        organizationId: users.organizationId,
        organizationName: organizations.name,
        userRole: users.role,
      })
      .from(users)
      .innerJoin(organizations, eq(users.organizationId, organizations.id))
      .where(sql`LOWER(${users.email}) = LOWER(${email})`)
      .orderBy(users.createdAt);

    // Filter out any null organizationIds and map to expected type
    return results
      .filter(r => r.organizationId !== null)
      .map(r => ({
        organizationId: r.organizationId!,
        organizationName: r.organizationName,
        userRole: r.userRole as string,
      }));
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

  async updateOrganization(id: string, updates: Partial<InsertOrganization>): Promise<Organization> {
    const [org] = await db
      .update(organizations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return org;
  }

  async deductCredit(organizationId: string, amount: number, description: string): Promise<Organization> {
    const org = await this.getOrganization(organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const currentCredits = org.creditsRemaining ?? 0;
    if (currentCredits < amount) {
      throw new Error("Insufficient credits");
    }

    const newCredits = currentCredits - amount;

    await this.createCreditTransaction({
      organizationId,
      amount: -amount,
      type: "usage",
      description,
    });

    return await this.updateOrganizationCredits(organizationId, newCredits);
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

  async getMostRecentCheckInInspection(propertyId: string): Promise<Inspection | undefined> {
    const results = await db
      .select()
      .from(inspections)
      .where(
        and(
          eq(inspections.propertyId, propertyId),
          eq(inspections.type, "check_in" as any)
        )
      )
      .orderBy(desc(inspections.scheduledDate))
      .limit(1);
    return results[0];
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

  async updateInspection(id: string, updates: Partial<InsertInspection>): Promise<Inspection> {
    const [inspection] = await db
      .update(inspections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inspections.id, id))
      .returning();

    if (!inspection) {
      throw new Error("Inspection not found");
    }

    return inspection;
  }

  async deleteInspection(id: string): Promise<void> {
    await db.delete(inspectionItems).where(eq(inspectionItems.inspectionId, id));
    await db.delete(inspectionResponses).where(eq(inspectionResponses.inspectionId, id));
    await db.delete(inspectionEntries).where(eq(inspectionEntries.inspectionId, id));
    await db.delete(inspections).where(eq(inspections.id, id));
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

  async updateComplianceDocument(id: string, data: Partial<InsertComplianceDocument>): Promise<ComplianceDocument> {
    const [doc] = await db
      .update(complianceDocuments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(complianceDocuments.id, id))
      .returning();
    return doc;
  }

  async getComplianceDocument(id: string): Promise<ComplianceDocument | undefined> {
    const [doc] = await db
      .select()
      .from(complianceDocuments)
      .where(eq(complianceDocuments.id, id));
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

  // Compliance Document Types operations
  async createComplianceDocumentType(typeData: InsertComplianceDocumentType): Promise<ComplianceDocumentType> {
    const [type] = await db.insert(complianceDocumentTypes).values(typeData).returning();
    return type;
  }

  async getComplianceDocumentTypes(organizationId: string): Promise<ComplianceDocumentType[]> {
    return await db
      .select()
      .from(complianceDocumentTypes)
      .where(
        and(
          eq(complianceDocumentTypes.organizationId, organizationId),
          eq(complianceDocumentTypes.isActive, true)
        )
      )
      .orderBy(asc(complianceDocumentTypes.sortOrder), asc(complianceDocumentTypes.name));
  }

  async updateComplianceDocumentType(id: string, updates: Partial<InsertComplianceDocumentType>): Promise<ComplianceDocumentType> {
    const [type] = await db
      .update(complianceDocumentTypes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(complianceDocumentTypes.id, id))
      .returning();
    return type;
  }

  async deleteComplianceDocumentType(id: string): Promise<void> {
    await db
      .delete(complianceDocumentTypes)
      .where(eq(complianceDocumentTypes.id, id));
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
    const reporterAlias = alias(users, 'reporter');
    const assigneeAlias = alias(users, 'assignee');

    return await db
      .select({
        id: maintenanceRequests.id,
        organizationId: maintenanceRequests.organizationId,
        propertyId: maintenanceRequests.propertyId,
        blockId: maintenanceRequests.blockId,
        reportedBy: maintenanceRequests.reportedBy,
        assignedTo: maintenanceRequests.assignedTo,
        title: maintenanceRequests.title,
        description: maintenanceRequests.description,
        status: maintenanceRequests.status,
        priority: maintenanceRequests.priority,
        photoUrls: maintenanceRequests.photoUrls,
        aiSuggestedFixes: maintenanceRequests.aiSuggestedFixes,
        aiAnalysisJson: maintenanceRequests.aiAnalysisJson,
        source: maintenanceRequests.source,
        inspectionId: maintenanceRequests.inspectionId,
        inspectionEntryId: maintenanceRequests.inspectionEntryId,
        dueDate: maintenanceRequests.dueDate,
        createdAt: maintenanceRequests.createdAt,
        updatedAt: maintenanceRequests.updatedAt,
        property: {
          id: properties.id,
          name: properties.name,
          address: properties.address,
        },
        block: {
          id: blocks.id,
          name: blocks.name,
          address: blocks.address,
        },
        reportedByUser: {
          firstName: reporterAlias.firstName,
          lastName: reporterAlias.lastName,
        },
        assignedToUser: {
          firstName: assigneeAlias.firstName,
          lastName: assigneeAlias.lastName,
        },
      })
      .from(maintenanceRequests)
      .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
      .leftJoin(blocks, eq(maintenanceRequests.blockId, blocks.id))
      .leftJoin(reporterAlias, eq(maintenanceRequests.reportedBy, reporterAlias.id))
      .leftJoin(assigneeAlias, eq(maintenanceRequests.assignedTo, assigneeAlias.id))
      .where(eq(maintenanceRequests.organizationId, organizationId))
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

  async updateMaintenanceRequest(id: string, updates: Partial<InsertMaintenanceRequest>): Promise<MaintenanceRequest> {
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

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

  async getComparisonReportsByOrganization(organizationId: string): Promise<ComparisonReport[]> {
    return await db
      .select()
      .from(comparisonReports)
      .where(eq(comparisonReports.organizationId, organizationId))
      .orderBy(desc(comparisonReports.createdAt));
  }

  async getComparisonReportsByTenant(tenantId: string): Promise<ComparisonReport[]> {
    // First, get all properties assigned to this tenant
    const assignments = await db
      .select({ propertyId: tenantAssignments.propertyId })
      .from(tenantAssignments)
      .where(eq(tenantAssignments.tenantId, tenantId));

    const propertyIds = assignments.map(a => a.propertyId);

    // If tenant has no property assignments, return empty array
    if (propertyIds.length === 0) {
      return [];
    }

    // Get all comparison reports for properties assigned to this tenant
    // Use sql template for IN clause since we have a dynamic array
    return await db
      .select()
      .from(comparisonReports)
      .where(
        sql`${comparisonReports.propertyId} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`
      )
      .orderBy(desc(comparisonReports.createdAt));
  }

  async getComparisonReport(id: string): Promise<ComparisonReport | undefined> {
    const [report] = await db.select().from(comparisonReports).where(eq(comparisonReports.id, id));
    return report;
  }

  async updateComparisonReport(id: string, updates: Partial<InsertComparisonReport>): Promise<ComparisonReport> {
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    const [report] = await db
      .update(comparisonReports)
      .set(updateData)
      .where(eq(comparisonReports.id, id))
      .returning();
    return report;
  }

  async deleteComparisonReport(id: string): Promise<void> {
    // Delete related items first (cascade delete)
    await db
      .delete(comparisonReportItems)
      .where(eq(comparisonReportItems.comparisonReportId, id));

    // Delete related comments
    await db
      .delete(comparisonComments)
      .where(eq(comparisonComments.comparisonReportId, id));

    // Delete the report itself
    await db
      .delete(comparisonReports)
      .where(eq(comparisonReports.id, id));
  }

  async createComparisonReportItem(itemData: any): Promise<any> {
    const [item] = await db.insert(comparisonReportItems).values(itemData).returning();
    return item;
  }

  async getComparisonReportItems(reportId: string): Promise<any[]> {
    return await db
      .select()
      .from(comparisonReportItems)
      .where(eq(comparisonReportItems.comparisonReportId, reportId))
      .orderBy(comparisonReportItems.createdAt);
  }

  async updateComparisonReportItem(id: string, updates: any): Promise<any> {
    const [item] = await db
      .update(comparisonReportItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(comparisonReportItems.id, id))
      .returning();
    return item;
  }

  async createComparisonComment(commentData: any): Promise<any> {
    const [comment] = await db.insert(comparisonComments).values(commentData).returning();
    return comment;
  }

  async getComparisonComments(reportId: string): Promise<any[]> {
    return await db
      .select()
      .from(comparisonComments)
      .where(eq(comparisonComments.comparisonReportId, reportId))
      .orderBy(comparisonComments.createdAt);
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

  async getTenantAssignmentsByBlock(blockId: string): Promise<any[]> {
    // Get all properties in the block
    const blockProperties = await db
      .select()
      .from(properties)
      .where(eq(properties.blockId, blockId));

    if (blockProperties.length === 0) {
      return [];
    }

    const propertyIds = blockProperties.map(p => p.id);

    // Get all tenant assignments for properties in this block with user and property info
    const assignments = await db
      .select({
        // Assignment info
        assignmentId: tenantAssignments.id,
        leaseStartDate: tenantAssignments.leaseStartDate,
        leaseEndDate: tenantAssignments.leaseEndDate,
        monthlyRent: tenantAssignments.monthlyRent,
        depositAmount: tenantAssignments.depositAmount,
        isActive: tenantAssignments.isActive,
        // User info
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        profileImageUrl: users.profileImageUrl,
        // Property info
        propertyId: properties.id,
        propertyName: properties.name,
        propertyAddress: properties.address,
      })
      .from(tenantAssignments)
      .innerJoin(users, eq(tenantAssignments.tenantId, users.id))
      .innerJoin(properties, eq(tenantAssignments.propertyId, properties.id))
      .where(sql`${tenantAssignments.propertyId} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`);

    return assignments.map(a => ({
      user: {
        id: a.userId,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phone: a.phone,
        profileImageUrl: a.profileImageUrl,
      },
      property: {
        id: a.propertyId,
        name: a.propertyName,
        address: a.propertyAddress,
      },
      assignment: {
        id: a.assignmentId,
        leaseStartDate: a.leaseStartDate,
        leaseEndDate: a.leaseEndDate,
        monthlyRent: a.monthlyRent,
        depositAmount: a.depositAmount,
        isActive: a.isActive,
      },
    }));
  }

  async getTenantAssignmentsByProperty(propertyId: string, organizationId: string): Promise<any[]> {
    // Get all tenant assignments for this property with user info
    // Enforce organization isolation by joining with properties table
    const assignments = await db
      .select({
        // Assignment info
        assignmentId: tenantAssignments.id,
        leaseStartDate: tenantAssignments.leaseStartDate,
        leaseEndDate: tenantAssignments.leaseEndDate,
        monthlyRent: tenantAssignments.monthlyRent,
        depositAmount: tenantAssignments.depositAmount,
        isActive: tenantAssignments.isActive,
        // User info
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        profileImageUrl: users.profileImageUrl,
      })
      .from(tenantAssignments)
      .innerJoin(users, eq(tenantAssignments.tenantId, users.id))
      .innerJoin(properties, eq(tenantAssignments.propertyId, properties.id))
      .where(
        and(
          eq(tenantAssignments.propertyId, propertyId),
          eq(properties.organizationId, organizationId)
        )
      );

    return assignments.map(a => ({
      id: a.userId,
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      phone: a.phone,
      profileImageUrl: a.profileImageUrl,
      role: 'tenant',
      assignment: {
        id: a.assignmentId,
        leaseStartDate: a.leaseStartDate,
        leaseEndDate: a.leaseEndDate,
        monthlyRent: a.monthlyRent,
        depositAmount: a.depositAmount,
        isActive: a.isActive,
      },
    }));
  }

  async createTenantAssignment(assignment: InsertTenantAssignment & { organizationId: string }): Promise<TenantAssignment> {
    const [created] = await db.insert(tenantAssignments).values(assignment).returning();
    return created;
  }

  async getTenantAssignment(id: string): Promise<TenantAssignment | undefined> {
    const [assignment] = await db.select().from(tenantAssignments).where(eq(tenantAssignments.id, id));
    return assignment;
  }

  async updateTenantAssignment(id: string, updates: Partial<InsertTenantAssignment>): Promise<TenantAssignment> {
    const [updated] = await db.update(tenantAssignments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tenantAssignments.id, id))
      .returning();
    return updated;
  }

  async deleteTenantAssignment(id: string): Promise<void> {
    await db.delete(tenantAssignments).where(eq(tenantAssignments.id, id));
  }

  async getTenantAssignmentsByOrganization(organizationId: string): Promise<any[]> {
    // Get all tenant assignments with user and property info
    const assignments = await db
      .select({
        // Assignment info
        id: tenantAssignments.id,
        organizationId: tenantAssignments.organizationId,
        tenantId: tenantAssignments.tenantId,
        propertyId: tenantAssignments.propertyId,
        leaseStartDate: tenantAssignments.leaseStartDate,
        leaseEndDate: tenantAssignments.leaseEndDate,
        monthlyRent: tenantAssignments.monthlyRent,
        depositAmount: tenantAssignments.depositAmount,
        notes: tenantAssignments.notes,
        isActive: tenantAssignments.isActive,
        nextOfKinName: tenantAssignments.nextOfKinName,
        nextOfKinPhone: tenantAssignments.nextOfKinPhone,
        nextOfKinEmail: tenantAssignments.nextOfKinEmail,
        nextOfKinRelationship: tenantAssignments.nextOfKinRelationship,
        hasPortalAccess: tenantAssignments.hasPortalAccess,
        createdAt: tenantAssignments.createdAt,
        updatedAt: tenantAssignments.updatedAt,
        // User (tenant) info
        tenantFirstName: users.firstName,
        tenantLastName: users.lastName,
        tenantEmail: users.email,
        tenantPhone: users.phone,
        tenantProfileImageUrl: users.profileImageUrl,
      })
      .from(tenantAssignments)
      .innerJoin(users, eq(tenantAssignments.tenantId, users.id))
      .where(eq(tenantAssignments.organizationId, organizationId));
    
    // Map to include status field based on isActive
    return assignments.map(a => ({
      ...a,
      status: a.isActive ? 'active' : 'inactive',
    }));
  }

  async getTenantAssignmentTags(tenantAssignmentId: string, organizationId: string): Promise<any[]> {
    const result = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(tenantAssignmentTags)
      .innerJoin(tags, eq(tenantAssignmentTags.tagId, tags.id))
      .innerJoin(tenantAssignments, eq(tenantAssignmentTags.tenantAssignmentId, tenantAssignments.id))
      .where(
        and(
          eq(tenantAssignmentTags.tenantAssignmentId, tenantAssignmentId),
          eq(tenantAssignments.organizationId, organizationId)
        )
      );

    return result;
  }

  async updateTenantAssignmentTags(tenantAssignmentId: string, tagIds: string[], organizationId: string): Promise<void> {
    // Verify tenant assignment belongs to organization
    const assignment = await db
      .select()
      .from(tenantAssignments)
      .where(
        and(
          eq(tenantAssignments.id, tenantAssignmentId),
          eq(tenantAssignments.organizationId, organizationId)
        )
      );

    if (assignment.length === 0) {
      throw new Error("Tenant assignment not found or access denied");
    }

    // Delete existing tags
    await db.delete(tenantAssignmentTags).where(eq(tenantAssignmentTags.tenantAssignmentId, tenantAssignmentId));

    // Insert new tags
    if (tagIds.length > 0) {
      await db.insert(tenantAssignmentTags).values(
        tagIds.map(tagId => ({
          tenantAssignmentId,
          tagId,
        }))
      );
    }
  }

  async createTenancyAttachment(attachment: InsertTenancyAttachment & { organizationId: string }): Promise<TenancyAttachment> {
    // Verify tenant assignment belongs to organization
    const assignment = await db
      .select()
      .from(tenantAssignments)
      .where(
        and(
          eq(tenantAssignments.id, attachment.tenantAssignmentId),
          eq(tenantAssignments.organizationId, attachment.organizationId)
        )
      );

    if (assignment.length === 0) {
      throw new Error("Tenant assignment not found or access denied");
    }

    const [created] = await db.insert(tenancyAttachments).values(attachment).returning();
    return created;
  }

  async getTenancyAttachment(id: string, organizationId: string): Promise<TenancyAttachment | undefined> {
    const [attachment] = await db
      .select({
        id: tenancyAttachments.id,
        tenantAssignmentId: tenancyAttachments.tenantAssignmentId,
        fileName: tenancyAttachments.fileName,
        fileUrl: tenancyAttachments.fileUrl,
        fileType: tenancyAttachments.fileType,
        fileSize: tenancyAttachments.fileSize,
        uploadedBy: tenancyAttachments.uploadedBy,
        organizationId: tenancyAttachments.organizationId,
        createdAt: tenancyAttachments.createdAt,
      })
      .from(tenancyAttachments)
      .innerJoin(tenantAssignments, eq(tenancyAttachments.tenantAssignmentId, tenantAssignments.id))
      .where(
        and(
          eq(tenancyAttachments.id, id),
          eq(tenantAssignments.organizationId, organizationId)
        )
      );

    return attachment;
  }

  async getTenancyAttachments(tenantAssignmentId: string, organizationId: string): Promise<TenancyAttachment[]> {
    return await db
      .select({
        id: tenancyAttachments.id,
        tenantAssignmentId: tenancyAttachments.tenantAssignmentId,
        fileName: tenancyAttachments.fileName,
        fileUrl: tenancyAttachments.fileUrl,
        fileType: tenancyAttachments.fileType,
        fileSize: tenancyAttachments.fileSize,
        uploadedBy: tenancyAttachments.uploadedBy,
        organizationId: tenancyAttachments.organizationId,
        createdAt: tenancyAttachments.createdAt,
      })
      .from(tenancyAttachments)
      .innerJoin(tenantAssignments, eq(tenancyAttachments.tenantAssignmentId, tenantAssignments.id))
      .where(
        and(
          eq(tenancyAttachments.tenantAssignmentId, tenantAssignmentId),
          eq(tenantAssignments.organizationId, organizationId)
        )
      )
      .orderBy(desc(tenancyAttachments.createdAt));
  }

  async deleteTenancyAttachment(id: string, organizationId: string): Promise<{ fileUrl: string } | null> {
    // Verify attachment belongs to organization and get fileUrl
    const attachment = await db
      .select({
        fileUrl: tenancyAttachments.fileUrl,
      })
      .from(tenancyAttachments)
      .innerJoin(tenantAssignments, eq(tenancyAttachments.tenantAssignmentId, tenantAssignments.id))
      .where(
        and(
          eq(tenancyAttachments.id, id),
          eq(tenantAssignments.organizationId, organizationId)
        )
      );

    if (attachment.length === 0) {
      throw new Error("Attachment not found or access denied");
    }

    const fileUrl = attachment[0].fileUrl;

    // Delete the database record
    await db.delete(tenancyAttachments).where(eq(tenancyAttachments.id, id));

    // Return fileUrl so caller can delete the file from object storage
    return { fileUrl };
  }

  async getBlockTenantStats(blockId: string): Promise<{ totalUnits: number; occupiedUnits: number; occupancyRate: number; totalMonthlyRent: number }> {
    // Get all properties in the block (properties = units)
    const blockProperties = await db
      .select()
      .from(properties)
      .where(eq(properties.blockId, blockId));

    const totalUnits = blockProperties.length;

    if (totalUnits === 0) {
      return {
        totalUnits: 0,
        occupiedUnits: 0,
        occupancyRate: 0,
        totalMonthlyRent: 0,
      };
    }

    const propertyIds = blockProperties.map(p => p.id);

    // Get active tenant assignments for properties in this block
    const activeAssignments = await db
      .select({
        propertyId: tenantAssignments.propertyId,
        monthlyRent: tenantAssignments.monthlyRent,
      })
      .from(tenantAssignments)
      .where(
        and(
          sql`${tenantAssignments.propertyId} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`,
          eq(tenantAssignments.isActive, true)
        )
      );

    const occupiedUnits = activeAssignments.length;
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    // Calculate total monthly rent
    const totalMonthlyRent = activeAssignments.reduce((sum, assignment) => {
      return sum + (assignment.monthlyRent ? parseFloat(assignment.monthlyRent as string) : 0);
    }, 0);

    return {
      totalUnits,
      occupiedUnits,
      occupancyRate,
      totalMonthlyRent,
    };
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
        teamId: workOrders.teamId,
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
        team: {
          id: teams.id,
          name: teams.name,
          email: teams.email,
        },
      })
      .from(workOrders)
      .innerJoin(maintenanceRequests, eq(workOrders.maintenanceRequestId, maintenanceRequests.id))
      .leftJoin(users, eq(workOrders.contractorId, users.id))
      .leftJoin(teams, eq(workOrders.teamId, teams.id))
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

  // Team operations
  async createTeam(teamData: InsertTeam & { organizationId: string }): Promise<Team> {
    const [team] = await db.insert(teams).values(teamData).returning();
    return team;
  }

  async getTeamsByOrganization(organizationId: string): Promise<any[]> {
    // Get teams with member count
    return await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
        name: teams.name,
        description: teams.description,
        email: teams.email,
        isActive: teams.isActive,
        createdAt: teams.createdAt,
        updatedAt: teams.updatedAt,
        memberCount: sql<number>`count(distinct ${teamMembers.id})::int`,
      })
      .from(teams)
      .leftJoin(teamMembers, eq(teams.id, teamMembers.teamId))
      .where(eq(teams.organizationId, organizationId))
      .groupBy(teams.id)
      .orderBy(desc(teams.createdAt));
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  }

  async updateTeam(id: string, updates: Partial<InsertTeam>): Promise<Team> {
    const [team] = await db
      .update(teams)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning();
    return team;
  }

  async deleteTeam(id: string): Promise<void> {
    // Delete team members and categories first
    await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
    await db.delete(teamCategories).where(eq(teamCategories.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));
  }

  // Team Member operations
  async addTeamMember(memberData: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(memberData).returning();
    return member;
  }

  async getTeamMembers(teamId: string): Promise<any[]> {
    // Get team members with user/contact details
    return await db
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        contactId: teamMembers.contactId,
        role: teamMembers.role,
        createdAt: teamMembers.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
        },
        contact: {
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          type: contacts.type,
        },
      })
      .from(teamMembers)
      .leftJoin(users, eq(teamMembers.userId, users.id))
      .leftJoin(contacts, eq(teamMembers.contactId, contacts.id))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(teamMembers.createdAt);
  }

  async removeTeamMember(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  // Team Category operations
  async addTeamCategory(categoryData: InsertTeamCategory): Promise<TeamCategory> {
    const [category] = await db.insert(teamCategories).values(categoryData).returning();
    return category;
  }

  async getTeamCategories(teamId: string): Promise<TeamCategory[]> {
    return await db
      .select()
      .from(teamCategories)
      .where(eq(teamCategories.teamId, teamId))
      .orderBy(teamCategories.category);
  }

  async removeTeamCategory(id: string): Promise<void> {
    await db.delete(teamCategories).where(eq(teamCategories.id, id));
  }

  async getTeamByCategory(organizationId: string, category: string): Promise<Team | undefined> {
    // Find team assigned to a specific category
    const [result] = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
        name: teams.name,
        description: teams.description,
        email: teams.email,
        isActive: teams.isActive,
        createdAt: teams.createdAt,
        updatedAt: teams.updatedAt,
      })
      .from(teams)
      .innerJoin(teamCategories, eq(teams.id, teamCategories.teamId))
      .where(and(
        eq(teams.organizationId, organizationId),
        eq(teamCategories.category, category),
        eq(teams.isActive, true)
      ))
      .limit(1);
    return result;
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

  async getAssetById(id: string): Promise<AssetInventory | undefined> {
    return this.getAssetInventory(id);
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

  // Contact tag operations
  async addTagToContact(contactId: string, tagId: string): Promise<void> {
    await db.insert(contactTags).values({ contactId, tagId });
  }

  async removeTagFromContact(contactId: string, tagId: string): Promise<void> {
    await db.delete(contactTags).where(
      and(
        eq(contactTags.contactId, contactId),
        eq(contactTags.tagId, tagId)
      )
    );
  }

  async getTagsForContact(contactId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(contactTags)
      .innerJoin(tags, eq(contactTags.tagId, tags.id))
      .where(eq(contactTags.contactId, contactId));
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
    // Sync photos from valueJson to photos column for consistency
    const dataToInsert = this.syncPhotosFromValueJson(entryData);
    const [entry] = await db.insert(inspectionEntries).values(dataToInsert).returning();
    return entry;
  }

  // Helper to extract photos from valueJson and sync to photos column
  private syncPhotosFromValueJson(data: Partial<InsertInspectionEntry>): Partial<InsertInspectionEntry> {
    const result = { ...data };

    // If photos are directly provided, use them (highest priority)
    if (data.photos !== undefined) {
      result.photos = Array.isArray(data.photos) && data.photos.length > 0 ? data.photos : null;
    } else if (data.valueJson && typeof data.valueJson === 'object') {
      // Otherwise, try to extract photos from valueJson
      const valueJson = data.valueJson as any;
      let extractedPhotos: string[] | null = null;

      if (Array.isArray(valueJson.photos)) {
        extractedPhotos = valueJson.photos;
      } else if (typeof valueJson.photo === 'string' && valueJson.photo) {
        extractedPhotos = [valueJson.photo];
      } else if (Array.isArray(valueJson)) {
        // valueJson might be the photos array directly for photo fields
        const isAllStrings = valueJson.every((item: any) => typeof item === 'string');
        if (isAllStrings && valueJson.length > 0) {
          extractedPhotos = valueJson;
        }
      }

      // Only update photos column if we found photos in valueJson
      if (extractedPhotos !== null) {
        result.photos = extractedPhotos.length > 0 ? extractedPhotos : null;
      }
    }

    return result;
  }

  async createInspectionEntriesBatch(entriesData: InsertInspectionEntry[]): Promise<InspectionEntry[]> {
    if (entriesData.length === 0) return [];
    // Sync photos from valueJson to photos column for each entry
    const syncedData = entriesData.map(entry => this.syncPhotosFromValueJson(entry) as InsertInspectionEntry);
    // Use onConflictDoUpdate to handle offline sync retries idempotently
    // If offlineId exists, update the entry; otherwise insert new
    const entries = await db
      .insert(inspectionEntries)
      .values(syncedData)
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
    // Sync photos from valueJson to photos column for consistency
    const syncedUpdates = this.syncPhotosFromValueJson(updates);
    const [updated] = await db
      .update(inspectionEntries)
      .set({ ...syncedUpdates, updatedAt: new Date() })
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

  async deleteAiImageAnalysesByEntry(entryId: string): Promise<void> {
    await db.delete(aiImageAnalyses).where(eq(aiImageAnalyses.inspectionEntryId, entryId));
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

  // Message Template operations
  async createMessageTemplate(templateData: InsertMessageTemplate): Promise<MessageTemplate> {
    const [template] = await db.insert(messageTemplates).values(templateData).returning();
    return template;
  }

  async getMessageTemplatesByOrganization(organizationId: string): Promise<MessageTemplate[]> {
    return await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.organizationId, organizationId))
      .orderBy(desc(messageTemplates.createdAt));
  }

  async getMessageTemplate(id: string): Promise<MessageTemplate | undefined> {
    const [template] = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.id, id));
    return template;
  }

  async updateMessageTemplate(id: string, updates: Partial<InsertMessageTemplate>): Promise<MessageTemplate> {
    const [template] = await db
      .update(messageTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(messageTemplates.id, id))
      .returning();
    return template;
  }

  async deleteMessageTemplate(id: string): Promise<void> {
    await db.delete(messageTemplates).where(eq(messageTemplates.id, id));
  }

  async getBlockTenantsEmails(blockId: string, organizationId: string): Promise<{ email: string; firstName?: string; lastName?: string; }[]> {
    const tenantsData = await db
      .select({
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(tenantAssignments)
      .innerJoin(users, eq(tenantAssignments.tenantId, users.id))
      .innerJoin(properties, eq(tenantAssignments.propertyId, properties.id))
      .where(
        and(
          eq(properties.blockId, blockId),
          eq(properties.organizationId, organizationId),
          eq(tenantAssignments.isActive, true)
        )
      );

    return tenantsData.map(t => ({
      email: t.email,
      firstName: t.firstName ?? undefined,
      lastName: t.lastName ?? undefined,
    }));
  }

  // Fixflo Integration operations
  async getFixfloConfig(organizationId: string): Promise<FixfloConfig | undefined> {
    const [config] = await db
      .select()
      .from(fixfloConfig)
      .where(eq(fixfloConfig.organizationId, organizationId));
    return config;
  }

  async upsertFixfloConfig(configData: InsertFixfloConfig): Promise<FixfloConfig> {
    const [config] = await db
      .insert(fixfloConfig)
      .values(configData)
      .onConflictDoUpdate({
        target: fixfloConfig.organizationId,
        set: {
          ...configData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return config;
  }

  // ==================== SUBSCRIPTION SYSTEM OPERATIONS ====================

  // Subscription Plan operations
  async getPlans(): Promise<Plan[]> {
    return await db.select().from(plans).orderBy(plans.monthlyPriceGbp);
  }

  async getActivePlans(): Promise<Plan[]> {
    return await db
      .select()
      .from(plans)
      .where(eq(plans.isActive, true))
      .orderBy(plans.monthlyPriceGbp);
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }

  async getPlanByCode(code: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.code, code as any));
    return plan;
  }

  async createPlan(planData: InsertPlan): Promise<Plan> {
    const [plan] = await db.insert(plans).values(planData).returning();
    return plan;
  }

  async updatePlan(id: string, updates: Partial<InsertPlan>): Promise<Plan> {
    const [plan] = await db
      .update(plans)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return plan;
  }

  // Country Pricing Override operations
  async getCountryPricingOverride(countryCode: string, planId: string): Promise<CountryPricingOverride | undefined> {
    const now = new Date();
    const [override] = await db
      .select()
      .from(countryPricingOverrides)
      .where(
        and(
          eq(countryPricingOverrides.countryCode, countryCode),
          eq(countryPricingOverrides.planId, planId),
          lte(countryPricingOverrides.activeFrom, now),
          or(
            isNull(countryPricingOverrides.activeTo),
            gte(countryPricingOverrides.activeTo, now)
          )
        )
      );
    return override;
  }

  async getCountryPricingOverridesByCountry(countryCode: string): Promise<CountryPricingOverride[]> {
    const now = new Date();
    return await db
      .select()
      .from(countryPricingOverrides)
      .where(
        and(
          eq(countryPricingOverrides.countryCode, countryCode),
          lte(countryPricingOverrides.activeFrom, now),
          or(
            isNull(countryPricingOverrides.activeTo),
            gte(countryPricingOverrides.activeTo, now)
          )
        )
      );
  }

  async getAllCountryPricingOverrides(): Promise<CountryPricingOverride[]> {
    return await db
      .select()
      .from(countryPricingOverrides)
      .orderBy(countryPricingOverrides.countryCode, countryPricingOverrides.planId);
  }

  async createCountryPricingOverride(overrideData: InsertCountryPricingOverride): Promise<CountryPricingOverride> {
    const [override] = await db.insert(countryPricingOverrides).values(overrideData).returning();
    return override;
  }

  async updateCountryPricingOverride(id: string, updates: Partial<InsertCountryPricingOverride>): Promise<CountryPricingOverride> {
    const [override] = await db
      .update(countryPricingOverrides)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(countryPricingOverrides.id, id))
      .returning();
    return override;
  }

  async deleteCountryPricingOverride(id: string): Promise<void> {
    await db.delete(countryPricingOverrides).where(eq(countryPricingOverrides.id, id));
  }

  // Credit Bundle operations
  async getCreditBundles(): Promise<CreditBundle[]> {
    return await db.select().from(creditBundles).orderBy(creditBundles.sortOrder, creditBundles.credits);
  }

  async getActiveCreditBundles(): Promise<CreditBundle[]> {
    return await db
      .select()
      .from(creditBundles)
      .where(eq(creditBundles.isActive, true))
      .orderBy(creditBundles.sortOrder, creditBundles.credits);
  }

  async getCreditBundle(id: string): Promise<CreditBundle | undefined> {
    const [bundle] = await db.select().from(creditBundles).where(eq(creditBundles.id, id));
    return bundle;
  }

  async createCreditBundle(bundleData: InsertCreditBundle): Promise<CreditBundle> {
    const [bundle] = await db.insert(creditBundles).values(bundleData).returning();
    return bundle;
  }

  async updateCreditBundle(id: string, updates: Partial<InsertCreditBundle>): Promise<CreditBundle> {
    const [bundle] = await db
      .update(creditBundles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(creditBundles.id, id))
      .returning();
    return bundle;
  }

  async deleteCreditBundle(id: string): Promise<void> {
    await db.delete(creditBundles).where(eq(creditBundles.id, id));
  }

  // Bundle Tier Pricing operations
  async getBundleTierPricing(bundleId: string, planCode: string): Promise<BundleTierPricing | undefined> {
    const [pricing] = await db
      .select()
      .from(bundleTierPricing)
      .where(
        and(
          eq(bundleTierPricing.bundleId, bundleId),
          eq(bundleTierPricing.planCode, planCode as any)
        )
      );
    return pricing;
  }

  async getBundleTierPricingByBundle(bundleId: string): Promise<BundleTierPricing[]> {
    return await db
      .select()
      .from(bundleTierPricing)
      .where(eq(bundleTierPricing.bundleId, bundleId));
  }

  async getAllBundleTierPricing(): Promise<BundleTierPricing[]> {
    return await db.select().from(bundleTierPricing);
  }

  // Subscription operations
  async createSubscription(subscriptionData: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db.insert(subscriptions).values(subscriptionData).returning();
    return subscription;
  }

  async getSubscription(id: string): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    return subscription;
  }

  async getSubscriptionByOrganization(organizationId: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return subscription;
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    return subscription;
  }

  async updateSubscription(id: string, updates: Partial<InsertSubscription>): Promise<Subscription> {
    const [subscription] = await db
      .update(subscriptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription;
  }

  async cancelSubscription(id: string): Promise<Subscription> {
    const [subscription] = await db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        status: 'cancelled' as any,
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription;
  }

  // Credit Batch operations
  async createCreditBatch(batchData: InsertCreditBatch): Promise<CreditBatch> {
    const [batch] = await db.insert(creditBatches).values(batchData as any).returning();
    return batch;
  }

  async getCreditBatch(id: string): Promise<CreditBatch | undefined> {
    const [batch] = await db.select().from(creditBatches).where(eq(creditBatches.id, id));
    return batch;
  }

  async getCreditBatchesByOrganization(organizationId: string): Promise<CreditBatch[]> {
    return await db
      .select()
      .from(creditBatches)
      .where(eq(creditBatches.organizationId, organizationId))
      .orderBy(desc(creditBatches.grantedAt));
  }

  async getAvailableCreditBatches(organizationId: string): Promise<CreditBatch[]> {
    const now = new Date();
    return await db
      .select()
      .from(creditBatches)
      .where(
        and(
          eq(creditBatches.organizationId, organizationId),
          sql`${creditBatches.remainingQuantity} > 0`,
          or(
            isNull(creditBatches.expiresAt),
            gte(creditBatches.expiresAt, now)
          )
        )
      )
      .orderBy(creditBatches.expiresAt, creditBatches.grantedAt); // FIFO: oldest expiry first
  }

  async updateCreditBatch(id: string, updates: Partial<InsertCreditBatch>): Promise<CreditBatch> {
    const [batch] = await db
      .update(creditBatches)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(creditBatches.id, id))
      .returning();
    return batch;
  }

  async expireCreditBatch(id: string): Promise<CreditBatch> {
    const [batch] = await db
      .update(creditBatches)
      .set({
        remainingQuantity: 0,
        updatedAt: new Date()
      })
      .where(eq(creditBatches.id, id))
      .returning();
    return batch;
  }

  // Credit Ledger operations
  async createCreditLedgerEntry(entryData: InsertCreditLedger): Promise<CreditLedger> {
    const [entry] = await db.insert(creditLedger).values(entryData).returning();
    return entry;
  }

  async getCreditLedgerByOrganization(organizationId: string, limit: number = 100): Promise<any[]> {
    const results = await db
      .select({
        id: creditLedger.id,
        organizationId: creditLedger.organizationId,
        createdBy: creditLedger.createdBy,
        source: creditLedger.source,
        quantity: creditLedger.quantity,
        batchId: creditLedger.batchId,
        unitCostMinorUnits: creditLedger.unitCostMinorUnits,
        notes: creditLedger.notes,
        linkedEntityType: creditLedger.linkedEntityType,
        linkedEntityId: creditLedger.linkedEntityId,
        createdAt: creditLedger.createdAt,
        createdByUser: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(creditLedger)
      .leftJoin(users, eq(creditLedger.createdBy, users.id))
      .where(eq(creditLedger.organizationId, organizationId))
      .orderBy(desc(creditLedger.createdAt))
      .limit(limit);

    return results;
  }

  async getCreditBalance(organizationId: string): Promise<{ total: number; rolled: number; current: number; expiresOn: Date | null }> {
    const now = new Date();
    const batches = await db
      .select()
      .from(creditBatches)
      .where(
        and(
          eq(creditBatches.organizationId, organizationId),
          sql`${creditBatches.remainingQuantity} > 0`,
          or(
            isNull(creditBatches.expiresAt),
            gte(creditBatches.expiresAt, now)
          )
        )
      );

    let total = 0;
    let rolled = 0;
    let current = 0;
    let earliestExpiry: Date | null = null;

    for (const batch of batches) {
      total += batch.remainingQuantity;
      if (batch.rolled) {
        rolled += batch.remainingQuantity;
      } else {
        current += batch.remainingQuantity;
      }
      if (batch.expiresAt && (!earliestExpiry || batch.expiresAt < earliestExpiry)) {
        earliestExpiry = batch.expiresAt;
      }
    }

    return { total, rolled, current, expiresOn: earliestExpiry };
  }

  // Top-up Order operations
  async createTopupOrder(orderData: InsertTopupOrder): Promise<TopupOrder> {
    const [order] = await db.insert(topupOrders).values(orderData).returning();
    return order;
  }

  async getTopupOrder(id: string): Promise<TopupOrder | undefined> {
    const [order] = await db.select().from(topupOrders).where(eq(topupOrders.id, id));
    return order;
  }

  async getTopupOrdersByOrganization(organizationId: string): Promise<TopupOrder[]> {
    return await db
      .select()
      .from(topupOrders)
      .where(eq(topupOrders.organizationId, organizationId))
      .orderBy(desc(topupOrders.createdAt));
  }

  async updateTopupOrder(id: string, updates: Partial<InsertTopupOrder>): Promise<TopupOrder> {
    const [order] = await db
      .update(topupOrders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(topupOrders.id, id))
      .returning();
    return order;
  }

  async updateFixfloHealthCheck(
    organizationId: string,
    updates: { lastHealthCheck: Date; healthCheckStatus: string; lastError: string | null; }
  ): Promise<void> {
    await db
      .update(fixfloConfig)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(fixfloConfig.organizationId, organizationId));
  }

  async getFixfloSyncStates(organizationId: string): Promise<FixfloSyncState[]> {
    return await db
      .select()
      .from(fixfloSyncState)
      .where(eq(fixfloSyncState.organizationId, organizationId))
      .orderBy(desc(fixfloSyncState.lastSyncAt));
  }

  async upsertFixfloSyncState(syncStateData: InsertFixfloSyncState): Promise<FixfloSyncState> {
    const [syncState] = await db
      .insert(fixfloSyncState)
      .values(syncStateData)
      .onConflictDoUpdate({
        target: [fixfloSyncState.organizationId, fixfloSyncState.entityType],
        set: {
          ...syncStateData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return syncState;
  }

  async getFixfloWebhookLogs(organizationId: string, limit: number = 50): Promise<FixfloWebhookLog[]> {
    return await db
      .select()
      .from(fixfloWebhookLogs)
      .where(eq(fixfloWebhookLogs.organizationId, organizationId))
      .orderBy(desc(fixfloWebhookLogs.createdAt))
      .limit(limit);
  }

  async createFixfloWebhookLog(logData: InsertFixfloWebhookLog): Promise<FixfloWebhookLog> {
    const [log] = await db
      .insert(fixfloWebhookLogs)
      .values(logData)
      .returning();
    return log;
  }

  async updateFixfloWebhookLog(id: string, updates: Partial<FixfloWebhookLog>): Promise<void> {
    await db
      .update(fixfloWebhookLogs)
      .set(updates)
      .where(eq(fixfloWebhookLogs.id, id));
  }

  // Knowledge Base operations
  async createKnowledgeBaseDocument(docData: InsertKnowledgeBaseDocument): Promise<KnowledgeBaseDocument> {
    const [doc] = await db
      .insert(knowledgeBaseDocuments)
      .values(docData)
      .returning();
    return doc;
  }

  async getKnowledgeBaseDocuments(activeOnly: boolean = true): Promise<KnowledgeBaseDocument[]> {
    if (activeOnly) {
      return await db
        .select()
        .from(knowledgeBaseDocuments)
        .where(eq(knowledgeBaseDocuments.isActive, true))
        .orderBy(desc(knowledgeBaseDocuments.createdAt));
    }
    return await db
      .select()
      .from(knowledgeBaseDocuments)
      .orderBy(desc(knowledgeBaseDocuments.createdAt));
  }

  async getKnowledgeBaseDocument(id: string): Promise<KnowledgeBaseDocument | undefined> {
    const [doc] = await db
      .select()
      .from(knowledgeBaseDocuments)
      .where(eq(knowledgeBaseDocuments.id, id));
    return doc;
  }

  async updateKnowledgeBaseDocument(id: string, updates: Partial<InsertKnowledgeBaseDocument>): Promise<KnowledgeBaseDocument> {
    const [doc] = await db
      .update(knowledgeBaseDocuments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(knowledgeBaseDocuments.id, id))
      .returning();
    return doc;
  }

  async deleteKnowledgeBaseDocument(id: string): Promise<void> {
    await db
      .delete(knowledgeBaseDocuments)
      .where(eq(knowledgeBaseDocuments.id, id));
  }

  async searchKnowledgeBase(query: string): Promise<KnowledgeBaseDocument[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    return await db
      .select()
      .from(knowledgeBaseDocuments)
      .where(
        and(
          eq(knowledgeBaseDocuments.isActive, true),
          or(
            sql`LOWER(${knowledgeBaseDocuments.title}) LIKE ${searchTerm}`,
            sql`LOWER(${knowledgeBaseDocuments.extractedText}) LIKE ${searchTerm}`,
            sql`LOWER(${knowledgeBaseDocuments.category}) LIKE ${searchTerm}`
          )
        )
      )
      .orderBy(desc(knowledgeBaseDocuments.createdAt));
  }

  // Chat operations
  async createChatConversation(conversationData: InsertChatConversation): Promise<ChatConversation> {
    const [conversation] = await db
      .insert(chatConversations)
      .values(conversationData)
      .returning();
    return conversation;
  }

  async getChatConversationsByUser(userId: string): Promise<ChatConversation[]> {
    return await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.userId, userId),
          eq(chatConversations.isActive, true)
        )
      )
      .orderBy(desc(chatConversations.updatedAt));
  }

  async getChatConversation(id: string): Promise<ChatConversation | undefined> {
    const [conversation] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, id));
    return conversation;
  }

  async updateChatConversation(id: string, updates: Partial<InsertChatConversation>): Promise<ChatConversation> {
    const [conversation] = await db
      .update(chatConversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chatConversations.id, id))
      .returning();
    return conversation;
  }

  async createChatMessage(messageData: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db
      .insert(chatMessages)
      .values(messageData)
      .returning();

    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, messageData.conversationId));

    return message;
  }

  async getChatMessages(conversationId: string): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
  }

  // Tenant operations
  async getTenancyByTenantId(tenantId: string): Promise<any> {
    // Get the most recent active tenant assignment with property and block info
    const [tenancy] = await db
      .select({
        id: tenantAssignments.id,
        tenantId: tenantAssignments.tenantId,
        propertyId: tenantAssignments.propertyId,
        organizationId: tenantAssignments.organizationId,
        leaseStartDate: tenantAssignments.leaseStartDate,
        leaseEndDate: tenantAssignments.leaseEndDate,
        monthlyRent: tenantAssignments.monthlyRent,
        depositAmount: tenantAssignments.depositAmount,
        isActive: tenantAssignments.isActive,
        createdAt: tenantAssignments.createdAt,
        updatedAt: tenantAssignments.updatedAt,
        blockId: properties.blockId,
      })
      .from(tenantAssignments)
      .leftJoin(properties, eq(tenantAssignments.propertyId, properties.id))
      .where(eq(tenantAssignments.tenantId, tenantId))
      .orderBy(desc(tenantAssignments.createdAt))
      .limit(1);
    return tenancy;
  }

  async getTenantMaintenanceChats(tenantId: string): Promise<any[]> {
    return await db
      .select()
      .from(tenantMaintenanceChats)
      .where(eq(tenantMaintenanceChats.tenantId, tenantId))
      .orderBy(desc(tenantMaintenanceChats.createdAt));
  }

  async getMaintenanceChatById(chatId: string): Promise<any> {
    const [chat] = await db
      .select()
      .from(tenantMaintenanceChats)
      .where(eq(tenantMaintenanceChats.id, chatId));
    return chat;
  }

  async getTenantMaintenanceChatMessages(chatId: string): Promise<any[]> {
    return await db
      .select()
      .from(tenantMaintenanceChatMessages)
      .where(eq(tenantMaintenanceChatMessages.chatId, chatId))
      .orderBy(tenantMaintenanceChatMessages.createdAt);
  }

  async createTenantMaintenanceChat(chatData: any): Promise<any> {
    const [chat] = await db
      .insert(tenantMaintenanceChats)
      .values(chatData)
      .returning();
    return chat;
  }

  async createTenantMaintenanceChatMessage(messageData: any): Promise<any> {
    const [message] = await db
      .insert(tenantMaintenanceChatMessages)
      .values(messageData)
      .returning();
    return message;
  }

  async updateTenantMaintenanceChat(chatId: string, updates: any): Promise<any> {
    const [chat] = await db
      .update(tenantMaintenanceChats)
      .set(updates)
      .where(eq(tenantMaintenanceChats.id, chatId))
      .returning();
    return chat;
  }

  async getMaintenanceRequestsByReporter(reporterId: string): Promise<MaintenanceRequest[]> {
    return await db
      .select()
      .from(maintenanceRequests)
      .where(eq(maintenanceRequests.reportedBy, reporterId))
      .orderBy(desc(maintenanceRequests.createdAt));
  }

  // Feedback system operations
  async createFeedback(feedbackData: InsertFeedback): Promise<FeedbackSubmission> {
    const [feedback] = await db
      .insert(feedbackSubmissions)
      .values(feedbackData)
      .returning();
    return feedback;
  }

  async getFeedbackById(id: string): Promise<FeedbackSubmission | undefined> {
    const [feedback] = await db
      .select()
      .from(feedbackSubmissions)
      .where(eq(feedbackSubmissions.id, id));
    return feedback;
  }

  async getFeedbackByUser(userId: string): Promise<FeedbackSubmission[]> {
    return await db
      .select()
      .from(feedbackSubmissions)
      .where(eq(feedbackSubmissions.userId, userId))
      .orderBy(desc(feedbackSubmissions.createdAt));
  }

  async getAllFeedback(filters?: { status?: string; category?: string; priority?: string; }): Promise<FeedbackSubmission[]> {
    let query = db.select().from(feedbackSubmissions);

    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(feedbackSubmissions.status, filters.status as any));
    }
    if (filters?.category) {
      conditions.push(eq(feedbackSubmissions.category, filters.category as any));
    }
    if (filters?.priority) {
      conditions.push(eq(feedbackSubmissions.priority, filters.priority as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return await query.orderBy(desc(feedbackSubmissions.createdAt));
  }

  async updateFeedback(id: string, updates: UpdateFeedback): Promise<FeedbackSubmission> {
    const updateData: any = {
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.status === 'completed' || updates.status === 'rejected') {
      updateData.resolvedAt = new Date();
    }

    const [feedback] = await db
      .update(feedbackSubmissions)
      .set(updateData)
      .where(eq(feedbackSubmissions.id, id))
      .returning();
    return feedback;
  }

  // Central team config operations
  async getCentralTeamConfig(): Promise<CentralTeamConfig[]> {
    return await db
      .select()
      .from(centralTeamConfig)
      .orderBy(centralTeamConfig.createdAt);
  }

  async addCentralTeamEmail(email: string): Promise<CentralTeamConfig> {
    const [config] = await db
      .insert(centralTeamConfig)
      .values({ notificationEmail: email })
      .returning();
    return config;
  }

  async removeCentralTeamEmail(id: string): Promise<void> {
    await db
      .delete(centralTeamConfig)
      .where(eq(centralTeamConfig.id, id));
  }

  async updateCentralTeamEmail(id: string, isActive: boolean): Promise<CentralTeamConfig> {
    const [config] = await db
      .update(centralTeamConfig)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(centralTeamConfig.id, id))
      .returning();
    return config;
  }

  // Notification operations
  async createNotification(notificationData: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(notificationData)
      .returning();
    return notification;
  }

  async getNotificationsByUser(userId: string, unreadOnly: boolean = false): Promise<Notification[]> {
    const conditions = [eq(notifications.userId, userId)];

    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    return await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt));
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date(), updatedAt: new Date() })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date(), updatedAt: new Date() })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result[0]?.count || 0;
  }

  // Organization Trademark operations
  async getOrganizationTrademarks(organizationId: string): Promise<OrganizationTrademark[]> {
    return await db
      .select()
      .from(organizationTrademarks)
      .where(eq(organizationTrademarks.organizationId, organizationId))
      .orderBy(asc(organizationTrademarks.displayOrder));
  }

  async createOrganizationTrademark(trademark: InsertOrganizationTrademark): Promise<OrganizationTrademark> {
    const [created] = await db.insert(organizationTrademarks).values(trademark).returning();
    return created;
  }

  async updateOrganizationTrademark(id: string, updates: Partial<InsertOrganizationTrademark>): Promise<OrganizationTrademark> {
    const [updated] = await db
      .update(organizationTrademarks)
      .set(updates)
      .where(eq(organizationTrademarks.id, id))
      .returning();
    return updated;
  }

  async deleteOrganizationTrademark(id: string): Promise<void> {
    await db.delete(organizationTrademarks).where(eq(organizationTrademarks.id, id));
  }

  async reorderOrganizationTrademarks(organizationId: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(organizationTrademarks)
        .set({ displayOrder: i })
        .where(and(
          eq(organizationTrademarks.id, orderedIds[i]),
          eq(organizationTrademarks.organizationId, organizationId)
        ));
    }
  }

  // User Document operations
  async getUserDocuments(userId: string): Promise<UserDocument[]> {
    return await db
      .select()
      .from(userDocuments)
      .where(eq(userDocuments.userId, userId))
      .orderBy(desc(userDocuments.createdAt));
  }

  async getUserDocument(id: string): Promise<UserDocument | undefined> {
    const [document] = await db
      .select()
      .from(userDocuments)
      .where(eq(userDocuments.id, id));
    return document;
  }

  async createUserDocument(document: InsertUserDocument): Promise<UserDocument> {
    const [newDocument] = await db
      .insert(userDocuments)
      .values(document)
      .returning();
    return newDocument;
  }

  async updateUserDocument(id: string, updates: Partial<InsertUserDocument>): Promise<UserDocument> {
    const [updated] = await db
      .update(userDocuments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteUserDocument(id: string): Promise<void> {
    await db.delete(userDocuments).where(eq(userDocuments.id, id));
  }

  // ==================== COMMUNITY DISCUSSION OPERATIONS ====================

  // Community Rules
  async getCommunityRules(organizationId: string): Promise<CommunityRules | undefined> {
    const [rules] = await db
      .select()
      .from(communityRules)
      .where(and(eq(communityRules.organizationId, organizationId), eq(communityRules.isActive, true)))
      .orderBy(desc(communityRules.version))
      .limit(1);
    return rules;
  }

  async createCommunityRules(rules: InsertCommunityRules): Promise<CommunityRules> {
    // Deactivate previous rules
    await db
      .update(communityRules)
      .set({ isActive: false })
      .where(eq(communityRules.organizationId, rules.organizationId));
    
    // Get next version number
    const existing = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${communityRules.version}), 0)` })
      .from(communityRules)
      .where(eq(communityRules.organizationId, rules.organizationId));
    
    const nextVersion = (existing[0]?.maxVersion || 0) + 1;
    
    const [created] = await db
      .insert(communityRules)
      .values({ ...rules, version: nextVersion, isActive: true })
      .returning();
    return created;
  }

  async getActiveRuleVersion(organizationId: string): Promise<number> {
    const rules = await this.getCommunityRules(organizationId);
    return rules?.version || 0;
  }

  // Rule Acceptances
  async hasAcceptedLatestRules(tenantId: string, organizationId: string): Promise<boolean> {
    const latestVersion = await this.getActiveRuleVersion(organizationId);
    if (latestVersion === 0) return true; // No rules set up yet
    
    const [acceptance] = await db
      .select()
      .from(communityRuleAcceptances)
      .where(and(
        eq(communityRuleAcceptances.tenantId, tenantId),
        eq(communityRuleAcceptances.organizationId, organizationId),
        eq(communityRuleAcceptances.ruleVersion, latestVersion)
      ))
      .limit(1);
    return !!acceptance;
  }

  async acceptCommunityRules(acceptance: InsertCommunityRuleAcceptance): Promise<CommunityRuleAcceptance> {
    const [created] = await db
      .insert(communityRuleAcceptances)
      .values(acceptance)
      .returning();
    return created;
  }

  // Community Groups
  async getCommunityGroups(blockId: string, status?: string): Promise<CommunityGroup[]> {
    if (status) {
      return await db
        .select()
        .from(communityGroups)
        .where(and(eq(communityGroups.blockId, blockId), eq(communityGroups.status, status as any)))
        .orderBy(desc(communityGroups.createdAt));
    }
    return await db
      .select()
      .from(communityGroups)
      .where(eq(communityGroups.blockId, blockId))
      .orderBy(desc(communityGroups.createdAt));
  }

  async getCommunityGroupsByOrganization(organizationId: string, status?: string): Promise<CommunityGroup[]> {
    if (status) {
      return await db
        .select()
        .from(communityGroups)
        .where(and(eq(communityGroups.organizationId, organizationId), eq(communityGroups.status, status as any)))
        .orderBy(desc(communityGroups.createdAt));
    }
    return await db
      .select()
      .from(communityGroups)
      .where(eq(communityGroups.organizationId, organizationId))
      .orderBy(desc(communityGroups.createdAt));
  }

  async getCommunityGroup(id: string): Promise<CommunityGroup | undefined> {
    const [group] = await db
      .select()
      .from(communityGroups)
      .where(eq(communityGroups.id, id));
    return group;
  }

  async createCommunityGroup(group: InsertCommunityGroup): Promise<CommunityGroup> {
    const [created] = await db
      .insert(communityGroups)
      .values(group)
      .returning();
    return created;
  }

  async updateCommunityGroup(id: string, updates: UpdateCommunityGroup): Promise<CommunityGroup> {
    const updateData: any = { ...updates, updatedAt: new Date() };
    if (updates.status === 'approved') {
      updateData.approvedAt = new Date();
    }
    const [updated] = await db
      .update(communityGroups)
      .set(updateData)
      .where(eq(communityGroups.id, id))
      .returning();
    return updated;
  }

  async deleteCommunityGroup(id: string): Promise<void> {
    await db.delete(communityGroups).where(eq(communityGroups.id, id));
  }

  async getPendingGroupsCount(organizationId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(communityGroups)
      .where(and(eq(communityGroups.organizationId, organizationId), eq(communityGroups.status, 'pending')));
    return result[0]?.count || 0;
  }

  // Group Members
  async getGroupMembers(groupId: string): Promise<CommunityGroupMember[]> {
    return await db
      .select()
      .from(communityGroupMembers)
      .where(eq(communityGroupMembers.groupId, groupId))
      .orderBy(desc(communityGroupMembers.joinedAt));
  }

  async isGroupMember(groupId: string, tenantId: string): Promise<boolean> {
    const [member] = await db
      .select()
      .from(communityGroupMembers)
      .where(and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.tenantId, tenantId)))
      .limit(1);
    return !!member;
  }

  async joinGroup(membership: InsertCommunityGroupMember): Promise<CommunityGroupMember> {
    const [member] = await db
      .insert(communityGroupMembers)
      .values(membership)
      .returning();
    
    // Update member count
    await db
      .update(communityGroups)
      .set({ memberCount: sql`${communityGroups.memberCount} + 1` })
      .where(eq(communityGroups.id, membership.groupId));
    
    return member;
  }

  async leaveGroup(groupId: string, tenantId: string): Promise<void> {
    await db
      .delete(communityGroupMembers)
      .where(and(eq(communityGroupMembers.groupId, groupId), eq(communityGroupMembers.tenantId, tenantId)));
    
    // Update member count
    await db
      .update(communityGroups)
      .set({ memberCount: sql`GREATEST(${communityGroups.memberCount} - 1, 0)` })
      .where(eq(communityGroups.id, groupId));
  }

  // Community Threads
  async getCommunityThreads(groupId: string): Promise<CommunityThread[]> {
    return await db
      .select()
      .from(communityThreads)
      .where(eq(communityThreads.groupId, groupId))
      .orderBy(desc(communityThreads.isPinned), desc(communityThreads.lastActivityAt));
  }

  async getCommunityThread(id: string): Promise<CommunityThread | undefined> {
    const [thread] = await db
      .select()
      .from(communityThreads)
      .where(eq(communityThreads.id, id));
    return thread;
  }

  async createCommunityThread(thread: InsertCommunityThread): Promise<CommunityThread> {
    const [created] = await db
      .insert(communityThreads)
      .values(thread)
      .returning();
    
    // Update group post count
    await db
      .update(communityGroups)
      .set({ postCount: sql`${communityGroups.postCount} + 1` })
      .where(eq(communityGroups.id, thread.groupId));
    
    return created;
  }

  async updateCommunityThread(id: string, updates: UpdateCommunityThread): Promise<CommunityThread> {
    const [updated] = await db
      .update(communityThreads)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(communityThreads.id, id))
      .returning();
    return updated;
  }

  async deleteCommunityThread(id: string): Promise<void> {
    // Get the thread to update group count
    const thread = await this.getCommunityThread(id);
    if (thread) {
      await db
        .update(communityGroups)
        .set({ postCount: sql`GREATEST(${communityGroups.postCount} - 1, 0)` })
        .where(eq(communityGroups.id, thread.groupId));
    }
    await db.delete(communityThreads).where(eq(communityThreads.id, id));
  }

  async incrementThreadViewCount(id: string): Promise<void> {
    await db
      .update(communityThreads)
      .set({ viewCount: sql`${communityThreads.viewCount} + 1` })
      .where(eq(communityThreads.id, id));
  }

  // Community Posts
  async getCommunityPosts(threadId: string): Promise<CommunityPost[]> {
    return await db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.threadId, threadId))
      .orderBy(asc(communityPosts.createdAt));
  }

  async getCommunityPost(id: string): Promise<CommunityPost | undefined> {
    const [post] = await db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, id));
    return post;
  }

  async createCommunityPost(post: InsertCommunityPost): Promise<CommunityPost> {
    const [created] = await db
      .insert(communityPosts)
      .values(post)
      .returning();
    
    // Update thread reply count and last activity
    await db
      .update(communityThreads)
      .set({ 
        replyCount: sql`${communityThreads.replyCount} + 1`,
        lastActivityAt: new Date()
      })
      .where(eq(communityThreads.id, post.threadId));
    
    return created;
  }

  async updateCommunityPost(id: string, updates: UpdateCommunityPost): Promise<CommunityPost> {
    const [updated] = await db
      .update(communityPosts)
      .set({ ...updates, isEdited: true, editedAt: new Date(), updatedAt: new Date() })
      .where(eq(communityPosts.id, id))
      .returning();
    return updated;
  }

  async deleteCommunityPost(id: string): Promise<void> {
    // Get the post to update thread count
    const post = await this.getCommunityPost(id);
    if (post) {
      await db
        .update(communityThreads)
        .set({ replyCount: sql`GREATEST(${communityThreads.replyCount} - 1, 0)` })
        .where(eq(communityThreads.id, post.threadId));
    }
    await db.delete(communityPosts).where(eq(communityPosts.id, id));
  }

  // Community Attachments
  async getThreadAttachments(threadId: string): Promise<CommunityAttachment[]> {
    return await db
      .select()
      .from(communityAttachments)
      .where(eq(communityAttachments.threadId, threadId))
      .orderBy(asc(communityAttachments.createdAt));
  }

  async getPostAttachments(postId: string): Promise<CommunityAttachment[]> {
    return await db
      .select()
      .from(communityAttachments)
      .where(eq(communityAttachments.postId, postId))
      .orderBy(asc(communityAttachments.createdAt));
  }

  async createCommunityAttachment(attachment: InsertCommunityAttachment): Promise<CommunityAttachment> {
    const [created] = await db
      .insert(communityAttachments)
      .values(attachment)
      .returning();
    return created;
  }

  async deleteCommunityAttachment(id: string): Promise<void> {
    await db.delete(communityAttachments).where(eq(communityAttachments.id, id));
  }

  // Community Flags
  async getCommunityFlags(organizationId: string, unresolvedOnly?: boolean): Promise<CommunityPostFlag[]> {
    // Get flags by joining through threads -> groups -> organization
    const flaggedThreads = await db
      .select({ flag: communityPostFlags })
      .from(communityPostFlags)
      .innerJoin(communityThreads, eq(communityPostFlags.threadId, communityThreads.id))
      .innerJoin(communityGroups, eq(communityThreads.groupId, communityGroups.id))
      .where(and(
        eq(communityGroups.organizationId, organizationId),
        unresolvedOnly ? eq(communityPostFlags.isResolved, false) : undefined
      ));
    
    const flaggedPosts = await db
      .select({ flag: communityPostFlags })
      .from(communityPostFlags)
      .innerJoin(communityPosts, eq(communityPostFlags.postId, communityPosts.id))
      .innerJoin(communityThreads, eq(communityPosts.threadId, communityThreads.id))
      .innerJoin(communityGroups, eq(communityThreads.groupId, communityGroups.id))
      .where(and(
        eq(communityGroups.organizationId, organizationId),
        unresolvedOnly ? eq(communityPostFlags.isResolved, false) : undefined
      ));
    
    const allFlags = [...flaggedThreads.map(f => f.flag), ...flaggedPosts.map(f => f.flag)];
    return allFlags.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createCommunityFlag(flag: InsertCommunityPostFlag): Promise<CommunityPostFlag> {
    const [created] = await db
      .insert(communityPostFlags)
      .values(flag)
      .returning();
    return created;
  }

  async resolveCommunityFlag(id: string, resolvedBy: string, notes: string): Promise<CommunityPostFlag> {
    const [updated] = await db
      .update(communityPostFlags)
      .set({ isResolved: true, resolvedBy, resolutionNotes: notes, resolvedAt: new Date() })
      .where(eq(communityPostFlags.id, id))
      .returning();
    return updated;
  }

  // Community Moderation Log
  async getCommunityModerationLog(organizationId: string): Promise<CommunityModerationLog[]> {
    return await db
      .select()
      .from(communityModerationLog)
      .where(eq(communityModerationLog.organizationId, organizationId))
      .orderBy(desc(communityModerationLog.createdAt));
  }

  async createCommunityModerationLog(log: InsertCommunityModerationLog): Promise<CommunityModerationLog> {
    const [created] = await db
      .insert(communityModerationLog)
      .values(log)
      .returning();
    return created;
  }

  // Community Tenant Blocks
  async getCommunityTenantBlocks(organizationId: string): Promise<CommunityTenantBlock[]> {
    return await db
      .select()
      .from(communityTenantBlocks)
      .where(eq(communityTenantBlocks.organizationId, organizationId))
      .orderBy(desc(communityTenantBlocks.createdAt));
  }

  async getCommunityTenantBlock(organizationId: string, tenantUserId: string): Promise<CommunityTenantBlock | undefined> {
    const [block] = await db
      .select()
      .from(communityTenantBlocks)
      .where(and(
        eq(communityTenantBlocks.organizationId, organizationId),
        eq(communityTenantBlocks.tenantUserId, tenantUserId)
      ));
    return block;
  }

  async createCommunityTenantBlock(block: InsertCommunityTenantBlock): Promise<CommunityTenantBlock> {
    const [created] = await db
      .insert(communityTenantBlocks)
      .values(block)
      .returning();
    return created;
  }

  async deleteCommunityTenantBlock(organizationId: string, tenantUserId: string): Promise<void> {
    await db
      .delete(communityTenantBlocks)
      .where(and(
        eq(communityTenantBlocks.organizationId, organizationId),
        eq(communityTenantBlocks.tenantUserId, tenantUserId)
      ));
  }

  async isTenantBlocked(organizationId: string, tenantUserId: string): Promise<boolean> {
    const block = await this.getCommunityTenantBlock(organizationId, tenantUserId);
    return !!block;
  }
}

export const storage = new DatabaseStorage();
