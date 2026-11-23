# Phase 06 — Payment Recording & WO UI Integration

## Objective

Let the **owner** record **payments received** against customer invoices — nothing more. Not a finance/accounting product. Also finish WO-centric quote/invoice navigation and light email polish.

## Prerequisites

- Phase 05: customer invoices exist / can be sent.  
- Phase 04 queues exist.

## Existing functionality to reuse

| Piece | Path |
|---|---|
| Email | `server/resend.ts` |
| Events | `work_order_events` |
| Prototype record | `#screen-record`, `screens/record_screen.png` |
| Payments table | `maintenance_invoice_payments` |

## Implementation tasks

1. Payment API: list/add payments with **amount**, **date**, **method** (e.g. bank transfer, cash), optional **reference**, optional **notes**, **recorded_by** = session user.  
2. Recompute: total paid, outstanding, status `unpaid` | `partially_paid` | `paid`.  
3. Reject amount ≤ 0, overpayment (sum > invoice total), payments on void invoices. No Stripe/bank calls.  
4. Invoice UI: simple “Record payment” form + payment history + outstanding.  
5. WO record page tabs: quotes, invoices, activity; show authorised cost and invoice payment status.  
6. Nav links to Pending Owner Approvals + customer tracking (Phase 04).  
7. **No** Settings tax module, approval limits, finance dashboard, or org finance settings screen.  
8. Display amounts with document currency (`preferred_currency` snapshot).

## Backend changes

| Method | Path | Actor |
|---|---|---|
| GET | `.../invoices/:invoiceId/payments` | Owner |
| POST | `.../invoices/:invoiceId/payments` | Owner |

## Database changes

Use Phase 01 payments table (`method` column required). Indexes as needed.

## Frontend changes

| Screen | Notes |
|---|---|
| Invoice payment panel | Amount, date, method, reference, notes |
| WO record | Quotes & invoices list; outstanding |
| Tracking | Unpaid / partial invoices (lightweight) |

## UI references

- Record/invoice prototype layout; customer “payments received” copy only.

## Permissions

Owner records payments. Tenants denied. No bank details stored.

## Acceptance criteria

- [ ] Multiple payments against one invoice; outstanding and status correct.  
- [ ] Overpayment / invalid amount rejected.  
- [ ] Invoice send ≠ paid.  
- [ ] WO page shows quotes/invoices/payments summary.  
- [ ] No finance-settings or tax-admin UI shipped.  
- [ ] Responsive; Inspect360 design system.

## Testing

Partial then full pay; overpay rejected; void invoice rejects payment.

## Out of scope

- Stripe, ledgers, reconciliation, supplier payments, finance dashboards  
- Tax/currency settings screens  
- MR/WO create redesign  
- Contractor AP  
- Native app
