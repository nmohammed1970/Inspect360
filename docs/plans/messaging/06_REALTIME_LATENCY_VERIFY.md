# Messaging realtime latency — verification checklist

Use two browsers (or profiles), two org users.

## Instant send / receive

- [ ] Sender sees bubble immediately (pending → ticks) without waiting for refetch
- [ ] Recipient sees message without refresh while WS is connected
- [ ] No duplicate bubbles when API response and WS event both arrive
- [ ] Failed send shows **Failed · Retry**; retry succeeds with same `clientMessageId`

## Unread / secondary

- [ ] Sidebar unread badge updates live via `messaging_unread_count`
- [ ] Typing indicator appears without REST traffic
- [ ] Edit / delete / reaction update both clients without full thread refetch
- [ ] Conversation list preview and order update from WS

## Reliability

- [ ] DevTools Network: send `POST .../messages` returns before notification DB side-effects matter (fast TTFB relative to before)
- [ ] WS `/ws` reconnects after kill with capped backoff (does not stop after 5 attempts)
- [ ] With WS closed: open thread polls ~4s; reconnect stops poll and syncs
- [ ] `online` event reconnects promptly after offline

## Isolation

- [ ] User in another organization never receives messages or directory hits

## Notes

Record rough timings (send API ms, peer bubble appear ms) before/after in PR description if available.
