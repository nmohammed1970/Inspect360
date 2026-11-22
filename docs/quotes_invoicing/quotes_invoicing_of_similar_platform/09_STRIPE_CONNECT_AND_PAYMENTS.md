# Phase 09 — Stripe Connect & Invoice Payments

## Purpose
Reproduce HeyTeam’s **Stripe Connect direct-charge Checkout** for invoices: connect onboarding, readiness gates, session creation, webhooks, refunds, and reconciliation.

## Prerequisites
Phase 02 stripe settings table; Phase 07 invoice send + payments tables.

**Never store or document real API keys.** Use env vars only.

---

## 1. Account ownership model (confirmed)

| Concept | Behaviour |
| --- | --- |
| Platform | Your app’s Stripe platform account (secret key in env) |
| Connected account | Each organisation’s Express/Standard Connect account id in `organization_quote_invoice_stripe_settings.stripe_connect_account_id` |
| Charge type | **Direct charges** on the connected account: `stripe.checkout.sessions.create(params, { stripeAccount })` |
| Platform application fee | **Not set** — no `application_fee_amount` in invoice Checkout create (confirmed) |
| Funds | Settle to the connected account’s Stripe balance / payouts per Stripe Connect rules |

Quotes do **not** collect payment; only invoices do.

---

## 2. Connect onboarding APIs (HeyTeam)

Routes in `server/quote-invoice-settings-routes.ts`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/quote-invoice-settings/stripe` | Settings + readiness; `?refresh=1` resyncs account |
| POST | `/api/quote-invoice-settings/stripe/connect/start` | Body `{ mode: "existing" \| "new" }` → OAuth authorize URL |
| GET | `/api/quote-invoice-settings/stripe/oauth/callback` | Exchange code; persist `stripe_user_id`; state-bound (not admin session alone) |
| POST | `/api/quote-invoice-settings/stripe/account-link` | Hosted Account Link for completing requirements |
| GET | `.../onboarding/refresh` / `.../return` | Redirect helpers; sync status |
| GET | `.../stripe/transactions` | Recent charges on connected account |
| PATCH | `.../stripe/settings` | Toggles: `paymentLinksEnabled`, `bacsDdEnabled`, `cardSurchargePassThrough` |

OAuth client id: `STRIPE_CONNECT_CLIENT_ID` (ignore placeholder values).

Authorize URL builder: `server/lib/quote-invoice-stripe-connect.ts` `buildStripeConnectAuthorizeUrl`.

Account status interpreter/sync: `server/lib/stripe-connect-account-status.ts`.

---

## 3. Readiness gate for Checkout (confirmed)

`resolveInvoiceStripeConnectAccountId(cfg)` returns account id only if **all** true:

1. `paymentLinksEnabled`
2. `connectStatus === "connected"`
3. Non-empty `stripeConnectAccountId`
4. `chargesEnabled === true`
5. If `stripeLivemode` is boolean, it matches platform livemode

Otherwise send invoice without Stripe session (share URL only).

**Unclear:** whether `bacsDdEnabled` or `cardSurchargePassThrough` alter Checkout `payment_method_types` or amounts — not applied in the Checkout create snippets reviewed. Store the flags; do not invent surcharge math unless you confirm elsewhere.

---

## 4. Checkout Session create (confirmed)

On invoice send/resend (and portal pay URL ensure):

```text
mode: payment
line_items: one price_data line
  currency: document currency
  unit_amount: outstanding pence
  product_data.name: "Invoice {reference}"
success_url: shareOrPortalUrl?session_id={CHECKOUT_SESSION_ID}
cancel_url: shareOrPortalUrl
metadata:
  heyteam_document: "invoice"   # REQUIRED for admin send path
  invoice_id: ...
  organization_id: ...
Request options: { stripeAccount: connectedAccountId }
```

Persist:
- `invoices.stripeCheckoutSessionId`, `stripePaymentLinkUrl`
- row in `invoice_stripe_checkout_sessions` (session id, account id, nextCheckAt)

### Confirmed gap — portal metadata
Portal helper `buildStripeMetadata` in `customer-portal-billing.ts` currently returns **only** `invoice_id` + `organization_id` (omits `heyteam_document`).  
Reconcile logic requires `heyteam_document === "invoice"`.  
**When porting, include `heyteam_document: "invoice"` on all invoice Checkout metadata** (fix the gap) unless you intentionally replicate the bug.

---

## 5. Webhooks & reconciliation

| Endpoint | Secret env | Role |
| --- | --- | --- |
| `POST /api/stripe/webhook` | `STRIPE_WEBHOOK_SECRET` | Platform billing first; then invoice document handler |
| `POST /api/stripe/connect/webhook` | `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect account updates + invoice payment events |

Invoice document processor: `server/lib/stripe-invoice-documents.ts`.

**Events handled (confirmed):**
- `checkout.session.completed`
- `payment_intent.succeeded`
- `refund.created` → insert **negative** `invoice_payments` with method like `stripe_refund`; rebalance status

Also:
- HTTP reconcile: `POST /api/public/invoices/:token/reconcile?session_id=` and portal equivalent — retrieve session with connected account option, verify metadata, record payment if not duplicate.
- Poller: `processPendingStripeInvoiceCheckoutReconciliations`.

Idempotency: do not double-insert payments for the same PaymentIntent/Charge.

---

## 6. Refunds

On `refund.created` for a documented invoice payment:

- Insert payment row with negative `amountPence`
- Recalculate `amountPaidPence` / status (`part_paid` or `sent` etc.)

No separate “refund API” for admins in the reviewed invoice routes — Stripe Dashboard/Connect refunds flow through webhooks.

---

## 7. Receipts

On reaching `paid`, HeyTeam may send payment receipt email (`server/lib/invoice-payment-receipt.ts`) using connected-account context when available.

---

## 8. Implementation steps

1. Env wiring + Stripe SDK client helper (platform key).
2. Settings GET/PATCH + Connect start/callback/Account Link.
3. Account status sync from Stripe Account retrieve.
4. Gate helper identical to `resolveInvoiceStripeConnectAccountId`.
5. Checkout create on send + portal ensure URL (**with full metadata**).
6. Webhook signature verify + invoice payment/refund handlers.
7. Public/portal reconcile endpoints + background poller.
8. Settings UI: connect CTA, requirements list, toggles, transactions.

## 9. Acceptance criteria

- [ ] Org can OAuth-connect and persist account id.
- [ ] Checkout not created when gate fails.
- [ ] Successful Checkout marks invoice paid (webhook or reconcile).
- [ ] Duplicate events do not double-count.
- [ ] Refund reduces `amountPaidPence` and status.
- [ ] No platform secret or connect client secret exposed to browser.

## 10. Security

- Verify webhook signatures.
- OAuth `state` must bind to organisation and expire.
- Always pass `stripeAccount` when retrieving connected-account objects.
- Separate Connect webhook endpoint/secret from platform billing webhook.

## 11. References

- `server/lib/quote-invoice-stripe-connect.ts`
- `server/quote-invoice-settings-routes.ts` (stripe section)
- `server/invoice-routes.ts` (`buildStripeMetadata`, send Checkout)
- `server/lib/customer-portal-billing.ts` (`ensureInvoiceStripePayUrl`)
- `server/lib/stripe-invoice-documents.ts`
- `server/lib/stripe-connect-webhook.ts`
- `server/lib/stripe-connect-account-status.ts`
