# Phase 05 — Hardening

**Depends on:** Phase 04  
**Unlocks:** Production-ready messaging (web)

## Objective

Rate limits, idempotency, isolation tests, reconnect/retry UX, responsive polish.

## Tasks

1. Per-user send rate limit (~30/min); attachment prepare rate limit.
2. Enforce unique `(sender_id, client_message_id)`; duplicate POST returns existing message.
3. Automated tests: cross-org directory empty; cross-org conversation 404/403; non-participant message 403.
4. Client: optimistic send with retry on failure; WS reconnect refreshes unread + open thread.
5. Responsive QA: mobile list/thread navigation; tablet split.
6. Update `00_MASTER_PLAN.md` progress table.

## Acceptance criteria

- [ ] Burst sends beyond limit return 429.
- [ ] Duplicate `clientMessageId` does not create two rows.
- [ ] Isolation tests pass in CI or local runner.
- [ ] After WS drop/reconnect, badge and open chat recover without full page reload.
- [ ] Mobile layout usable without horizontal overflow.
