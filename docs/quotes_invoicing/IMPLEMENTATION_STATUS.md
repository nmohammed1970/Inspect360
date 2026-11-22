# Quotes & invoicing — status (Nov 2026)

Short snapshot vs phases `01`–`07` in [`IMPLEMENTATION_PLAN/`](IMPLEMENTATION_PLAN/).

## Implemented

| Area | What’s in |
|---|---|
| **01 Foundation** | Price book; quotes/lines/sequences; finance maths; lifecycle tables (tokens, invoices, payments, WO auth columns, events) |
| **02 Quotation** | Draft builder on existing WO; freehand + price-book lines; save; submit → `pending_owner_approval` |
| **03 Approvals** | Owner approve / reject / request changes; send/resend hashed link; public customer accept / decline / request changes; revise + variation |
| **04 Workflow** | New WOs `quote_required`; start/complete gated until customer accept; cost lock; delete blocked if finance docs; pending + tracking queues (`/maintenance/finance`) |
| **05 Invoice** | Convert accepted quote → invoice draft; edit; send + public invoice view; void |
| **06 Payments** | Record payments on invoice; unpaid/partial/paid; invoice payment UI |

## Remaining (vs plans)

| Area | Gap |
|---|---|
| **02 PDF** | Staff/customer **PDF download** (HTML view only for now) |
| **02 polish** | Richer recipient contact picker; fuller work-order event coverage on every edit |
| **03 polish** | Expiry job (`sent` → `expired`); email reliability/templates polish |
| **04 polish** | Stronger Analytics badges; mobile tolerance only partially covered |
| **05 polish** | Invoice PDF; OD-09 private attachment serving |
| **06 polish** | Deeper WO “record” tabs (quotes/invoices/activity as one dedicated surface) |
| **07 Testing** | Formal E2E checklist / integration pass not run as a phase |
| **Out of scope (still)** | Offline customer approve; Stripe/ledgers; contractor AP; appointments; tax-admin Settings; MR/WO create redesign |

## Migrations to apply (Contabo)

1. `server/migrations/addMaintenancePriceBookItems.sql`  
2. `server/migrations/addMaintenanceQuotes.sql`  
3. `server/migrations/addMaintenanceQuoteLifecycle.sql`  

(+ `GRANT … TO inspect360` on new tables as noted in each file)
