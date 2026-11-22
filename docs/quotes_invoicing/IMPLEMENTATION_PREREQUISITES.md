# Quotes & Invoicing — Implementation Prerequisites

**Status:** Review draft for product owner / team lead
**Prepared:** 23 November 2026, against branch `develop` at commit `e92f822`
**Companion document:** [`SPEC_DISCREPANCIES_AND_GAPS.md`](SPEC_DISCREPANCIES_AND_GAPS.md). Issue IDs such as **QI-C02** refer to findings in that report.

---

## 1. Purpose and assumptions

This document lists what must exist, change or be confirmed before and during the build of Quotes & Invoicing on top of Inspect360's **current** maintenance workflow.

It assumes the recommendations in the discrepancy report are accepted, mainly:

- v1 is **accounts-payable**: contractors quote and invoice the organisation; Inspect360 records approval and payment status but moves no money (QI-A01, QI-F06).
- The scope is quotes, approvals, contractor invoices and payment tracking on the **existing** work-order model, not the Brief's full maintenance re-architecture (QI-A02).
- Existing statuses, roles and screens are extended **additively**; nothing that works today is renamed or removed (QI-B05).

Where a decision is still open, the item is marked **[Decision #n]**, referring to the decision register in §14 of the discrepancy report. All schema and API shapes below are **proposals for review**, not final designs.

Labels used:

- **Verified (code):** read in source at the cited location.
- **Inferred (code):** follows from the code but not tested against a running system.
- **Unverified:** needs confirmation outside the repository.

---

## 2. Blocking prerequisites (before any Quotes & Invoicing code)

These items protect existing data and prevent financial data from leaking. They should ship first, ideally as separate, small changes.

| # | Prerequisite | Why it blocks | Where | Issue |
|---|---|---|---|---|
| P1 | Deny tenants organisation-wide work-order access; add role checks to work-order and maintenance read/write routes; add tenant cases to tests | Quote/invoice amounts would otherwise be readable by tenants | `server/workOrderAccess.ts` L21–66; `server/routes.ts` L17752, L17785, L17900, L17944, L15349, L15396; `server/workOrderAccess.test.ts` | QI-C02 |
| P2 | Refuse hard-deletion of requests/work orders that have quotes or invoices; review clerk delete rights | Deleting a request currently cascades to every work order and child row | `server/storage.ts` L1674–1695, L2792–2804; `server/routes.ts` L15411, L18012 | QI-B02 |
| P3 | Organisation-scoped private file access for financial attachments | `set-acl` always makes files public; `/objects/*` serves them unauthenticated | `server/routes.ts` L20188–20234, L20997–21013; `server/objectAcl.ts` | QI-C03 |
| P4 | Restrict who can write `cost_estimate` / `cost_actual` | Assignees can overwrite costs that an approved quote should control | `server/routes.ts` L17986–18010, L18030–18106; `server/workOrderCertificateService.ts` L385–428 | QI-C06 |
| P5 | Approve naming that avoids `invoices`, `quotations`, `quotation_requests`, `credit_notes` and `/api/quotations` | Migrations and types would collide with SaaS billing | `shared/schema.ts` L3650–3737 | QI-B01 |
| P6 | Agree decisions #1–#10 (scope, money, currency, tax, approver model) | Schema cannot be designed without them | — | §14 of discrepancy report |

---

## 3. Existing functionality that can be reused

These work today and can be used without change (or with only the modifications listed in §4).

| Capability | Where it lives | How Quotes & Invoicing uses it |
|---|---|---|
| Session auth, role guard, module guard | `isAuthenticated`, `requireRole`, `requireCompanyModule` in `server/auth.ts` L814–960 | Protect every new route; apply `requireCompanyModule("maintenance")` |
| Paid-access / trial locking by API prefix | `LOCKED_API_PREFIXES` in `shared/entitlements.ts` L13–36 (already includes `/api/work-orders`, `/api/maintenance`) | New routes under `/api/work-orders/...` inherit locking (QI-I05) |
| Work-order access helper (after P1) | `canAccessWorkOrder`, `buildWorkOrderIdentity`, `isAssigneeMatch` in `server/workOrderAccess.ts` | Contractor sees only their work orders' quotes/invoices |
| Work-order → request → property/block joins | `storage.workOrderListSelect`, `getWorkOrdersByOrganization`, `getWorkOrdersForAssignee` (`server/storage.ts` L2643–2708) | Property, block and priority context for quote/invoice screens |
| Teams and assignment model | `teams`, `team_members`, `team_categories` (`shared/schema.ts` L1972–2030); Settings → Maintenance Team (`client/src/components/SettingsTeamsPanel.tsx`) | Identify the assigned contractor who may quote/invoice |
| Contractor identities | `users.role = 'contractor'`; `contacts.type = 'contractor'` with optional `linked_user_id` (`shared/schema.ts` L33, L379–402) | Quote/invoice preparer; see QI-C04 for contact-only contractors |
| Completion checklist with snapshot, completion gate, customer signature | `shared/completionChecklist.ts`; `server/workOrderCompletionGate.ts`; `WorkOrderCompletionChecklistPanel` / `WorkOrderCompleteDialog` (web), `WorkOrderCompleteScreen` (mobile) | Unchanged. "Completed" remains the invoice gate unless decision #15 adds review |
| Certificates → Compliance | `server/workOrderCertificateService.ts`; `client/src/components/WorkOrderCertificatePanel.tsx` | Unchanged; shown on the work-order record |
| HMO verification hook | `server/hmo/maintenanceVerification.ts` L16–94; call site `server/routes.ts` L17850–17861 | Must keep firing on `completed` (QI-D05) |
| Email delivery (Resend) | `server/resend.ts` (e.g. `sendTeamWorkOrderNotification` L270, `sendContractorWorkOrderNotification` L415) | Pattern for "quote submitted", "quote decided", "invoice submitted", "invoice decided" emails |
| In-app notifications (data + WebSocket) | `notifications` table (`shared/schema.ts` L3067); `sendNotificationToUser` (`server/websocket.ts`) | Optional staff alerts; needs UI (QI-H08) |
| Report PDF infrastructure | `server/pdfService.ts`, `server/pdfBrowserPool.ts`, `server/reportPdfShared.ts`; organisation branding fields (`organizations.logo_url`, `branding_*`, L203–231) | Optional quote/work-order PDF (QI-I02) |
| File upload endpoints | `POST /api/objects/upload`, `/api/objects/upload-direct`, `/api/objects/upload-file` (`server/routes.ts` L20249–21158) | Invoice PDF and quote attachments, once P3 is in place |
| Transactions and row locks | `drizzle-orm/node-postgres` (`server/db.ts`); `SELECT … FOR UPDATE` in `server/billingService.ts` L13–22 | Reference-number counters; race-safe approve/submit |
| Pure money helper style | `shared/billingFinancialMath.ts` (integer minor units, no floats) | Model for `shared/maintenanceFinanceMath.ts` (line/header calculation) |
| Currency formatting | `formatCurrency(amount, currency, minorUnits)` in `shared/countryUtils.ts` L159–180; `useLocale().formatCurrency` (`client/src/contexts/LocaleContext.tsx`) | Display amounts; currency source per decision #8 |
| In-process schedulers | `server/index.ts` L215–396 (`setInterval`) | Optional quote-expiry job (QI-E05) |
| Web UI kit and patterns | shadcn/ui in `client/src/components/ui`, `PageHeader`, Breadcrumb (e.g. `client/src/pages/CommunityModeration.tsx` L405), React Query, `react-hook-form` + `zod` | All new web screens; tokens from `client/src/index.css` (QI-H02) |
| Lightweight test style | Assertion scripts run with `tsx` (e.g. `server/workOrderAccess.test.ts`, `shared/billingFinancialMath.test.ts`) | Unit tests for maths, transitions, access rules |
| Migration process | Idempotent SQL in `server/migrations/*.sql`, applied as `creativecloud`, then `GRANT … TO inspect360` (e.g. `addWorkOrderChecklistSignature.sql`) | All schema changes (§7) |

---

## 4. Existing functionality requiring modification

| Component | Current behaviour (Verified unless marked) | Required change | Risk if skipped | Issue |
|---|---|---|---|---|
| `server/workOrderAccess.ts` `listScopeForUser` / `canAccessWorkOrder` | Any role other than clerk/contractor gets organisation scope, including tenant (Inferred impact) | Explicit allow-list: `owner`, `compliance` (org); `clerk`, `contractor` (assignee); others denied | Tenant sees financial data | QI-C02 |
| `GET /api/maintenance`, `GET /api/maintenance/:id` (`server/routes.ts` L15349–15409) | Any org user, including tenants and contractors, sees all requests | Role restriction; contractors limited to requests linked to their work orders (product to confirm) | Data leak; also affects request payloads if finance data is joined later | QI-C02 |
| `storage.deleteMaintenanceRequest`, `storage.deleteWorkOrder` | Hard cascade delete | Refuse when quotes/invoices exist; consider archive/cancel instead | Financial data loss | QI-B02 |
| `PATCH /api/work-orders/:id` and `PATCH /api/work-orders/:id/status` | Role-only status check; any status reachable | Route both through one transition helper; block `assigned → in_progress` when authorisation is required and missing | Quote gate bypass | QI-D02, QI-D03 |
| `PATCH /api/work-orders/:id` cost handling and `PATCH /api/work-orders/:id/cost` | Assignees can set `cost_estimate`; contractors can set `cost_actual` and `variation_notes` | Lock `cost_estimate` once a quote is approved (write authorised total); restrict `cost_actual` to owner or invoice flow | Contradictory numbers in reports | QI-C06, QI-E04 |
| `POST /api/work-orders` (`server/routes.ts` L17567) | Allowed for `owner` and `contractor`; does not visibly check that `maintenanceRequestId` belongs to the organisation (Inferred) | Confirm contractor creation is intended; add request-organisation check | Contractors could self-create and self-quote jobs | QI-C06 |
| `PUT /api/objects/set-acl` and object serving | Always public; owner-only ACL | Do not use for financial files; add authorised serve route keyed by work-order access | Public invoice files | QI-C03 |
| `storage.workOrderListSelect` | Returns cost fields to every caller of the list | Add `reference`, `authorisation_status`; keep financial totals out of assignee/compliance payloads unless approved | Over-exposure | QI-C02, QI-C07 |
| `client/src/pages/Maintenance.tsx` | Dialog-based; hardcoded "£" (L874–877, L2023) | Show authorisation status and link to the new detail page; use locale currency | Wrong currency symbol for non-UK orgs | QI-G01, QI-H03 |
| `client/src/pages/Analytics.tsx` (owner "Work Orders" board) | Edit dialog with manual cost estimate | Link to detail page; read-only estimate after quote approval | Users bypass quote via cost edit | QI-E04 |
| `server/resend.ts` work-order emails | Cost shown with hardcoded "$" (L368, L513) | Use document currency | Wrong currency in emails | QI-G01 |
| Mobile `WorkOrderDetailScreen` / `WorkOrdersListScreen` | Statuses hardcoded; no authorisation concept | Show "Awaiting quote approval" and explain why Start is blocked; tolerate new fields | Contractors confused by server rejections (Unverified how errors render) | QI-H06 |
| `client/src/pages/Settings.tsx` | No maintenance finance settings | New tab for quote policy, tax rates, approvers | No way to configure policy | QI-E02, QI-G02 |
| `server/services/fixflo-webhook-processor.ts` | Writes Fixflo invoices into `maintenance_requests.ai_analysis_json`; sets request `completed` | Guard against conflicting Inspect360 invoices on Fixflo-linked jobs per decision #23 | Duplicate invoices | QI-D06 |
| `shared/schema.ts` | `Invoice`/`CreditNote` types exported twice; SaaS names occupy `invoices`/`quotations` | Add new tables under maintenance-specific names only | Type and table collisions | QI-B01 |

---

## 5. Completely new functionality required

### 5.1 Database changes (proposal)

All new tables: `organization_id NOT NULL`, money as **integer minor units** [Decision #7], explicit `currency`, `created_at`/`updated_at`, foreign keys with `ON DELETE RESTRICT` to `work_orders` (QI-B09). Names avoid SaaS collisions [Decision #3].

| Table | Purpose | Key columns (indicative) |
|---|---|---|
| `maintenance_quotes` | Quote header, one row per version | `work_order_id` (NOT NULL, FK), `quote_number`, `version_number`, `reference`, `quote_type` (`original` / `variation`), `parent_quote_id`, `superseded_by_quote_id`, `variation_of_quote_id`, `status`, `prepared_by_user_id`, `prepared_by_contact_id`, `entered_by_user_id`, `submitted_at`, `decided_by_user_id`, `decided_at`, `decision_reason`, `valid_until`, `currency`, `subtotal_minor`, `tax_minor`, `total_minor`, `scope_description`, `exclusions`, `contractor_notes`, `internal_notes`. Unique `(organization_id, quote_number, version_number)` |
| `maintenance_quote_lines` | Quote lines | `quote_id` (FK), `sort_order`, `category`, `description`, `quantity` (numeric, e.g. 1.5 hours), `unit`, `unit_price_minor`, `tax_rate_bp` (basis points snapshot), `tax_rate_label`, `line_net_minor`, `line_tax_minor`, `line_total_minor` |
| `maintenance_invoices` (or `contractor_invoices`) | Contractor invoice header | `work_order_id` (NOT NULL, FK), `quote_id` (authorised quote), `internal_reference`, `supplier_invoice_number`, `contractor_contact_id`, `contractor_user_id`, `entered_by_user_id`, `issue_date`, `due_date`, `currency`, totals, `authorised_total_minor` (snapshot at submission), `variance_minor`, `variance_flags` (jsonb: amount, tax, duplicate reference, date), `status`, `submitted_at`, `decided_by_user_id`, `decided_at`, `decision_reason`, `payment_status`, `paid_amount_minor`, `paid_at`, `payment_reference`, `payment_recorded_by_user_id`, `attachment_object_path`, `contractor_notes`. Index (not unique) on `(organization_id, contractor_contact_id, supplier_invoice_number)` |
| `maintenance_invoice_lines` | Invoice lines | Same shape as quote lines, optional `quote_line_id` for line comparison |
| `work_order_events` | Append-only audit for quotes, invoices, authorisation and status changes | `work_order_id`, `actor_user_id`, `actor_role`, `event_type`, `entity_type`, `entity_id`, `from_status`, `to_status`, `payload` (jsonb), `created_at`. No update/delete routes; optionally revoke `UPDATE, DELETE` from `inspect360` [Decision #37] |
| `maintenance_finance_settings` | One row per organisation | `quote_policy` (`never` / `always` / `above_threshold`), `quote_threshold_minor`, `default_currency` [Decision #8], `allow_single_approver`, `invoice_variance_tolerance_minor`, `quote_validity_days` |
| `maintenance_tax_rates` | Organisation tax rate list | `name`, `rate_bp`, `is_default`, `is_active`; seeded per country [Decision #9] |
| `maintenance_approvers` | Capabilities for existing users (no new enum role) | `user_id`, `max_quote_approval_minor`, `can_approve_invoices`, `can_record_payments` [Decision #10] |
| `maintenance_document_sequences` | Concurrency-safe numbering | `organization_id`, `document_type`, `year`, `next_value`; updated with `SELECT … FOR UPDATE` [Decision #25] |

New columns on existing `work_orders` (all nullable or defaulted, so existing rows and clients are unaffected):

| Column | Default for existing rows | Purpose |
|---|---|---|
| `reference` | NULL, optional backfill [Decision #25] | Human-readable `WO-…` |
| `authorisation_status` | `'not_required'` | Quote gate, separate from `status` (QI-D03) |
| `approved_quote_id` | NULL | Current authorised quote |
| `authorised_total_minor` | NULL | Cached original + approved variations (optional) |

No changes to Postgres enums `work_order_status` or `maintenance_status` are required (QI-B05).

### 5.2 API requirements (proposal)

All routes: `isAuthenticated`, `requireCompanyModule("maintenance")`, work-order access check, role/capability check, zod validation, transition helper, event write. All amounts computed server-side. Repeated submit/approve calls must be no-ops (conditional updates on current status) (QI-I01).

**Quotes**

| Method and path | Actor | Notes |
|---|---|---|
| `GET /api/work-orders/:id/quotes` | owner, approver, assigned contractor | Contractor sees own; tenant never |
| `POST /api/work-orders/:id/quotes` | assigned contractor, or owner on behalf [Decision #11] | Creates `draft` v1 or a `variation` |
| `PATCH /api/work-orders/:id/quotes/:quoteId` | preparer | `draft` only; recomputes totals |
| `POST …/quotes/:quoteId/submit` | preparer | `draft → submitted`; `authorisation_status → awaiting_approval` (unless variation) |
| `POST …/quotes/:quoteId/approve` | approver within limit, not the preparer | Locks quote; sets `approved_quote_id`, `cost_estimate`, `authorisation_status = authorised` |
| `POST …/quotes/:quoteId/reject` and `…/request-changes` | approver | Reason required |
| `POST …/quotes/:quoteId/revise` | preparer | New version `draft`; previous `superseded` |
| `POST …/quotes/:quoteId/withdraw` | preparer or owner | Before decision only |

**Invoices**

| Method and path | Actor | Notes |
|---|---|---|
| `GET /api/work-orders/:id/invoices` | owner, approver, assigned external contractor | |
| `POST /api/work-orders/:id/invoices` | external contractor, or owner on behalf | Only when the work order passes the invoice gate [Decision #15]; pre-fill from authorised quote |
| `PATCH …/invoices/:invoiceId` | preparer | `draft` only |
| `POST …/invoices/:invoiceId/submit` | preparer | Computes variance against authorised total; flags duplicates |
| `POST …/invoices/:invoiceId/approve`, `…/query`, `…/reject` | invoice approver | Approval does not mark paid |
| `POST …/invoices/:invoiceId/void` | owner | Reason required |
| `POST …/invoices/:invoiceId/payment` | payment recorder | Sets payment status/amount/date/reference; approved invoices only |
| `GET …/invoices/:invoiceId/attachment` | owner, approver, preparer | Authorised file serve (P3) |

**Supporting**

| Method and path | Notes |
|---|---|
| `GET /api/work-orders/:id/events` | Activity timeline; tenant never |
| `GET /api/work-orders/pending-approvals` | Approver queue. Must be registered **before** `GET /api/work-orders/:id` or it will be captured by the `:id` route |
| Finance settings, tax rates, approvers CRUD | Owner only. Do **not** place under `/api/maintenance/<name>`: `GET /api/maintenance/:id` (L15349) would capture it unless registered first. Use e.g. `/api/maintenance-finance/...` and add that prefix to `LOCKED_API_PREFIXES` |

### 5.3 User interface

| Surface | New or changed | Notes |
|---|---|---|
| Web work-order detail page (e.g. `/work-orders/:id`) | New | Tabs: Overview, Quotes, Invoices, Activity. Page-level breadcrumb; handles block-level jobs (QI-H03, QI-B04) |
| Quote builder (contractor / owner-on-behalf) | New | Lines with category, description, quantity, unit, rate, tax rate; live preview only; server totals authoritative (QI-E06) |
| Quote review (approver) | New | Read-only lines, version history, limit indicator, approve / reject / request changes (QI-H04) |
| Invoice builder (contractor) | New | Supplier invoice number, dates, lines pre-filled from quote, PDF upload (private) |
| Invoice review and payment tracking (approver / payment recorder) | New | Two-way match and variance flags (QI-F04); separate payment status control |
| Pending approvals list | New | Entry point for approvers without a notification inbox (QI-H08) |
| Settings → Maintenance finance | New tab | Quote policy, tax rates, approvers |
| Maintenance page, Analytics board | Changed | Authorisation badge; link to detail page; currency fix |
| Mobile work-order detail | Changed (minimal) | Read-only authorisation status [Decision #30] |
| Strings module for the feature | New | Per workspace convention (QI-H07) |

All screens need loading skeletons, error states and empty states, and must fit 390px width on web.

### 5.4 Workflow adjustments

Proposed transition matrices for review [Decision #16].

**Quote status**

| From | To | Actor | Guard |
|---|---|---|---|
| `draft` | `submitted` | preparer | ≥1 valid line; totals > 0; currency set |
| `draft` | `withdrawn` | preparer / owner | — |
| `submitted` | `approved` | approver | Within limit; not the preparer (or audited single-approver override); quote not expired |
| `submitted` | `rejected` | approver | Reason |
| `submitted` | `changes_requested` | approver | Reason |
| `submitted` | `expired` | system | Past `valid_until` (submitted quotes only, QI-E05) |
| `submitted` | `withdrawn` | preparer | — |
| `changes_requested` / `rejected` | `superseded` | system | When a revised version is created |
| `approved`, `superseded`, `withdrawn`, `expired` | — | — | Terminal; variations are separate quotes |

**Work-order `authorisation_status`** (new field; `status` unchanged)

| From | To | Trigger |
|---|---|---|
| (created) | `not_required` or `quote_required` | Organisation quote policy at creation; existing rows `not_required` |
| `quote_required` | `awaiting_approval` | Original quote submitted |
| `awaiting_approval` | `authorised` | Quote approved |
| `awaiting_approval` | `quote_required` | Quote rejected, changes requested, withdrawn or expired |
| `not_required` | `quote_required` | Owner decides a quote is needed |

Guard on existing `status`: `assigned → in_progress` (and any jump to `completed`) is refused while `authorisation_status` is `quote_required` or `awaiting_approval`, except for an audited owner override if the emergency override is approved [Decision #14]. Variations do not revoke authorisation; additional work beyond scope is controlled procedurally in v1 (QI-E03).

**Invoice status** and separate **payment status**

| From | To | Actor | Guard |
|---|---|---|---|
| `draft` | `submitted` | preparer | Work order passes invoice gate; attachment if required; variance computed |
| `submitted` | `approved` | invoice approver | Variance acknowledged with reason if outside tolerance |
| `submitted` | `queried` | invoice approver | Query text |
| `queried` | `submitted` | preparer | Response / edits recorded as event |
| `submitted` / `queried` | `rejected` | invoice approver | Reason; contractor may create a new invoice |
| `draft` / `submitted` / `queried` / `approved` | `void` | owner | Reason; only before any payment recorded |

Payment status (only on `approved` invoices): `not_paid → sent_for_payment → part_paid → paid` (forward only; `paid` requires date and reference). One active (non-void, non-rejected) invoice per work order in v1 [Decision #20].

**Invoice gate:** work order `status = completed` (plus owner acceptance flag if decision #15 requires review) and assignee is external [Decision #19].

### 5.5 Services and infrastructure

| Item | Notes |
|---|---|
| `shared/maintenanceFinanceMath.ts` | Pure functions: line net, tax (half-up per line), totals, variance with tolerance (QI-G03). Unit-tested |
| Transition helpers | One module per document type plus work-order authorisation guard (QI-D02) |
| Reference allocator | Uses `maintenance_document_sequences` with row lock (QI-B10) |
| Event writer | Called inside the same transaction as each transition (QI-C08) |
| Email notifications | Quote submitted → approvers; decision → preparer; invoice submitted → invoice approvers; decision → preparer. Best-effort, as existing work-order emails |
| Private attachment service | Stores files with private visibility and serves through authorised routes (P3) |
| Optional quote-expiry job | Idempotent conditional update in `server/index.ts` scheduler (QI-I03) |

---

## 6. Unverified assumptions requiring confirmation

### 6.1 Data checks (read-only)

These answer questions the code cannot. Per the Contabo rule, connect as `creativecloud` (dev: `docker exec -it postgres psql -U creativecloud -d inspect360_dev`; prod: `docker exec -it postgres psql -U creativecloud -d inspect360`). All queries are `SELECT` only.

| Question | Query | Informs |
|---|---|---|
| Do requests already have several work orders? | `SELECT count(*) FROM (SELECT maintenance_request_id FROM work_orders GROUP BY 1 HAVING count(*) > 1) t;` | QI-B07 |
| Do tenant users have an organisation id (exposure in P1)? | `SELECT count(*) FROM users WHERE role = 'tenant' AND organization_id IS NOT NULL;` | QI-C02 |
| How many team contractors have no login? | `SELECT count(*) FROM team_members tm JOIN contacts c ON c.id = tm.contact_id WHERE c.linked_user_id IS NULL;` | QI-C04 |
| How many organisations have a single active owner? | `SELECT count(*) FROM (SELECT organization_id FROM users WHERE role = 'owner' AND is_active GROUP BY 1 HAVING count(*) = 1) t;` | QI-C05 |
| Orphaned work orders (FK readiness) | `SELECT count(*) FROM work_orders wo LEFT JOIN maintenance_requests mr ON mr.id = wo.maintenance_request_id WHERE mr.id IS NULL;` | QI-B09 |
| Orphaned work logs | `SELECT count(*) FROM work_logs wl LEFT JOIN work_orders wo ON wo.id = wl.work_order_id WHERE wo.id IS NULL;` | QI-B09 |
| Are cost estimates really in minor units? | `SELECT min(cost_estimate), max(cost_estimate), avg(cost_estimate) FROM work_orders WHERE cost_estimate IS NOT NULL;` | QI-B06 |
| Currency inputs in use | `SELECT country_code, preferred_currency, count(*) FROM organizations GROUP BY 1, 2 ORDER BY 3 DESC;` | QI-G01 |
| Fixflo-enabled organisations | `SELECT count(*) FROM fixflo_config WHERE is_enabled;` | QI-D06 |
| Work-order status mix | `SELECT status, count(*) FROM work_orders GROUP BY 1;` | QI-B05 |
| Are `/objects` files referenced publicly? (sample) | Manual: open a known work-order photo URL in a private browser window | QI-C03 |

### 6.2 Behaviour and environment checks

| Assumption | How to confirm | Issue |
|---|---|---|
| Tenant session can call `GET /api/work-orders` and receive cost fields | Manual request with a tenant session in dev | QI-C02 |
| Production runs a single app instance | Check `docker-compose.contabo.yml` and host | QI-I03 |
| Mobile app shows server error messages when a status change is refused | Try a refused status change on a dev build | QI-H06 |
| Distribution of installed mobile versions (for additive API changes) | App store / EAS update metrics | QI-B05 |
| `GET /objects/*` reachable without auth through the production proxy | Request from outside the session in dev/prod | QI-C03 |

### 6.3 Business confirmations

| Assumption | Owner | Issue |
|---|---|---|
| No accounts-receivable recharging is required in v1 | Product | QI-A01 |
| Contractors are mostly contact-only vs login users | Product / customer success | QI-C04 |
| Quote requirement default for existing organisations is "never" (unchanged behaviour) | Product | QI-E02 |
| UAE and other non-UK organisations need correct tax and currency in v1 | Product | QI-G01, QI-G02 |
| Customer signature remains mandatory | Product | QI-D01 |
| Bank details are never stored in v1 | Product / compliance | QI-F03 |
| Malware scanning requirement for uploaded invoices | Security | QI-C03 |

---

## 7. Migration approach

1. One idempotent SQL file per change in `server/migrations/` (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), matching the existing style, with `shared/schema.ts` updated in the same change.
2. Apply to `inspect360_dev` first, then `inspect360`, as `creativecloud`; then run `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO inspect360;` for every new table (and only `SELECT, INSERT` on `work_order_events` if decision #37 protects it).
3. Do not use `drizzle-kit push` against shared databases (QI-B08).
4. New `work_orders` columns are nullable or defaulted so existing rows, web and mobile keep working without a backfill.
5. Foreign keys only on new tables; existing tables untouched until the orphan checks in §6.1 are clean (QI-B09).
6. No enum values renamed or removed (QI-B05).
7. Every migration ships with a written rollback (drop new tables/columns), since all changes are additive.

---

## 8. Testing prerequisites

| Need | Current state (Verified) | Required |
|---|---|---|
| Unit tests | Assertion scripts executed with `tsx`; no Jest/Vitest (`package.json` scripts) | Same style for maths, transitions, access rules (including tenant denial) |
| API / integration tests | None for maintenance | At least scripted checks for: quote submit → approve → start allowed; start blocked without approval; self-approval refused; over-limit refused; invoice variance flagged; approved ≠ paid; tenant denied all finance routes; deleting a work order with an invoice refused |
| Concurrency | None | Two simultaneous approvals produce one approval and one event |
| End-to-end / screenshot regression | No Playwright or similar tool in the repo | Brief §0.4 screenshot regression requires new tooling; decide whether this is in scope |
| Mobile regression | Manual | Existing work-order flows unchanged with new fields present |

---

## 9. Suggested sequencing

| Stage | Content | Depends on |
|---|---|---|
| 0 | Decisions #1–#24 | — |
| 1 | Security and data-safety patches P1–P4 | Decisions #4–#6 |
| 2 | Foundation migrations: settings, tax rates, approvers, sequences, events; new `work_orders` columns | Stage 1; decisions #3, #7–#10 |
| 3 | Quotes: maths, transitions, APIs, web builder/review, emails, `cost_estimate` sync | Stage 2; decisions #11, #16–#18 |
| 4 | Authorisation gate on work-order start; mobile read-only status | Stage 3; decisions #12–#14 |
| 5 | Contractor invoices and payment tracking; private attachments | Stage 3; decisions #15, #19–#22 |
| 6 | Work-order detail page Activity tab and property history additions | Stages 3–5 |
| 7 | Regression across HMO verification, Fixflo, Analytics board, PropertyHistoryReport, mobile | All |

---

## 10. Explicitly out of scope for this project (unless decisions change)

Taken from the Brief but not required for Quotes & Invoicing on the current model:

- Team broadcast offers and atomic first-accept allocation (Brief §8).
- Appointment scheduling and tenant visit confirmation (Brief §5.4).
- Engineer before/after evidence categories and offline drafts (Brief §5.5, §11).
- New request statuses, triage, merge and reopen flows (Brief §4, §5.2).
- Maintenance messaging (`maintenance_messages`) and a notification outbox (Brief §6, §10).
- Preapproval by property, category or contractor type (Brief §9), beyond the organisation threshold.
- Stripe Connect, customer share links, invoice chasing, credit notes, price book, terms templates (Ref-02, Ref-06, Ref-08, Ref-09).
- Global header redesign, sidebar section headings (Brief §0.2).
