# Inspect360 | Rent Management
**Developer specification · v1.0 · 25 November 2026**

## 1. Objective and boundaries
Build a portfolio-level operational rent management module, integrated with the existing Inspect360 property, unit/room, tenancy, contact, tenant portal, notification, reporting and permissions services. Replace the current basic property-level rent collection view with a view of the same canonical rent ledger. Do not create a second tenancy database, duplicate charges or build a full general ledger/accounting product.

Initial market: UK residential operators, with England private rented sector rules as the first validated legal configuration. Support single lets, HMOs, build-to-rent, individual and joint tenancies; student housing and other tenancy regimes require their own validated rules. GBP initially; store currency and timezone on the organisation/contract. Existing interface conventions: white sidebar, light-grey workspace, white cards, turquoise (#00D6C1) primary actions, compact text status chips, responsive tables and existing Inspect360 components. Use the supplied HTML as UX reference, not production code. Replace the illustrative logo and navigation with actual application components.

## 2. Navigation and operator screens
Add `Finance > Rent management` to the main portal; show only to authorised roles. Include a Rent tab on each property/unit and tenancy, opening the same filtered records. One tenant account is attached to the tenancy, not solely the property or contact. Expose a separate My Rent view in the tenant portal/app.

| Screen | Functions | Primary action |
|---|---|---|
| Dashboard / rent roll | Scheduled, collected, collection rate, arrears; breakdown of current-period rent; work queue; search/filter by organisation, owner, portfolio, property/block, unit/room, date, status, manager; sortable table | View tenancy account |
| Tenancy account | Contract terms, current/future charges, opening balance, allocated receipts, reversals, credits, adjustments, running balance, case history, statement and related property/tenant | Record receipt / view statement |
| Arrears | Aging, overdue amount, oldest unpaid due date, last contact, next action, owner, disputes, payment plans, failed payments; bulk reminder preview | Manage case |
| Payments | Receipt register, payment channel, references, status, linked charges, reversals/refunds, unallocated receipts and receipts awaiting confirmation | Record receipt |
| Reconciliation | Import bank transactions, duplicate checks, suggested matches, split allocation, exceptions, suspense, reconciliation runs and balance checks | Review match |
| Rent reviews | Upcoming eligibility, current/proposed amounts, evidence, draft notices, approval, service dates, disputes and effective date | Assess review |
| Statements | Tenant statements, owner income reports, date ranges, PDF/CSV, delivery history | Generate statement |
| Settings | Payment references, payment providers, reminder rules, account permissions, approval thresholds, jurisdiction rules, notification templates, accounting integrations | Save configuration |

Dashboard: four headline metrics (scheduled rent, rent collected, collection rate, total arrears), current-period stacked bar, action queue. Show historical and upcoming amounts separately, never confuse future charges with arrears. Clicking metric or alert opens its underlying records. Use pagination/server-side filters for large portfolios. Display a clear reporting period, as-of date, currency and scope; mark organisation-wide reconciliation exceptions as such. Empty, loading, error and denied states are required. Mobile tenant view must be responsive; operator desktop prioritised for reconciliation.

## 3. Tenancy rent setup
During existing tenancy creation/import, capture or confirm:
- Organisation, landlord/owner, property/block, unit/room (HMO), tenancy ID, all liable tenants and optional payer/guarantor relationships; joint tenancy has ONE liability/ledger. Do not multiply rent by number of tenants. Individual room contracts have separate ledgers.
- Jurisdiction, tenancy type, agreement signed date, start date, end date if applicable, periodic status, rent amount/currency, frequency (weekly, fortnightly, monthly, quarterly where lawful), contractual due date/rule, first due date, pro-rata policy, rent-free periods/concessions, payment reference and owner collection account.
- Approved rent schedule version and effective dates, payment destination, existing legacy opening balance (separately documented by charge date), source agreement and change history.
- Deposit/scheme reference separately from rent; never automatically allocate a tenancy deposit to rent.
- Tenant notification preference and authorised contacts, no unnecessary sensitive data.

Preview generated schedule before approval. For calendar day 29–31, agree and record a month-end handling rule. Pro-rating must use documented contractual convention (e.g. actual days within billing period); no silent change. For ended tenancies stop future rent generation from the legally effective end; preserve historic debt and handle final pro-rata and approved adjustments. Vacant units contribute zero contractual rent; estimated void opportunity cost is a separate report.

## 4. Rent ledger and charge engine (critical)
Use an immutable, auditable operational subledger. Amounts in integer minor units or fixed decimal; never binary floating-point for financial records. Persist `effective_date`, `posted_at`, actor/source, currency, organisation, tenancy and idempotency key. Distinguish scheduled obligations from posted charges and posted receipts from bank settlement.

1. Approve contract/rent schedule. Generate future schedule and post each charge when due (or under the configured accounting policy). Scheduled amounts must not be charged twice.
2. Daily background job identifies due charges, posts idempotently and recalculates balances. Unique constraint on tenancy + schedule version + charge period + charge type, plus validation preventing overlapping active versions and duplicate periods.
3. Receive payment via manual confirmed receipt, CSV/bank transaction or approved provider. Pending/failed transactions are not paid rent. Use unique provider transaction IDs; match payment source and bank settlement to the same underlying receipt.
4. Allocate confirmed receipt to specified charge(s). Default proposed allocation oldest due charge first, subject to contractual/legal payer designation. Staff must see and approve exceptions; allow partial/split allocation, multiple payers and lawful voluntarily paid future amounts or unapplied credit. Unmatched cash stays in suspense; tenant-assigned credit is distinct from a matched charge. Never automatically treat excess as rent or deposit.
5. Derive balances from ledger entries/allocations. Payment reversals, refunds, chargebacks, write-offs, concessions and corrections use linked compensating entries and approval workflow, never silent edits/deletion. Reversals reopen balances where appropriate.
6. Close reconciled periods with a lock; finance manager controls authorised reopen/next-period corrections. Preserve report as-of snapshots, original transaction timestamps and a complete audit trail.

Example: £1,100 prior arrears + £1,100 current charge − £900 receipt allocated to prior arrears = £1,300 total arrears (£200 prior + £1,100 current). Current-month collection remains zero; cash receipts show £900. An advance credit and outstanding balance must not be netted invisibly. No manual toggle 'Paid' without a receipt or approved adjustment.

### Status rules
Charge: scheduled, due, part paid, paid, overdue, reversed/adjusted. Use contractual date and organisation local time; define due-today separately (overdue only after due date unless validated terms specify differently). Case state is independent: review required, contact scheduled, reminder sent, plan active, disputed/on hold, escalated, resolved. Receipt: pending, confirmed, failed, reversed/refunded; allocation state unallocated/partial/allocated; bank reconciliation status unmatched/suggested/confirmed/reconciled. Store separate state fields, not one ambiguous status. A case marked disputed does not remove a debt; a valid adjustment changes the ledger.

## 5. Metrics and reports
Define all metrics centrally, with filters and as-of time identical across screens and exports.
- Scheduled rent: sum of valid contractual rent obligations for selected period, including future due dates, net of approved concessions per reporting policy; excludes deposit and non-rent charges.
- Period rent collected: confirmed, non-reversed amounts allocated to rent charges in the selected obligation period as of reporting date, regardless of cash receipt month; show cash received in selected calendar period separately (including recovery of historical rent and separately tagged unapplied credits).
- Due-to-date collection rate: confirmed allocation to obligations due as of reporting date / valid rent obligations due by that date; no denominator => N/A. Exclude future charges from this ratio; cap per obligation, don't use gross receipt totals. Label obligation vs cash reporting clearly.
- Arrears: remaining unpaid net rent charge balances with due dates before as-of date, all historical periods; exclude future charges, deposit, non-rent charges. Age per unpaid charge, not per tenant; bands 1–30, 31–60, 61–90, 91+ days (configurable). Show oldest unpaid date and sum by tenancy.
- Upcoming rent: unpaid future scheduled amount within selected period; unallocated cash and tenant credit displayed separately.
- Net rent collection forecast, owner/property income vs scheduled, on-time payment %, arrears recovery, aging movement and month-to-month trends. Forecast must clearly distinguish confirmed from estimated; avoid implying rent lost on vacant units is a receivable.
- Statements: opening balance, dated charges/receipts/adjustments, references, allocations, closing balance, unapplied credit and statement date range. Provide PDF/CSV, secure tenant delivery and audit. Owner report: rent due, receipts and allocations, arrears, approved fees/disbursements separately (only if supported). Do not call gross rent a landlord payout or profit.

Demo baseline (25 Nov 2026, all properties): 8 tenancies, £10,125 scheduled, £6,025 allocated to November, £8,775 due to date, 68.7% collection rate, £2,750 overdue November plus £1,100 prior = £3,850 total arrears, £1,350 not yet due, 2 unmatched receipts totalling £1,350 (excluded from rent collected). These are fictional sample figures, not production data.

## 6. Reconciliation and payments
MVP: manual receipts and CSV bank import. Import preview maps date, amount, direction, reference, account and unique transaction ID; validate sign/date/currency, prevent duplicates by stable source ID or fingerprint plus manual duplicate review. Keep raw import records and per-line errors. Exact unique payment reference + amount and currency may suggest a match; partial/combined payments, payer-name similarity and ambiguous matches must go to review. Finance user confirms and allocates; linked provider/bank records must not generate duplicate receipts. Reconcile each collection/client account separately: opening bank balance + receipts − outflows = closing balance; compare bank statement to subledger cash movement and separately track suspense, liabilities, provider fees, refunds, settlement timing. Record differences and reviewer sign-off; do not claim a full client-account reconciliation without complete balances/liability reporting.

Phase 2: regulated payment/open banking provider (provider selection subject to compliance, fee, settlement and technical review), bank feeds/read consent, tenant-initiated bank payment links and optional Direct Debit via approved provider. Use hosted payment UI; do not store card details or bank login credentials. Verify webhook signatures, deduplicate, track settlement/chargeback, retry safely. Never mark a payment request, screenshot or promise as paid. Do not make Inspect360 a custodian or payment intermediary without specialist review. Pay directly into operator/owner-approved account through authorised provider, subject to contractual and regulatory checks. For third-party client money, segregate accounts, ledger liability by owner, dual approval and appropriate client money protection; operator's existing accounting system remains the financial system of record unless separately agreed.

## 7. Arrears management and notifications
1. Daily job detects actual overdue rent after contractual due date; checks confirmed payments, matching exceptions, disputes, repayment plans, communication preferences and any hold.
2. Create/update one open case per tenancy; assign to responsible rent officer or distribution group (reuse Inspect360 settings). Internal dashboard alert with balance, age, tenant and next action.
3. Default configurable operational sequence: due-day optional informational notification; day 1 after due date internal review and optional polite reminder; day 7 follow-up; day 14 manager review. These are proposed workflow timings, not statutory thresholds or permission to charge fees/take legal action. Suppress duplicates, enforce quiet hours, delivery audit, frequency caps and opt/channel rules. No demanding payment before agreed due date where prohibited. Do not send sensitive data in push/SMS; use authenticated links.
4. Operator can record call, email, agreed payment date, dispute, support referral, case note and next task; approve a repayment plan specifying instalments, dates, original arrears and ongoing contractual rent separately. Track promised vs actual payments and exceptions; changing a plan does not change the contractual rent ledger. Allow pause/hold for pending reconciliation, dispute, hardship review or applicable debt protections, including Breathing Space where relevant. Keep tenant-facing communications respectful and manual review for vulnerable cases.
5. If arrears clear, stop reminders and resolve case with history. If a receipt reverses or later balance arises, reopen/new case based on policy. Escalations to legal team always manual, no automated eviction notices, possession decisions, guarantor demands or statutory fee application. Late interest/fees disabled by default; only introduce after legal validation of applicable tenancy, thresholds, calculation and approval.

## 8. Tenant and owner experiences
Tenant portal/app > My Rent: current rent, next contractual due date, overdue balance and separate credit; secure payment link if provider enabled; itemised history, receipts and statements; report a payment discrepancy (reference/evidence, no auto-mark-paid), request a repayment discussion, contact support. Joint tenants see only information authorised under their agreement; do not expose another person's private bank details or unrelated tenancy. Reuse authenticated portal, push/email notifications, existing contact data and localisation. Former tenant access to own historic statements subject to policy and privacy.

Owner/landlord view (phase 2 unless existing owner portal supports it): property-level rent roll, cash collected vs allocated, arrears and statements only for authorised ownership periods. No tenant personal notes or unrelated accounts. Owner payout workflow, fee calculations and bank transfers deferred until client money and accounting controls are separately designed and validated.

## 9. Rent reviews and regulatory controls
Use a versioned jurisdiction + tenancy type policy engine, not universal UK rules. Review eligibility from tenancy start, last lawful increase, effective dates, statutory form and notice, challenge status and applicable exemptions. Store proposed rent and market comparables, reviewer, approved notice file, service method/date/evidence, proposed effective date, challenge/tribunal status and final authorised amount/date. No change to live rent until valid effective date and approval, with disputed/uncertain outcomes held for legal review; preserve prior schedule and avoid retroactive changes unless legally authorised. Do not auto-serve notices.

England private assured tenancies subject to the Renters' Rights Act reforms from 1 May 2026: generally no rent increase in first 12 months of a new tenancy, no more than once a year, use applicable Section 13 Form 4A and at least two months' notice. Do not request/encourage/accept prohibited pre-signature rent; between signing and start, applicable limits generally one month's rent (28 days for shorter rental periods). Once tenancy starts, do not enforce payment before contractual due date. Validate transitional cases and exemptions before release. Other UK nations, social housing, licenses, PBSA and non-assured arrangements require separate rules. Deposit protection/tenant fees are separate; review all applicable obligations with counsel. England property agents holding client money in scope must belong to approved/designated client money protection scheme. The software does not itself certify legal compliance.

Official references checked 25 Nov 2026:
- GOV.UK landlord overview: https://www.gov.uk/guidance/renters-rights-act-an-overview-for-landlords
- GOV.UK advance rent guidance: https://www.gov.uk/government/publications/asking-for-rent-in-advance-guidance-for-local-authorities/asking-for-rent-in-advance-guidance-for-local-authorities
- GOV.UK client money protection: https://www.gov.uk/client-money-protection-scheme-property-agents
- GOV.UK tenant overview: https://www.gov.uk/guidance/renters-rights-act-overview-for-tenants

## 10. Roles and safeguards
| Role | Permission |
|---|---|
| Organisation admin | Configure module and role assignments; cannot bypass finance audit controls |
| Rent officer / property manager | View assigned properties, initiate receipt/case/review; no unrestricted refunds or write-offs |
| Finance operator | Import, allocate and reconcile authorised accounts; submit adjustments |
| Finance approver | Approve reversals/refunds, write-offs, close/reopen, payment destination changes; separation of duties |
| Owner | Read only authorised properties and approved statements |
| Tenant | Own authorised account, statement, payment initiation and discrepancy request |
| Inspector/maintenance | No rent details by default |

Enforce organisation and property scope in API/database, not UI alone. MFA/step-up and dual approval for bank detail changes, high-risk refunds/adjustments. Verify change of beneficiary out of band, never rely on email alone. Encrypt in transit/at rest, restrict audit exports, retention policy, access logs, redacted support data, backup and recovery. Audit who, when, before/after, reason, approval, related records; no secrets in logs. Apply UK GDPR and data minimisation; avoid AI-based scoring of tenant worthiness or autonomous adverse decisions.

## 11. Suggested schema and APIs (adapt to existing architecture)
Reuse existing organisation/property/unit/tenancy/contact IDs. New tables (all organisation-scoped):
- `rent_accounts`: tenancy_id unique, currency, jurisdiction, tenancy_type, collection_account_id, payer_reference, status.
- `rent_schedule_versions`: account_id, amount_minor, frequency, due_rule, effective_from/to, proration_rule, approved_by, evidence_id, idempotency.
- `rent_charges`: account_id, schedule_version_id, period_start/end, due_date, amount_minor, type, status, linked_reversal_id.
- `rent_receipts`: account_id nullable for suspense, amount_minor, channel, received_at, confirmed_at, external_id, source, status, bank_account_id.
- `rent_allocations`: receipt_id, charge_id, amount_minor, effective_at, reversal_of; enforce total active allocations <= confirmed receipt and net charge balance.
- `rent_adjustments`: charge/receipt link, type, amount_minor, reason, approved_by, posted_at, reversal_of.
- `bank_transactions`, `reconciliation_runs`, `reconciliation_links`: account, source IDs, raw import reference, value date, amount, matching state, reviewer, close balance.
- `arrears_cases`, `case_events`, `payment_plans`, `plan_instalments`, `notification_events`, `rent_reviews`, `statement_snapshots`, `financial_audit_events`.
- Unallocated credit and suspense must remain identifiable; separate deposit records from rental ledger.

Illustrative API (use existing conventions, authentication and pagination):
```
GET /rent/dashboard?from=&to=&asOf=&portfolioId=
GET /rent/accounts?propertyId=&status=&search=
GET /rent/accounts/{id}/ledger?asOf=
POST /rent/accounts/{id}/schedule-versions
POST /rent/receipts (idempotency key)
POST /rent/receipts/{id}/allocations
POST /rent/adjustments (approval workflow)
POST /rent/bank-imports (preview then commit)
POST /rent/reconciliation/{id}/confirm
POST /rent/arrears/{id}/events
POST /rent/arrears/{id}/plans
POST /rent/reviews/{id}/submit
POST /rent/statements (authorised PDF generation)
GET /tenant/me/rent
```
Transactionally lock affected receipt/charge rows on allocation; concurrent actions must not overallocate. Queue jobs with retry and idempotency; reconcile provider event ordering; publish domain events `rent.charge.posted`, `rent.receipt.confirmed`, `rent.allocation.changed`, `rent.arrears.updated`, `rent.review.effective` to existing notification/reporting services. Financial values must always come from deterministic code, not AI.

## 12. AI assistance (phase 2)
AI can suggest bank matches with reasons/confidence, summarise case history, draft neutral reminders, highlight income anomalies, explain collection trends and suggest tasks. Show evidence and uncertainty, require human confirmation, redact personal data and restrict access. No automatic ledger changes, eligibility decisions, rent increases, fees, legal notice generation/service or eviction. Deterministic balances and rule checks are authoritative.

## 13. Legacy migration and rollout
1. Inventory existing rent fields and transactions; map to current tenancy IDs, never guess historical payment dates or invent receipts. Export backup, retain source IDs and read-only legacy history.
2. Reconcile opening balance and current terms per tenancy with operator/finance sign-off. Import supported historical receipts/charges or approved opening entries, not both for the same amounts. Unverified entries flagged for manual review. Test individual HMO and joint tenancy mappings.
3. Run dry migration with counts, exception list and totals by property/owner/currency; compare signed source balances and sample statements. Enable behind feature flag; cutover stops old charge writer; single ledger powers all views. Rollback plan preserves audit and new records; do not delete posted transactions.
4. Phase 1 (launch gate): tenancy schedule, rent roll, ledger, manual receipts/CSV, allocation, arrears workflows, tenant view, statements, audit/roles and basic rent review reminders/approval. Phase 2: bank feeds/payment provider, full reconciliation signoff for applicable account model, accounting exports/integration (e.g. Xero), owner reporting, AI assist and advanced forecasting. Do not launch client-money handling or payout until dedicated controls are validated.

## 14. Acceptance tests (release gates)
- Monthly and weekly schedules, month-end/leap year, start/end proration, rent concession, revised schedule and duplicate job retries produce exactly expected charges; no void charge or post-end charge.
- Joint tenancy produces one liability; individual HMO rooms remain independent; tenant move preserves prior debt and privacy.
- Partial, split and designated payments allocate correctly; old arrears recovery does not inflate current-period collection. Unmatched and pending payments never count as collected. Excess credit, future payment policy, failed transaction, reversal, refund and chargeback remain traceable. Concurrent allocation and duplicate import/webhooks never double count.
- Aging and due-today behavior follow as-of dates and timezone; upcoming charges excluded from overdue; sample dashboard totals match section 5. Report totals reconcile to ledger and exported statements.
- Case reminder suppresses duplicates and holds; cleared balance stops alerts; plan missed payment creates review task; no automatic legal notice or fees. Tenant discrepancy does not post receipt.
- Rent review refuses premature or unsupported change, requires correct approval/notice evidence, handles challenge and only activates lawful effective schedule; advanced payment rules scoped to applicable jurisdiction.
- Owner/tenant/property and organisation boundaries enforced even via direct API; inspector denied; approvals and reversals logged; account changes require safeguards.
- Migration dry run matches signed opening totals, with no duplicate historical records or charges; previous property rent view shows canonical ledger.
- Dashboard/filter/search/table and drawer navigation accessible; keyboard, screen reader, narrow screens and large portfolios tested. CSV escapes formula injection and PDF downloads require authorisation; no confidential personal data leaks into notices.

## 15. Prototype scope / developer notes
Open `Inspect360_Rent_Management.html` locally in a modern browser; no dependencies. Includes six navigable views, property filter, rent-roll status and search, receipt allocation simulation, bank match review, case status changes, rent review assessment, statement preview and CSV rent-roll export. PNG is captured directly from the initial HTML screen. All names/data fictional. No backend, live payment, notices, saved notes, actual PDF, accounting integration or persistent storage; the demo date is fixed. It models monthly charges and oldest-due allocation only, and rejects excess/advance allocations (including the £500 bank example against £450 arrears); real system must support credit and split exceptions per spec. The prototype sidebar is illustrative, not exact production navigation. Use the specification as authoritative for functional rules; existing live schema, provider choice, user permissions and legal regime details must be confirmed by the developer/finance lead before implementation.
