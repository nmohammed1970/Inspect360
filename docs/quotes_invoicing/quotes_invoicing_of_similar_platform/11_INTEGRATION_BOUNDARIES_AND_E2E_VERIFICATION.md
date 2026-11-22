# Phase 11 — Integration Boundaries & End-to-End Verification

## Purpose
Define how Quotes & Invoicing touches adjacent systems **without** requiring a HeyTeam-style Jobs module, and provide a full acceptance suite.

## Prerequisites
Phases 01–10 implemented.

---

## 1. Job boundary (only what quotes need)

### Confirmed coupling in HeyTeam
- `quotes.jobId` nullable FK → `jobs` (SET NULL) — migration `134_quotes_job_link.sql`.
- Job UI embeds `JobLinkedQuotePanel` to view/send/open linked quote.
- Navigation helper `withJobQuoteContext` adds `?from=job&jobId=` when opening quote from a job.
- Job form may create/patch quotes and run AI line generation with job context.
- Scheduling gate (`job-quote-scheduling-gate.ts`) may block job activation until quote rules pass — **job-domain logic; do not port unless target has the same rule**.

### Portable integration contract
If the target app has work orders / jobs:

| Operation | Contract |
| --- | --- |
| Link | Optional `jobId` on quote create/update; validate job belongs to same org |
| Unlink | Allow nulling `jobId`; deleting job nulls FK |
| Deep link | Quote UI may accept return URL / job id query for breadcrumbs |
| No job module | Omit `jobId` entirely; quotes still fully functional |

**Do not** implement dispatch, timesheets, or job status machines in this module.

---

## 2. Widget / enquiry boundary (optional)

HeyTeam can create billing quotes from a public quotation widget (`widget-billing-quote-service.ts`) with `source: "widget_enquiry"` (often as `draft`).  
Admin may call `convert-enquiry-to-draft` for legacy `new_quote_enquiry` rows.

**If target has no widget:** skip; support only `source: "manual"`.

---

## 3. SaaS billing boundary (do not confuse)

HeyTeam `/billing` subscription UI (`BillingV2Dashboard`) is **platform SaaS billing**, not customer quotes/invoices.

Document documents live under `/billing/quotes`, `/billing/invoices`, `/billing/settings`.

Optional metering: quote/invoice send may increment org monthly usage counters / AI credits — implement only if the target sells the same SaaS limits.

---

## 4. Customers & contacts

- Invoices require a customer (`clientId`).
- Quotes preferably have a customer; snapshots store name/email for send/PDF even if relationship changes later.
- Portal access maps logged-in customer users to customer records (`customer-portal-access.ts`).

---

## 5. End-to-end verification checklist

### Settings
- [ ] Branding save + logo appears on PDF
- [ ] Price book CRUD; item appears in builder for currency
- [ ] Stripe Connect start → callback → `chargesEnabled` sync
- [ ] Enable payment links only when gate passes

### Quote path
- [ ] Create draft with 2 lines (mixed VAT) — totals match Phase 03 quote rules
- [ ] Save and send — email + public link
- [ ] Public accept → status accepted
- [ ] Public decline / request-change paths
- [ ] Revise sent quote → new version; old superseded
- [ ] Convert accepted → draft invoice linked by `quoteId`

### Invoice path
- [ ] Edit draft; cannot edit after send
- [ ] Send creates share link; Checkout URL when Connect ready
- [ ] Manual partial payment → `part_paid`
- [ ] Manual full payment → `paid`
- [ ] Stripe Checkout success → webhook/reconcile → `paid` (metadata includes `heyteam_document`)
- [ ] Refund webhook reduces paid balance
- [ ] Void revokes tokens
- [ ] Credit note from paid invoice
- [ ] Overdue cron flips past-due invoices
- [ ] Chase pause/resume

### Portal
- [ ] Customer sees only own sent/relevant docs
- [ ] Portal quote accept works
- [ ] Portal invoice pay URL works with full metadata

### Security / isolation
- [ ] Org A cannot read Org B documents by id
- [ ] Public tokens hashed at rest
- [ ] Webhook signatures required
- [ ] No secrets in client bundles or docs

### Job boundary (if applicable)
- [ ] Quote with `jobId` validates ownership
- [ ] Deleting job nulls quote link without deleting quote

---

## 6. Suggested automated tests

1. Unit: line tax quote vs invoice (`reduced`).
2. Unit: quote/invoice transition matrices.
3. Unit: Connect account id resolver gate matrix.
4. Integration: create → send → accept → convert → send invoice → record payment.
5. Integration: Checkout completed event idempotency.
6. API authz: cross-org access denied.

---

## 7. Implementation order reminder

Always: **01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11**.

Phases 08 and 09 can partially overlap after 07 (UI vs Stripe), but do not enable Pay CTAs until 09 gate works.

---

## 8. References

- `client/src/components/jobs/job-linked-quote-panel.tsx` (boundary UI only)
- `client/src/lib/navigation-context.ts` (`withJobQuoteContext`)
- `server/lib/widget-billing-quote-service.ts` (optional)
- `server/lib/job-quote-scheduling-gate.ts` (job-domain; optional)
- Master guide: `00_MASTER_IMPLEMENTATION_GUIDE.md`
