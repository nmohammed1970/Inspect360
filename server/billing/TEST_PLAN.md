# Inspect360 Billing — Test Plan & Traceability (Nov 2026)

Mandatory rule: **never mark a phase complete until its acceptance criteria and tests pass.**

## Traceability (requirement → tests)

| Req ID | Business rule | Automated tests | Manual (if needed) |
|--------|---------------|-----------------|--------------------|
| P-01..P-05 | Catalog prices, 10×, £2.95 floor | `catalogValidation*.test.ts`, `billingFinancialMath.test.ts` | Admin publish UI |
| C-04 | 500 photos/credit | `billingFinancialMath.test.ts`, `catalogValidation.test.ts` | Complete inspection with 500/501 photos |
| C-02 | SMS segments 160/153 | `billingFinancialMath.test.ts` | Send long SMS, confirm ledger |
| C-06 | Zero-credit capture OK | `billingWorkflow.guards.test.ts`, `entitlement.test.ts` | Offline capture with 0 credits |
| C-07 | Auto top-up max 3 | `billingFinancialMath.test.ts` (cap const) | Trigger 4th auto top-up → blocked |
| S-06 | Fail 7d → read-only | `billingFinancialMath.test.ts` | Stripe fail invoice + wait/backdate |
| A-02 | Price version freeze | `billingFinancialMath.test.ts` | Publish new version; old sub unchanged |
| Webhook | Idempotency / duplicate / recovery | `webhookIdempotency.test.ts` | Replay Stripe CLI event twice |
| Authz | Tenant isolation / admin | `billingWorkflow.guards.test.ts` | Cross-org API 403 |
| Evidence | Never delete on fail/cancel | `billingWorkflow.guards.test.ts` | Cancel + open evidence URL |
| Ledger | Credits match payment/usage | Manual + Stripe Dashboard | Checkout then compare ledger vs Stripe |
| Amounts | Match provider confirmed txn | Manual | Compare Checkout amount to invoice |

## Phase test plans

### Phase A — Catalog
- Unit: floor, 10×, negative, missing cycle, enquire-only, seed validate
- Integration: ensure-seed → publish → GET `/api/billing/catalog`
- E2E: Admin create draft, change price, validate, publish; `/pricing` shows new amounts

### Phase B — Checkout / webhooks
- Unit: billingV2 gate, idempotency store
- Integration: duplicate webhook, failed then retry, delayed ignored
- E2E: Checkout trial → webhook → `billing_subscriptions` + trial credits
- Manual: timeout (kill network mid-checkout), recover via portal

### Phase C — Credits
- Unit: photo bands, SMS, FIFO order (service), refund helper presence
- Integration: consume then low-balance auto-topup path (Stripe test mode)
- E2E: 0 credits capture → AI blocked → top-up → AI works

### Phase D — Limits / add-ons
- Unit: pack proration math
- Integration: property create at limit → 403; pack Stripe item quantity
- E2E: Buy pack → property limit increases → Stripe invoice line appears

### Phase E — Failures / cancel / auto top-up / enquire
- Unit: readonly day math; enquire analytics POST
- E2E: past_due → read_only; cancel_at_period_end; enquire opens Calendly

### Phase F — Hardening
- All suites green via `npm run test:billing:all`
- Manual matrix below signed off

## Manual reproducible tests (automation unsuitable / Stripe-dependent)

### M1 — Amounts vs Stripe
1. Use Stripe test mode + Checkout for `pm_essentials` yearly.
2. Note `amount_total` / line unit amounts (ex VAT) vs catalog `amount_minor`.
3. Confirm hosted invoice tax line = Stripe Tax.
4. Pass if catalog minor × quantity matches Stripe pre-tax line.

### M2 — Ledger vs payment
1. Complete Checkout top-up `topup_insp_25`.
2. Query `credit_batches` for org: `remaining_quantity=25`, `credit_kind=inspection`, expiry ~+12m.
3. Complete one inspection consuming N credits; ledger shows −N linked to inspection id.
4. Pass if sum(batches) + sum(ledger) consistent.

### M3 — Duplicate webhook
1. `stripe listen --forward-to localhost:.../api/billing/webhook`
2. Trigger checkout; note `evt_…`
3. `stripe events resend evt_…`
4. Pass if credits granted once; `billing_webhook_events.processed_at` set; no second grant.

### M4 — Delayed / out-of-order webhook
1. Deliver `customer.subscription.updated` before checkout completed for same customer.
2. Then deliver checkout.completed.
3. Pass if final subscription row active/trialing and credits correct.

### M5 — Zero-credit offline capture
1. Exhaust inspection credits.
2. Open mobile/web inspection; add photos offline; sync.
3. Confirm photos stored; AI analyze returns lock/403; evidence still downloadable after cancel/read_only.

### M6 — Cross-tenant
1. User A org calls `/api/billing/v2/credits` with cookies for org A — OK.
2. Attempt admin/catalog mutate without admin session — 401/403.
3. Pass if no org B data returned.

### M7 — Price freeze
1. Note `billing_subscriptions.price_version_id` for org.
2. Admin publish new price version with higher amounts.
3. Pass if org row still old `price_version_id`; new checkouts use new version.

## Running automated suites

```bash
npm run test:billing:all
```

Individual:

```bash
npx tsx shared/billingFinancialMath.test.ts
npx tsx server/billing/catalogValidation.test.ts
npx tsx server/billing/catalogValidation.boundaries.test.ts
npx tsx server/billing/webhookIdempotency.test.ts
npx tsx server/billing/billingWorkflow.guards.test.ts
npx tsx shared/entitlement.test.ts
```

## Test execution report template

Fill after each phase:

| Scenario | Type | Result | Notes |
|----------|------|--------|-------|
| … | unit/integration/e2e/manual | passed/failed/blocked/untested | … |

Totals: Passed __ / Failed __ / Blocked __ / Untested __
