# Phase 07 — Testing & Final Integration

## Objective

Prove finance flows **starting from a pre-existing work order**: draft → submit → owner approve → send → customer accept → convert → record payments (including owner self-approve); verify owner approval ≠ customer acceptance; verify **no** MR/WO-create regressions beyond additive authorisation fields; regress completion/HMO/Fixflo/SaaS billing; fix only defects from Phases 01–06.

## Prerequisites

- Phases 01–06 complete.  
- Open decisions resolved or deferred with defaults (OD-13 AP not silently shipped).

## Protect / reuse

| Area | Note |
|---|---|
| Completion + signature | Unchanged |
| HMO verification | Must still fire on completion |
| Fixflo | Unchanged |
| SaaS `/api/quotations` | Must still work |
| Existing tsx tests | Keep green |

## Implementation tasks

1. Assert tests: maths; quote transitions (`draft`/`sent`/`accepted`/…); convert preconditions; payment outstanding; token accept/reject; start gate.  
2. Run scenario pack below.  
3. Permission matrix: owner vs tenant vs others (OD-12).  
4. Security: public token, PDF privacy, tenant denial.  
5. Regression: legacy `not_required` WO; HMO; Fixflo; SaaS quotation.  
6. UI pass desktop + ~390px: quote, public customer, invoice, record, tracking, settings.  
7. Confirm contractor-payables paths were **not** shipped; confirm **dual-stage** owner+customer approval **was** shipped correctly.  
8. Update `IMPLEMENTATION_PROGRESS.md`.

## Backend / frontend

Bugfixes only. No new product scope.

## Acceptance criteria (feature-level)

- [ ] Happy path: staff draft → submit → owner approve → send → customer accept → cost locked → start/complete → convert → send invoice → part pay → pay.  
- [ ] Owner self-approve then send then customer accept via **token only**.  
- [ ] No offline customer-decision path.  
- [ ] Owner approve alone does not unlock start.  
- [ ] Cannot send before `owner_approved`.  
- [ ] Existing WOs not blocked; new WOs gated.  
- [ ] Per-line tax + preferred currency on PDF/email.  
- [ ] Convert preserves tax; payments partial/full; overpay rejected.  
- [ ] Pending Owner Approvals + customer tracking.  
- [ ] No contractor AP / tax-admin / finance-suite UI.  
- [ ] Tokens hashed/revoked; regressions pass.

## Testing — scenario pack

1. Happy path (above).  
2. Owner self-approve then send then customer accept.  
3. Attempt send without owner approve → fail.  
4. Attempt start after owner approve but before customer accept → fail.  
5. Legacy WO without quote still starts.  
6. Customer accept **only** via secure link in private window.  
7. Assert **no** offline customer-decision API.  
8. Expired/revoked token fails; resend issues new token.  
9. Manual recipient full path → convert (tax lines preserved).  
10. Contact + landlord preselect path.  
11. Block-level WO path.  
12. Existing `not_required` WO starts without quote; new `quote_required` WO blocked until accept.  
13. Convert twice → fail; WO id immutable.  
14. Edit invoice lines → quote unchanged.  
15. Delete WO with finance docs → refused; WO without finance docs keeps prior delete behaviour.  
16. Tenant 403; clerk can submit but not owner-approve/send/convert/pay.  
17. Partial then full payment; overpay rejected.  
18. Pending Owner Approvals; HMO / SaaS regressions; WO detail access.

```bash
npx tsx shared/maintenanceFinanceMath.test.ts
npx tsx server/maintenanceQuoteTransitions.test.ts
npx tsx server/workOrderAuthorisation.test.ts
# plus payment/convert tests as added
```

## Out of scope

- Building request triage or WO-create features “while testing”  
- Contractor AP (unless OD-13 explicitly opened)  
- Appointments / new completion-review  
- Native mobile quotes/invoices  
- Unrelated discrepancy-report fixes  

## Exit

Mark all phases Complete in [`IMPLEMENTATION_PROGRESS.md`](IMPLEMENTATION_PROGRESS.md); record release SHA when code lands. Confirm test scenarios always begin with **an already-created WO**.
