# Phase 03 — Line Items, Pricing, Tax & Calculations

## Purpose
Specify exact money math and line validation so quotes and invoices produce identical totals to HeyTeam.

## Prerequisites
Phase 01 schema; Phase 02 price book enums.

---

## 1. Line payload contract

Each document line (create/update) carries:

| Field | Rules |
| --- | --- |
| `name` | Required non-empty |
| `description` | String (may be empty) |
| `sku` | Optional |
| `lineType` | One of document line types |
| `unit` | Required non-empty (often price-book unit) |
| `quantity` | Finite number **> 0** |
| `unitPricePence` | Integer **≥ 0** |
| `discountType` | `none` \| `percentage` \| (fixed treated as pence amount when not percentage) |
| `discountValue` | Number; % or pence depending on type |
| `vatRate` | `standard_20` \| `exempt` \| `zero_rated` \| `reduced` |
| `priceBookItemId` | Optional FK |

HeyTeam shared Zod: `shared/document-line-schema.ts`.  
Client draft model: `client/src/lib/document-line-validation.ts`.

**UI note (confirmed):** Line-level discount controls are **not** exposed in the spreadsheet editor; drafts default `discountType: "none"`, `discountValue: 0`. Document-level `discountPence` **is** exposed.

---

## 2. Per-line computation (server)

### Quotes — `computeLine` in `server/quote-routes.ts`

```text
raw          = round(quantity * unitPricePence)
lineDiscount = if discountType == "percentage"
                 then round(raw * (discountValue / 100))
                 else round(discountValue)          # treat as pence
subtotal     = max(0, raw - lineDiscount)         # stored as lineSubtotalPence
lineTax      = if vatRate == "standard_20"
                 then round(subtotal * 0.2)
                 else 0                             # exempt/zero/reduced → 0 on QUOTES
lineTotal    = subtotal + lineTax
```

### Invoices — `computeInvoiceLineAmounts` in `server/lib/invoice-totals.ts`

Same as quotes **except tax**:

```text
if vatRate == "standard_20" → round(netBeforeTax * 0.2)
else if vatRate == "reduced" → round(netBeforeTax * 0.05)
else → 0
```

**Confirmed asymmetry:** Quote tax ignores `reduced`; invoice tax applies 5% for `reduced`.

Also invoice clamps `lineDiscountPence = min(raw, max(0, lineDiscount))`.

---

## 3. Header totals

On write:

```text
subtotalPence = sum(lineSubtotalPence)   # or sum of net-before-tax lines — match HeyTeam write path
discountPence = document-level overall discount (integer pence, ≥ 0)
taxPence      = sum(lineTaxPence)
totalPence    = max(0, subtotalPence - discountPence + taxPence)   # invoice path uses this form
```

**Important:** Totals are **persisted** on create/update, not recomputed on every read. Recompute whenever lines or discounts change.

Invoice outstanding:

```text
outstanding = max(0, totalPence - amountPaidPence)
```

`amountPaidPence` is kept in sync with sum of `invoice_payments.amountPence` (refunds may be negative rows).

---

## 4. Client-side validation (builder)

From `validateDocumentLine` / `areDocumentLinesReadyToSave`:

- Name required  
- Unit required  
- Quantity finite and > 0  
- Unit price input non-empty; `unitPricePence >= 0`  
- At least one valid line  
- Customer (`clientId`) required before save  

Money input helpers: `client/src/lib/money-input.ts` (sanitize decimal → minor units).

Client live VAT preview for lines typically mirrors **quote** rule (`standard_20` only) in the editor — verify when implementing invoice builder preview if you want invoice `reduced` preview parity.

---

## 5. Implementation steps

1. Port line Zod/schema validators.
2. Implement `computeLine` and `computeInvoiceLineAmounts` with unit tests for:
   - qty 1.5 × 1000p, standard VAT
   - percentage discount 10%
   - fixed discount
   - reduced VAT on invoice vs quote
   - document discount larger than subtotal (clamp total ≥ 0)
3. Ensure create/update handlers always rewrite stored line + header money fields.
4. Map price book → line defaults (unit, price, vat, lineType, sku, description).

## 6. Acceptance criteria

- [ ] Quote with `reduced` VAT stores **0** tax (parity).
- [ ] Invoice with `reduced` VAT stores **5%** tax.
- [ ] `standard_20` always 20% after line discount.
- [ ] Invalid lines rejected client + server.
- [ ] Totals on GET match last persisted write.

## 7. References

- `server/quote-routes.ts` (`computeLine`)
- `server/lib/invoice-totals.ts`
- `shared/document-line-schema.ts`
- `client/src/lib/document-line-validation.ts`
- `client/src/components/quote-invoice/document-line-items-editor.tsx`
