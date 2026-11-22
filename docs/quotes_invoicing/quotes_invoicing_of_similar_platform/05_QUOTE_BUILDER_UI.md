# Phase 05 — Quote Builder & Manager UI

## Purpose
Build the manager-facing quote list, create/edit builder, and detail actions matching HeyTeam UX flows.

## Prerequisites
Phases 02–04 APIs available.

---

## 1. Routes (HeyTeam)

| Route | Page | Role |
| --- | --- | --- |
| `/billing/quotes` | `billing-quotes.tsx` | List / filter / archive / restore |
| `/billing/quotes/new` | `billing-quote-new.tsx` | Create builder |
| `/billing/quotes/:id/edit` | same | Edit/revise |
| `/billing/quotes/:id` | `billing-quote-detail.tsx` | Send, convert, archive, history |

Optional analytics: `/billing/documents` (`billing-documents-dashboard.tsx`).

---

## 2. List page behaviour

- Fetch `GET /api/quotes` with filters: status, dates, search `q`, archived toggle.
- Show status badges (`client/src/lib/billing-status-badges.ts` pattern).
- Row click → detail; actions for archive/restore.
- Empty states when no quotes.

---

## 3. Builder UX (confirmed)

**Sections (collapsible cards):**

1. **Customer & dates** — customer select (required), quote date, expiry (default today + branding `quoteExpiryDays`), currency GBP/USD/EUR, subject, live customer snapshot preview.
2. **Line items** — `DocumentLineItemsEditor`: spreadsheet rows, price-book autocomplete filtered by currency, qty/unit/price/VAT, add/copy/delete, live line totals.
3. **Notes & terms** — document discount, notes, TipTap terms (prefill defaults on create), internal notes.
4. **Totals** — subtotal − discount + tax.

**Primary actions:**

- Save draft / Save changes → `POST` or `PATCH` → navigate to detail.
- Save and send → save then `POST .../send`.

**Edit gates:**

- Allow edit only if status ∈ `draft` | `sent` | `change_requested`.
- For sent/change_requested, show copy that saving creates a **revision**.

**Not on builder:** Convert to invoice (detail page only). No job picker on standalone builder (job linkage is job-side — Phase 11).

### Shared components

| Component | Path |
| --- | --- |
| Line editor | `client/src/components/quote-invoice/document-line-items-editor.tsx` |
| Terms editor | `.../terms-editor.tsx` (`coerceTipTapHtml`) |
| Collapsible section | `.../collapsible-section-card.tsx` |
| Line validation | `client/src/lib/document-line-validation.ts` |

State: React Query + local form state (no global store required).

---

## 4. Detail page actions

| Status | Actions |
| --- | --- |
| `draft` | Edit, Send, Archive |
| `sent` | View public link, Edit (revise), Archive |
| `change_requested` | Edit revise, Archive |
| `accepted` | **Convert to invoice**, Archive |
| `new_quote_enquiry` | Convert enquiry → draft |
| Terminal-ish | Restore from archived when applicable |

Show lines, totals, status history, attachments upload, version list.

---

## 5. Implementation steps

1. List page + filters + badges.
2. Line editor component with price-book quick-add.
3. Create builder wired to POST.
4. Edit hydrate from GET; enforce edit gates.
5. Detail page with send/convert/archive mutations + toasts.
6. Breadcrumbs and navigation to settings.

## 6. Acceptance criteria

- [ ] Cannot save without customer + ≥1 valid line.
- [ ] Expiry defaults from branding days.
- [ ] Catalog filtered by currency.
- [ ] Save-and-send lands on detail with status `sent`.
- [ ] Accepted quote shows Convert; success opens invoice.

## 7. References

- `client/src/pages/billing-quotes.tsx`
- `client/src/pages/billing-quote-new.tsx`
- `client/src/pages/billing-quote-detail.tsx`
- `client/src/components/quote-invoice/*`
