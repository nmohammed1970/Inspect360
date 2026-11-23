# Quotes & invoicing — done vs remaining

Source of truth for phases in [`IMPLEMENTATION_PLAN/`](IMPLEMENTATION_PLAN/) (`00`–`07`, ODs). Updated Nov 2026.

## Workflow (correct?)

**Yes — the planned WO-first lifecycle is in place in code:**

```text
Existing WO → Quote draft → Submit → Owner approve
  → Send (email + PDF + secure link) → Customer accept/decline/changes (public page only)
  → WO authorised + cost_estimate locked → Convert → Invoice draft
  → Send invoice (email + PDF + link) → Record payments (partial/full)
```

Owner approve ≠ customer accept (independent). No offline customer decision. New WOs get `quote_required`; existing stay `not_required`. Tenants blocked from staff finance APIs.

**Not proven as Phase 07:** formal E2E / regression pack not executed as a dedicated phase. Ops must apply migrations + `APP_URL` + Resend before production smoke.

---

## Phase checklist

| Phase | Status | Done | Remaining |
|---|---|---|---|
| **01 Foundation** | Done | Price book; `maintenance_quotes` / lines / sequences; invoices / payments / share tokens; WO auth columns; `work_order_events`; `maintenanceFinanceMath` | — |
| **02 Quotation** | Done (+ polish open) | Draft on existing WO; lines (freehand + price-book soft link); VAT enum; save; submit; currency snapshot; PDF generate/download | Contact-search recipient UI; events on every draft edit |
| **03 Approvals** | Done (+ polish open) | Owner approve/reject/request changes; send/resend hashed token; public accept/decline/request-changes; revise + variation; email + PDF attach; `emailSent`/`publicLink` | Cron: `sent` → `expired` |
| **04 Workflow** | Done (+ polish open) | Start/complete gate when `quote_required`; cost lock after accept; delete WO blocked if quotes/invoices; `/maintenance/finance` pending + tracking; WO “Quote required / Authorised” badges | Richer Analytics badges; mobile-only pass |
| **05 Invoice** | Done (+ polish open) | Convert from `accepted` only; draft edit; send + public view; void; PDF download/attach | Broader OD-09 private `/objects` (PDFs already auth/token gated) |
| **06 Payments** | Done (+ polish open) | Payment API; unpaid/partial/paid; invoice payment panel; finance nav | Dedicated WO “record” tabs (quotes/invoices/activity as one surface) |
| **07 Testing** | Not done | Unit maths + transition tests exist | Full scenario pack, permission matrix, UI 390px pass, update `IMPLEMENTATION_PROGRESS.md` |

---

## Also shipped (cross-cutting)

- Settings price-book CRUD  
- Entry: Maintenance / Analytics → Quotation; sidebar **Quotes & Invoicing**  
- Public routes: `/public/quotes/:token`, `/public/invoices/:token`  
- Staff PDF: `.../quotes|invoices/:id/pdf` · Public PDF: `.../token/pdf`

---

## Explicitly out of scope (plans / ODs) — not remaining product work here

Offline/phone customer accept (OD-03); Stripe/ledgers; contractor AP (OD-13); appointments (OD-14); new completion-review (OD-15); org tax-admin Settings; MR/WO-create redesign; SaaS marketplace `/api/quotations` (separate, must keep working).

---

## Ops before real use

1. Migrations (as `creativecloud`): `addMaintenancePriceBookItems.sql` → `addMaintenanceQuotes.sql` → `addMaintenanceQuoteLifecycle.sql` (+ any line SKU add-on) + `GRANT` to `inspect360`  
2. Env: `APP_URL` or `PUBLIC_APP_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`  
3. Smoke the happy path above once on Contabo/dev
