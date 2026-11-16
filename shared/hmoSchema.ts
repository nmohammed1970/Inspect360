import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/** HMO Compliance Intelligence domain tables (org-isolated). */

export const hmoOrgSettings = pgTable("hmo_org_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().unique(),
  slaJson: jsonb("sla_json").$type<Record<string, unknown>>().default({}),
  quietHoursJson: jsonb("quiet_hours_json").$type<Record<string, unknown>>().default({}),
  assignmentRoutingJson: jsonb("assignment_routing_json")
    .$type<Record<string, unknown>>()
    .default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
});

export const hmoPropertyProfiles = pgTable(
  "hmo_property_profiles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    propertyId: varchar("property_id").notNull(),
    licensingSchemeId: varchar("licensing_scheme_id"),
    uprn: varchar("uprn", { length: 32 }),
    responsibleRegionId: varchar("responsible_region_id"),
    complianceOwnerId: varchar("compliance_owner_id"),
    profileStatus: varchar("profile_status", { length: 64 }).default("NOT_ASSESSED"),
    overallStatus: varchar("overall_status", { length: 64 }).default("NOT_ASSESSED"),
    evidenceCompleteness: integer("evidence_completeness").default(0),
    lastAssessmentId: varchar("last_assessment_id"),
    lastAssessedAt: timestamp("last_assessed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by"),
    updatedBy: varchar("updated_by"),
  },
  (t) => [
    uniqueIndex("hmo_property_profiles_org_property_uidx").on(t.organizationId, t.propertyId),
    index("hmo_property_profiles_org_idx").on(t.organizationId),
  ],
);

export const hmoLicences = pgTable(
  "hmo_licences",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    propertyId: varchar("property_id").notNull(),
    licenceNumber: varchar("licence_number", { length: 128 }),
    authorityId: varchar("authority_id"),
    authorityName: text("authority_name"),
    holderContactId: varchar("holder_contact_id"),
    holderName: text("holder_name"),
    managerContactId: varchar("manager_contact_id"),
    managerName: text("manager_name"),
    schemeType: varchar("scheme_type", { length: 128 }),
    issueDate: timestamp("issue_date"),
    expiryDate: timestamp("expiry_date"),
    maxPersons: integer("max_persons"),
    lifecycleStatus: varchar("lifecycle_status", { length: 64 }).default("DRAFT"),
    supersedesId: varchar("supersedes_id"),
    currentVersionId: varchar("current_version_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by"),
    updatedBy: varchar("updated_by"),
  },
  (t) => [
    index("hmo_licences_org_property_idx").on(t.organizationId, t.propertyId),
    index("hmo_licences_expiry_idx").on(t.expiryDate),
  ],
);

export const hmoLicenceVersions = pgTable(
  "hmo_licence_versions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    licenceId: varchar("licence_id").notNull(),
    originalDocumentId: text("original_document_id"),
    originalObjectUrl: text("original_object_url"),
    fileName: varchar("file_name", { length: 512 }),
    contentHash: varchar("content_hash", { length: 128 }),
    versionNo: integer("version_no").notNull().default(1),
    extractedJson: jsonb("extracted_json"),
    pageCount: integer("page_count"),
    reviewerId: varchar("reviewer_id"),
    reviewAt: timestamp("review_at"),
    confirmedAt: timestamp("confirmed_at"),
    effectiveFrom: timestamp("effective_from"),
    effectiveTo: timestamp("effective_to"),
    status: varchar("status", { length: 64 }).default("DRAFT"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by"),
    updatedBy: varchar("updated_by"),
  },
  (t) => [
    index("hmo_licence_versions_licence_idx").on(t.licenceId),
    uniqueIndex("hmo_licence_versions_hash_uidx").on(t.organizationId, t.contentHash),
  ],
);

export const hmoLicenceConditions = pgTable("hmo_licence_conditions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  licenceVersionId: varchar("licence_version_id").notNull(),
  conditionNo: integer("condition_no"),
  rawText: text("raw_text").notNull(),
  structuredRuleJson: jsonb("structured_rule_json"),
  sourcePages: integer("source_pages").array(),
  validity: varchar("validity", { length: 64 }).default("PENDING_REVIEW"),
  humanApproved: boolean("human_approved").default(false),
  exceptionNotes: text("exception_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
});

export const hmoJobs = pgTable(
  "hmo_jobs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    propertyId: varchar("property_id"),
    jobType: varchar("job_type", { length: 64 }).notNull(),
    status: varchar("status", { length: 64 }).notNull().default("QUEUED"),
    progress: integer("progress").default(0),
    errorMessage: text("error_message"),
    resultJson: jsonb("result_json"),
    licenceVersionId: varchar("licence_version_id"),
    assessmentId: varchar("assessment_id"),
    idempotencyKey: varchar("idempotency_key", { length: 256 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by"),
  },
  (t) => [
    index("hmo_jobs_org_idx").on(t.organizationId),
    uniqueIndex("hmo_jobs_idempotency_uidx").on(t.organizationId, t.idempotencyKey),
  ],
);

export const hmoAssessments = pgTable(
  "hmo_assessments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    propertyId: varchar("property_id").notNull(),
    licenceVersionId: varchar("licence_version_id"),
    snapshotHash: varchar("snapshot_hash", { length: 128 }),
    runReason: varchar("run_reason", { length: 128 }),
    engineVersion: varchar("engine_version", { length: 64 }).default("1.0"),
    promptVersion: varchar("prompt_version", { length: 64 }),
    startedAt: timestamp("started_at").defaultNow(),
    completedAt: timestamp("completed_at"),
    status: varchar("status", { length: 64 }).default("RUNNING"),
    overallStatus: varchar("overall_status", { length: 64 }),
    evidenceCompleteness: integer("evidence_completeness").default(0),
    supersededById: varchar("superseded_by_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by"),
  },
  (t) => [index("hmo_assessments_property_idx").on(t.organizationId, t.propertyId)],
);

export const hmoFindings = pgTable(
  "hmo_findings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    assessmentId: varchar("assessment_id").notNull(),
    propertyId: varchar("property_id").notNull(),
    checkId: varchar("check_id", { length: 32 }).notNull(),
    subjectRef: varchar("subject_ref", { length: 256 }).notNull(),
    ruleVersionId: varchar("rule_version_id"),
    status: varchar("status", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 32 }).notNull(),
    actualJson: jsonb("actual_json"),
    requiredJson: jsonb("required_json"),
    explanation: text("explanation"),
    fingerprint: varchar("fingerprint", { length: 512 }).notNull(),
    confidence: doublePrecision("confidence"),
    humanReviewRequired: boolean("human_review_required").default(false),
    suggestedActionCode: varchar("suggested_action_code", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("hmo_findings_assessment_idx").on(t.assessmentId),
    index("hmo_findings_fingerprint_idx").on(t.organizationId, t.fingerprint),
  ],
);

export const hmoFindingEvidence = pgTable("hmo_finding_evidence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  findingId: varchar("finding_id").notNull(),
  documentId: text("document_id"),
  inspectionId: varchar("inspection_id"),
  page: integer("page"),
  textOffsets: jsonb("text_offsets"),
  measuredAt: timestamp("measured_at"),
  verificationState: varchar("verification_state", { length: 64 }).default("AI_REVIEWED"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hmoCases = pgTable(
  "hmo_cases",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    propertyId: varchar("property_id").notNull(),
    caseReference: varchar("case_reference", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 32 }).notNull(),
    status: varchar("status", { length: 64 }).notNull().default("OPEN"),
    ownerUserId: varchar("owner_user_id"),
    createdFromAssessmentId: varchar("created_from_assessment_id"),
    dueAt: timestamp("due_at"),
    closureReason: text("closure_reason"),
    approverId: varchar("approver_id"),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by"),
    updatedBy: varchar("updated_by"),
  },
  (t) => [
    index("hmo_cases_org_status_idx").on(t.organizationId, t.status),
    uniqueIndex("hmo_cases_org_ref_uidx").on(t.organizationId, t.caseReference),
  ],
);

export const hmoCaseFindings = pgTable("hmo_case_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  caseId: varchar("case_id").notNull(),
  findingId: varchar("finding_id").notNull(),
  findingStatusAtLink: varchar("finding_status_at_link", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hmoTasks = pgTable(
  "hmo_tasks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    caseId: varchar("case_id").notNull(),
    findingId: varchar("finding_id"),
    propertyId: varchar("property_id").notNull(),
    taskCode: varchar("task_code", { length: 64 }),
    assignedRole: varchar("assigned_role", { length: 64 }),
    assignedUserId: varchar("assigned_user_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: varchar("status", { length: 64 }).notNull().default("OPEN"),
    dueAt: timestamp("due_at"),
    priority: varchar("priority", { length: 32 }).default("MEDIUM"),
    approvalPolicyId: varchar("approval_policy_id"),
    escalatedAt: timestamp("escalated_at"),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    evidenceChecklistJson: jsonb("evidence_checklist_json"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by"),
    updatedBy: varchar("updated_by"),
  },
  (t) => [
    uniqueIndex("hmo_tasks_idempotency_uidx").on(t.organizationId, t.idempotencyKey),
    index("hmo_tasks_case_idx").on(t.caseId),
  ],
);

export const hmoEvidenceRequests = pgTable("hmo_evidence_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  taskId: varchar("task_id").notNull(),
  recipientContactId: varchar("recipient_contact_id"),
  recipientEmail: varchar("recipient_email", { length: 320 }),
  secureTokenHash: varchar("secure_token_hash", { length: 128 }).notNull(),
  expiryAt: timestamp("expiry_at").notNull(),
  requestTemplate: text("request_template"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  responseAt: timestamp("response_at"),
  status: varchar("status", { length: 64 }).default("REQUESTED"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
});

export const hmoEvidenceReviews = pgTable("hmo_evidence_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  taskId: varchar("task_id").notNull(),
  evidenceId: varchar("evidence_id"),
  evidenceObjectUrl: text("evidence_object_url"),
  aiResult: jsonb("ai_result"),
  reviewerUserId: varchar("reviewer_user_id"),
  decision: varchar("decision", { length: 64 }),
  decisionAt: timestamp("decision_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hmoEscalationEvents = pgTable("hmo_escalation_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  taskId: varchar("task_id").notNull(),
  policyId: varchar("policy_id"),
  trigger: varchar("trigger", { length: 128 }),
  recipientUserId: varchar("recipient_user_id"),
  occurredAt: timestamp("occurred_at").defaultNow(),
  deliveryResult: text("delivery_result"),
});

export const hmoAuditEvents = pgTable(
  "hmo_audit_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    actorType: varchar("actor_type", { length: 64 }).notNull(),
    actorId: varchar("actor_id"),
    entityType: varchar("entity_type", { length: 128 }).notNull(),
    entityId: varchar("entity_id").notNull(),
    action: varchar("action", { length: 128 }).notNull(),
    beforeHash: varchar("before_hash", { length: 128 }),
    afterHash: varchar("after_hash", { length: 128 }),
    correlationId: varchar("correlation_id", { length: 128 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("hmo_audit_org_entity_idx").on(t.organizationId, t.entityType, t.entityId)],
);

export const hmoRoomProfiles = pgTable(
  "hmo_room_profiles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    propertyId: varchar("property_id").notNull(),
    existingRoomId: varchar("existing_room_id"),
    roomType: varchar("room_type", { length: 128 }),
    measuredUsableAreaM2: doublePrecision("measured_usable_area_m2"),
    ceilingHeightM: doublePrecision("ceiling_height_m"),
    measuredAt: timestamp("measured_at"),
    measurementEvidenceId: text("measurement_evidence_id"),
    declaredPermittedOccupancy: integer("declared_permitted_occupancy"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by"),
    updatedBy: varchar("updated_by"),
  },
  (t) => [index("hmo_room_profiles_property_idx").on(t.organizationId, t.propertyId)],
);

export const hmoOccupancySnapshots = pgTable(
  "hmo_occupancy_snapshots",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull(),
    propertyId: varchar("property_id").notNull(),
    asOf: timestamp("as_of").notNull(),
    sourceSystem: varchar("source_system", { length: 128 }).default("tenant_assignments"),
    verifiedBy: varchar("verified_by"),
    personCount: integer("person_count"),
    householdCount: integer("household_count"),
    confidence: doublePrecision("confidence"),
    version: integer("version").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    createdBy: varchar("created_by"),
  },
  (t) => [index("hmo_occupancy_snapshots_property_idx").on(t.organizationId, t.propertyId)],
);

export const hmoRoomAllocations = pgTable("hmo_room_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  occupancySnapshotId: varchar("occupancy_snapshot_id").notNull(),
  roomId: varchar("room_id"),
  pseudonymousOccupantRef: varchar("pseudonymous_occupant_ref", { length: 128 }),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  householdRef: varchar("household_ref", { length: 128 }),
  ageBand: varchar("age_band", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hmoRegulatorySources = pgTable("hmo_regulatory_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"),
  authorityId: varchar("authority_id"),
  authorityName: text("authority_name"),
  sourceUrl: text("source_url"),
  sourceType: varchar("source_type", { length: 128 }),
  contentHash: varchar("content_hash", { length: 128 }),
  publishedAt: timestamp("published_at"),
  checkedAt: timestamp("checked_at"),
  status: varchar("status", { length: 64 }).default("ACTIVE"),
  evidenceDocumentId: text("evidence_document_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const hmoRuleVersions = pgTable(
  "hmo_rule_versions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id"),
    ruleCode: varchar("rule_code", { length: 128 }).notNull(),
    authorityId: varchar("authority_id"),
    schemeId: varchar("scheme_id"),
    jurisdiction: varchar("jurisdiction", { length: 64 }).default("England"),
    classification: varchar("classification", { length: 128 }),
    requirementsJson: jsonb("requirements_json"),
    effectiveFrom: timestamp("effective_from"),
    effectiveTo: timestamp("effective_to"),
    approvedBy: varchar("approved_by"),
    approvedAt: timestamp("approved_at"),
    status: varchar("status", { length: 64 }).default("DRAFT"),
    supersedesId: varchar("supersedes_id"),
    sourceId: varchar("source_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("hmo_rule_versions_code_status_idx").on(t.ruleCode, t.status)],
);

export const hmoRuleImpactRuns = pgTable("hmo_rule_impact_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  ruleVersionId: varchar("rule_version_id").notNull(),
  status: varchar("status", { length: 64 }).default("QUEUED"),
  impactedPropertyCount: integer("impacted_property_count").default(0),
  completedCount: integer("completed_count").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  summaryJson: jsonb("summary_json"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
});

export const insertHmoLicenceVersionSchema = createInsertSchema(hmoLicenceVersions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type HmoLicenceVersion = typeof hmoLicenceVersions.$inferSelect;
export type InsertHmoLicenceVersion = z.infer<typeof insertHmoLicenceVersionSchema>;
export type HmoLicence = typeof hmoLicences.$inferSelect;
export type HmoAssessment = typeof hmoAssessments.$inferSelect;
export type HmoFinding = typeof hmoFindings.$inferSelect;
export type HmoCase = typeof hmoCases.$inferSelect;
export type HmoTask = typeof hmoTasks.$inferSelect;
export type HmoJob = typeof hmoJobs.$inferSelect;
export type HmoPropertyProfile = typeof hmoPropertyProfiles.$inferSelect;
