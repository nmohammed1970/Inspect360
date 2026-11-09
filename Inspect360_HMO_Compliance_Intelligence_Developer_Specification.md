# Inspect360 — HMO Compliance Intelligence
## Developer Implementation Specification (v1.0)

**Date:** 4 November 2026  
**Product:** Inspect360 (web portal and inspector PWA)  
**Primary audience:** Product owner, engineering lead, AI engineer, QA, compliance reviewers  
**Target scale:** Enterprise portfolios of 10,000+ HMOs / 30,000+ managed properties  
**Status:** Implementation specification; validate against existing Inspect360 architecture before development.

> **Important:** This specification does not assert that Inspect360 can certify legal compliance without current evidence and authorised human review. It prescribes a system for evaluating evidence, detecting exceptions, initiating tasks and monitoring verified regulatory changes. Technical stack, CRM table names, notification provider and existing workflow modules require engineering discovery. Dates in the example case are illustrative workflow SLAs, not legal deadlines.

## 1. Executive product requirement

Build an end-to-end **HMO Compliance Intelligence** module inside Inspect360. A property manager uploads an HMO licence, the system securely extracts its terms and matches it to a property; compares authorised use with property/room/occupancy data; determines whether evidence is sufficient; generates findings and remediation cases; assigns tasks and requests evidence; monitors critical dates and portfolio changes; and re-evaluates affected properties when verified national or local rules change.

**Outcomes:** (1) rapid detection of expired or mismatched documentation; (2) controlled occupancy and room compliance checking; (3) prioritised and auditable remediation; (4) borough-level regulatory impact monitoring; (5) enterprise oversight; (6) pre-tenancy allocation guardrails.

**Non-goals for v1:** automatic legal certification; unsupervised council correspondence; automatically preventing a legally valid tenancy without authorised workflow approval; using photographs as authoritative measurements; treating unverified search results as law; rebuilding Inspect360's existing property, inspection, maintenance or notification systems.

## 2. Product principles and scope

1. **Reuse Inspect360 records:** property/block/unit/room/tenant, inspection template and outcomes, compliance documents, maintenance/work orders, contacts, user/role and notifications where these exist; introduce only the additional HMO domain tables.
2. **Evidence-first:** every finding references source evidence and a specific version of the rule used. Missing evidence is *not* a verified breach and is never a pass.
3. **Separate rule classes:** Licence-specific condition; national statutory requirement; locally enforceable requirement; local guidance/recommendation. Planning permission and licence status are different checks.
4. **Deterministic before generative:** addresses, dates, numbers, room thresholds, current occupancy and task SLAs evaluated by code against verified rules; LLM assists with extraction, interpretation, classification and drafting.
5. **Human-in-the-loop:** material safety/legal ambiguity, a critical adverse conclusion, regulatory rule publication, communication to a council, tenancy hold and final critical-case closure require configured authorisation.
6. **Event-driven monitoring:** monitor source changes centrally then target affected properties; do not web-search 10,000 HMOs independently every day.
7. **Multi-tenant and secure:** strict organisation-level isolation, least-privilege RBAC, retention controls and privacy-aware occupant data processing.

### 2.1 Delivery phases

| Phase | Scope | Release gate |
|---|---|---|
| P1 — Licence Intelligence | Upload, versioning, extraction, UPRN/address matching, dates, conditions, evidence gaps, case/tasks, manual review, audit | 38 Park View fixture passes end-to-end |
| P2 — Property and Allocation Checks | Actual occupants, household/room allocation, dimensions, inspections, certificates, pre-tenancy check | Room/occupancy calculation test suite, opt-in operational workflows |
| P3 — Regulatory Intelligence | Approved versioned borough/national rules, source monitoring, legal review, impact evaluation, enterprise analytics | Regulatory change simulation impacts only applicable cohort |
| P4 — Integrations/Scale | Reapit sync connector, bulk import, enterprise dashboards, bulk evidence workflows, performance/SLO tuning | 10k+ HMO load test and security review |

## 3. User roles and authorisation

| Role | Core permitted operations | Restrictions |
|---|---|---|
| Portfolio Compliance Director | All portfolio cases, escalations, SLA policies, critical decisions, reports | Cannot publish legal rules unless also designated rule approver |
| Regional Compliance Lead | Regional cases, approvals, reassignment, case review | Region-scoped by default |
| HMO Compliance Lead | Triage findings, resolve ambiguities, approve evidence, escalate, sign off cases | Critical close requires policy-authorised approval |
| Property Manager | Upload licence, view assigned properties, request evidence, update occupancy proposals, complete tasks | Cannot override national regulatory rules |
| Lettings Officer | View permissible allocation decision, request pre-tenancy check | Sensitive occupancy data only by necessity |
| Inspector | Record room measurements, fire/condition observations and inspection evidence | Cannot mark legal interpretation as conclusively compliant |
| Regulatory Analyst | Monitor rules, prepare proposed revisions and impact reports | Rule changes remain draft until approval |
| Rule Approver / Legal Reviewer | Authorise effective rule versions and legal applicability | All changes audited |
| Landlord / External Respondent | Time-limited scoped evidence-upload link | No access to wider portfolio or other occupant data |
| System Administrator | Organisation config, permissions, assignment rules and integration credentials | No ability to silently alter immutable evidence history |

**Access model:** organisation_id on all domain tables, property-level access rules, optional region/branch scopes, fine-grained permissions (`hmo.case.read`, `hmo.case.assign`, `hmo.rule.approve`, `hmo.critical.close`, `hmo.occupancy.read`, `hmo.notification.send`, etc.). Log every privileged action.

## 4. Core journeys and screens

### 4.1 Licence upload wizard (web; PWA where suitable)

1. Open property > **Compliance > HMO**; select **Upload Licence** or **Replace / Renew**.
2. Accept PDF/image files with configured limits; malware scan; store content hash and original immutable file; display privacy and data-use notice.
3. Capture document type, optional known authority, effective date and relationship to a previous document; do not assume file name is authoritative.
4. Extract text/OCR, classify document(s), detect page count, schedule references and missing attachments.
5. Extract candidate fields with page/bounding-box references and confidence; display side-by-side viewer for confirmation.
6. Match property address against canonical Inspect360 property and UPRN (where available). Low-confidence or multiple candidates => user selection/review, no automatic match.
7. User confirms extracted licence fields and uploads any missing schedules.
8. Persist immutable `LicenceVersion`, start assessment job, display statuses and exceptions.
9. Show assessment and suggested cases/tasks; authorised user confirms sensitive outbound actions.

### 4.2 Individual property — HMO tab

Tabs: **Overview | Licence & Conditions | Room & Occupancy | Evidence | Findings | Remediation Tasks | History**.

Overview: licence status (current / expired document / renewal pending evidence / superseded / under review), permitted occupancy, actual confirmed occupancy, condition completeness, urgent exceptions, upcoming actions, last evidence review, next scheduled check. Do not use a percentage as the main compliance judgement.

Finding card: severity + epistemic status; actual vs required; explanation; rule/version/effective date; page-highlight or authoritative URL; evidence age; confidence; assigned owner; due date; `Request Evidence`, `Create Task`, `Review`, `Resolve` actions.

### 4.3 Case workspace

A case may contain multiple findings but tasks should remain individually assignable. Workspace shows case summary; linked findings; SLA clock; owner; affected room(s); correspondence; documents; internal comments; linked maintenance work orders; approval trail; next action; blockers; audit events.

### 4.4 Portfolio operations dashboard

Metrics: HMOs monitored, verified compliant, critical unresolved, review/evidence required, expired-document exceptions, occupancy risk, pending renewals, overdue tasks, average time to verification, exceptions by borough/branch/manager, evidence coverage and source freshness. Drill down from every number to the exact cohort. Support CSV export with RBAC, and filters by borough, property manager, scheme, licence status, severity and evidence status. All metric labels include definitions; distinguish verified breach from pending verification.

### 4.5 Pre-tenancy allocation check

Before an optional integrated approval step, read intended room and occupants, existing verified occupants, current applicable licence limit and room-specific limits. Return `ALLOW_FOR_CHECKED_CONSTRAINTS`, `BLOCK_REVIEW_REQUIRED`, or `INSUFFICIENT_EVIDENCE` with rule/evidence references. This is a **decision-support gate**, not an autonomous legal refusal. Override requires specific permission, reason and audit; any system-level hold is configurable and separately authorised.

## 5. Mandatory checks and assessment behaviour

| ID | Check | Required data | Failure / fallback |
|---|---|---|---|
| LIC-01 | Licence address matches property (UPRN, canonical address, unit) | Licence, CRM address, UPRN | Uncertain match => review; never force-match by postcode alone |
| LIC-02 | Licence issuer, number, scheme and authenticity indicators | Uploaded licence, council records if available | Upload is not independently authenticated; show verification status |
| LIC-03 | Expiry, replacement, renewal evidence and present legal status | Licence dates; validated application, council correspondence | Expired document => critical verification task, not automatic finding of unlawful operation |
| LIC-04 | Named holder/manager and changes | Licence, landlord/agent details, change history | Missing or different => investigation |
| LIC-05 | Complete schedules and licence variations | All pages, annexes, referenced conditions | Missing attachment => `EVIDENCE_MISSING` and block overall verified-compliant status |
| OCC-01 | Total confirmed persons vs applicable maximum | Current authoritative limit, verified occupant register | Missing data => unknown; excess => critical review |
| OCC-02 | Household count / other licence restrictions | Household relationships as lawfully recorded, current conditions | Do not infer households from surname/address |
| OCC-03 | Occupancy per room / permitted ages | Licence room schedule, room assignment, permitted occupancy | Missing schedule => check incomplete |
| ROOM-01 | Sleeping-room net eligible area vs current standards | Measured usable dimensions and ceiling constraints, versioned rules | Images cannot certify dimensions; raise measurement task |
| ROOM-02 | Unauthorised room conversion / bedroom use | Previous plans, current inspection, approvals, licence conditions | Difference => potential risk and review |
| AMEN-01 | Kitchen, bath, WC, ventilation and waste provision | Room/amenity inventory and applicable standards | Evidence missing => inspection task |
| SAF-01 | Gas, electrical, smoke/CO and relevant fire measures | Dated safety evidence and rules | Expiry, defect or missing record => categorised case, urgent when warranted |
| COND-01 | Damp/mould, HHSRS hazards, condition defects | Inspection findings, linked work orders | Not automatically licence breach; assess proper legal basis |
| LOC-01 | Applicable borough licensing standards / adopted variations | Approved rule library, effective dates, geography/scheme | Draft/consultation => informational only |
| PLAN-01 | Planning use / Article 4 and permission where applicable | Planning evidence, local rules | Licence alone does not prove planning compliance |
| MGMT-01 | Licence display, required notifications, response to notices | Inspection and council correspondence | Task if missing/overdue |

### 5.1 Status and severity vocabularies

**Finding status:** `VERIFIED_COMPLIANT`, `CONFIRMED_NON_COMPLIANT`, `POTENTIAL_RISK`, `EVIDENCE_MISSING`, `NOT_APPLICABLE`, `REQUIRES_HUMAN_REVIEW`. **Severity:** `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFORMATIONAL`. **Evidence:** `REQUESTED`, `RECEIVED`, `AI_REVIEWED`, `HUMAN_VERIFIED`, `REJECTED`, `SUPERSEDED`. Severity and status are distinct. E.g., an expired *document* can generate a critical investigation even before a legal breach is confirmed.

**Overall property:** `CRITICAL_EXCEPTION`, `ACTION_REQUIRED`, `REVIEW_REQUIRED`, `VERIFIED_COMPLIANT`, `NOT_ASSESSED`. Do not mark `VERIFIED_COMPLIANT` while applicable mandatory checks remain unknown/missing, or unresolved material findings exist. Provide an evidence-completeness metric separately.

### 5.2 Sleeping room baseline (England — configure versioned sources)

National licensing floor-area minimums for applicable HMOs include 6.51 m² for one person aged 10 or above, 10.22 m² for two persons aged 10 or above, and 4.64 m² for one child under 10; rooms smaller than 4.64 m² cannot be used for sleeping. Ignore floor area with ceiling height below 1.5 m. Local licence conditions may be stricter. Interpret complex age/household combinations with approved regulatory guidance and review, rather than an invented extrapolation. See Housing Act 2004 Schedule 4 paragraph 1A and GOV.UK guidance.

## 6. Remediation case/task workflow

**Case states:** `OPEN` → `TRIAGED` → `IN_PROGRESS` → `AWAITING_EVIDENCE` / `AWAITING_REVIEW` → `READY_FOR_SIGNOFF` → `VERIFIED_CLOSED`; exceptional `REOPENED`, `CANCELLED_AS_DUPLICATE` with reason. **Task states:** `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `EVIDENCE_REQUESTED`, `EVIDENCE_RECEIVED`, `AWAITING_VERIFICATION`, `VERIFIED_CLOSED`, `REOPENED`, `CANCELLED`.

- Assessment creates/updates findings with stable fingerprints (property + check + rule version + subject) to avoid duplicate open tasks.
- Rules map finding type/severity/region to owner role; then assign active named user from organisation routing table. Unresolved assignment goes to compliance triage queue.
- Default SLA rules are **tenant-configurable**; critical event triggers immediate triage, not guaranteed statutory deadline. Use business timezone `Europe/London` for UK local deadlines; store UTC.
- Task requires description, category, owner, evidence checklist, due date, approver, escalation policy, linked finding and idempotency key.
- Evidence request uses template, recipient verification, time-limited signed link and tracked delivery; never send tenancy-sensitive data unnecessarily.
- Reminders: configurable e.g. at creation, 24h before due, on due, overdue daily; digest and quiet-hours policy except critical cases.
- Critical findings -> compliance lead immediately; serious imminent physical danger -> emergency safety workflow; no independent AI decision to evacuate or contact authorities.
- Evidence reviewer accepts/rejects with reasons; accepted evidence triggers re-evaluation; critical task closure needs authorised human sign-off.
- Closing entire case requires resolution/disposition of each critical finding, verified evidence and an explicit approver decision. Reopen on licence change, occupancy change, rejected evidence or new applicable rule.

### 6.1 Example: 38 Park View case fixture

**From supplied 5-page Ealing document:** address 38 Park View, Acton, W3 0PT; licence number 19LIC1842; holder Ms Jasbir Sihota; issued 14 Jan 2021; expiry 13 Jan 2026; max 5 individuals. The 5-page file references schedules/conditions which are not included. Actual occupancy, room sizes, current renewals, current management and current compliance are **not established**.

| Task ID | Task and deliverable | Suggested owner role | Proposed due date | Escalation |
|---|---|---|---|---|
| HMO-001 | Verify current licence, replacement or application with dated council evidence | HMO Compliance Lead | 5 Nov 2026 | Regional Compliance Director |
| HMO-002 | Obtain full licence conditions, annexes, schedules and variations | Property Manager | 6 Nov 2026 | HMO Compliance Lead |
| HMO-003 | Verify CRM property / UPRN / current holder and management | Property Manager | 6 Nov 2026 | HMO Compliance Lead |
| HMO-004 | Verify occupants, households, room allocation, tenancy effective dates | Property/Lettings Manager | 6 Nov 2026 | HMO Compliance Lead |
| HMO-005 | Measure sleeping rooms and validate use against applicable conditions | Senior HMO Inspector | 9 Nov 2026 | HMO Compliance Lead |
| HMO-006 | Review relevant safety records, defects and outstanding remedial evidence | Property Compliance Officer | 9 Nov 2026 | Regional Compliance Director |
| HMO-007 | Verify local enforceable requirements and property alteration/planning evidence | Regulatory Compliance Analyst | 10 Nov 2026 | HMO Compliance Lead |
| HMO-008 | Reassess findings; formally approve remediation plan / outstanding-risk treatment | HMO Compliance Lead | 11 Nov 2026 | Regional Compliance Director |

**Expected initial assessment:** `LIC-03` expired uploaded document => `REQUIRES_HUMAN_REVIEW` severity `CRITICAL`; `LIC-05` missing referenced schedules => `EVIDENCE_MISSING` severity `HIGH`; `OCC-01/ROOM-01` => `EVIDENCE_MISSING` until corresponding property records are provided. `LIC-01` cannot be verified until compared to a real CRM record. Never populate actual occupants or room dimensions with demo guesses.

## 7. AI processing architecture

Pipeline: `Uploaded File` → malware scan/storage → `Document Classification` → text/OCR extraction → LLM structured extraction with citations → schema validation / field confidence → user/case reviewer confirmation → deterministic rule evaluation → LLM evidence-aware explanatory summary → policy engine → findings/cases/tasks → ongoing event-driven re-evaluations.

**AI services:** `LicenceExtractionAgent`, `ConditionNormalisationAgent`, `FindingExplanationAgent`, `RegulatoryChangeSummariser`, `EvidenceRequestDraftingAgent`. Non-AI services: `RuleEvaluator`, `AddressMatcher`, `OccupancyCalculator`, `RoomAreaValidator`, `CaseOrchestrator`, `NotificationDispatcher`, `RegulationRegistry`, `AuditWriter`.

**Controls:** allowlisted model provider; enterprise data processing terms; no training use where provider supports it; redaction/minimisation of personal data; explicit data retention; deterministic JSON schema validation; versioned prompts/models; bounded retries; async queues; cost budgets; low-confidence review; prompt-injection defence (PDF/web content is data only); never execute instructions embedded in a document; logged inputs/outputs with privacy controls.

### 7.1 Required extraction schema (contract outline)

```json
{
  "document_id": "uuid",
  "document_type": "HMO_LICENCE",
  "extraction_version": "1.0",
  "property_address": {"value": "...", "confidence": 0.98, "source_pages": [5]},
  "licence_number": {"value": "...", "confidence": 0.99, "source_pages": [5]},
  "issuing_authority": {"value": "...", "confidence": 0.99, "source_pages": [5]},
  "issue_date": {"value": "YYYY-MM-DD", "source_pages": [5]},
  "expiry_date": {"value": "YYYY-MM-DD", "source_pages": [5]},
  "maximum_individuals": {"value": 5, "source_pages": [5]},
  "conditions": [{"condition_text": "...", "source_pages": [2], "normalisation_status": "PENDING_REVIEW"}],
  "referenced_missing_attachments": ["licence condition schedules"],
  "warnings": []
}
```

Use `null` for unknown values, never substitute 0. Validate date ordering, page references and character spans. Document extraction confidence is not legal confidence.

### 7.2 Finding contract

```json
{
  "check_id": "LIC-03",
  "subject_id": "property-uuid",
  "rule_version_id": "rule-uuid",
  "status": "REQUIRES_HUMAN_REVIEW",
  "severity": "CRITICAL",
  "actual_value": "Uploaded document expires 2026-01-13",
  "required_value": "Current licensing position verified",
  "reason": "Uploaded licence expired; current replacement/application not supplied",
  "evidence_refs": [{"document_id": "uuid", "page": 5}],
  "confidence": 0.99,
  "human_review_required": true,
  "suggested_action_code": "VERIFY_LICENSING_STATUS"
}
```

### 7.3 Assessment behaviour

Run upon `licence.uploaded`, `licence.replaced`, `property.changed`, `occupancy.changed`, `room.updated`, `inspection.completed`, `evidence.verified`, `rule.published`, `task.resolution.changed`. Debounce noisy events, use idempotent assessment jobs, capture snapshot of source record versions and rule versions, do not modify past assessments retroactively. A complete re-evaluation shall supersede but retain historical findings.

## 8. Regulatory monitoring and approvals

**Verified hierarchy:** legislation/statutory instruments → licence-specific enforceable conditions → applicable adopted council scheme/standards and enforceable local instruments → official guidance → proposed/consultation materials (information only). Exact hierarchy/applicability can be legally complex; a trained reviewer must sign off the effective rule and its applicability before publication.

Source registry fields: jurisdiction (England), authority ID, borough/scheme, URL, source type, fetch method, source version/hash, publication date, effective/expiry dates, last_checked_at, approval status, reviewer, applicability expression, superseded_by. Support explicit council-document upload if automated retrieval is unavailable.

Scheduled **source watcher** (e.g. weekly), with content diff and freshness check, queues candidate changes for analyst review; LLM summarizes changes with precise citations but does not auto-publish. Legal approver verifies authenticity, legal force, effective date, geography, licence cohort and grandfathering/transitional rules. On publish, compute impacted `property_id` set, queue only affected assessments, record rule-impact report with notifications. Failed fetch or stale source => `SOURCE_UNVERIFIED`, not silent assumption of no change.

**Ealing:** incorporate approved Ealing HMO standards and borough licensing scheme records; never interpret an Ealing proposal or planning standard as an effective licence condition solely because it appears online. Distinguish planning authorisation from HMO licence (Ealing standards explicitly discuss both).

## 9. Data model / schema specification

All primary tables: `id UUID`, `organisation_id UUID`, `created_at`, `updated_at`, `created_by`, `updated_by`; soft-delete where allowed, immutable event versions for evidentiary records. Suggested additional tables:

| Table | Key fields / relationships |
|---|---|
| `hmo_property_profile` | property_id FK UNIQUE, licensing_scheme_id, UPRN, responsible_region_id, compliance_owner_id, profile_status |
| `hmo_licence` | property_id, licence_number, authority_id, holder_contact_id, manager_contact_id, scheme_type, issue_date, expiry_date, max_persons, lifecycle_status, supersedes_id |
| `hmo_licence_version` | licence_id, original_document_id, content_hash, version_no, extracted_json, reviewer_id, review_at, effective_from, effective_to |
| `hmo_licence_condition` | licence_version_id, condition_no, raw_text, structured_rule_json, source_pages, validity, human_approved, exception_notes |
| `hmo_room_profile` | property_id, existing_room_id FK, room_type, measured_usable_area_m2, measured_at, measurement_evidence_id, declared_permitted_occupancy |
| `hmo_occupancy_snapshot` | property_id, as_of, source_system, verified_by, person_count, household_count, confidence, version |
| `hmo_room_allocation` | occupancy_snapshot_id, room_id, pseudonymous_occupant_ref, effective_from/to, household_ref, age_band_if_lawfully_needed |
| `hmo_regulatory_source` | authority_id, source_url, source_type, content_hash, published_at, checked_at, status, evidence_document_id |
| `hmo_rule_version` | rule_code, authority_id, scheme_id, jurisdiction, classification, requirements_json, effective_from/to, approved_by/at, status, supersedes_id |
| `hmo_assessment` | property_id, snapshot_hash, run_reason, engine_version, prompt_version, started_at, completed_at, status, overall_status, evidence_completeness |
| `hmo_finding` | assessment_id, property_id, check_id, subject_ref, rule_version_id, status, severity, actual_json, required_json, explanation, fingerprint, confidence |
| `hmo_finding_evidence` | finding_id, document_id/inspection_id, page, text_offsets, measured_at, verification_state |
| `hmo_case` | property_id, case_reference, severity, status, owner_user_id, created_from_assessment_id, due_at, closure_reason, approver_id |
| `hmo_case_finding` | case_id, finding_id, finding_status_at_link |
| `hmo_task` | case_id, finding_id, assigned_role, assigned_user_id, title, status, due_at, priority, approval_policy_id, escalated_at, idempotency_key |
| `hmo_evidence_request` | task_id, recipient_contact_id, secure_token_hash, expiry_at, request_template, sent_at, delivered_at, response_at, status |
| `hmo_evidence_review` | task_id, evidence_id, AI_result, reviewer_user_id, decision, decision_at, rejection_reason |
| `hmo_escalation_event` | task_id, policy_id, trigger, recipient_user_id, occurred_at, delivery_result |
| `hmo_audit_event` | actor_type/id, entity_type/id, action, before_hash, after_hash, timestamp, correlation_id, metadata |

**Existing-table adapter mapping required:** no duplicate canonical property, tenant/occupant, room, document, inspection, maintenance order, organisation or user records if suitable entities already exist. Tenant PII must not be duplicated into AI outputs; calculate counts server-side when possible. Unique indexes on (`organisation_id`, `property_id`, `licence_number`) where semantically valid, task idempotency key, rule version and event processing ID. Search/filter indexes on authority, expiry, status, severity, owner, due dates and region. Persist structured `source_version` and `data_as_of` for reproducibility.

## 10. API and events (illustrative REST contract)

All endpoints under `/api/v1/hmo`; OAuth/session auth as established by Inspect360 and organisation isolation. Standard error envelope with `code`, `message`, `correlation_id`, `details`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/properties/{propertyId}/licences/uploads` | Secure upload/create draft licence version; returns job ID |
| GET | `/uploads/{jobId}` | Extraction/assessment progress and errors |
| GET | `/properties/{propertyId}/overview` | Property status, evidence coverage, active case summary |
| GET | `/properties/{propertyId}/licences` | Licence and version history |
| POST | `/licence-versions/{id}/confirm` | Reviewer confirms extracted fields |
| POST | `/properties/{propertyId}/assessments` | Trigger validated assessment (idempotency key) |
| GET | `/properties/{propertyId}/findings` | Filterable findings, citations, rule versions |
| GET/POST | `/cases` | List/create permitted cases |
| PATCH | `/cases/{id}/assign` | Change owner with permission and audit |
| POST | `/tasks/{id}/evidence-requests` | Generate/deliver approved evidence request |
| POST | `/tasks/{id}/evidence-reviews` | Record accept/reject and trigger reassessment |
| POST | `/cases/{id}/signoff` | Policy-controlled closure approval |
| POST | `/properties/{propertyId}/occupancy-check` | Proposed tenancy/room allocation simulation |
| GET | `/dashboard` | Aggregated enterprise portfolio data |
| POST | `/rule-versions/{id}/approve` | Publish legally reviewed regulatory rule |
| GET | `/regulatory-changes/{id}/impact` | Affected properties and reassessment progress |

**Events:** `hmo.licence.uploaded`, `.extraction.completed`, `.assessment.completed`, `.finding.created`, `.finding.changed`, `.case.opened`, `.task.assigned`, `.evidence.requested`, `.evidence.verified`, `.task.overdue`, `.case.escalated`, `.case.closed`, `.rule.approved`, `.rule.impact.completed`, `.occupancy-check.review-required`.

Implementation expectations: request idempotency, event outbox and at-least-once consumer deduplication, pagination, field-level RBAC, optimistic concurrency (`version`/ETag), webhook signing where exposed, backoff/retry and dead-letter queues.

## 11. UI acceptance detail

- Upload wizard previews actual extracted text + source-page highlight and displays which schedules are missing.
- Every visible compliance label clearly differentiates legal assessment, document expiry and evidence gaps.
- Dashboard totals reconcile with filtered property rows and use an explicit “as of” timestamp.
- Property card shows allowed/confirmed occupant counts and indicates unknown values rather than 0.
- Evidence requester supports template editing, named recipient, due date, secure upload, send confirmation and status history.
- Task board supports queue, sort, bulk assignment (permissioned), clear status, owners, due date, review state, comments and activity trail.
- Critical closure displays required approval and does not accept a simple checkbox.
- Regulatory analyst can compare old/new source and view a draft impact preview before approval.
- UI accessible on desktop and responsive tablet; inspectors can capture offline evidence in PWA and queue securely; regulatory approvals/critical sign-offs require online confirmation.

## 12. Integration points

**Core Inspect360:** canonical property and unit inventory; inspection photos and notes; compliance records; maintenance/work order engine; notification/email; tenant/landlord portal; app/PWA offline sync; analytics. Preserve origin of truth, embed case links into property and work-order screens. **Reapit (optional P4):** property identity/address, tenancy events and occupancy changes where API coverage, consent, mapping and entitlements permit; never promise Reapit exposes verified resident count or HMO room detail without integration discovery. **Council feeds:** prefer official published sources and approved manual uploads; many boroughs may not provide a usable live HMO status API. **Identity and address:** UPRN matching from licensed/authorised source; store source quality and date.

## 13. Security, privacy, reliability and performance

- UK GDPR/DPA 2018: purpose limitation, lawful basis, DPIA for systematic monitoring, minimisation, data-subject rights, retention and DPA with processors; do not include personal occupant names in general portfolio reports.
- Signed URLs short-lived and single-purpose; malware scan and MIME/content verification; encrypted object storage and secrets management; TLS in transit; encryption at rest; audit and key rotation.
- Role + property row-level access; tenant-aware cache keys; prevent cross-organisation data leakage in exports, AI contexts, search indices and background jobs.
- Store input document original and extraction version separately; tamper-evident case audit history; configurable legal holds.
- System should degrade gracefully when model, regulatory source or notification provider unavailable; queue/retry and show `ASSESSMENT_DELAYED` or `SOURCE_UNVERIFIED` not compliance green.
- Performance targets **proposed**: upload acknowledgement p95 < 3s excluding transfer; property overview p95 < 2s; case search p95 < 3s; 10,000-property dashboard p95 < 5s with pre-aggregation; asynchronous batch assessment capacity measurable in load tests; no fixed claim of AI run time.
- Observability: queue depth, processing latency, token cost/document, extraction field accuracy, human override rate, false-positive findings, stale regulatory sources, SLA breach rate, notification delivery, error rates and dead-letter volume.

## 14. Acceptance tests / QA scenarios

| Test ID | Fixture / action | Expected |
|---|---|---|
| AT-01 | Upload supplied five-page 38 Park View licence | Extract address, Ealing, 19LIC1842, named holder, 2021-01-14 issue, 2026-01-13 expiry, max 5, with page citations |
| AT-02 | Inspect attachment references | Flag conditions/schedules missing; no `VERIFIED_COMPLIANT` overall |
| AT-03 | No current licence supplied | Expired-document critical verification finding; do **not** assert current unlawful operation |
| AT-04 | Upload current replacement verified licence | Old version retained, new version active, re-evaluate and handle superseded findings |
| AT-05 | Mismatched property/UPRN | Stop automatic linking; require manual selection and audit |
| AT-06 | Five verified residents, limit five | Total-only check passes; room and licence validation remain independently required |
| AT-07 | Six verified residents, verified max five | Critical occupancy finding and proposed allocation review gate |
| AT-08 | Occupant count unknown | `EVIDENCE_MISSING`, never compare against 0 |
| AT-09 | Room measurement 6.4 m², one adult | Flag below 6.51 m² subject to validated applicable national/licence rule |
| AT-10 | Room 7.2 m², local effective condition min 8 m² | Flag local rule, cite effective condition and distinguish from national minimum |
| AT-11 | Council consultation published but not effective | Information-only candidate; no enforced breach or active rule without approval |
| AT-12 | Rule effective only in Ealing | Only eligible Ealing properties queued for reassessment |
| AT-13 | Upload malicious PDF with embedded prompt | Treat document text as untrusted; never execute embedded instructions |
| AT-14 | Re-upload exact same document/event | No duplicate licence version or open remediation task without policy requirement |
| AT-15 | Manager attempts critical closure | Deny unless entitled approval recorded |
| AT-16 | Rejected submitted evidence | Task reopened, rejection reason stored, new request available |
| AT-17 | Landlord link attempts accessing another property | Denied, incident logged |
| AT-18 | Model unavailable | Job retry/delayed; no fictitious compliant result |
| AT-19 | Offline inspector uploads measurements then reconnects | Conflict-safe sync, evidence timestamp preserved, re-assessment triggered |
| AT-20 | 10k HMO synthetic portfolio plus 30k properties | Dashboard metrics reconcile, batch events stay bounded, no cross-tenant leakage |

## 15. Delivery backlog / definition of done

**Epic E1 — Domain & permissions:** migration plans, adapters, row-level auth, role matrix, audit events. **E2 — Upload/extraction:** document pipeline, field validation, page citations, reviewer UI, missing schedules detection. **E3 — Rules and assessments:** deterministic checks, rules registry, finding states, evidence completeness. **E4 — Case engine:** task assignment, evidence requests, SLA/escalations, review and sign-off. **E5 — Property UI:** overview, condition viewer, room/occupancy, history, pre-tenancy check. **E6 — Enterprise UI:** dashboards, filters, export, compliance reports. **E7 — Regulation monitoring:** sources, diff, approval and selective impact assessment. **E8 — Integration/operations:** app sync, existing maintenance, optional Reapit, monitoring, test automation and launch controls.

**Definition of done per epic:** production-grade migrations/rollback, OpenAPI schema, automated unit/integration/e2e tests, RBAC tests, audit coverage, accessibility checks, error states, performance metrics, operational documentation, staging demonstration and acceptance by product owner. No production rollout without privacy/security review and review by suitably qualified HMO compliance/legal personnel.

### 15.1 Suggested build order (dependency-aware)

1. Map existing Inspect360 tables, permissions, jobs, notifications and inspection workflows (architecture discovery).
2. Build data entities, storage/versioning and audit baseline.
3. Implement extraction + field confirmation using the supplied Ealing file.
4. Build core deterministic checks and evidence-aware finding model.
5. Implement case/task/evidence request lifecycle and escalation service.
6. Add property HMO tab and basic portfolio queue.
7. Integrate occupancy, rooms, inspections and pre-tenancy validation.
8. Add approved local rules and regulatory-source monitoring.
9. Scale/test enterprise portfolio and integrate CRM where justified.

## 16. Key engineering decisions requiring discovery (not blockers to scope)

- Existing application stack, ORM, database, queue and infrastructure; use established conventions rather than imposing a new stack.
- Canonical room and occupant allocation storage, including how to obtain verified actual counts.
- Source of UPRN, council boundaries and licence authenticity verification; manual verification fallback essential.
- Whether owner/manager records are complete enough for LIC-04.
- Whether current compliance module already has evidence expiries, task assignment, maintenance work orders and notifications.
- Which roles can trigger external notifications and pre-tenancy system restrictions.
- Council-specific legal review capacity, approved authoritative data feeds and change-review cadence.
- Data processing arrangements with model vendors and accessibility requirements.

## 17. Sources and distinction of evidence

**Uploaded document (primary test fixture):** “38 Park View Licence 2026.pdf” — five pages. Pages 1–3 describe grant, conditions, change notifications and safety reminders; page 5 contains address, holder, expiry, max five occupants and licence number. Referenced conditions schedules are not present in those five pages. The document alone does **not** verify current renewal status, actual occupancy, room sizes or current legal compliance.

**External sources used to define configurable rule baselines (verify applicability at run time):**
- Housing Act 2004, Schedule 4 paragraph 1A (room-size licensing conditions): https://www.legislation.gov.uk/ukpga/2004/34/schedule/4/paragraph/1A
- GOV.UK HMO licence guidance (licence requirement, renewal, conditions): https://www.gov.uk/find-licences/house-in-multiple-occupation-licence
- GOV.UK licensing reform guidance (room measurements and floor area): https://www.gov.uk/government/publications/houses-in-multiple-occupation-and-residential-property-licensing-reform-guidance-for-local-housing-authorities/houses-in-multiple-occupation-and-residential-property-licensing-reform-guidance-for-local-housing-authorities
- Ealing Council HMO Standards (April 2025 version, subject to verification/supersession): https://www.ealing.gov.uk/download/downloads/id/20124/hmo_standards_guide.pdf

**Design assumptions:** Foxtons-scale 10k HMOs and 30k+ properties are enterprise design targets supplied for planning, not independently verified customer figures. Proposed tasks, dates, SLAs, API names, table names and performance targets are product/engineering design decisions, not facts extracted from the licence or statutory requirements.
