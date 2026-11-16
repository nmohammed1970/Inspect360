# Billing test execution report

Generated: 2026-11-09T09:07:21.811Z

**Automated:** 6 passed, 0 failed, 0 blocked
**Manual / E2E untested:** 10 (see TEST_PLAN.md)

| ID | Phase | Suite | Result | ms |
|----|-------|-------|--------|----|
| FIN-UNIT | A/C/E | Financial math (photos, SMS, 10×, floor, proration, readonly, freeze) | **passed** | 4504 |
| CAT-UNIT | A | Catalog validation core | **passed** | 4150 |
| CAT-BOUND | A | Catalog validation boundaries + seed | **passed** | 4060 |
| WH-IDEM | B | Webhook idempotency / duplicate / recovery | **passed** | 3501 |
| WF-GUARD | C/E/F | Workflow guards (capture, evidence, authz, freeze) | **passed** | 3350 |
| ENT | C | Entitlement + zero-credit capture | **passed** | 3655 |

## Untested (manual — do not skip)
- [ ] M1 Amounts vs Stripe confirmed transaction
- [ ] M2 Credit ledger vs payment/usage events
- [ ] M3 Duplicate Stripe webhook resend
- [ ] M4 Delayed/out-of-order webhook
- [ ] M5 Zero-credit offline capture E2E
- [ ] M6 Cross-tenant isolation live
- [ ] M7 Price freeze after publish live
- [ ] E2E full Checkout → trial credits journey
- [ ] E2E payment failure → read_only after 7 days
- [ ] E2E concurrent consume race
