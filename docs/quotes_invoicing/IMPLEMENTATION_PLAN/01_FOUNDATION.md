# Phase 01 — Foundation

## Objective

Minimal durable schema and money maths for **customer** quotations/invoices on **existing work orders**. No quote UI, no tax-admin module, no offline customer APIs.

## Prerequisites

- OD-01, OD-02, **OD-06, OD-07, OD-08** resolved.  
- Migrations as `creativecloud` + `GRANT` to `inspect360`.  
- Avoid SaaS name collisions (`invoices` / `quotations` / `/api/quotations`).

## Existing functionality to reuse

| Piece | Path |
|---|---|
| Schema style | `shared/schema.ts` |
| Integer money pattern | `shared/billingFinancialMath.ts` |
| Currency enum / org field | `organizations.preferred_currency` |
| Formatting | `shared/countryUtils.ts`, `LocaleContext` |
| Row locks | `server/billingService.ts` |
| Migrations | `server/migrations/*.sql` |
| Auth / module / locks | `server/auth.ts`, `shared/entitlements.ts` |
| WO access | `server/workOrderAccess.ts` |

## Implementation tasks

1. Name tables `maintenance_*` (AR: org → customer).  
2. `shared/maintenanceFinanceMath.ts` + tests: line net, per-line tax from type/rate, header totals, payment outstanding / status.  
3. Idempotent SQL: quotes, lines, share_tokens, invoices, lines, payments, sequences, `work_order_events`, additive WO columns.  
4. Mirror in `shared/schema.ts` with non-colliding types.  
5. Sequence allocator (`SELECT … FOR UPDATE`).  
6. Access helper: tenants denied; non-tenant WO-scoped quote mutations later; owner for invoice/pay.  
7. Add `/api/maintenance-finance` (or equivalent) to `LOCKED_API_PREFIXES` only for routes that exist (pending lists later — **no** tax CRUD settings).  
8. Minimal WO create hook: new inserts get `authorisation_status = quote_required`; existing rows default `not_required` (OD-06). No WO-create UX change.

## Backend changes

No finance-settings or tax-rate admin APIs in this phase.

Optional: none beyond schema + maths + sequences + events helper.

## Database changes

| Table | Purpose |
|---|---|
| `maintenance_quotes` | Header: `work_order_id`, org, status, currency (from preferred), recipient snapshots + nullable contact id, totals, owner/customer decision metadata, versioning/variation links |
| `maintenance_quote_lines` | description, qty, unit, unit_price_minor, **tax_type**, **tax_rate**, **tax_label**, line tax/total minors |
| `maintenance_quote_share_tokens` | token hash, expiry, revoked_at, viewed_at |
| `maintenance_invoices` | Same WO + quote_id; recipient snapshot copy; currency; totals; status |
| `maintenance_invoice_lines` | Copied tax fields from quote lines |
| `maintenance_invoice_payments` | amount_minor, paid_at, **method**, reference?, notes?, recorded_by_user_id |
| `maintenance_document_sequences` | Quote/invoice numbers |
| `work_order_events` | Append-only audit |

**Do not create:** `maintenance_tax_rates`, heavy `maintenance_finance_settings`, approval-limit tables, offline-decision tables.

**WO additive columns:** `authorisation_status` (default `not_required` for existing), `approved_quote_id`, `authorised_total_minor`, optional `reference`.

**Tax on lines (OD-08):** e.g. `tax_type` ∈ `percentage` \| `exempt` \| `zero_rated` \| `custom`; rate 0 for exempt/zero; custom/percentage store numeric rate; label for display/PDF.

**Payments:** support many rows per invoice; app logic rejects sum > invoice total.

FKs to `work_orders` `ON DELETE RESTRICT`. `GRANT` to `inspect360`.

## Frontend

None.

## Integration

- Read existing WOs/MRs later for joins.  
- Currency always from `preferred_currency` at create time.

## Permissions

Tenants denied any future finance routes. Settings tax UI: none.

## Acceptance criteria

- [ ] Migration idempotent; grants documented.  
- [ ] No tax-rate admin table.  
- [ ] Maths tests cover presets/exempt/zero/custom and payment outstanding.  
- [ ] New WO insert → `quote_required`; existing → `not_required`.  
- [ ] Quote/invoice headers have currency column.  
- [ ] Line tax type/rate/label columns exist.

## Testing

```bash
npx tsx shared/maintenanceFinanceMath.test.ts
```

## Out of scope

MR/WO create redesign; quote UI; org tax admin; offline customer accept; Stripe; contractor AP.
