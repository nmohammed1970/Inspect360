# Phase 05 — Invoice from Quote (Customer Invoices)

## Objective

After a quotation is **customer-accepted** (`accepted` — not merely `owner_approved`), the owner uses **Convert to Invoice** to create a **customer invoice draft** (organisation = issuer, customer = recipient) populated from the quote. Owner reviews/edits permitted fields, saves, and **sends** the invoice to the customer (email ± secure link per OD-11). Invoice edits must **not** mutate the historical quotation. No payment recording yet (Phase 06). No contractor/payables invoices.

## Prerequisites

- Phase 03–04: quote can reach customer `accepted`; WO authorised from that event.  
- OD-09, OD-11.  
- Reference: `04_QUOTE_LIFECYCLE_AND_APIS.md` §5 Convert to invoice; `07_INVOICE_LIFECYCLE_AND_APIS.md`.

## Existing functionality to reuse

| Piece | Path |
|---|---|
| Accepted quote + lines | Phase 02–03 data |
| Maths | `maintenanceFinanceMath` (recompute invoice lines on convert) |
| PDF / email | Puppeteer pool, Resend, org branding |
| Prototype layout | `#screen-invoice` structure — **relabel** for customer invoice (not contractor supplier bill) |
| Upload | Only if supporting docs needed; keep private (OD-09) |

## Implementation tasks

1. `POST .../quotes/:quoteId/convert-to-invoice`:  
   - Precondition: status customer `accepted` (not `owner_approved` alone; not already `converted`).  
   - Create invoice draft on the **same** `work_order_id` and `organization_id` as the quote (do not accept a different WO).  
   - Copy recipient snapshot fields and nullable `recipient_contact_id` from the quote (manual recipients stay contact-less).  
   - Copy **currency**, lines including **tax_type / tax_rate / tax_label**, recompute totals; link `quote_id`.  
   - Transition quote → `converted`; set `converted_at`.  
   - Never update quote line rows from invoice edits.  
2. Invoice CRUD while `draft`: edit lines/dates/notes within rules; server totals; may edit recipient snapshot for corrections but must not invent a contact; **reject** `work_order_id` changes.  
3. Owner **Send invoice**: status → `sent`; email **snapshot** recipient email with PDF; optional public invoice token (OD-11).  
4. Invoice PDF generation (org letterhead → bill-to recipient snapshot; show linked WO + property/block via join).  
5. Owner invoice UI: Convert CTA on accepted quote; invoice editor; Send; read-only linked WO / property or block.  
6. Void draft/sent unpaid invoices with reason (optional but recommended).  
7. Tracking API buckets: accepted not converted; invoices draft/sent unpaid.

**Explicitly do not build:** contractor invoice intake, three-way match vs supplier, approve/query contractor bill, supplier invoice number as primary identity (customer invoice number from org sequences instead).

## Backend changes

| Method | Path | Notes |
|---|---|---|
| POST | `/api/work-orders/:id/quotes/:quoteId/convert-to-invoice` | Owner; → draft invoice |
| GET/POST | `/api/work-orders/:id/invoices` | List / (optional manual create — prefer convert-only for v1) |
| GET/PATCH | `.../invoices/:invoiceId` | Detail / draft edit |
| PUT | `.../lines` | Editable draft only |
| POST | `.../send` | Email + status sent |
| GET | `.../pdf` | Owner PDF |
| POST | `.../void` | Owner + reason |
| Public (optional) | `/api/public/maintenance-invoices/:token` | View/PDF if OD-11 |

## Database changes

Ensure invoice header has: mandatory `work_order_id`, `quote_id` (when from convert), nullable `recipient_contact_id`, recipient snapshot columns (not supplier fields). Org invoice number via sequences. No property/block columns — derive for UI via WO → MR.

## Frontend changes

| Screen | Notes |
|---|---|
| Quote detail | **Convert to Invoice** enabled iff `accepted` |
| Invoice page | Adapt prototype: status, linked quote, amount, customer, lines, send — replace “Supplier name” / contractor copy with **Bill to customer** |
| Entry | From convert, tracking list, WO record |

## UI references

- Prototype `#screen-invoice`, `screens/invoice_screen.png` — layout only  
- Reference invoice send/PDF patterns — not Stripe pay URLs  
- Payment panel: read-only “Not paid” until Phase 06

## Integration points

- Convert only from `accepted` quote.  
- Historical quote immutable after convert.  
- WO completion not required for convert (product: convert is available once quote accepted; work may proceed in parallel — do **not** require contractor completion for customer billing unless product later says so). *If product prefers invoice only after job completion, gate convert — default per user instruction: convert available after customer acceptance.*  
- Fixflo untouched.

## Permissions and security

- Convert/edit/send/void: owner (OD-12).  
- Attachments/PDFs: authenticated or valid token; not public `/objects`.  
- Tenants denied.

## Acceptance criteria

- [ ] Convert only from customer `accepted`; fails on `owner_approved` / `sent`.  
- [ ] Convert creates invoice draft with same WO, copied recipient snapshot (± contact id), lines, tax, currency, totals.  
- [ ] Manual-recipient quotes convert without requiring a contact record.  
- [ ] Quote becomes `converted`; quote lines unchanged if invoice lines later edited; `work_order_id` immutable.  
- [ ] Cannot convert twice; cannot convert non-accepted.  
- [ ] Owner can edit draft and send; email uses snapshot address (and link if OD-11).  
- [ ] No contractor/payables APIs or UI.  
- [ ] PDF shows org as issuer, recipient as bill-to, and linked WO / property or block.  
- [ ] Invoice reachable from WO detail; UI responsive; prototype contractor labels replaced.

## Testing

Manual: accept quote (contact and manual recipient cases) → convert → verify WO + recipient snapshot → edit line → verify quote unchanged → send → PDF. Attempt convert on draft/sent → fail. Attempt change invoice workOrderId → fail.

## Out of scope

- Payment rows UI/API (Phase 06)  
- Stripe / pay links  
- **Contractor AP invoices** (OD-13 — do not implement under this customer-invoice UI)  
- Credit notes / chasing  
- MR/WO create  
- Native mobile
