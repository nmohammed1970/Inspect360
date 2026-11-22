# Phase 07 — Invoice Lifecycle & Admin APIs

## Purpose
Implement invoice CRUD, status machine, send/resend, void, manual payments, credit notes, and balance sync.

## Prerequisites
Phases 01–03; quote convert hook from Phase 04.

---

## 1. Status transitions (confirmed)

From `server/lib/invoice-lifecycle.ts`:

| From | Allowed to |
| --- | --- |
| `draft` | `sent`, `void` |
| `sent` | `overdue`, `part_paid`, `paid`, `void`, `escalated` |
| `overdue` | `part_paid`, `paid`, `void`, `escalated` |
| `part_paid` | `paid`, `void`, `escalated` |
| `escalated` | `part_paid`, `paid`, `void` |
| `paid` / `void` | (terminal) |
| `credit_note` | `void` |

`invoiceStatusAllowsEdit` → **only `draft`**.

**Confirmed caveats:**
- Payment balance sync may set `paid` / `part_paid` / `sent` without always calling `assertInvoiceStatusTransition`.
- Overdue cron may move `part_paid` → `overdue` outside the map — document and decide whether to preserve.

---

## 2. Balance sync algorithm (confirmed pattern)

After payment insert/refund:

```text
paid = sum(invoice_payments.amountPence)
total = invoice.totalPence
if paid >= total and total > 0 → status paid (set paidAt)
else if paid > 0 and paid < total and sent → part_paid
else if paid <= 0 and sent → keep overdue/escalated if already, else sent
amountPaidPence = paid
```

(See `syncInvoicePaymentBalance` style logic in `server/invoice-routes.ts`.)

---

## 3. Admin API inventory (`server/invoice-routes.ts`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/invoices` | Filters: status, dates, assignee, paymentMethod, clientIds, q, archivedOnly |
| GET | `/api/invoices/:id` | Detail: lines, payments, chase, jobs, quote link, totals |
| GET | `/api/invoices/:id/pdf` | PDF |
| POST | `/api/invoices` | Create **draft** |
| PATCH | `/api/invoices/:id` | Draft only |
| POST | `/api/invoices/:id/send` | → sent; email + optional Stripe Checkout; usage metering if applicable |
| POST | `/api/invoices/:id/resend` | New share token; re-email |
| POST | `/api/invoices/:id/void` | Void + revoke share tokens; body `{ reason? }` |
| POST | `/api/invoices/:id/record-payment` | `{ amountPence, method, note? }` manual payment |
| POST | `/api/invoices/:id/credit-note` | Parent must be `paid`; creates credit_note invoice |
| POST/GET archive/restore | `/api/invoices/:id/archive\|restore` | `archivedAt` flag (status unchanged on archive) |
| Chase | `.../chase/pause\|resume\|skip-next` | Phase 08 |
| Bulk | `/api/invoices/bulk/mark-sent`, `bulk/export-zip` | Optional |
| Public | `/api/public/invoices/:token` (+ pdf, reconcile) | Phase 08/09 |

### Create body (conceptual)
`clientId` (required), `invoiceDate`, `lines[]`, optional `quoteId`, currency, subject, `poNumber`, notes/terms, `paymentTermsKey`/`Days`, `paymentMethod`, `jobIds`, `discountPence`, `assignedToUserId`.

Due date: derived from invoice date + payment terms (see `server/lib/invoice-payment-terms.ts`).

---

## 4. Send flow (high level)

1. Transition draft → sent; set `sentAt`.
2. Create share token (~60 days in HeyTeam send path).
3. If Stripe Connect ready and outstanding > 0: create Checkout Session (Phase 09); store session id + URL on invoice.
4. Persist PDF artifact; email client with PDF + pay/share link.
5. Skip email event if no `clientEmailSnapshot`.

---

## 5. Credit notes

- Only from `paid` parent.
- Create child invoice with `parentInvoiceId`, status `credit_note`, inverted/credit semantics as HeyTeam implements (copy structure; verify signs in code when porting).

---

## 6. Schedulers

- `processOverdueInvoices` — mark past-due sent invoices `overdue`.
- Stripe checkout reconcile poller — Phase 09.
- Bulk export worker — optional.

---

## 7. Implementation steps

1. Transition helpers + edit gate.
2. CRUD with invoice tax math (Phase 03).
3. Payment recording + balance sync.
4. Send/resend/void/archive.
5. Public token GET (pay URL fields).
6. Convert-from-quote integration tests with Phase 04.

## 8. Acceptance criteria

- [ ] Non-draft invoices reject PATCH.
- [ ] Manual payment updates `amountPaidPence` and status.
- [ ] Full payment → `paid` + `paidAt`.
- [ ] Void revokes tokens.
- [ ] Converted quote produces linked draft invoice.

## 9. References

- `server/invoice-routes.ts`
- `server/lib/invoice-lifecycle.ts`
- `server/lib/invoice-totals.ts`
- `server/lib/invoice-payment-terms.ts`
