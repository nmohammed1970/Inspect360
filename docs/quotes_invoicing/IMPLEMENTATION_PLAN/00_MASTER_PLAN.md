# Maintenance Quotes & Invoicing — Master Implementation Plan

**Status:** Planning only  
**Updated:** 23 November 2026 — WO entry point; OD-03/04/06/07/08 resolved; simplified payments  
**Authority:** §1–§2. Upstream MR/WO **creation** unchanged.

Related: [`OPEN_DECISIONS.md`](OPEN_DECISIONS.md) · [`IMPLEMENTATION_PROGRESS.md`](IMPLEMENTATION_PROGRESS.md) · phases `01`–`07`

---

## 1. Scope boundary

**Entry point = existing Work Order.**

```text
[Out of scope] Request → triage → WO created (existing product)
        │
        ▼
[This project]
  Quote draft → owner approve → send (secure token)
  → customer accept/decline/request changes (link only)
  → authorise work / lock cost_estimate
  → existing completion (unchanged)
  → convert → customer invoice → record received payments
```

**Not in scope:** MR create/triage; WO-create redesign; offline customer approval; org-wide tax admin module; Stripe/bank/ledger/finance dashboards; contractor AP (until OD-13); appointments (OD-14); new completion-review (OD-15).

---

## 2. Confirmed requirements

| # | Requirement |
|---|---|
| R0 | Quotes/invoices require existing `work_order_id` |
| R1 | Non-tenant create/edit/submit; owner approve/send/invoice/payments; tenants excluded |
| R2 | Recipient contact **or** manual snapshot; property/block via WO → MR |
| R3 | Owner approval then customer acceptance (independent) |
| R4 | Customer decisions **only** via hashed secure link (expire/revoke); **no** offline owner override |
| R5 | Quote gate for **new** WOs only; existing WOs not blocked (OD-06) |
| R6 | Revisions, variations, audit |
| R7 | Existing completion checklist/signature |
| R8 | Convert customer-accepted quote → customer invoice |
| R9 | Simple payment records (amount, date, method, optional reference/notes, recorder); multi-pay; outstanding; Unpaid/Partial/Paid; reject overpay |
| R10 | No payment processing / Stripe / ledgers |
| R11 | Currency = org `preferred_currency` snapshotted on documents |
| R12 | Per-line tax in quote builder (presets / exempt / zero / custom); stored on lines; copied on convert |
| R13 | Pending Owner Approvals + customer-response tracking |
| R14 | PDFs/email; private doc access (OD-09) |
| R15 | Delete protection when quotes/invoices exist |

**Core workflow:**  
Existing WO → Quote Draft → Owner Approval → Send to Customer → Customer Acceptance → Work Authorised → Convert → Send Invoice → Record Partial/Full Payments.

---

## 3. Architecture (minimum)

```text
Tables: maintenance_quotes + lines + share_tokens
        maintenance_invoices + lines
        maintenance_invoice_payments
        work_order_events
        maintenance_document_sequences
Additive WO: authorisation_status, approved_quote_id, authorised_total_minor, reference?
NO: maintenance_tax_rates admin, heavy finance_settings, approval-limit tables, offline decision APIs
```

Money: integer minor units; server-side totals. Currency from org preferred, stored on headers.

---

## 4. Dependencies

```text
Phase 01 (OD-06/07/08 closed) → 02 → 03 → 04 → 05 → 06 → 07
```

---

## 5. Phases

| # | File | Delivers |
|---|---|---|
| 01 | `01_FOUNDATION.md` | Minimal schema, maths, sequences, events, WO additive columns |
| 02 | `02_QUOTATION_MANAGEMENT.md` | Draft/submit + per-line tax UI + PDF |
| 03 | `03_QUOTATION_APPROVALS.md` | Owner decisions + secure-link customer only |
| 04 | `04_WORKFLOW_INTEGRATION.md` | New-WO start gate, cost lock, delete guard, queues |
| 05 | `05_INVOICE_MANAGEMENT.md` | Convert + send customer invoice |
| 06 | `06_PAYMENT_AND_UI.md` | Payment records + WO finance UI (no finance suite) |
| 07 | `07_TESTING_AND_FINAL_INTEGRATION.md` | E2E from existing WO |

---

## 6. Definition of done

WO-first quote→customer-accept→invoice→payments works; no offline customer accept; new WOs gated, old ones not; currency/tax as decided; no AP/Stripe/tax-admin module; existing completion intact.

---

## 7. Execute

1. Phases sequential; update progress file.  
2. Remaining opens: OD-09, OD-11, OD-13–16 (see OPEN_DECISIONS).  
3. Do not rebuild MR/WO-create flows.
