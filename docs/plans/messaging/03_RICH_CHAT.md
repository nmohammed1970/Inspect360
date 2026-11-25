# Phase 03 — Rich chat

**Depends on:** Phase 02  
**Unlocks:** Phase 04

## Objective

Receipts, typing, presence/last-seen, reply/edit/delete, reactions, emoji, in-thread search, copy/forward.

## Tasks

1. API: PATCH/DELETE message; reactions POST/DELETE; search; forward; receipts on deliver/read.
2. WS: `messaging_receipt`, `messaging_typing`, `messaging_presence`.
3. UI: ticks (sent/delivered/read), typing line, online/last-seen in header.
4. Reply quote bar; edit/delete menus (own messages); reaction picker; emoji in composer.
5. In-thread search panel; copy; forward dialog (pick conversation).

## Acceptance criteria

- [ ] Edit shows `editedAt`; delete shows tombstone to peers.
- [ ] Reactions sync live to participants.
- [ ] Typing indicator clears after idle (~3s) or send.
- [ ] Search finds body matches within conversation only.
- [ ] Forward creates a new message in the target conversation.
