# Inspect360 — Communications Hub
Developer specification | v1.0 | 25 November 2026 | Proposed build

## 1. Objective and non-negotiable principles
Create a central operational inbox where operators receive, classify, assign, action and resolve tenant requests. Every actionable request must have an owner (or a monitored unassigned queue), status, next action and traceable tenant/property context. A reply is not a resolution. Preserve the original communication and all subsequent actions. Do not build a standalone helpdesk or duplicate the maintenance system.

Existing capabilities described by product owner: tenant portal/app, maintenance requests and work orders, maintenance chat, property/tenant records, inspections, compliance, distribution groups and Ivy AI. Verify actual schemas, APIs, permissions and deployed features before implementation; no repository was supplied. All new screens and integrations below are proposals.

## 2. Navigation and roles
Add Communications to the operator navigation, with Inbox, My work, Approvals, Analytics and Settings (permission gated). Tenant navigation: Requests, New request, request detail. Add Activity tabs on tenant, tenancy and property records. Add linked case panel to maintenance and inspection records. Allow organisations to choose Communications as their default landing page.

| Role | Capabilities |
|---|---|
| Operator | Triage, assign within scope, reply, action, resolve permitted cases |
| Team member | Work assigned cases, notes, actions, permitted replies |
| Manager/approver | Approve/reject specified decisions, escalate, reassign, reopen |
| Organisation admin | Configure categories, queues, SLAs, permissions, workflows, channels |
| Tenant | Submit requests, view own permitted cases, reply, attach evidence |
| Contractor | Access only assigned work order and explicitly shared communications; no rent/tenancy records |
| Auditor | Read-only authorised history/export |

Enforce organisation and property scope server-side on every read/write, export, attachment and search. A distribution group is a routing destination, not automatic access to every tenant record. Sensitive categories need additional permission. Former tenants must not see new occupants' data.

## 3. Operator inbox
Three-pane desktop layout: queue/filter navigation, case list, selected case workspace. On mobile use list then detail. Default sort: urgent safety flags, overdue, next deadline, oldest unassigned; allow alternate sort. Show case reference, tenant, property/unit, category, source, owner, priority, status, unread indicator, last activity, next action due. Filters: portfolio/block/property, tenant, category, team, owner, status, priority, source, unread, overdue, approval. Saved views: My cases, Unassigned, Urgent, Overdue, Awaiting approval, Awaiting tenant, All, Closed. Search case ID, subject, authorised message text and property/tenant names. Paginate server-side. Bulk assign only with confirmation and individual audit events. Do not allow bulk closure of safety or approval cases.

Case workspace: header with reference, status, priority and owner; original message plus threaded correspondence; separate internal note composer; action checklist with assignee/due date/evidence; approval panel; linked records; deadlines; activity/audit history. Actions: reply, note, add task, assign, escalate, link/create work order, request approval, resolve, reopen. Distinguish sent, queued, delivered, failed and unknown delivery status; never claim delivery without evidence.

## 4. Tenant journey
Tenant signs in, selects tenancy/property if multiple, types request or chooses a shortcut (repair, rent, tenancy, general), attaches photos/documents, submits. Show confirmation/reference and status; provide emergency contact guidance configured by organisation, without blocking submission. Tenant can view own requests, reply, add evidence and indicate issue persists. Public status labels: Received, Under review, In progress, Waiting for you, Resolved, Closed. No internal notes, AI confidence, private approvals or other tenant data. Existing maintenance submission remains usable; it creates or links a case automatically rather than creating a duplicate repair request.

## 5. Categories and routing
Seed categories: Maintenance; Rent & payments; Tenancy; Complaints; Health & safety; Access; Property alterations; Documentation; Inspections; Move-in; Move-out; General; Internal. Admin can add subcategories, default priority, group, workflow, SLA and approval requirements. Routing precedence: safety rule > explicit property/category rule > category default > monitored unassigned queue. Record why a rule fired; allow authorised override with reason. Unmatched sender/property goes to identity review, never guesses a tenant or exposes records.

## 6. Case lifecycle
New → Triaged → Assigned → In progress → Resolved → Closed. Waiting states: Awaiting tenant, Awaiting approval, Awaiting third party; resume In progress when dependency clears. Reopen a resolved/closed case with reason and new follow-up; preserve prior closure. Duplicate/cancelled cases require reason and linked canonical case if applicable. Assignment requires eligible team/user; team-only ownership must remain visible to queue manager. Closure requires resolution summary, required tasks completed, required approvals decided and relevant linked work verified; exceptions require manager reason, never bypass safety policy. Notify tenant of outcome where appropriate. Track first response separately from resolution. Incoming replies to closed cases alert owner and trigger review/reopen according to configured rule.

## 7. Example workflows
### Rent payment extension
Tenant requests payment on 15th rather than 1st → case categorised → rent team assigned → review payment history using authorised accounting source → review policy → request manager approval → record approved/rejected decision and terms → send human-reviewed outcome → schedule follow-up → confirm payment outcome or escalate → close. Do not change rent ledger or agree financial terms automatically. Accounting integration is optional and unverified; manual reference supported.
### Maintenance / damp and mould
Tenant reports issue → safety triage and urgent alert where indicated → existing maintenance request/work order linked or created exactly once → maintenance admin allocates via existing process → contractor updates/photos → case receives linked progress → operator verifies outcome and tenant communication → close. Do not mark issue safe based on AI or contractor status alone. Safety deadlines are configured and validated by compliance owner for jurisdiction, tenure and incident type; no blanket legal SLA. Never pause statutory timers automatically. Existing maintenance chat remains accessible through canonical message references; do not expose contractor-only messages to tenants.
### Tenancy renewal
Receive request → tenancy team → review terms and permissions → approval where required → issue authorised documents → update existing tenancy record after approval → notify tenant → close.
### Multi-intent / duplicate
One email asks for rent extension and repair: preserve source message once; create two linked cases with distinct owners and tasks. Link message to both internally; replies explicitly scoped to case. Similar messages suggest merge/link, require human confirmation unless deterministic provider retry. Preserve references, history and permissions.

## 8. Data model (logical, adapt to existing schema)
All records include org_id, created_at, updated_at where applicable; timestamps UTC, display local. UUID or existing ID convention. Do not store copies of existing tenant/property/work-order entities.

| Entity | Key fields |
|---|---|
| Case | id, reference, tenant_id nullable, tenancy_id nullable, property_id, unit_id, block_id (existing relations), subject, category_id, status, priority, owner_group_id, owner_user_id, source, summary, next_action_at, first_response_due_at, resolution_due_at, first_response_at, resolved_at, closed_at, resolution_summary, version |
| Message | id, source_channel, provider_message_id, thread_id, sender/recipient references, body, attachment references, direction, visibility, delivery_status, received_at, sent_at, external_reference |
| CaseMessage | case_id, message_id, visibility/scope (must not broaden message permissions) |
| Action | id, case_id, title, description, assignee_id, due_at, status, required, completed_by, completed_at, evidence_ref |
| Approval | id, case_id, type, requested_by, eligible_approver/group, decision, reason, terms snapshot, decided_by, decided_at |
| CaseLink | case_id, entity_type, entity_id, relationship, unique constraint |
| AuditEvent | id, case_id, actor_type/id, event_type, timestamp, before/after permitted metadata, reason, correlation_id |
| Category/Workflow | category, routing rules, task templates, approval policy, SLA policy, version |
| ChannelEvent | provider, external event ID, processing status, retry count, correlation ID |
| SLAEvent | case_id, timer type, deadline, pause/resume reason, escalation level |

Use append-only audit events with controlled redaction/retention process. Do not include secrets in logs. Property timeline queries linked cases/events rather than copying them. Preserve historical tenancy associations when occupants change. Tenant identity review permits nullable links until confirmed. Use optimistic locking for conflicting updates, transaction/outbox for notifications, unique provider event keys and idempotency keys for creation.

## 9. API contract (illustrative REST, adapt to existing framework)
- GET /cases?status=&owner=&property=&cursor= ; POST /cases
- GET /cases/{id}; PATCH /cases/{id} (version required)
- POST /cases/{id}/messages; POST /cases/{id}/notes (separate visibility)
- POST /cases/{id}/assign; /actions; /approvals; /links; /escalate; /resolve; /reopen
- PATCH /cases/{id}/actions/{actionId}; POST /approvals/{id}/decision
- GET /tenants/{id}/activity; GET /properties/{id}/activity
- POST /channels/{provider}/webhook (signed, replay protected)
- GET /cases/{id}/audit; GET /analytics/communications

Example create payload: `{"subject":"Rent extension","category":"rent_payments","tenant_id":"existing-id","tenancy_id":"existing-id","property_id":"existing-id","message":"Can I pay on the 15th?","source":"tenant_portal"}`. Server derives org and actor from authenticated session, validates relationships, returns case ID/reference and status. All mutating endpoints return validation errors, 403 for denied access, 409 for stale version or duplicate conflict; asynchronous channel failure is visible and retryable. Use existing API conventions instead of blindly implementing these paths.

## 10. Channels and notifications
Phase 1 portal/app existing entry points, manual operator logging of phone/email/WhatsApp and existing maintenance chat. Phase 2 shared mailbox inbound/outbound with provider thread IDs, sender matching, delivery/failure handling, WhatsApp Business approved templates/consent where required, app notifications. Confirm provider credentials, costs, supported APIs and organisational consent before implementation. Do not scrape personal WhatsApp. Telephone manual log: date, caller, operator, summary and outcome; recording not required. Notifications: new assignment, urgent risk, overdue, approval requested/decided, tenant reply, delivery failure, resolution. Configurable group/user channels, reminders and escalation; avoid alert storms via deduplication. Never put sensitive case details in lock-screen or email subject by default.

## 11. AI and Ivy
AI produces structured suggestions: category, priority, summary, intents, suggested group, actions, draft response, confidence, evidence excerpts, risk flags. Treat incoming message content as untrusted; no instructions inside messages may alter policies or permissions. Low confidence or mismatched identity → human triage. Safety keyword/rule fallback independent of AI; alerts are not delayed by model failure. No autonomous rent agreements, tenancy decisions, complaint closure or safety determinations. Human edits/acceptance and model/version logged. AI drafts never auto-send in MVP. Ivy may answer approved FAQs with citations to internal authorised knowledge and hand off to operator with context; measure actual confirmed self-service outcomes, not just chatbot replies. Restrict retrieval to authorised scope, minimise personal data sent to model, confirm processor and retention settings.

## 12. SLA and workflow settings
Admin defines first-response and resolution targets by category/priority, working hours/calendar, routing group, escalation chain, required tasks, approvals and notification rules. Store policy version on case. Show next deadline and overdue age. Separate business SLA from statutory obligation; compliance owner validates any legal rules. Pause only eligible business timers with reason and audit; waiting states do not automatically pause. Approval decisions record actor, timestamp, rationale and approved terms; edits to approved terms require reapproval. No self-approval where policy prohibits it.

## 13. Analytics
Dashboard: received/open/unassigned/overdue, first response median and percentile, resolution median, % completed within applicable SLA, workload by team, case volumes by property/category, reopened rate, repeat issues, approval bottlenecks and delivery failures. Define denominators/time windows; exclude duplicates from distinct case counts but retain audit. AI self-service = confirmed resolved without operator action / eligible requests. Export authorised filtered rows; log exports. Mockup metrics are fictional.

## 14. Security, accessibility and operations
Use existing auth/RBAC, tenant isolation, encryption in transit/at rest, signed short-lived attachment links, file type/size validation, malware scanning, rate limits, webhook signature validation, secrets vault and backups. Define retention with data owner, deletion/redaction process, legal holds and subject access export; avoid perpetual immutable PII. Internal note visibility enforced on API, notifications, search and exports. Test keyboard navigation, focus, screen reader labels, contrast and responsive layout. Monitor queue lag, webhook failures, notification retries, duplicate rate, AI errors and overdue escalations. Provide dead-letter queue and authorised retry tools. Feature flag by organisation; migration backfill existing maintenance links with dry run and reconciliation, not duplicate messages. Rollback flag must preserve data.

## 15. Delivery phases and acceptance gates
| Phase | Scope | Release gate |
|---|---|---|
| 1 | Core cases, inbox, portal, manual logs, maintenance links, timeline, tasks, basic deadlines, approvals, audit | End-to-end tenant request resolved with one traceable case and no duplicate work order |
| 2 | Email/WhatsApp provider adapters, delivery status, channel notifications | Retry/replay tests, sender review, no cross-tenant disclosure |
| 3 | AI classification, multi-intent suggestions, summaries and drafts | Human oversight, safety fallback, confidence routing, model failure tests |
| 4 | Configurable workflows, advanced SLA and escalation | Versioned rules, deterministic routing and timer tests |
| 5 | Analytics, Ivy operational queries, proactive intelligence | Metric reconciliation and access-scoped retrieval |

### Acceptance test checklist
- [ ] Tenant submits request, gets reference, sees only own public case and messages.
- [ ] Operator assigns case to eligible team/person; history records before/after.
- [ ] Existing maintenance request appears in inbox and retains original chat/work order; retry produces no duplicate.
- [ ] Internal note cannot be retrieved by tenant/contractor via API, search, attachment URL or export.
- [ ] Rent approval cannot be bypassed; decision and follow-up preserved; closure blocked until required tasks complete.
- [ ] Urgent safety report alerts appropriate queue even if AI unavailable; statutory timer not paused.
- [ ] Unmatched sender remains in restricted review queue; no guessed tenant linking.
- [ ] Multi-intent source can link to two cases without exposing unrelated replies.
- [ ] Provider duplicate webhook produces one event/message; failed delivery shown and retryable.
- [ ] Overdue deadline triggers configured alert; waiting-state timer rules correct.
- [ ] Tenant/property timelines show authorised cases after tenancy changes; no new occupant visibility into old tenant data.
- [ ] Reopening retains original closure and records new reason/deadline.
- [ ] Concurrent updates reject stale version; audit and notifications remain consistent.
- [ ] Cross-organisation access denied for all endpoints and files.
- [ ] Analytics reconcile with filtered case records; keyboard and mobile journeys usable.

## 16. Handover and decisions
HTML is a standalone browser prototype using illustrative data, not production code or live integrations. PNGs are screenshots of the same prototype. Confirm actual Inspect360 design tokens, architecture, maintenance chat visibility, distribution group rules, accounting provider, email/WhatsApp providers, compliance policies, retention and emergency guidance before build. Suggested first sprint: map existing schemas and permissions, implement case/link/audit foundation, then inbox and tenant submission. Do not replace existing maintenance workflows. No source code or production screenshots were supplied; design and API names are proposed.
