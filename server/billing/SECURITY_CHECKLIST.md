# Self-serve billing security checklist (Nov 2026)

- [x] No card data stored — Stripe Checkout / Customer Portal only
- [x] Webhook signature verified when `STRIPE_WEBHOOK_SECRET` is set
- [x] Webhook idempotency via `billing_webhook_events.stripe_event_id` (unique)
- [x] Org isolation on customer billing routes (`req.user.organizationId`)
- [x] Admin catalog / publish routes require `isAdminAuthenticated`
- [x] Published price versions are immutable (clone to draft to edit)
- [x] Money stored as integer minor units (pence)
- [x] Self-serve checkout is the only customer purchase path (admin credit-request UX removed)
- [x] Payment failure → `past_due` → `read_only` after configured days
- [x] Evidence / capture not deleted on cancel; read-only still allows GET
- [x] SMS credits separated from inspection entitlement balance

## Rollout

1. Apply `server/migrations/addBillingCatalogV1.sql` (as table owner / creativecloud on Contabo)
2. `npm run seed:billing` (or Admin → Billing Catalog → Ensure seed)
3. Configure Stripe Tax + webhook endpoint to `/api/billing/webhook`
