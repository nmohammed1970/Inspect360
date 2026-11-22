# Phase 01 — Data Models & Schema

## Purpose
Define the portable data model for Quotes & Invoicing so later phases can implement APIs and UI against stable contracts.

## Prerequisites
- Organisation + user auth model
- Customers table (or equivalent)
- Optional Jobs table only if you need the quote↔job FK boundary

## Scope
Tables, fields, statuses, relationships, constraints. No UI/API behaviour beyond what the schema implies.

---

## 1. Money & currency conventions

| Rule | Detail |
| --- | --- |
| Storage | Integer **minor units** named `*Pence` (even for USD/EUR — treat as smallest currency unit) |
| Currency | ISO code on each document: `GBP` \| `USD` \| `EUR` (org default may seed new docs) |
| Rounding | `Math.round` after qty × unit and after % discount / tax |

---

## 2. Status vocabularies (string constants)

### Quote statuses
`new_quote_enquiry` | `draft` | `sent` | `change_requested` | `accepted` | `declined` | `expired` | `converted` | `superseded` | `archived`

### Invoice statuses
`draft` | `sent` | `overdue` | `part_paid` | `paid` | `void` | `credit_note` | `escalated`

### Quote source
`manual` | `widget_enquiry`

### Payment term keys
`due_on_receipt` | `net_7` | `net_14` | `net_30` | `net_60` | `custom`

### Price book
- Units: `hour`, `shift`, `day`, `flat_fee`, `visit`, `m2`
- Categories: `labour`, `material`, `consumable`, `equipment`, `overhead`
- VAT rates: `standard_20`, `exempt`, `zero_rated`, `reduced`
- Document line types: `materials`, `labour`, `subcontractor`, `rental`, `other`

### Stripe Connect account status (settings row)
`not_connected` | `setup_incomplete` | `info_required` | `verification_pending` | `payments_only` | `payouts_only` | `operational` | `restricted` | `rejected`  
Plus operational `connectStatus` values used in code: `disconnected`, `connected`, `pending_oauth`.

---

## 3. Core tables (implement equivalents)

### 3.1 `organization_quote_invoice_branding` (1:1 org)
Letterhead + numbering defaults + payment-term defaults.

Key fields: `organizationId` (unique), logo path, trading/registered names, company/VAT numbers, addresses, phone/email, bank fields, `quoteReferencePrefix` (default `HT-Q`), `invoiceReferencePrefix` (default `HT-INV`), `quoteExpiryDays` (default `30`), payment term presets JSON, default payment terms key/days/HTML, default quote/invoice terms HTML, timestamps.

### 3.2 `organization_quote_invoice_stripe_settings` (1:1 org)
`stripeConnectAccountId`, `connectStatus`, OAuth state/error, `paymentLinksEnabled`, `bacsDdEnabled`, `cardSurchargePassThrough` + disclaimer timestamp, `accountStatus`, `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted`, `stripeLivemode`, `requirementsSummary` (json), sync timestamps.

### 3.3 `price_book_items`
Org catalog: `sku`, `name`, `description`, `unit`, `defaultUnitPricePence`, `vatRate`, `currency`, `category`, optional `costRatePence`, `environmentTags[]`, `productivityRate`, `active`.

### 3.4 `price_book_customer_overrides`
Unique `(customerId, priceBookItemId)` with override unit price / VAT.

### 3.5 Terms & email templates
- `quote_invoice_terms_templates`: name, bodyHtml, isDefaultQuote, isDefaultInvoice
- `quote_invoice_email_templates`: unique `(organizationId, templateKey)`, subject/body

### 3.6 `quotes`
| Field group | Fields |
| --- | --- |
| Identity | `id`, `organizationId`, `quoteReference`, `quoteNumber`, `versionNumber` (default 1) |
| Parties | `clientId` (nullable FK customers RESTRICT), snapshots: name (required), email/phone/address |
| Boundary | `jobId` (nullable FK jobs SET NULL) — **do not implement job workflow here** |
| Lifecycle | `status`, `source`, dates `quoteDate`/`expiryDate`, timestamps sent/accepted/declined/expired/converted/archived |
| Versioning | `parentQuoteId`, `supersededByQuoteId` (logic-level; may lack formal FK) |
| Content | `subject`, `notesHtml`, `internalNotes`, `termsTemplateId`, `termsSnapshotHtml` |
| Money | `subtotalPence`, `discountPence`, `taxPence`, `totalPence`, `currency` |
| Audit | `createdByUserId`, created/updated |

Uniques: `(organizationId, quoteReference)`, `(organizationId, quoteNumber, versionNumber)`.

### 3.7 `quote_line_items`
`quoteId` CASCADE, `sortOrder`, optional `priceBookItemId` SET NULL, `name`, `description`, `sku`, `lineType`, `unit`, `quantity`, `unitPricePence`, `discountType`/`discountValue`, `vatRate`, computed `lineSubtotalPence`/`lineDiscountPence`/`lineTaxPence`/`lineTotalPence`.

### 3.8 Quote support tables
- `quote_attachments`
- `quote_share_tokens` (hashed token, expiry, revoke, viewed)
- `quote_status_history`
- `quote_audit_log`

### 3.9 `invoices`
Similar to quotes with: required `clientId`, optional `quoteId` SET NULL, `parentInvoiceId` (credit notes), `invoiceReference`/`invoiceNumber`, payment terms fields, `paymentMethod`, `assignedToUserId`, Stripe session/url fields, `amountPaidPence`, `pdfStoragePath`, void fields, money totals, `archivedAt`.

### 3.10 `invoice_line_items`
Same shape as quote lines with `invoiceId`.

### 3.11 Payments & Stripe session tracking
- `invoice_payments`: amount, currency, method, optional Stripe PI/charge ids, recorder, note
- `invoice_stripe_checkout_sessions`: invoiceId, session id, stripeAccountId, reconcile scheduling fields
- `invoice_status_history`, `invoice_audit_log`, `invoice_share_tokens`, `invoice_job_links`, delivery/chase tables as needed (see Phase 08)

### 3.12 Chase settings (preview)
`organization_invoice_chase_settings` + per-invoice chase state — detail in Phase 08.

---

## 4. Relationship diagram

```
organizations 1──1 branding
organizations 1──1 stripe_settings
organizations 1──* price_book_items
customers 1──* quotes (optional)
customers 1──* invoices (required)
quotes 1──* quote_line_items
quotes 0..1──* invoices (quoteId)
invoices 1──* invoice_line_items
invoices 1──* invoice_payments
jobs 0..1──* quotes (jobId)   [BOUNDARY ONLY]
```

---

## 5. Implementation steps

1. Create enums/constants modules matching Section 2.
2. Create branding + stripe settings + price book tables.
3. Create quotes + lines + share/history/audit.
4. Create invoices + lines + payments + checkout sessions.
5. Add unique indexes and FKs with the same delete behaviours (CASCADE / SET NULL / RESTRICT).
6. Seed empty branding/stripe rows when an organisation is created (or lazy-create on first settings open).

## 6. Acceptance criteria

- [ ] All money fields are integers in minor units.
- [ ] Quote client nullable; invoice client required.
- [ ] Quote/invoice number+version uniqueness per org.
- [ ] Price book item delete nulls line FKs (SET NULL).
- [ ] Status values match Section 2 exactly if you want parity.

## 7. References (HeyTeam)

- `shared/schema.ts` (~L1842–2711)
- `shared/price-book-constants.ts`
- Migrations `066_quote_invoice_settings.sql`, `067_quote_documents.sql`, `068_invoice_management.sql`, `094_invoice_stripe_checkout_sessions.sql`, `134_quotes_job_link.sql`, `135_stripe_connect_account_status.sql`
