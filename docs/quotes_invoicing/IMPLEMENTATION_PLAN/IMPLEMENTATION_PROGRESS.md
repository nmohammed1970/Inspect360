# Implementation progress — Maintenance Quotes & Invoicing

**Status:** Not started  
**Entry:** Existing Work Order  
**Flow:** Draft → owner approve → secure-link customer → convert → record payments  
**Master:** [`00_MASTER_PLAN.md`](00_MASTER_PLAN.md)

---

## Phase status

| Phase | Doc | Status |
|---|---|---|
| 01 Foundation | `01_FOUNDATION.md` | **Not Started** |
| 02 Quotation Management | `02_QUOTATION_MANAGEMENT.md` | **Not Started** |
| 03 Owner + Customer (link only) | `03_QUOTATION_APPROVALS.md` | **Not Started** |
| 04 Workflow Integration | `04_WORKFLOW_INTEGRATION.md` | **Not Started** |
| 05 Customer Invoice | `05_INVOICE_MANAGEMENT.md` | **Not Started** |
| 06 Payment recording + WO UI | `06_PAYMENT_AND_UI.md` | **Not Started** |
| 07 Testing | `07_TESTING_AND_FINAL_INTEGRATION.md` | **Not Started** |

---

## Decisions

| ID | Status |
|---|---|
| OD-01 Recipient | **Resolved** |
| OD-02 Dual-stage approval | **Resolved** |
| OD-03 Offline customer approve | **Resolved — removed** |
| OD-04 Secure link | **Resolved** |
| OD-06 New WOs only gated | **Resolved** |
| OD-07 `preferred_currency` | **Resolved** |
| OD-08 Per-line tax in builder | **Resolved** |
| OD-09 Private file serving | Unresolved |
| OD-11 Invoice delivery channel | Unresolved |
| OD-13 Contractor AP | Unresolved (defer) |
| OD-14 Appointments | Unresolved (out of project) |
| OD-15 Completion-review stage | Unresolved (keep existing) |
| OD-16 Pre-auth skip rules | Unresolved (always require quote) |

---

## Checklists

### 01
- [ ] Minimal schema (no tax-admin tables)  
- [ ] Maths + payment outstanding helpers  
- [ ] New WO `quote_required` / existing `not_required`  

### 02
- [ ] Draft/submit on existing WO  
- [ ] Per-line tax dropdown  
- [ ] Currency snapshot + PDF  

### 03
- [ ] Owner decisions  
- [ ] Send + hashed token (expire/revoke)  
- [ ] Public customer page only — **no offline accept**  

### 04
- [ ] Start gate for new WOs only  
- [ ] Cost lock; delete guard with finance docs  
- [ ] Pending owner approvals + customer tracking  

### 05
- [ ] Convert preserves tax/currency  
- [ ] Customer invoice send/PDF  

### 06
- [ ] Simple payment records (amount/date/method/ref/notes/recorder)  
- [ ] Outstanding / unpaid-partial-paid; reject overpay  
- [ ] WO finance UI — **no** finance settings suite  

### 07
- [ ] E2E from existing WO; no offline path; payments; regressions  
