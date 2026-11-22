# Phase 08 — Invoice UI & Payment Chasing

## Purpose
Manager invoice UI, public/portal invoice views, and automated payment chasing configuration/runtime.

## Prerequisites
Phase 07 APIs; Phase 02 settings hub tab for chasing.

---

## 1. Manager routes (HeyTeam)

| Route | Page |
| --- | --- |
| `/billing/invoices` | `billing-invoices.tsx` — list, filters, bulk select |
| `/billing/invoices/new` | `billing-invoice-new.tsx` — create |
| `/billing/invoices/:id/edit` | same — edit **draft only** |
| `/billing/invoices/:id` | `billing-invoice-detail.tsx` — send/resend/void/record payment/credit note/chase/PDF |

Legacy: `/billing/invoices/review/:id` redirects to detail.

---

## 2. Builder behaviour

Mirrors quote builder with extras:

- PO number
- Payment terms key + custom days
- Due date derived from terms
- Same line editor + document discount + TipTap terms

Actions: Save draft; Save and send.

---

## 3. Detail actions

| Action | API |
| --- | --- |
| Send / Resend | `POST .../send`, `.../resend` |
| Void | `POST .../void` |
| Record payment | modal → `POST .../record-payment` |
| Credit note | `POST .../credit-note` when paid |
| PDF | `GET .../pdf` |
| Chase pause/resume/skip | chase endpoints |
| Archive/restore | archive endpoints |

Show payments ledger, outstanding, Stripe pay URL if present, linked quote.

---

## 4. Customer invoice views

| Channel | UI | APIs |
| --- | --- | --- |
| Public | `/invoice/:token` → `public-invoice-view.tsx` | GET public invoice; Pay now; PDF; reconcile `?session_id=` |
| Portal | `/customer/billing/invoices/:id` | Portal GET; pay URL; reconcile; PDF |

Portal list visibility statuses (confirmed): `sent`, `overdue`, `part_paid`, `paid`.

---

## 5. Payment chasing (confirmed module)

### Settings
Table `organization_invoice_chase_settings` (+ customer overrides).  
UI: settings tab + `invoice-chase-schedule-editor.tsx`.  
API: GET/PATCH via quote-invoice settings routes.

### Runtime
- Service: `server/invoice-chase-service.ts`
- Per-invoice chase state/events
- Detail actions: pause (optional note), resume, skip-next
- Sends reminder emails on schedule for unpaid sent/overdue invoices

Implement schedule schema as stored in HeyTeam (days-after-due steps, templates). Port fields from schema + settings routes rather than inventing a new model.

---

## 6. Implementation steps

1. List + builder pages.
2. Detail with payment modal and status actions.
3. Public invoice page with pay button.
4. Portal invoice list/detail.
5. Chase settings UI + service + cron entrypoint.
6. Wire overdue processor.

## 7. Acceptance criteria

- [ ] Cannot edit non-draft invoice in UI.
- [ ] Record payment reflects on detail immediately.
- [ ] Public token shows outstanding and pay CTA when URL exists.
- [ ] Chase pause stops further reminders until resume.
- [ ] Overdue status appears after due date passes (cron).

## 8. References

- `client/src/pages/billing-invoice-*.tsx`
- `client/src/pages/public-invoice-view.tsx`
- `client/src/pages/customer-billing-invoice-detail.tsx`
- `client/src/features/billing/invoice-chase-schedule-editor.tsx`
- `server/invoice-chase-service.ts`
- Schema chase tables in `shared/schema.ts` (~`069_invoice_chasing.sql`)
