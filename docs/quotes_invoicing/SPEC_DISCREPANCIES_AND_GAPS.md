# Quotes & Invoicing — Specification Discrepancies and Gaps

**Status:** Review draft for product owner / team lead
**Prepared:** 23 November 2026, against branch `develop` at commit `e92f822`
**Scope of review:** analysis only. No application code or original specification was changed.

---

## 1. How to read this report

### 1.1 Sources reviewed

| Short name used below | File |
|---|---|
| **Brief** | `docs/quotes_invoicing/Inspect360_Maintenance_UI_Aligned/Inspect360_Maintenance_Cursor_Implementation_Brief.md` |
| **README** | `docs/quotes_invoicing/Inspect360_Maintenance_UI_Aligned/README_START_HERE.md` |
| **Handover** | `.../Inspect360_Maintenance_Process_Flow_Developer_Handover.docx` (reviewed through the extracted HTML in `..._DOCX_FILE_EXtracted/`) |
| **Prototype** | `.../Inspect360_Maintenance_Screen_Prototype.html` and `screens/*.png` |
| **HMO screenshot** | `.../Inspect360_HMO_Overview_UI_Reference.png` |
| **Flow PNG** | `.../Inspect360_Maintenance_Process_Flow.png` |
| **Ref-00 … Ref-11** | `docs/quotes_invoicing/quotes_invoicing_of_similar_platform/00_…md` to `11_…md` (the HeyTeam reference) |

Line numbers such as `Brief L144` refer to lines in the Brief markdown file.

### 1.2 Verification labels

Every finding about the codebase carries one of these labels:

- **Verified (code):** read directly in the source at the cited location.
- **Inferred (code):** follows from reading the code, but was not exercised against a running server or database. These should be confirmed with a quick manual test before being relied on.
- **Unverified:** could not be checked from the repository (for example production data, hosting topology or business intent).

### 1.3 Severity scale

| Severity | Meaning |
|---|---|
| **Critical** | Would cause an incorrect migration, data loss, a security/financial-data leak, or a fundamental redesign if not resolved before implementation. |
| **High** | Would cause significant rework or break an existing workflow if implemented as written. |
| **Medium** | Ambiguity or mismatch that needs a decision but has a contained impact. |
| **Low** | Cosmetic, naming or documentation issue. |

---

## 2. Executive summary

The primary specification is a **full re-design of the maintenance module**, of which Quotes & Invoicing is only one part. Much of it assumes features that do not exist in Inspect360 (maintenance admin/engineer/finance roles, appointment scheduling, team broadcast offers, an audit log, a notification outbox, signed media URLs, virus scanning, a work-order detail page, an offline engineer PWA). The spec's guiding instruction to "reuse existing" functionality therefore cannot be followed for most of those items; they would all be new builds.

The reference implementation (HeyTeam) is a **different kind of product**: the organisation quotes and invoices *its own customers* and collects money through Stripe. Inspect360's specification describes the opposite flow: *contractors* quote and invoice *the organisation*, which approves them and only tracks payment. The reference's calculation, versioning, lifecycle-helper and audit patterns are reusable; its customer-facing, Stripe and chasing features are not.

The ten issues that most need a decision before any implementation starts:

1. **QI-A01 (Critical):** Accounts-payable (spec) versus accounts-receivable (reference): which direction(s) is the product actually building?
2. **QI-A02 (High):** Is this project Quotes & Invoicing only, or the whole maintenance re-architecture described in the Brief?
3. **QI-B01 (Critical):** Tables `invoices`, `quotations`, `quotation_requests` and `credit_notes` already exist for SaaS subscription billing. The Brief's suggested table names collide.
4. **QI-B02 (Critical):** Deleting a maintenance request hard-deletes all its work orders and their children. Any linked quote or invoice would be destroyed or orphaned.
5. **QI-C02 (Critical, inferred):** Tenant users appear to be able to read every work order in their organisation (including cost fields) through existing endpoints. Adding quote/invoice amounts on top of this would leak financial data.
6. **QI-C03 (Critical):** Every uploaded object is made public by `PUT /api/objects/set-acl`. Contractor invoice PDFs would be readable by anyone with the URL.
7. **QI-C01 (Critical):** None of the spec's roles (Maintenance Admin, Engineer, Finance/Approver, Eco Admin as an org role) exist. Inspect360 has only `owner`, `clerk`, `compliance`, `tenant`, `contractor`.
8. **QI-D01 (High):** Work orders are completed directly by the assignee, gated by a **mandatory** customer signature, with no admin review. The spec requires admin acceptance before invoicing and calls tenant acknowledgement optional.
9. **QI-G01 / QI-G02 (High):** No tax configuration exists, and the currency has three conflicting sources in the codebase.
10. **QI-H01 (High):** The "existing Inspect360 HMO overview" screenshot is itself a design prototype (it carries the "Interactive design concept" banner). The live sidebar, header and colour tokens differ from it.

A consolidated decision list is in [Section 14](#14-decision-register).

---

## 3. Scope and framing

### QI-A01 — The reference platform and the Inspect360 spec describe opposite money flows

- **Severity:** Critical
- **Specification reference:** Brief §1 "In scope" (L75–76), §5.3 (L183–184), §5.6 (L192–193), §12 (L303–309); Ref-00 §1 "System overview" and §5 "End-to-end happy path"; Ref-06 (customer quote interactions); Ref-09 (Stripe Connect).
- **What the specification claims or assumes:** The Brief describes an engineer or external contractor *preparing* a quote that an internal approver *approves*, and an external contractor *submitting* an invoice that admin/finance *approves* and whose payment is *tracked but not executed* ("Actual payment **not** executed by Inspect360 v1", L193). The reference describes the organisation *sending* quotes to *customers*, who accept them via a public link, then the organisation *issuing* invoices and *collecting* payment through Stripe Connect.
- **Actual Inspect360 implementation:** Neither flow exists for maintenance (Verified: no maintenance quote/invoice code anywhere outside `docs/`; see QI-B01 for the unrelated SaaS billing tables). The only maintenance money fields are `work_orders.cost_estimate` and `work_orders.cost_actual` (`shared/schema.ts` L1623–1625).
- **Discrepancy:** The reference is accounts-receivable; the Brief is accounts-payable. Statuses, actors, permissions, numbering, PDFs and notifications differ fundamentally between the two. The reference cannot be ported as a module; only individual patterns can be adapted (see [Section 13](#13-reference-implementation-what-can-and-cannot-be-adapted)).
- **Impact:** If developers follow the reference's phase files literally, they will build customer share links, Stripe Checkout, invoice chasing and credit notes that the Brief explicitly puts out of scope, and will model the counterparty as a "customer" instead of a contractor.
- **Recommended correction:** State explicitly in the implementation plan that v1 is **accounts-payable only** (contractor → organisation), and use the reference only for: line-item maths, lifecycle transition helper, versioning, status history/audit tables, reference-number allocation and PDF rendering.
- **Decision required:**
  1. Is v1 strictly accounts-payable (contractor quotes and invoices to the organisation)?
  2. Is there any accounts-receivable need now or later, for example re-charging a landlord (`properties.landlord_contact_id`, `contacts.type = 'landlord'`) or a tenant (comparison-report `liability_decision`) for a repair? If yes, it should be a separate phase.

### QI-A02 — The primary spec is a full maintenance re-architecture, not a Quotes & Invoicing feature

- **Severity:** High
- **Specification reference:** Brief §1 "In scope" (L75–76), §4 (L139–165), §8 (L249–259), §10 (L271–292), §15 (L331–356), §16 phases A–F (L359–373); Handover "Developer implementation order".
- **What the specification claims or assumes:** One release delivering tenant/inspector reporting, triage, team broadcast with atomic first-accept, appointments with tenant confirmation, engineer PWA with offline evidence, admin completion review, quotes, invoices, messaging, a notification outbox, a rules engine and 25 acceptance tests.
- **Actual Inspect360 implementation:** Request reporting, AI-assisted tenant reporting, direct team-member assignment, completion checklists, customer signature and certificate upload already exist (see [`IMPLEMENTATION_PREREQUISITES.md` §3](IMPLEMENTATION_PREREQUISITES.md#3-existing-functionality-that-can-be-reused)). Broadcast offers, appointments, before/after evidence, admin review, messaging, outbox and rules do not exist (Verified: no tables, routes or UI found; mobile audit found no appointment, scheduling or push-notification code).
- **Discrepancy:** Of the 25 acceptance tests in Brief §15, only tests 10–12, 15 and 17–20 are directly about quotes/invoices. Tests 1–9, 13–14, 16 and 21–25 depend on non-financial features that do not exist yet.
- **Impact:** Scoping the work as "Quotes & Invoicing" while accepting the Brief's acceptance gate would make release impossible without building the full re-architecture first.
- **Recommended correction:** Split the Brief into (a) a Quotes & Invoicing scope that sits on the current work-order model and (b) a later maintenance-workflow roadmap. Re-baseline acceptance tests to the agreed scope.
- **Decision required:** Which of Brief Phases A–F are in scope for this project? Proposed: Phase C quote/approval and Phase E invoice/payment tracking, plus the minimum of Phase A (roles, audit, guarded transitions) needed to support them.

### QI-A03 — "Preserves the original maintenance process" refers to a previous spec, not to the live app

- **Severity:** Low
- **Specification reference:** README L4 ("preserves the original maintenance process, workflow, security rules and 25 functional tests").
- **What the specification claims or assumes:** That an "original" process is being preserved.
- **Actual Inspect360 implementation:** No v1 of this specification exists in the repository (Verified: only the v2 files are present under `docs/quotes_invoicing/`). The live maintenance process (open → work order → assignee completes with signature) differs materially from the Brief.
- **Discrepancy:** Readers could assume the Brief describes how Inspect360 works today.
- **Impact:** Misleading during review; may cause existing behaviour to be treated as a bug.
- **Recommended correction:** Treat "original" as "previous spec version". Use [`IMPLEMENTATION_PREREQUISITES.md` §3](IMPLEMENTATION_PREREQUISITES.md#3-existing-functionality-that-can-be-reused) as the description of current behaviour.
- **Decision required:** None.

---

## 4. Data model and migrations

### QI-B01 — Suggested table, type and route names collide with SaaS billing

- **Severity:** Critical
- **Specification reference:** Brief §6 table rows `quotes` + `quote_items` and `invoices` + `invoice_items` (L209, L213); Brief §7 routes (L231–242); Ref-01 §3.6–3.10.
- **What the specification claims or assumes:** New tables named `quotes`, `quote_items`, `invoices`, `invoice_items`. The Brief says names are suggestions (L3), but gives no warning about collisions.
- **Actual Inspect360 implementation (Verified):**
  - `shared/schema.ts` L3650 `invoices` (SaaS subscription invoices, keyed to `instance_subscription_id`, globally unique `invoice_number`).
  - L3673 `credit_notes` referencing `invoices.id`.
  - L3690 `quotation_requests` and L3704 `quotations` (plan/inspection-credit quotations created by platform admins).
  - TypeScript exports `Invoice`, `InsertInvoice`, `CreditNote`, `Quotation` (L3729–3737, and `Invoice`/`CreditNote` exported a second time at L3793–3796).
  - Routes `POST /api/quotations/request`, `GET /api/quotations/pending`, `/api/quotations/:id/cancel|decline` (`server/routes.ts` L3994–4151), `/api/admin/quotations/*` (L22086–22447), `GET /api/billing/v2/invoices` (`server/billing/registerBillingRoutes.ts` L273).
- **Discrepancy:** A migration creating `invoices` would fail (or, with `IF NOT EXISTS`, silently skip and leave the wrong table in place). A Drizzle definition named `invoices` would clash with the existing export. Routes under `/api/quotations` would intercept SaaS calls.
- **Impact:** Broken migrations; risk of SaaS billing code reading maintenance rows or vice versa; confusing type imports.
- **Recommended correction:** Use a distinct, maintenance-scoped namespace, for example `maintenance_quotes`, `maintenance_quote_lines`, `maintenance_invoices` (or `contractor_invoices`), `maintenance_invoice_lines`, with TypeScript names `MaintenanceQuote`, `ContractorInvoice`, and routes under `/api/work-orders/:id/quotes` and `/api/work-orders/:id/invoices` (see QI-I05 for why the `/api/work-orders` prefix matters).
- **Decision required:** Approve the naming convention for tables, types and routes.

### QI-B02 — Deleting a request or work order hard-deletes everything beneath it

- **Severity:** Critical
- **Specification reference:** Brief §1 "records … retained" (L72), §5.7 (L195–196), §14 "immutable audit events" (L326); Handover "Evidence and audit".
- **What the specification claims or assumes:** A permanent work-order record with immutable approvals, quotes and invoices.
- **Actual Inspect360 implementation (Verified):**
  - `storage.deleteMaintenanceRequest` (`server/storage.ts` L1674–1695) loops over every linked work order and calls `deleteWorkOrder`.
  - `storage.deleteWorkOrder` (L2792–2804) hard-deletes `work_logs`, `work_order_completion_checklist_responses`, `work_order_certificates` and the `work_orders` row.
  - `DELETE /api/maintenance/:id` is allowed for `owner` **and** `clerk` (`server/routes.ts` L15411); `DELETE /api/work-orders/:id` likewise (L18012).
  - No maintenance table declares a foreign key (`shared/schema.ts` L1338–1368, L1614–1640, L1654–1731 use plain `varchar` ids without `.references()`).
- **Discrepancy:** Nothing in the current model can be "permanent". A clerk could delete a request with an approved quote and submitted contractor invoice.
- **Impact:** Financial data loss and orphaned rows; audit trail broken.
- **Recommended correction:** Before adding financial tables: (a) block deletion of a work order or request that has any quote or invoice, (b) prefer archive/cancel over delete for work orders, (c) declare new financial tables with `ON DELETE RESTRICT` foreign keys to `work_orders`, and (d) extend `deleteWorkOrder` to refuse rather than cascade.
- **Decision required:**
  1. Should work orders with financial documents ever be deletable? If yes, by whom?
  2. Should clerks keep delete rights on requests and work orders?

### QI-B03 — Brief §6 `work_orders` columns do not match the existing table

- **Severity:** High
- **Specification reference:** Brief §6, `work_orders` row (L205).
- **What the specification claims or assumes:** Columns `reference`, `request_id`, `property_id`, `unit_id`, `asset_id`, `team_id`, `assignee_id`, `work_status`, `financial_status`, `priority`, `preapproval_policy_id`, `approved_quote_id`, `estimated_cost`, `actual_cost`, `version`, `closed_at`.
- **Actual Inspect360 implementation (Verified, `shared/schema.ts` L1614–1640):**

  | Brief column | Existing equivalent |
  |---|---|
  | `request_id` | `maintenance_request_id` (NOT NULL) |
  | `team_id` | `team_id` |
  | `assignee_id` | Two columns: `assigned_to_id` (user id, or contact id when the contact has no linked user) and `contractor_id` (contact id). Resolved by `resolveWorkOrderAssigneeIds` (`server/workOrderAccess.ts` L140–152). |
  | `work_status` | `status` using Postgres enum `work_order_status` (`assigned`, `in_progress`, `waiting_parts`, `completed`, `rejected`, L40) |
  | `estimated_cost` / `actual_cost` | `cost_estimate` / `cost_actual`, **integer minor units** |
  | `closed_at` | Only `completed_at` |
  | `property_id`, `unit_id`, `asset_id`, `priority` | Not on the work order; property/block and priority live on the parent request |
  | `reference`, `financial_status`, `preapproval_policy_id`, `approved_quote_id`, `version` | Do not exist |
  | (not in Brief) | `sla_due`, `variation_notes`, `completion_checklist_id`, `completion_checklist_snapshot_json`, `customer_signature_json`, `customer_signed_at` exist and are in use |

- **Discrepancy:** The Brief's table is a fresh design, not a mapping. Adding `property_id`/`priority` to work orders would duplicate data held on the request.
- **Impact:** A developer adding the Brief's columns literally would create duplicated, drifting data and might replace `assigned_to_id`/`contractor_id`, breaking `canAccessWorkOrder` and the mobile app.
- **Recommended correction:** Add only what Quotes & Invoicing needs (e.g. `reference`, `approved_quote_id`, an authorisation/financial status — see QI-D03 and QI-F05). Keep `assigned_to_id`/`contractor_id`. Derive property and priority through the request.
- **Decision required:** Confirm that work orders keep reading property, block and priority from the parent request.

### QI-B04 — Brief §6 `maintenance_requests` columns and property hierarchy do not match

- **Severity:** High
- **Specification reference:** Brief §6, `maintenance_requests` row (L204); §5.1 "unit, tenant, room" (L171); §5.7 "property > unit > room/asset" (L196); §0.3 breadcrumb `Properties > 39 Park Avenue > Maintenance > Quotation` (L41).
- **What the specification claims or assumes:** `unit_id`, `room_id`, `asset_id`, `inspection_point_id`, `reporter_role`, `category`, `request_status`, `merged_into_id`, with a property → unit → room hierarchy.
- **Actual Inspect360 implementation (Verified, `shared/schema.ts` L1338–1368):** `property_id` (nullable), `block_id` (nullable), `reported_by`, `assigned_to`, `status` (enum `open`/`in_progress`/`completed`/`closed`), `priority` (free text `low`/`medium`/`high`/`urgent`), `source` enum, `inspection_id`, `inspection_entry_id`, Fixflo columns, HMO verification columns. Inspect360's hierarchy is **block → property → `property_rooms`** (L436, L524); there is no units table, and a "property" is effectively the unit. Assets live in `asset_inventory` (L1733). There is no `category` column (team categories are free text in `team_categories`, L2016).
- **Discrepancy:** `unit_id` has no target. Requests can be block-level with no property at all, so a "Properties > …" breadcrumb cannot always be built.
- **Impact:** Wrong foreign-key targets in migrations; broken breadcrumbs and property history for block-level jobs.
- **Recommended correction:** Map Brief `property` → Inspect360 `block` (when present), Brief `unit` → Inspect360 `property`, Brief `room` → `property_rooms`, Brief `inspection_point_id` → `inspection_entry_id`. Room/asset/category columns are not needed for Quotes & Invoicing and should be deferred.
- **Decision required:** Confirm the hierarchy mapping, and how quote/invoice screens should present block-level work orders.

### QI-B05 — Replacing status enums would break shipped clients and existing hooks

- **Severity:** High
- **Specification reference:** Brief §4 (L141–146) "Keep separate dimensions" with 5 request statuses, 17 work statuses and 10 financial statuses.
- **What the specification claims or assumes:** New status vocabularies replacing the current flat lists.
- **Actual Inspect360 implementation (Verified):**
  - Postgres enums `maintenance_status` and `work_order_status` (`shared/schema.ts` L37, L40).
  - The mobile app hardcodes `assigned`, `in_progress`, `waiting_parts`, `completed`, `rejected` (`mobile/src/screens/workOrders/WorkOrderDetailScreen.tsx` L61–71).
  - `isAllowedWorkOrderStatus` (`server/workOrderAccess.ts` L69–83) whitelists the same values.
  - The HMO hook `onWorkOrderCompletedForHmo` fires on `completed` (`server/routes.ts` L17850–17861), and `assertHmoMaintenanceCloseable` checks request `completed`/`closed` (`server/hmo/maintenanceVerification.ts` L75–94).
  - The Fixflo webhook maps external statuses to request `completed`/`in_progress` (`server/services/fixflo-webhook-processor.ts` L120–126, L184–190).
  - The owner Work Orders board (`client/src/pages/Analytics.tsx` L470–513) has columns per existing status.
- **Discrepancy:** Renaming or removing enum values breaks mobile builds already installed on devices, the HMO workflow, Fixflo sync and the Analytics board.
- **Impact:** Regression across several existing features; Postgres enum values cannot be dropped without recreating the type.
- **Recommended correction:** Keep existing enum values. Represent the quote/authorisation gate and financial state as **new, separate columns** (see QI-D03, QI-F05), or add enum values only additively (`ALTER TYPE … ADD VALUE`). Keep mobile clients tolerant of unknown statuses.
- **Decision required:** Approve an additive status strategy, and set a minimum mobile app version policy if any new status can be returned to mobile clients.

### QI-B06 — Money representation conflicts between the spec, the reference and the codebase

- **Severity:** High
- **Specification reference:** Brief §6 L219 "Use **numeric/decimal money** … never use JS floating-point"; Ref-01 §1 "Integer **minor units** named `*Pence`"; Ref-03 §2 (`Math.round` rules).
- **What the specification claims or assumes:** The Brief requires decimal storage; the reference uses integers in minor units.
- **Actual Inspect360 implementation (Verified):**
  - `work_orders.cost_estimate` / `cost_actual`: `integer`, "In cents" (`shared/schema.ts` L1623–1624). Web converts with `Math.round(parseFloat(x) * 100)` (`client/src/pages/Maintenance.tsx` L2350; `Analytics.tsx` L380).
  - `property_expenses.amount`: `numeric(12,2)` (L693). `tenant_assignments.monthly_rent`: `numeric(10,2)` (L575).
  - SaaS billing: integer minor units with pure helpers (`shared/billingFinancialMath.ts` L1–3).
  - No decimal library in `package.json` (Verified: no `decimal.js`, `big.js`, `dinero.js`).
- **Discrepancy:** The Brief and reference disagree; the codebase uses both forms.
- **Impact:** Mixed units would produce ×100 errors when comparing quote totals with `cost_estimate`, in reports, and in three-way matching.
- **Recommended correction:** Store quote/invoice money as **integer minor units** (consistent with `work_orders` costs and SaaS billing, and safe without a decimal library), with an explicit `currency` and stored tax-rate snapshot. Treat the Brief's "numeric/decimal" as satisfied by "no floating-point authority". Define one rounding rule (per line, half-up) and test it.
- **Decision required:** Approve integer minor units (or, if decimal is preferred, approve adding a decimal library and converting existing cost fields).

### QI-B07 — "One request → one primary work order" versus the existing one-to-many model

- **Severity:** Medium
- **Specification reference:** Brief §1 L67; §6 `maintenance_requests.merged_into_id` (L204).
- **What the specification claims or assumes:** One primary work order per request, with linked quotes/invoices.
- **Actual Inspect360 implementation (Verified):** `work_orders.maintenance_request_id` has no uniqueness constraint; the "Create Work Order" button on a request card can be used repeatedly (`client/src/pages/Maintenance.tsx` L1788–1801). Existing data may already contain requests with several work orders (**Unverified** — needs a read-only query, see prerequisites §6).
- **Discrepancy:** The Brief's model cannot be enforced without deciding what happens to existing multi-work-order requests.
- **Impact:** Quotes attached to the "request" would be ambiguous; property cost totals could double count.
- **Recommended correction:** Attach quotes and invoices to the **work order**, not the request. Do not add a uniqueness constraint in this project.
- **Decision required:** Is "one primary work order per request" a product rule to enforce later, or just a description?

### QI-B08 — Migration mechanism differs from what the spec implies

- **Severity:** Medium
- **Specification reference:** Brief §16 "data migrations … safe migrations" (L361–363); Brief §17 handoff "migration commands".
- **What the specification claims or assumes:** A generic migration toolchain.
- **Actual Inspect360 implementation (Verified):** Schema changes are hand-written, idempotent SQL files in `server/migrations/` (e.g. `addWorkOrderChecklistSignature.sql` uses `ADD COLUMN IF NOT EXISTS` and ends with a `GRANT … TO inspect360` note). Per the workspace rule, they are applied on the Contabo host as user `creativecloud`, and the app role `inspect360` must then be granted access. `drizzle.config.ts` and a `db:push` script exist, but `migrations/meta/_journal.json` only has snapshots `0000`–`0001`, so Drizzle's migration history is not the source of truth.
- **Discrepancy:** Running `drizzle-kit push` against shared databases could attempt to reconcile unrelated drift (**Inferred**).
- **Impact:** Risk of unintended schema changes in dev/prod if the wrong tool is used.
- **Recommended correction:** Ship each change as an idempotent SQL file in `server/migrations/`, update `shared/schema.ts` to match, apply as `creativecloud`, and include explicit `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO inspect360;` for every new table.
- **Decision required:** None beyond confirming this process for the project.

### QI-B09 — No foreign keys exist on maintenance tables; adding them may fail on existing data

- **Severity:** Medium
- **Specification reference:** Brief §6 L219 "Foreign-key and organisation checks must be enforced in service layer and database where possible."
- **What the specification claims or assumes:** Database-enforced relationships.
- **Actual Inspect360 implementation (Verified):** None of `maintenance_requests`, `work_orders`, `work_logs`, `work_order_completion_checklist_responses`, `work_order_certificates`, `teams` or `team_members` declare foreign keys. Organisation scoping is done in route handlers.
- **Discrepancy:** Retro-fitting FKs to existing tables requires the data to be clean; this is **Unverified**.
- **Impact:** A migration adding FKs to existing tables could fail in production.
- **Recommended correction:** Put FKs on the **new** financial tables only (pointing at `work_orders.id`, `contacts.id`, `users.id`). Run a read-only orphan audit before any FK is added to an existing table.
- **Decision required:** None.

### QI-B10 — No human-readable work-order, quote or invoice references exist

- **Severity:** Medium
- **Specification reference:** Brief §5.3 "quote number and version" (L184); Prototype references `WO-2026-0142`, `Q-2026-0089`; Ref-04 §3 (per-org monotonic `quoteNumber`).
- **What the specification claims or assumes:** Readable references on all documents.
- **Actual Inspect360 implementation (Verified):** `work_orders.id` and `maintenance_requests.id` are UUIDs (`gen_random_uuid()`); no reference/number column or sequence exists.
- **Discrepancy:** The Prototype's references would have to be generated.
- **Impact:** Needs a concurrency-safe per-organisation sequence; adding `reference` to existing work orders needs a backfill.
- **Recommended correction:** Add a per-organisation counter table updated with `SELECT … FOR UPDATE` (the pattern is already used in `server/billingService.ts` L13–22). Decide the format (e.g. `WO-{YYYY}-{seq}`, `Q-{YYYY}-{seq}` with `v{n}`).
- **Decision required:** Reference formats, whether numbering resets yearly, and whether existing work orders are backfilled.

---

## 5. Roles, permissions and security

### QI-C01 — The spec's roles do not exist in Inspect360

- **Severity:** Critical
- **Specification reference:** Brief §3 role table (L127–135); Handover §04 "Role boundaries"; Brief §9 "approver limits" (L263–269).
- **What the specification claims or assumes:** Tenant, Inspector, Maintenance Admin, Maintenance Engineer (employee), External Contractor, Finance/Approver and Eco/System Admin, each with distinct permissions, plus per-approver financial limits.
- **Actual Inspect360 implementation (Verified):** `user_role` enum has only `owner`, `clerk`, `compliance`, `tenant`, `contractor` (`shared/schema.ts` L33). Display labels: "Owner/Operator", "Inventory Clerk / Inspector", "Compliance Officer", "Maintenance Contractor", "Tenant" (`shared/roleLabels.ts` L4–13). Authorisation is role-name checks (`requireRole`, `server/auth.ts` L913–927). There are no permissions, no per-user limits, and no finance role. "Eco Admin" is the **platform** super-admin (`admin_users`, `isAdminAuthenticated`, e.g. `server/routes.ts` L22086; `client/src/components/admin-layout.tsx` L36), not an organisation role.

  | Brief role | Closest Inspect360 equivalent | Gap |
  |---|---|---|
  | Tenant | `tenant` | Exists |
  | Inspector | `clerk` | Exists; clerks cannot see the Work Orders tab on web or mobile |
  | Maintenance Admin | `owner` | No dedicated role; every owner is effectively admin |
  | Maintenance Engineer (employee) | `clerk` assigned via a team, or `contractor` user | No "internal vs external" flag |
  | External Contractor | `contractor` user, **or** a `contacts` row with `type = 'contractor'` and no login | See QI-C04 |
  | Finance / Approver | none (closest: `owner`; `compliance` has read access) | New |
  | Eco/System Admin | platform `admin_users` | Must **not** configure organisation settings |

- **Discrepancy:** Every permission rule in the Brief must be re-expressed in terms of the five existing roles, or new roles/permissions must be added.
- **Impact:** Adding a new enum role affects login (`mobile/src/contexts/AuthContext.tsx` L33 whitelists mobile roles), sidebar gating, `isAllowedWorkOrderStatus`, `listScopeForUser` and every `requireRole` call.
- **Recommended correction:** For v1, avoid a new enum role. Add a small organisation-level **permission/limit table** (e.g. `maintenance_approvers`: user id, max approvable amount, can-approve-invoices, can-record-payments) that grants capabilities to existing `owner` (and optionally `compliance`) users. Reassign the Brief's "Eco Admin" duties to organisation `owner`s.
- **Decision required:**
  1. Who may approve quotes and invoices: all owners, or named users with limits?
  2. Is a Finance capability needed in v1? If so, which existing role receives it?
  3. Confirm platform Eco Admin has no part in organisation maintenance configuration.

### QI-C02 — Existing endpoints appear to expose all work orders (with costs) to tenants

- **Severity:** Critical
- **Specification reference:** Brief §3 Tenant "Cannot … see internal pricing" (L129); §14 (L323–325); §15 tests 3, 18, 24 (L335, L350, L356).
- **What the specification claims or assumes:** Tenant isolation already exists and will be extended.
- **Actual Inspect360 implementation (Inferred from code, not runtime-tested):**
  - `listScopeForUser` returns `"org"` for every role except `clerk`/`contractor`, so `tenant` gets organisation scope (`server/workOrderAccess.ts` L21–24). `canAccessWorkOrder` then returns `true` for any same-organisation tenant (L49–58). The unit tests cover owner, compliance, clerk and contractor but not tenant (`server/workOrderAccess.test.ts` L82–83).
  - `GET /api/work-orders` and `GET /api/work-orders/:id` have no `requireRole` (`server/routes.ts` L17752, L17785) and return full rows including `cost_estimate`, `cost_actual`, `variation_notes`.
  - `PUT /api/work-orders/:id/completion-checklist/items/:itemId` and `PUT /api/work-orders/:id/customer-signature` have no role restriction either (L17900, L17944), so a tenant could write to them.
  - `GET /api/maintenance` and `GET /api/maintenance/:id` return all organisation requests to any authenticated user of that organisation, including tenants and contractors (L15349–15409). Tenants have `organization_id` set (required by `POST /api/tenant/maintenance-requests`, L32693).
  - `isAuthenticated` performs no role filtering (`server/auth.ts` L814–910).
- **Discrepancy:** The spec assumes isolation that the code does not appear to enforce.
- **Impact:** Any quote or invoice data joined onto work-order or request responses would be readable by tenants. This is a pre-existing exposure, independent of this project.
- **Recommended correction:** Before any financial field is added: restrict `listScopeForUser`/`canAccessWorkOrder` to explicit roles (deny `tenant`), add `requireRole` to work-order and request read/write routes, and add tenant cases to `server/workOrderAccess.test.ts`. Expose quotes/invoices only through dedicated, role-filtered endpoints.
- **Decision required:** Confirm by manual test (tenant session calling `GET /api/work-orders`). Decide whether this fix ships as a separate security patch ahead of Quotes & Invoicing.

### QI-C03 — Uploaded files are public and unscanned; signed URLs do not exist

- **Severity:** Critical
- **Specification reference:** Brief §13 "Document / photo service: reuse existing storage, secure signed URLs, virus scan, upload size settings and retention rules" (L318); §14 (L327); §5.6 "invoice file attachment" (L193).
- **What the specification claims or assumes:** Secure signed URLs and virus scanning already exist.
- **Actual Inspect360 implementation (Verified):**
  - Storage is local disk with a JSON metadata sidecar (`server/objectStorage.ts` L54–136, `LOCAL_STORAGE_DIR`).
  - The only ACL is `{ owner, visibility }` (`server/objectAcl.ts` L11–14). Private objects are readable only by the uploader (L77–81), so there is no organisation-level sharing.
  - `PUT /api/objects/set-acl` always sets `visibility: "public"` (`server/routes.ts` L20997–21013).
  - `GET /objects/*` has no authentication and serves public objects to anyone (`server/routes.ts` L20232–20234 with `serveObjectEntity` L20188–20230).
  - No signed-URL mechanism exists (`getObjectEntityUploadURL` returns a direct upload endpoint, `objectStorage.ts` L257–258).
  - Malware scanning is a documented stub that is "explicitly deferred" (`server/hmo/documentPipeline.ts` L193–199).
- **Discrepancy:** None of the claimed security features exist.
- **Impact:** Contractor invoice PDFs, quote attachments and evidence photos would be accessible to anyone with the URL. If the "private" visibility is used instead, admins could not open files uploaded by contractors.
- **Recommended correction:** Add an organisation-scoped access check for financial attachments (e.g. serve them only through an authenticated `/api/work-orders/:id/…/attachments/:fileId` route that checks work-order access and role), and do not call `set-acl` with public visibility for them. Track virus scanning as a separate decision.
- **Decision required:** Is an organisation-scoped private file route acceptable for v1? Is malware scanning a release blocker?

### QI-C04 — External contractors may not have a login

- **Severity:** High
- **Specification reference:** Brief §3 External Contractor "submit quote and … invoice" (L133); §5.6 (L193); Handover step 9.
- **What the specification claims or assumes:** Contractors use the app to submit quotes and invoices.
- **Actual Inspect360 implementation (Verified):** Team members are either users (`team_members.user_id`) or contacts (`team_members.contact_id`) (`shared/schema.ts` L1995–2006). A contractor contact may have no `linked_user_id` (L399). When assigning, `assignedToId` falls back to the contact id (`server/workOrderAccess.ts` L146–150), and the only contractor interaction is an email (`server/routes.ts` L17692–17740; `sendContractorWorkOrderNotification` in `server/resend.ts` L415). Users with role `contractor` can log in and see "My Work Orders".
- **Discrepancy:** Contact-only contractors cannot submit anything.
- **Impact:** A core flow of the spec is impossible for some (possibly most) contractors. **Unverified** how many organisations use contact-only contractors.
- **Recommended correction:** Support two paths in v1: (a) contractor users submit in-app; (b) an owner records a quote/invoice **on behalf of** a contact-only contractor, with the actor recorded. Treat the reference's tokenised share-link pattern (Ref-04 §4, Ref-06) as an optional later phase for contractor self-service without accounts.
- **Decision required:** Which of (a), (b), tokenised link must v1 support?

### QI-C05 — "No self-approval" and approval limits can deadlock small organisations

- **Severity:** High
- **Specification reference:** Brief §3 (L132–134), §4 `awaiting_approval → authorised` "not self-approval" (L155), §9 (L268), §15 test 11 (L343).
- **What the specification claims or assumes:** A separate approver is always available.
- **Actual Inspect360 implementation (Verified):** Only `owner` users act as admins; a single-owner organisation is supported by sign-up. **Unverified:** the distribution of owners per organisation in production.
- **Discrepancy:** If an owner records a quote on behalf of a contractor (QI-C04 path b), the same owner then cannot approve it.
- **Impact:** Blocked jobs in single-owner organisations.
- **Recommended correction:** Define "self" as the person who **prepared** the quote (contractor/engineer) rather than the person who typed it, record both, and allow an organisation setting for single-approver organisations with an audited override.
- **Decision required:** Policy for single-owner organisations and for quotes entered on behalf of contractors.

### QI-C06 — Assignees can already change cost fields freely

- **Severity:** High
- **Specification reference:** Brief §9 "approved version is locked … do not overwrite original approved pricing" (L265–267); §4 "Never permit arbitrary transitions through generic update endpoints" (L165).
- **What the specification claims or assumes:** Cost fields are controlled by approval.
- **Actual Inspect360 implementation (Verified):**
  - `PATCH /api/work-orders/:id` allows `owner`, `clerk`, `contractor` and passes `costEstimate` to `updateWorkOrderFields`, which only restricts reassignment for non-owners (`server/routes.ts` L18030–18106; `server/workOrderCertificateService.ts` L385–428).
  - `PATCH /api/work-orders/:id/cost` lets `owner` or `contractor` set `cost_actual` and `variation_notes` with no validation (`server/routes.ts` L17986–18010; `storage.updateWorkOrderCost` L2778–2790).
  - `POST /api/work-orders` is open to `contractor` as well as `owner` (L17567).
- **Discrepancy:** An approved quote could be contradicted by an assignee editing `cost_estimate` or `cost_actual`.
- **Impact:** Three-way match and reports would use untrusted numbers.
- **Recommended correction:** Once a work order has an approved quote, make `cost_estimate` derived (or read-only) and restrict `cost_actual` writes to the invoice/internal-cost flow. Review whether contractors should create work orders at all.
- **Decision required:** Should `cost_estimate`/`cost_actual` become derived from quotes/invoices, or remain manual fields alongside them?

### QI-C07 — The `compliance` role is not addressed

- **Severity:** Medium
- **Specification reference:** Brief §3 (L127–135) omits it.
- **What the specification claims or assumes:** n/a.
- **Actual Inspect360 implementation (Verified):** `compliance` has organisation-wide work-order read access (`server/workOrderAccess.ts` L21–28) and can confirm certificates (`server/routes.ts` L18177), but cannot change status (L17832).
- **Discrepancy:** It is unclear whether compliance officers should see quote/invoice amounts.
- **Impact:** Either a leak or a missing permission.
- **Recommended correction:** Decide explicitly; default to read-only, no amounts, unless approved.
- **Decision required:** Compliance role visibility of quotes and invoices.

### QI-C08 — No maintenance audit log exists

- **Severity:** High
- **Specification reference:** Brief §6 `maintenance_events` (L215); §14 "append immutable audit events" (L326); §5.7 timeline (L196); Prototype "Full activity history".
- **What the specification claims or assumes:** An append-only audit trail.
- **Actual Inspect360 implementation (Verified):** No maintenance audit/event table. `work_logs` has `note`, `photos`, `time_spent_minutes`, `created_at` but **no author column** (`shared/schema.ts` L1716–1723). Status changes overwrite the row without history (`storage.updateWorkOrderStatus`, L2710–2722). Audit tables exist only for other domains (HMO, billing, `quotation_activity_log` for SaaS quotations, `entitlement_events`).
- **Discrepancy:** The activity timeline and "immutable approvals" have no data source.
- **Impact:** Quote/invoice approval history cannot be shown or proven.
- **Recommended correction:** Add a work-order event table (append-only by convention: no update/delete routes; optionally revoke `UPDATE, DELETE` from the `inspect360` role on it). Write events for every quote/invoice transition. Historical events before go-live will not exist.
- **Decision required:** Should the audit table be protected at the database-grant level?

---

## 6. Workflow and state machine

### QI-D01 — Completion has no admin review and requires a customer signature

- **Severity:** High
- **Specification reference:** Brief §4 `in_progress → awaiting_completion_review → completed` (L159–161); §5.5 "Optional tenant acknowledgement (not a substitute for admin sign-off)" (L190); §12 invoice "linked to an **accepted/completed** work order" (L305); Prototype completion screen "Submit for review".
- **What the specification claims or assumes:** The engineer submits, an admin accepts, then the contractor may invoice. Tenant acknowledgement is optional.
- **Actual Inspect360 implementation (Verified):** The assignee sets `completed` directly. `assertWorkOrderReadyToComplete` blocks completion unless required checklist items are done **and** a customer signature image exists (`server/workOrderCompletionGate.ts` L16–51, called at `server/routes.ts` L17836–17846 and L18074–18086). Web and mobile both force the signature pad (`client/src/components/WorkOrderCompleteDialog.tsx`; `mobile/src/screens/workOrders/WorkOrderCompleteScreen.tsx` L118–128). The only "review" is HMO verification for HMO-sourced requests.
- **Discrepancy:** The spec reverses the existing rule (signature mandatory → optional) and inserts a review step that does not exist.
- **Impact:** Removing the signature gate changes a shipped workflow; adding review changes what "completed" means for the HMO hook, Analytics, PropertyHistoryReport and mobile.
- **Recommended correction:** For Quotes & Invoicing, gate invoice creation on the **existing** `completed` status (optionally plus an owner "accept" flag on the work order) rather than introducing a new review status. Keep the signature gate unless product decides otherwise.
- **Decision required:**
  1. Is admin acceptance of completion required before a contractor can invoice?
  2. Should the customer-signature gate stay mandatory?

### QI-D02 — Status transitions are not guarded

- **Severity:** High
- **Specification reference:** Brief §4 (L148–165); §1 "All transitions enforce guards on the **server**" (L70).
- **What the specification claims or assumes:** A server-side transition service exists or will be extended.
- **Actual Inspect360 implementation (Verified):** `isAllowedWorkOrderStatus` checks only the role, not the current state (`server/workOrderAccess.ts` L72–83). Status can be changed through two endpoints, `PATCH /api/work-orders/:id/status` and the generic `PATCH /api/work-orders/:id` (`server/routes.ts` L17809, L18030). A work order can move from `completed` back to `in_progress` or to `rejected` (Inferred). Request status is changed through the generic `PATCH /api/maintenance/:id` (L15432–15507).
- **Discrepancy:** No transition matrix exists.
- **Impact:** Quote gates (e.g. "cannot start before approval") would be bypassable through the generic endpoint.
- **Recommended correction:** Introduce a single transition helper for work orders (modelled on Ref-04 `assertQuoteTransition` / Ref-07 `assertInvoiceStatusTransition`) and route both PATCH endpoints through it. Define separate matrices for quotes and invoices.
- **Decision required:** Which work-order transitions must be blocked by quote state in v1 (minimum: `assigned → in_progress` when authorisation is required)?

### QI-D03 — The quote/authorisation gate has no place in the current status model

- **Severity:** High
- **Specification reference:** Brief §4 `assigned → awaiting_approval → authorised` and `assigned → authorised` via preapproval (L154–156); §9 (L261–269); Flow PNG step 04.
- **What the specification claims or assumes:** Statuses `awaiting_quote`, `awaiting_approval`, `authorised` and a preapproval policy engine.
- **Actual Inspect360 implementation (Verified):** Work orders are created directly as `assigned` (`shared/schema.ts` L1621 default; mobile sets `status: 'assigned'`, `MaintenanceListScreen.tsx` L334). No preapproval policy, threshold or category rule exists (Settings tabs listed in `client/src/pages/Settings.tsx` L89–101 contain none).
- **Discrepancy:** The spec's gate requires either new statuses (see QI-B05 risk) or a parallel field.
- **Impact:** Choosing new enum values breaks mobile; choosing a parallel field needs UI on web and mobile to explain why "Start" is blocked.
- **Recommended correction:** Add a separate `authorisation_status` (e.g. `not_required`, `quote_required`, `awaiting_approval`, `authorised`, `rejected`) on `work_orders`, leaving `status` untouched. Start with a simple organisation threshold ("quote required above X" or "always/never") rather than the full policy engine in Brief §9.
- **Decision required:**
  1. Is a quote mandatory for all work orders, optional, or threshold-based in v1?
  2. Is per-property / per-category preapproval policy needed in v1?
  3. Is the emergency override (Brief §2 L123) in v1?

### QI-D04 — The spec's own state machine is incomplete

- **Severity:** Medium
- **Specification reference:** Brief §4 status lists (L143–146) versus transition table (L148–163).
- **What the specification claims or assumes:** A complete lifecycle.
- **Actual Inspect360 implementation:** n/a (spec-internal issue).
- **Discrepancy:** The table defines no transitions into or out of `assessment_required`, `awaiting_quote`, `awaiting_appointment`, `on_hold`, `cancelled`; no `offered → awaiting_allocation` on expiry; no path for a rejected quote (`awaiting_approval → ?`); no variation transitions; and no transitions at all for the ten `financial_status` values. `request_status` transitions other than `new → accepted` are missing.
- **Impact:** Developers would invent the missing rules.
- **Recommended correction:** For the agreed scope, write explicit matrices for quote status, invoice status and `authorisation_status` (proposals in [`IMPLEMENTATION_PREREQUISITES.md` §5.4](IMPLEMENTATION_PREREQUISITES.md#54-workflow-adjustments)).
- **Decision required:** Approve the proposed matrices.

### QI-D05 — HMO verification depends on work-order completion

- **Severity:** Medium
- **Specification reference:** Brief §13 "Compliance/HMO dashboard" (L315). Not otherwise addressed.
- **What the specification claims or assumes:** HMO integration is a future feed.
- **Actual Inspect360 implementation (Verified):** Completing a work order for an HMO-sourced request moves the request to `awaiting_verification` (`server/hmo/maintenanceVerification.ts` L16–38, called from `server/routes.ts` L17850–17861). Closing an HMO request is blocked until verified (L75–94; `server/routes.ts` L15486–15498).
- **Discrepancy:** The spec does not mention this existing gate.
- **Impact:** Any change to the meaning or timing of `completed` must keep this hook firing exactly once.
- **Recommended correction:** Leave the hook on the existing `completed` transition. Add a regression test.
- **Decision required:** None.

### QI-D06 — Fixflo already records invoices, outside work orders

- **Severity:** Medium
- **Specification reference:** Brief §1 "Optional Fixflo sync must be feature-gated" (L79); §13 "Existing Fixflo integration" (L317); §17 (L381).
- **What the specification claims or assumes:** A Fixflo contract still needs to be defined.
- **Actual Inspect360 implementation (Verified):** Fixflo is per-organisation (`fixflo_config`, `shared/schema.ts` L1808). Webhooks update **requests**, not work orders: status mapping to `completed`/`in_progress`, contractor name, attachments, and `InvoiceAdded` stores `{amount, invoiceNumber, date, description}` inside `maintenance_requests.ai_analysis_json.fixfloInvoice` (`server/services/fixflo-webhook-processor.ts` L196–234). Retries use in-memory `setTimeout` (L71–78).
- **Discrepancy:** A second invoice source already exists for Fixflo-enabled organisations, in an unstructured field.
- **Impact:** Duplicate or conflicting invoices; Fixflo can mark a request completed while the Inspect360 work order still awaits approval.
- **Recommended correction:** For v1, disable Inspect360 invoice submission on work orders whose request has a `fixflo_issue_id` (or the reverse), and document which system is authoritative.
- **Decision required:** For Fixflo-enabled organisations, is Fixflo or Inspect360 the source of truth for quotes/invoices?

### QI-D07 — Priority vocabularies differ

- **Severity:** Low
- **Specification reference:** Brief §4 `priority`: `emergency`, `urgent`, `routine`, `low` (L146).
- **What the specification claims or assumes:** Four priorities including `emergency` and `routine`.
- **Actual Inspect360 implementation (Verified):** Free-text `low`, `medium`, `high`, `urgent` (`shared/schema.ts` L1348, L1424); tenants may only choose `low`/`medium`/`high` (`server/routes.ts` L32712–32713).
- **Discrepancy:** `emergency` (used by the spec's emergency override) does not exist.
- **Impact:** Threshold or override rules keyed on priority need a mapping.
- **Recommended correction:** Keep existing values; if an emergency override is in scope, treat `urgent` as emergency or add a separate flag.
- **Decision required:** Only if the emergency override is in scope.

---

## 7. Quotes

### QI-E01 — Quote actors and statuses differ between the Brief and the reference

- **Severity:** High
- **Specification reference:** Brief §5.3 (L183–184), §9 (L261–269); Ref-01 §2 quote statuses; Ref-04 §1 transition map; Ref-06.
- **What the specification claims or assumes:** Brief: engineer/contractor drafts and submits; approver approves, rejects or requests revision. Reference: admin drafts and sends; customer accepts, declines or requests changes; admin converts to invoice.
- **Actual Inspect360 implementation:** None.
- **Discrepancy:** Reference statuses `sent`, `accepted`, `declined`, `change_requested`, `converted`, `new_quote_enquiry` describe customer interactions, not internal approval.
- **Impact:** Porting the reference status list would mislabel the workflow.
- **Recommended correction:** Use Inspect360-specific quote statuses, e.g. `draft`, `submitted`, `changes_requested`, `approved`, `rejected`, `superseded`, `withdrawn`, `expired`. Keep the reference's transition-helper pattern.
- **Decision required:** Approve the quote status list.

### QI-E02 — No approval thresholds, preapproval rules or approver limits exist

- **Severity:** High
- **Specification reference:** Brief §9 (L263–269); §17 (L381); Handover §04 "Settings the developer must expose".
- **What the specification claims or assumes:** Policies "configured by organisation/property, issue category, contractor type and maximum authorised amount".
- **Actual Inspect360 implementation (Verified):** No such settings; maintenance-related settings are only "Maintenance Team" (`client/src/components/SettingsTeamsPanel.tsx`), "Completion Checklists" and "Integrations" (Fixflo) (`client/src/pages/Settings.tsx` L89–101).
- **Discrepancy:** Every policy dimension is new.
- **Impact:** Large configuration surface if built as specified.
- **Recommended correction:** v1 minimum: one organisation-level "quote required above amount" (or always/never), and per-approver limits (QI-C01). Defer property/category/contractor-type overrides.
- **Decision required:** Confirm the v1 minimum policy set and the default for existing organisations (recommended default: quotes optional, so existing workflows are unchanged).

### QI-E03 — Versioning and variation rules conflict

- **Severity:** Medium
- **Specification reference:** Brief §5.3 "Approved quote is immutable; variation creates linked version/new approval" (L184), §9 "Quote revisions create versions… A variation beyond approved scope must go through a separate approval event" (L266–267); Ref-04 §3 "Editing a **sent** quote creates `versionNumber + 1` draft; prior version `superseded`".
- **What the specification claims or assumes:** Brief: versions on rejection; variations as separate approvals. Reference: versions on any edit after sending.
- **Actual Inspect360 implementation:** None. Existing `work_orders.variation_notes` is a free-text field with no UI (Verified: only set via `PATCH /cost`).
- **Discrepancy:** It is unclear whether a variation is a new quote version replacing the approved one, or an additional quote whose amount adds to it.
- **Impact:** Determines how "approved total" is computed for invoice matching.
- **Recommended correction:** Model a variation as an **additional quote linked to the approved quote** (type `variation`), approved separately; "authorised total" = approved original + approved variations. Model revisions of an unapproved quote as new versions that supersede the previous one.
- **Decision required:** Approve the variation model.

### QI-E04 — Relationship between quotes and the existing `cost_estimate`

- **Severity:** Medium
- **Specification reference:** Brief §6 `estimated_cost` (L205).
- **What the specification claims or assumes:** An `estimated_cost` field alongside quotes.
- **Actual Inspect360 implementation (Verified):** `cost_estimate` is set at work-order creation and edit, and is shown on web cards (`Maintenance.tsx` L2021–2033), the owner board (`Analytics.tsx` L1254–1256), team/contractor emails (`server/resend.ts` L365–368, L510–513) and property history (`client/src/pages/PropertyHistoryReport.tsx` L786–789).
- **Discrepancy:** Two sources of "estimate" would diverge.
- **Impact:** Reports may show a stale estimate after quote approval.
- **Recommended correction:** On quote approval, write the authorised total into `cost_estimate` and lock manual edits (ties to QI-C06).
- **Decision required:** Approve.

### QI-E05 — Quote expiry semantics are undefined

- **Severity:** Medium
- **Specification reference:** Brief §5.3 "expiry/date" (L184), §9 "a previous authorisation has expired" (L264); Ref-04 §6 expiry job.
- **What the specification claims or assumes:** Quotes can expire; authorisation can expire.
- **Actual Inspect360 implementation:** None. In-process schedulers exist (`server/index.ts` L215–396) and could run an expiry job.
- **Discrepancy:** No rule says whether an **approved** quote can expire, or only a submitted one.
- **Impact:** Work could be blocked mid-job if approved quotes expire.
- **Recommended correction:** Expire only `submitted` quotes past their validity date; approved quotes do not expire in v1.
- **Decision required:** Approve.

### QI-E06 — Line-item categories and units are inconsistent across sources

- **Severity:** Medium
- **Specification reference:** Brief §5.3 "labour, parts, callout, miscellaneous" with unit and taxable flag (L184); Prototype quote table (description, qty, rate only; single VAT line at document level); Ref-01 §2 line types `materials`, `labour`, `subcontractor`, `rental`, `other` and units `hour`, `shift`, `day`, `flat_fee`, `visit`, `m2`.
- **What the specification claims or assumes:** Three different line structures.
- **Actual Inspect360 implementation:** None.
- **Discrepancy:** The Prototype lacks the unit and per-line tax columns the Brief requires.
- **Impact:** UI and schema built from the Prototype would not satisfy the Brief.
- **Recommended correction:** Lines: `category` (`labour`, `materials`, `call_out`, `other`), `description`, `quantity`, `unit`, `unit_price_minor`, `tax_rate_bp` (basis points), computed line amounts. Price book (Ref-02) is out of scope.
- **Decision required:** Approve line categories and units.

---

## 8. Invoices and payments

### QI-F01 — Supplier invoice numbers are not organisation-issued numbers

- **Severity:** High
- **Specification reference:** Brief §5.6 "invoice number" (L193), §12 "flag … duplicate invoice reference" (L306); Prototype invoice `PAT-INV-3021`; Ref-01 §3.9 / Ref-07 (organisation allocates `invoiceNumber`, unique per organisation).
- **What the specification claims or assumes:** Brief: the contractor's own invoice number. Reference: an organisation-generated number.
- **Actual Inspect360 implementation:** None.
- **Discrepancy:** Uniqueness must be per contractor, not per organisation, and duplicates should be flagged rather than rejected (two contractors can both issue "INV-001").
- **Impact:** A reference-style unique index would wrongly reject valid invoices.
- **Recommended correction:** Store `supplier_invoice_number` (non-unique; duplicate warning on `(organization_id, contractor_contact_id/user_id, supplier_invoice_number)`), plus an internal Inspect360 reference for tracking.
- **Decision required:** Is an internal reference needed in addition to the supplier's number?

### QI-F02 — "External contractor only" cannot be determined from current data

- **Severity:** High
- **Specification reference:** Brief §3 Engineer "cannot … generate external-contractor payable invoice" (L132), §5.6 "External contractor only… Internal technicians record time/materials" (L193), §15 test 20 (L352).
- **What the specification claims or assumes:** The system knows whether an assignee is internal or external.
- **Actual Inspect360 implementation (Verified):** Assignees can be staff users (`clerk`, `owner`), `contractor` users, or contractor contacts. Nothing marks a person as an employee versus an external business. Contacts have `company_name` but no VAT number, registration or payee fields (`shared/schema.ts` L379–402).
- **Discrepancy:** The rule cannot be enforced without a new attribute.
- **Impact:** Either everyone can invoice or nobody can.
- **Recommended correction:** Treat `contractor_id` (contact with `type = 'contractor'`) or a `contractor` role user as external; treat `clerk`/`owner` assignees as internal. Confirm with product.
- **Decision required:** Approve the internal/external rule.

### QI-F03 — No finance capability exists for payee or bank data

- **Severity:** High
- **Specification reference:** Brief §5.6 "payee/payment reference where permitted… Do not store bank details in unrestricted tenant-facing metadata" (L193); §12 "Do not implement storage/transfer of card or bank account details unless within existing approved finance capability" (L309).
- **What the specification claims or assumes:** An approved finance capability may exist.
- **Actual Inspect360 implementation (Verified):** None for maintenance. Stripe is used only for SaaS subscriptions (`server/stripeClient.ts`, `server/billing/`). Contacts have no bank fields.
- **Discrepancy:** The condition in §12 is not met, so bank details must not be stored.
- **Impact:** Payment tracking is limited to status, amount, date and a free-text payment reference.
- **Recommended correction:** v1 stores **no** bank details. Record `payment_status`, `paid_amount_minor`, `paid_at`, `payment_reference`, and who recorded it.
- **Decision required:** Confirm.

### QI-F04 — "Completed work value" in the three-way match has no data source

- **Severity:** Medium
- **Specification reference:** Prototype invoice screen "Three-way verification: Approved quote / Completed work value / Contractor invoice"; Brief §12 "Match invoices to approval snapshot and accepted work" (L306).
- **What the specification claims or assumes:** A measurable "completed work value".
- **Actual Inspect360 implementation (Verified):** `cost_actual` is free entry with no web UI (`Maintenance.tsx` shows it read-only; no input exists); `work_logs.time_spent_minutes` has no rate; materials are not recorded anywhere; neither web nor mobile has UI to create work logs (`POST /api/work-logs` exists at `server/routes.ts` L18204 but is unused).
- **Discrepancy:** The middle column of the match has no input.
- **Impact:** The match collapses to two-way (approved quote vs invoice).
- **Recommended correction:** v1: two-way match (authorised total including approved variations vs invoice total), plus line-level comparison. Add "completed work value" only if internal cost capture is built.
- **Decision required:** Accept two-way matching for v1?

### QI-F05 — Financial status on the work order duplicates invoice status

- **Severity:** Medium
- **Specification reference:** Brief §4 `financial_status` (L145); §5.6 statuses (L193); §5.7 "invoice(s)" (L196); §12 "Multiple progress invoices are out of scope" (L305).
- **What the specification claims or assumes:** Both a work-order `financial_status` and per-invoice statuses.
- **Actual Inspect360 implementation:** None.
- **Discrepancy:** If several invoices are allowed (e.g. one rejected, one resubmitted), the work-order value must be derived; if stored separately it will drift.
- **Impact:** Inconsistent dashboards.
- **Recommended correction:** Allow several invoices per work order but at most one non-void "active" invoice in v1; derive the work-order financial summary from it (store as a cached column only if needed for list filtering).
- **Decision required:** Approve "one active invoice per work order" for v1.

### QI-F06 — Most reference invoice features are out of scope by the Brief's own rules

- **Severity:** Medium
- **Specification reference:** Brief §1 "Out of scope for v1: Bank payments … new third-party integrations unless already supported" (L78–79); Ref-07 (send/resend, credit notes, archive), Ref-08 (chasing, public/portal views), Ref-09 (Stripe Connect), Ref-10 (customer emails).
- **What the specification claims or assumes:** n/a.
- **Actual Inspect360 implementation (Verified):** Stripe Connect is not configured anywhere (no Connect code; Stripe usage is SaaS-only).
- **Discrepancy:** The reference's payment collection, chasing, credit notes and customer portal do not apply to contractor invoices.
- **Impact:** Wasted effort if ported.
- **Recommended correction:** Exclude Ref-06, Ref-08 §4–5, Ref-09 and the customer parts of Ref-07/Ref-10 from this project.
- **Decision required:** Confirm exclusion.

### QI-F07 — Internal labour/materials recording barely exists

- **Severity:** Low
- **Specification reference:** Brief §2 "Record internal labour/materials" (L118), §5.6 (L193), §15 test 20 (L352).
- **What the specification claims or assumes:** Internal staff record time and materials instead of invoicing.
- **Actual Inspect360 implementation (Verified):** `work_logs` holds a note, photos and minutes only; there is no creation UI on web or mobile, no materials table and no labour rate.
- **Discrepancy:** The alternative to invoicing for internal staff is not usable today.
- **Impact:** Internal jobs would have no actual cost.
- **Recommended correction:** Out of scope for Quotes & Invoicing unless product requires internal costs in v1.
- **Decision required:** Is internal cost capture in scope?

### QI-F08 — Possible double counting with the Rentals `property_expenses` module

- **Severity:** Medium
- **Specification reference:** Brief §1 "Out of scope … automatic financial postings" (L78).
- **What the specification claims or assumes:** No automatic postings.
- **Actual Inspect360 implementation (Verified):** The Rentals module records property expenses including category `repair`, supplier and receipt (`shared/schema.ts` L675–706; UI `client/src/components/PropertyFinancePanels.tsx` L723). They are not linked to work orders.
- **Discrepancy:** Users may already record contractor repairs as property expenses manually.
- **Impact:** Property cost totals could include the same repair twice if both are reported together later.
- **Recommended correction:** No automatic posting in v1; optionally store `work_order_id` on manually created expenses later.
- **Decision required:** Should a paid contractor invoice ever create a property expense?

---

## 9. Money, currency and tax

### QI-G01 — Currency has three conflicting sources, and existing UI hardcodes symbols

- **Severity:** High
- **Specification reference:** Brief §0.4 "Currency and tax labels are demonstration data" (L52), §6 "explicit ISO currency" (L219); Ref-01 §1 (`GBP` | `USD` | `EUR`).
- **What the specification claims or assumes:** An organisation currency setting exists.
- **Actual Inspect360 implementation (Verified):**
  - The web UI derives currency from `organizations.country_code` through `COUNTRY_TO_CURRENCY`, which supports only GBP/USD/AED and maps lossily (e.g. Ireland → GBP, Saudi Arabia → AED) (`shared/countryUtils.ts` L4–52; `client/src/contexts/LocaleContext.tsx` L24–32).
  - `organizations.preferred_currency` is a separate enum including EUR, used by billing (`shared/schema.ts` L200, enum L72).
  - `property_expenses.currency` is free text defaulting to GBP (L694).
  - Existing maintenance displays hardcode "£" (`client/src/pages/Maintenance.tsx` L874–877, L2023) and emails hardcode "$" (`server/resend.ts` L368, L513).
- **Discrepancy:** No authoritative organisation currency for maintenance; the reference's currency list omits AED and includes EUR.
- **Impact:** Quotes could be created in the wrong currency for non-UK organisations.
- **Recommended correction:** Store `currency` on each quote/invoice, defaulted from one agreed organisation source, and editable only before submission. Fix the hardcoded symbols when touching those views.
- **Decision required:** Which source is authoritative: `country_code` mapping or `preferred_currency`? Which currencies must v1 support?

### QI-G02 — No tax configuration exists

- **Severity:** High
- **Specification reference:** Brief §5.3 "tax rate per existing account settings" (L184), §0.4 "never hardcode a 20% VAT" (L52), §12 VAT variance (L306); Ref-03 §2 (hardcoded `standard_20` → 20%, invoice `reduced` → 5%, quote `reduced` → 0).
- **What the specification claims or assumes:** "Existing account settings" for tax.
- **Actual Inspect360 implementation (Verified):** No tax rate, VAT registration or VAT number fields on `organizations` (L181–253) or `contacts` (L379–402). No tax settings in the Settings UI.
- **Discrepancy:** The referenced settings do not exist; the reference hardcodes UK rates and is internally inconsistent (quote vs invoice treatment of `reduced`).
- **Impact:** Tax would be either hardcoded (contradicting the Brief) or entirely manual.
- **Recommended correction:** v1: per-line tax rate stored in basis points, chosen from an organisation-configurable list of named rates (seed with UK 20%, 5%, 0% and UAE 5% as defaults), with the rate snapshotted on the line. Do **not** port the reference's quote/invoice asymmetry.
- **Decision required:** Default tax rates per country, and whether contractor VAT registration status must be captured.

### QI-G03 — Rounding and calculation rules are unspecified in the Brief

- **Severity:** Medium
- **Specification reference:** Brief §5.3 "Auto-calculate … on server" (L184); Ref-03 §2–3.
- **What the specification claims or assumes:** Server totals without a defined rounding rule.
- **Actual Inspect360 implementation:** No maintenance calculation code; SaaS billing uses `Math.round` on integers (`shared/billingFinancialMath.ts`).
- **Discrepancy:** Line-level versus document-level tax rounding gives different totals (the Prototype calculates VAT at document level; the Brief implies per line).
- **Impact:** Variance flags triggered by 1p rounding differences against contractor invoices.
- **Recommended correction:** Compute tax per line, half-up to minor units, sum lines for totals; apply a configurable tolerance (e.g. ±1 minor unit per line) before flagging variance.
- **Decision required:** Approve rounding rule and variance tolerance.

---

## 10. UI and design contract

### QI-H01 — The "existing Inspect360" reference screenshot is a prototype, and the live shell differs

- **Severity:** High
- **Specification reference:** Brief §0.1 "shows the **existing Inspect360 HMO overview interface**" (L15), §0.2 sidebar and header rows (L23–24); Handover "Visual identity — match existing Inspect360 HMO screen"; README L23.
- **What the specification claims or assumes:** The screenshot shows the live app: white sidebar with `WORKSPACE` / `MANAGEMENT` headings and items Dashboard, Properties, Inspections, Compliance, Maintenance, Work orders, Reports, Settings; header with breadcrumb, Help, Notifications and avatar.
- **Actual Inspect360 implementation (Verified):**
  - The HMO screenshot itself shows the "Interactive design concept — Sample data only" banner and a "View state" selector, which the Brief says exists "only in the prototype" (README L23). It is therefore a design mock-up, not a capture of the live app.
  - The live sidebar (`client/src/components/app-sidebar.tsx` L75–173, L223–300) is a flat list with **no section headings**, and includes Contacts, Blocks, Comparisons, HMO Compliance, Asset Inventory, Community, Billing and Feedback, gated by role and module.
  - "Work Orders" is an owner-only item pointing to `/analytics` (L131–132); contractors see "My Work Orders" → `/maintenance?tab=work-orders` (L137).
  - The staff header contains only the sidebar trigger and the user menu (`client/src/App.tsx` L634–636): no breadcrumb, Help or Notifications.
- **Discrepancy:** The "reuse current sidebar/header" instruction and the screenshot point in different directions.
- **Impact:** Implementing the screenshot's shell would redesign the app, which the Brief forbids (L17, L37).
- **Recommended correction:** Use the **live** shell as-is. Use the mockups only for in-page layout (KPI tiles, two-column cards, notices). Add page-level breadcrumbs inside new pages (the Breadcrumb component exists, e.g. `client/src/pages/CommunityModeration.tsx` L405) rather than in the global header.
- **Decision required:** Confirm the live shell is authoritative and the global header is not to be changed.

### QI-H02 — Approximate colours differ from real tokens

- **Severity:** Low
- **Specification reference:** Brief §0.2 L35 (`#00AAA6`, `#E4F8F5`, `#F4F8FA`, `#1B3346`, …).
- **What the specification claims or assumes:** Approximations to be replaced by real tokens.
- **Actual Inspect360 implementation (Verified):** `--primary: 177 96% 40%` "Signal Teal #04C6BD" (`client/src/index.css` L55–56, L9); navy `#013765`, mist `#F2F7F8`; fonts Inter (body) and Poppins (headings) (L96–98); radius 8/11/12px (L103–106). Organisations can override the sidebar accent via `brandingPrimaryColor` (`app-sidebar.tsx` L192–201).
- **Discrepancy:** As the Brief anticipates, the approximations are wrong.
- **Impact:** None if tokens are used.
- **Recommended correction:** Use Tailwind theme classes only; never hex values from the Brief.
- **Decision required:** None.

### QI-H03 — No work-order detail page or route exists

- **Severity:** High
- **Specification reference:** Brief §0.3 four screens with breadcrumb `Properties > … > Maintenance > Quotation` (L41–44); §5.7 (L195–196); §7 `GET /maintenance/work-orders/:id` (L243); §18 checklist "All four screens are accessible … using existing navigation and canonical work order" (L388).
- **What the specification claims or assumes:** A canonical work-order page that quote/invoice screens hang off.
- **Actual Inspect360 implementation (Verified):** Work orders are managed in dialogs: `client/src/pages/Maintenance.tsx` (Work Orders tab, detail dialog L2096–2196, create dialog L2210–2228) and `client/src/pages/Analytics.tsx` (owner board and edit dialog L894–1114). `/maintenance/:id` only opens the request edit dialog (`Maintenance.tsx` L618–673). No `/work-orders/:id` route exists in `client/src/App.tsx`. Mobile has `WorkOrderDetailScreen`.
- **Discrepancy:** The four screens have no host page on web.
- **Impact:** A new route and page are prerequisites, and must coexist with the dialogs and the `/analytics` board.
- **Recommended correction:** Add a web work-order detail route (e.g. `/work-orders/:id`) with tabs for Overview, Quotes, Invoices and Activity; link to it from the existing dialogs and board cards. Keep breadcrumbs page-local and handle block-level work orders.
- **Decision required:** Approve the new route and whether `/analytics` remains the owner "Work Orders" entry.

### QI-H04 — The mockups combine actions of different roles on one screen

- **Severity:** Medium
- **Specification reference:** Prototype quote screen (header "Save draft" + "Approve quotation"; line inputs editable while "Awaiting approval"); invoice screen ("Approve invoice", "Preview PDF", "Attach" supplier PDF, and "Save payment status" on one screen); Brief §0.4 "engineer, Admin and tenant get **role-scoped** variants" (L53).
- **What the specification claims or assumes:** Role-scoped variants exist.
- **Actual Inspect360 implementation:** n/a.
- **Discrepancy:** The mockups show a single combined view. Editable lines during approval contradict immutability after submission.
- **Impact:** Developers copying the mockup would expose approve buttons to contractors or editing to approvers.
- **Recommended correction:** Define per-role variants: contractor (edit draft, submit, view decision), approver (read-only lines, approve / reject / request changes), finance (payment tracking). Lock lines once submitted.
- **Decision required:** Approve the per-role screen split.

### QI-H05 — The mockups and Brief disagree on quote and invoice fields

- **Severity:** Medium
- **Specification reference:** Brief §5.3 (L184) and §5.6 (L193) versus Prototype quote and invoice tables.
- **What the specification claims or assumes:** Brief: per-line unit, taxable flag, tax rate; terms, exclusions, evidence; invoice due date, payee/payment reference. Prototype: description/qty/rate only on quotes; a single "VAT (demo 20%)" line; invoice line units ("2 hr").
- **Actual Inspect360 implementation:** n/a.
- **Discrepancy:** See QI-E06.
- **Impact:** UI built from the PNGs would miss required fields.
- **Recommended correction:** Treat the Brief's field list as authoritative and the mockups as layout only.
- **Decision required:** None beyond QI-E06.

### QI-H06 — The field app is React Native, not a PWA; no mobile quote/invoice support exists

- **Severity:** Medium
- **Specification reference:** Brief preface "inspector app/PWA" (L5), §0.3 "Production PWA must fit a 390px viewport" (L43), §5.5 "Save draft when offline" (L190).
- **What the specification claims or assumes:** An engineer PWA with offline drafts.
- **Actual Inspect360 implementation (Verified):** The mobile app is Expo / React Native (`mobile/package.json`, React Navigation v7). Its offline SQLite queue covers inspections only (`mobile/src/services/offline/database.ts` L276–341); work orders and maintenance are online-only. The web client has a service worker (`client/public/sw.js`), but no offline maintenance features. No quote, invoice or approval UI exists in mobile.
- **Discrepancy:** "PWA" refers to two different clients; offline drafting does not exist for maintenance.
- **Impact:** Contractor quoting on phones requires either responsive web pages or new React Native screens.
- **Recommended correction:** v1: quotes and invoices on **responsive web** (meets the 390px requirement); mobile shows read-only authorisation status so contractors know whether they may start. Native quote/invoice screens and offline drafting are later phases.
- **Decision required:** Is mobile quote/invoice entry required in v1?

### QI-H07 — No user-facing strings file exists

- **Severity:** Low
- **Specification reference:** Not in the spec; workspace user rule requires `constants/strings.ts`.
- **What the specification claims or assumes:** n/a.
- **Actual Inspect360 implementation (Verified):** No strings/i18n module in `client/src` or `mobile/src`; strings are inline.
- **Discrepancy:** The project convention and the codebase differ.
- **Impact:** Minor; affects new code only.
- **Recommended correction:** Create a feature-scoped strings module for new Quotes & Invoicing UI, without retrofitting existing pages.
- **Decision required:** Confirm the convention for this feature.

### QI-H08 — Staff in-app notifications have no UI

- **Severity:** Medium
- **Specification reference:** Brief §10 notification matrix "In-app" for Admin, approvers, engineers (L273–290).
- **What the specification claims or assumes:** In-app notifications for staff.
- **Actual Inspect360 implementation (Verified):** A `notifications` table and WebSocket delivery exist (`shared/schema.ts` L3067–3083; `sendNotificationToUser` used at `server/routes.ts` L1262–1278). The web popup renders **only for tenants** (`client/src/App.tsx` L806–819) and the staff header has no notification bell. Mobile staff receive none (`mobile/src/hooks/useTenantNotifications.ts`). Email via Resend exists (`server/resend.ts`).
- **Discrepancy:** Staff in-app alerts are infrastructure-only.
- **Impact:** "Quote submitted → approver in-app" needs new UI.
- **Recommended correction:** v1: email notifications (existing Resend pattern) plus a "Pending approvals" list on the work-order page/board. A staff notification bell is optional.
- **Decision required:** Is a staff notification inbox in scope?

---

## 11. Integrations and infrastructure

### QI-I01 — No notification outbox or idempotency exists for maintenance

- **Severity:** Medium
- **Specification reference:** Brief §6 `notification_outbox` (L216), §10 "Use existing notification templates and outbox/retry pattern" (L292), §15 test 23 (L355).
- **What the specification claims or assumes:** An existing outbox/retry pattern.
- **Actual Inspect360 implementation (Verified):** Work-order emails are best-effort, inline, with errors only logged (`server/routes.ts` L17648–17740). No outbox table. `message_templates` exists but is for tenant broadcasts (`shared/schema.ts` L2869–2882). Idempotency exists only for billing webhooks (`server/billing/webhookIdempotency.test.ts`).
- **Discrepancy:** The pattern to reuse does not exist.
- **Impact:** Double-submit of quote approval could send duplicate emails; create endpoints could duplicate rows.
- **Recommended correction:** Make state transitions idempotent at the database level (conditional `UPDATE … WHERE status = 'submitted'`), so a repeated request is a no-op; keep emails best-effort in v1. Defer a full outbox.
- **Decision required:** Is a durable outbox required for v1?

### QI-I02 — PDF generation exists but no work-order/quote/invoice template

- **Severity:** Low
- **Specification reference:** Brief §15 test 25 "PDF/export generation if existing" (L357); Prototype "Preview PDF", "Export work order"; Ref-10.
- **What the specification claims or assumes:** PDF export only if it already exists.
- **Actual Inspect360 implementation (Verified):** Puppeteer-based report PDFs exist (`server/pdfService.ts`, `server/pdfBrowserPool.ts`, `server/reportPdfShared.ts`), with organisation branding fields (`organizations.logo_url`, `branding_*`). No work-order PDF exists.
- **Discrepancy:** The infrastructure exists; the templates do not.
- **Impact:** Optional.
- **Recommended correction:** Quote PDF is optional for v1; contractor invoice PDFs are uploaded by contractors, not generated.
- **Decision required:** Is a generated quote/work-order PDF required for v1?

### QI-I03 — Schedulers are in-process

- **Severity:** Low
- **Specification reference:** Brief §8 offer expiry (L257), §10 reminders (L292); Ref-04 §6 expiry job.
- **What the specification claims or assumes:** Background jobs.
- **Actual Inspect360 implementation (Verified):** Jobs run via `setInterval` in `server/index.ts` (L215–396). **Unverified:** whether production runs more than one app instance (`docker-compose.contabo.yml` suggests a single container but was not inspected in detail).
- **Discrepancy:** With multiple instances, jobs would run multiple times.
- **Impact:** Duplicate expiry/reminder emails.
- **Recommended correction:** Make any new job idempotent (conditional updates). Confirm the instance count.
- **Decision required:** Confirm production instance count.

### QI-I04 — Inspection-to-maintenance linking is weaker than the spec assumes

- **Severity:** Low (for Quotes & Invoicing)
- **Specification reference:** Brief §5.1 (L170–171), §15 test 2 (L334).
- **What the specification claims or assumes:** Inspector-raised requests are linked to the inspection and entry.
- **Actual Inspect360 implementation (Verified):** The server accepts `inspectionId`/`inspectionEntryId` (`server/routes.ts` L15202, L15243–15244), but the mobile create screen does not send them (`mobile/src/screens/maintenance/CreateMaintenanceScreen.tsx` L474–483).
- **Discrepancy:** Linked evidence on the "permanent record" will be missing for mobile-raised requests.
- **Impact:** Affects the record screen, not quote/invoice logic.
- **Recommended correction:** Track separately.
- **Decision required:** None for this project.

### QI-I05 — New endpoints must respect module and entitlement gating

- **Severity:** Medium
- **Specification reference:** Brief §7 routes `/maintenance/...` (L227–244).
- **What the specification claims or assumes:** Free choice of paths.
- **Actual Inspect360 implementation (Verified):** Paid-access locking is prefix-based (`LOCKED_API_PREFIXES` in `shared/entitlements.ts` L13–36, including `/api/maintenance` and `/api/work-orders`; enforced in `server/auth.ts` L837–900). The maintenance module toggle is enforced with `requireCompanyModule("maintenance")` (`server/auth.ts` L930–960), and plan module `work_orders` controls `maintenanceEnabled` (`server/billing/planLimits.ts` L804).
- **Discrepancy:** Routes outside those prefixes (e.g. `/api/quotes`) would bypass trial/billing locks.
- **Impact:** Unpaid organisations could use the feature.
- **Recommended correction:** Place routes under `/api/work-orders/...` (or add new prefixes to `LOCKED_API_PREFIXES`) and apply `requireCompanyModule("maintenance")`.
- **Decision required:** Should Quotes & Invoicing be its own marketplace module or part of `work_orders`?

### QI-I06 — Appointments, availability and broadcast offers do not exist

- **Severity:** Low (for Quotes & Invoicing); High for the full Brief
- **Specification reference:** Brief §5.2 engineer picker "working hours, current jobs/calendar" (L180), §5.4 (L186–187), §8 (L249–259), §13 "reuse existing job schedules" (L316).
- **What the specification claims or assumes:** Existing schedules and availability to reuse.
- **Actual Inspect360 implementation (Verified):** No appointment, availability, slot or offer tables or routes; work orders have only `sla_due`. Users have `skills`, `qualifications`, `certificate_urls` arrays (`shared/schema.ts` L98–101); contacts do not.
- **Discrepancy:** Nothing to reuse.
- **Impact:** Brief §15 tests 5–8 and 13 cannot pass without new builds.
- **Recommended correction:** Exclude from Quotes & Invoicing (see QI-A02).
- **Decision required:** Covered by QI-A02.

---

## 12. Conflicts between the specification files themselves

| ID | Severity | Files and sections | Conflict | Recommended resolution |
|---|---|---|---|---|
| QI-J01 | High | Brief §0.1 L15 vs README L23 vs HMO screenshot | The screenshot is called "existing" UI, but it shows the banner the README says exists only in prototypes. | See QI-H01: live app is authoritative. |
| QI-J02 | High | Brief §6 L219 vs Ref-01 §1 / Ref-03 | Decimal money vs integer minor units. | See QI-B06. |
| QI-J03 | Medium | Brief §0.4 L52 vs Prototype (VAT 20%) vs Ref-03 §2 (20% / 5% hardcoded, quote/invoice asymmetry) | "Never hardcode 20%" vs hardcoded rates. | See QI-G02. |
| QI-J04 | High | Brief §5.5 L190 vs Prototype completion screen "Tenant acknowledgement" vs current code | Tenant acknowledgement optional vs mandatory signature in code. | See QI-D01. |
| QI-J05 | Medium | Brief §3 L127–135 vs Handover §04 | Brief has separate "Maintenance Engineer (employee)" and "External Contractor", "Finance / Approver" and "Eco/System Admin"; Handover merges "Engineer / external contractor" and uses "Finance / authorised approver" and "Eco Admin". | Use the mapping in QI-C01. |
| QI-J06 | Medium | Brief §4 `financial_status` L145 vs §5.6 invoice statuses L193 vs Prototype payment states ("Not paid, Sent for payment, Part paid, Paid") vs Ref-01 invoice statuses | Four different vocabularies. `rejected` appears in §5.6 but not §4; `queried` appears in §4/§5.6 only. | Single invoice status list plus separate payment status (proposal in prerequisites §5.4). |
| QI-J07 | Medium | Brief §12 L305 vs §5.7 L196 and §6 L213 | "Multiple progress invoices out of scope" vs "invoice(s)" and plural model. | See QI-F05. |
| QI-J08 | Medium | Brief §1 L78 vs Ref-09 | Bank payments out of scope vs Stripe Connect phase. | See QI-F06. |
| QI-J09 | Medium | Brief §5.3 L184 vs Prototype quote table | Per-line unit and tax vs description/qty/rate only. | See QI-E06. |
| QI-J10 | Medium | Brief §4 L143–163 (internal) | Statuses listed without transitions. | See QI-D04. |
| QI-J11 | Low | Brief §0.2 L23 (sidebar list) vs Prototype nav ("Maintenance" and "Work orders" separate) vs live app | Three different nav structures. | See QI-H01. |
| QI-J12 | Low | Handover "Implementation source of truth" vs Brief preface L3 | Handover says the Markdown is authoritative; Brief says its table/route names are suggestions only. Not a contradiction, but means nothing in §6/§7 is binding. | Treat §6/§7 as illustrative; this report's mappings supersede them. |
| QI-J13 | Medium | Ref-00 §6 "Known asymmetries / gaps" | The reference documents its own bugs (quote VAT ignores `reduced`, portal Stripe metadata gap, archive bypassing transition helper, payment sync bypassing transitions). | Do not port these behaviours. |
| QI-J14 | Low | Ref-05 §3 "No job picker on standalone builder" / Ref-11 §1 "jobId optional" vs Brief §6 L209 `quotes.work_order_id` | Reference treats the job link as optional; Brief requires it. | In Inspect360, `work_order_id` is required (NOT NULL). |

---

## 13. Reference implementation: what can and cannot be adapted

| Reference capability | Phase file | Adaptable? | Notes for Inspect360 |
|---|---|---|---|
| Integer minor-unit money, currency per document | Ref-01 §1 | **Yes** | Matches `work_orders` cost fields. Add AED support; drop the assumption that only GBP/USD/EUR exist. |
| Line maths (`computeLine`, header totals, clamp ≥ 0) | Ref-03 §2–3 | **Yes, with changes** | Replace the `vatRate` enum with stored basis-point rates; do not port the quote/invoice VAT asymmetry. |
| Transition helper with allowed-transition map | Ref-04 §1, Ref-07 §1 | **Yes** | New status vocabularies (QI-E01, QI-J06). Enforce on every mutation (the reference admits bypasses). |
| Versioning with `parent`/`superseded_by` | Ref-04 §3 | **Yes, with changes** | Version on revision of unapproved quotes; variations as linked quotes (QI-E03). |
| Status history + audit tables | Ref-01 §3.8 | **Yes** | Generalise into a work-order event table (QI-C08). |
| Per-org reference allocation | Ref-04 §3 | **Yes** | Concurrency-safe counter (QI-B10). Supplier invoice numbers are separate (QI-F01). |
| Branding on documents | Ref-02 §3 | **Partly** | Reuse existing `organizations.logo_url` / `branding_*`; no new branding table needed. |
| Price book and customer overrides | Ref-02 §4 | **No (v1)** | Not in the Brief. |
| Terms templates / TipTap | Ref-02, Ref-05 | **No (v1)** | TipTap is not a dependency; plain-text terms/exclusions suffice. |
| Customer share links (hashed tokens) | Ref-04 §4, Ref-06 | **Pattern only** | Possible later path for contact-only contractors or landlord approval (QI-C04, QI-A01). |
| Customer portal accept/decline | Ref-06 §3 | **No** | Counterparty is internal approver, not customer. |
| Convert accepted quote → draft invoice | Ref-04 §5 | **Partly** | Pre-fill a contractor invoice draft from the authorised quote lines; contractor edits before submitting. |
| Invoice send/resend/email to customer | Ref-07 §4 | **No** | AP invoices are received, not sent. |
| Manual payment recording + balance sync | Ref-07 §2 | **Yes, simplified** | Record payment status/amount/reference; no refunds. |
| Credit notes | Ref-07 §5 | **No (v1)** | Use `void` + resubmission. |
| Overdue cron, chasing | Ref-07 §6, Ref-08 §5 | **No** | Not applicable to payables. An "invoice overdue for payment" reminder could be considered later. |
| Stripe Connect / Checkout / webhooks | Ref-09 | **No** | Out of scope (Brief §1). |
| PDF rendering | Ref-10 §1 | **Optional** | Puppeteer infrastructure exists (QI-I02). |
| Email templates per org | Ref-10 §2 | **No (v1)** | Use fixed Resend templates like existing work-order emails. |
| Widget enquiries, SaaS metering | Ref-11 §2–3 | **No** | Not applicable. |
| Job boundary rules | Ref-11 §1 | **Inverted** | In Inspect360 the work order is mandatory and quotes may gate work-order progress, which the reference explicitly says not to port. |

---

## 14. Decision register

Decisions are grouped by how early they block work. Each refers back to the issue that explains it.

### Must be decided before any design or migration

| # | Decision | Issue |
|---|---|---|
| 1 | v1 is accounts-payable only (contractor → organisation)? Any landlord/tenant recharge needed later? | QI-A01 |
| 2 | Project scope: which Brief phases (A–F) and which of the 25 acceptance tests apply? | QI-A02 |
| 3 | Table / type / route naming convention avoiding SaaS collisions | QI-B01 |
| 4 | Deletion policy for work orders and requests with financial documents; clerk delete rights | QI-B02 |
| 5 | Ship the tenant work-order access fix first, as a separate patch? | QI-C02 |
| 6 | Private, organisation-scoped file access for financial attachments; is malware scanning a blocker? | QI-C03 |
| 7 | Money storage: integer minor units (recommended) or decimal | QI-B06 |
| 8 | Authoritative organisation currency source and supported currencies | QI-G01 |
| 9 | Tax model: per-line stored rates from an organisation list; default rates per country; contractor VAT status | QI-G02 |
| 10 | Approver model: who approves, per-user limits, finance capability, Eco Admin excluded | QI-C01, QI-C05 |

### Must be decided before workflow and API design

| # | Decision | Issue |
|---|---|---|
| 11 | Contact-only contractors: in-app users only, owner-entered on behalf, or tokenised links | QI-C04 |
| 12 | Additive status strategy; new `authorisation_status` field instead of new enum values | QI-B05, QI-D03 |
| 13 | Quote requirement policy for v1 (always / never / above threshold); default for existing orgs | QI-D03, QI-E02 |
| 14 | Emergency override in v1? | QI-D03, QI-D07 |
| 15 | Invoice gate: existing `completed`, or a new admin acceptance step? Keep mandatory signature? | QI-D01 |
| 16 | Quote statuses, invoice statuses and payment statuses (proposals in prerequisites §5.4) | QI-E01, QI-J06 |
| 17 | Variation model: linked additional quote | QI-E03 |
| 18 | Approved quote updates `cost_estimate`; lock manual cost edits | QI-C06, QI-E04 |
| 19 | Internal vs external assignee rule for invoicing | QI-F02 |
| 20 | One active invoice per work order in v1 | QI-F05 |
| 21 | Two-way matching (authorised vs invoiced) acceptable for v1; variance tolerance | QI-F04, QI-G03 |
| 22 | No bank details stored in v1 | QI-F03 |
| 23 | Fixflo-enabled organisations: which system is authoritative | QI-D06 |
| 24 | Compliance role visibility of financial data | QI-C07 |

### Can be decided during implementation

| # | Decision | Issue |
|---|---|---|
| 25 | Reference number formats and backfill of existing work orders | QI-B10 |
| 26 | Quote expiry applies to submitted quotes only | QI-E05 |
| 27 | Line categories and units | QI-E06 |
| 28 | New web route `/work-orders/:id`; keep `/analytics` board | QI-H03 |
| 29 | Per-role screen variants | QI-H04 |
| 30 | Mobile: read-only authorisation status only in v1? | QI-H06 |
| 31 | Staff notification inbox, or email + pending-approvals list | QI-H08 |
| 32 | Durable outbox needed? | QI-I01 |
| 33 | Generated quote/work-order PDF in v1? | QI-I02 |
| 34 | Feature as its own marketplace module, or part of `work_orders` | QI-I05 |
| 35 | Paid invoices create `property_expenses` rows? | QI-F08 |
| 36 | Internal labour/materials capture in scope? | QI-F07 |
| 37 | Audit table protected by database grants? | QI-C08 |
| 38 | Single-owner organisation approval policy | QI-C05 |
