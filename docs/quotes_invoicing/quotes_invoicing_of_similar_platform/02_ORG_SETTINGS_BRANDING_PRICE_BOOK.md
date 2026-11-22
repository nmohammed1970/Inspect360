# Phase 02 — Org Settings, Branding & Price Book

## Purpose
Implement organisation configuration that quotes/invoices consume: branding, numbering prefixes, terms, email templates, payment terms, price book (+ customer overrides), and the settings UI shell. Stripe Connect UI wiring is introduced here but payment mechanics are Phase 09.

## Prerequisites
- Phase 01 schema
- Admin auth (`requireAuth` + team admin equivalent)
- File upload for logos

## Scope
Settings APIs + manager settings screens. Not document CRUD.

---

## 1. Existing behaviour (confirmed)

Settings live under HeyTeam route hub **`/billing/settings`** with tabs:

1. Price book  
2. Branding  
3. Terms & conditions  
4. Email templates  
5. Payment chasing (detail Phase 08)  
6. Payment terms  
7. Stripe Connect (detail Phase 09)

Duplicate admin templates page: `/templates/quote-invoice` (terms + email only).

Lazy pattern: GET branding/stripe creates defaults if missing.

---

## 2. API surface (HeyTeam: `server/quote-invoice-settings-routes.ts`)

Implement equivalent endpoints (paths may differ; contracts should match):

### Branding
| Method | Path (HeyTeam) | Notes |
| --- | --- | --- |
| GET | `/api/quote-invoice-settings/branding` | Full branding row |
| PUT/PATCH | `/api/quote-invoice-settings/branding` | Update letterhead, prefixes, expiry days, bank, terms defaults as stored on branding |
| POST | `/api/quote-invoice-settings/branding/logo` | Multipart logo upload → store path |

### Price book
| Method | Behaviour |
| --- | --- |
| GET items | List org items; filter by currency/active as UI needs |
| POST/PATCH/DELETE item | CRUD; validate unit/category/vatRate enums |
| Customer overrides | GET/PUT per customer+item override price/VAT |

### Terms templates
CRUD for `quote_invoice_terms_templates`; mark default quote/invoice.

### Email templates
GET/PATCH by `templateKey` (keys from schema const `QUOTE_INVOICE_EMAIL_TEMPLATE_KEYS`).

### Payment terms defaults
Persist `defaultPaymentTermsKey`, `defaultPaymentTermsDays`, HTML on branding (and/or dedicated panel payload).

### Stripe (stub for this phase)
Expose GET settings + readiness flags; full OAuth in Phase 09.

### Chase
GET/PATCH chase settings — implement in Phase 08 if splitting work; schema exists in Phase 01.

**Auth:** all admin settings routes require authenticated team admin + organisation context.

---

## 3. Branding fields used by documents

When creating/sending docs, snapshots come from branding:

- Trading / company names, addresses, VAT number, bank details → PDF letterhead
- `quoteReferencePrefix` / `invoiceReferencePrefix` → reference allocation
- `quoteExpiryDays` → default expiry = quoteDate + N days
- Default terms HTML → prefill TipTap on create
- Default payment terms → invoice builder defaults

---

## 4. Price book rules

- Items are org-scoped and currency-scoped; quote/invoice builders filter catalog by document currency.
- Category → document line type mapping:

```
labour → labour
material | consumable → materials
equipment → rental
default → other
```

(Confirmed in `shared/price-book-constants.ts` `mapPriceBookCategoryToLineType`.)

- Customer overrides: when selecting a catalog item for a customer, prefer override unit price/VAT if present.

---

## 5. Frontend (HeyTeam)

| Piece | Path |
| --- | --- |
| Settings hub | `client/src/pages/billing-quote-invoice-settings.tsx` |
| Branding card | `client/src/features/quote-invoice-settings/branding-settings-card.tsx` |
| Payment terms panel | `.../payment-terms-defaults-panel.tsx` |
| Terms defaults | `.../terms-defaults-panel.tsx` |
| Email templates | `.../email-templates-panel.tsx` |
| Templates page | `client/src/pages/quote-invoice-templates.tsx` |

State: React Query against the settings endpoints.

---

## 6. Implementation steps

1. Implement branding GET/upsert + logo upload.
2. Implement price book CRUD + overrides.
3. Implement terms + email template CRUD.
4. Implement payment-terms defaults panel persistence.
5. Build settings hub UI with tabs (Stripe tab can show “not connected” until Phase 09).
6. On org creation (or first visit), ensure branding + stripe settings rows exist.

## 7. Acceptance criteria

- [ ] Admin can set prefixes and quote expiry days; new quotes use them.
- [ ] Price book item appears in quote builder catalog for matching currency.
- [ ] Logo uploads and path persists for PDF (Phase 10).
- [ ] Unauthorized users cannot mutate settings.
- [ ] Enum validation rejects invalid unit/VAT/category.

## 8. Security

- Restrict uploads (type/size); store outside public web root or behind auth.
- Never return Stripe secrets; only account id + status flags.
- Scope all queries by `organizationId` from session — never from client-supplied org id alone.

## 9. References

- `server/quote-invoice-settings-routes.ts`
- `client/src/pages/billing-quote-invoice-settings.tsx`
- `client/src/features/quote-invoice-settings/*`
- `shared/schema.ts` branding / stripe / price book sections
