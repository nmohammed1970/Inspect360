# Internal Messaging — Master Plan

**Status:** Approved architecture; implement phases 01–05 in order  
**Updated:** 25 November 2026  
**Scope:** Web app only (mobile UI deferred). Organization = instance isolation.

Related: [`01_FOUNDATION.md`](01_FOUNDATION.md) · [`02_REALTIME_AND_UI_SHELL.md`](02_REALTIME_AND_UI_SHELL.md) · [`03_RICH_CHAT.md`](03_RICH_CHAT.md) · [`04_MEDIA.md`](04_MEDIA.md) · [`05_HARDENING.md`](05_HARDENING.md)

---

## 1. Decisions

| Decision | Choice |
|----------|--------|
| Eligibility | All active users in same `organizationId` (all app roles) |
| Domain | New tables/routes — do **not** extend `maintenance_request_messages` |
| Conversations | Direct (2) + group (3+); 1:1 upserted uniquely |
| Realtime | Extend existing `/ws`; in-process fanout |
| Attachments | Private object storage ACL |
| Soft delete | Sender-only; tombstone for participants |

## 2. Architecture

```text
Postgres: messaging_* tables + users.last_seen_at
REST:     /api/messaging/*
WS:       messaging_message | receipt | typing | presence | unread_count
UI:       /messages (+ :conversationId), sidebar badge
Notify:   notifications.type = direct_message (when not viewing thread)
```

## 3. Phase order

```text
00 docs → 01 foundation → 02 realtime+UI → 03 rich chat → 04 media → 05 harden
```

Do not start the next phase until the current phase acceptance criteria pass.

## 4. Progress

| Phase | Status |
|-------|--------|
| 00 Docs | Done |
| 01 Foundation | Done |
| 02 Realtime + UI | Done |
| 03 Rich chat | Done |
| 04 Media | Done |
| 05 Hardening | Done |
| Maintenance discussion threads | Done |

## 5. Contabo migrations

Connect as `creativecloud` (never `inspect360` for DDL). After create:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO inspect360;
```

Dev: `inspect360_dev` · Prod: `inspect360`.
