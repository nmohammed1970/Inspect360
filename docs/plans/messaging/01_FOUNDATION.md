# Phase 01 — Foundation (schema + REST)

**Depends on:** Phase 00  
**Unlocks:** Phase 02

## Objective

Persist conversations/messages and expose authenticated org-scoped REST APIs for directory, conversations, messages, and mark-read.

## Tasks

1. Add Drizzle tables in `shared/schema.ts` + SQL migration `server/migrations/addMessaging.sql`.
2. Add `users.last_seen_at` column.
3. Implement `server/messaging/access.ts` (org + participant checks).
4. Implement `server/messaging/service.ts` (create/list/upsert DM, send message, unread count).
5. Register `server/messaging/routes.ts` from `routes.ts`.
6. Endpoints:
   - `GET /api/messaging/unread-count`
   - `GET /api/messaging/directory?q=`
   - `GET /api/messaging/conversations?q=`
   - `POST /api/messaging/conversations`
   - `GET /api/messaging/conversations/:id`
   - `GET /api/messaging/conversations/:id/messages?cursor=&limit=`
   - `POST /api/messaging/conversations/:id/messages`
   - `POST /api/messaging/conversations/:id/read`
7. Unit/integration tests for cross-org and non-participant 403.

## Acceptance criteria

- [ ] Tables exist; app user `inspect360` has DML grants.
- [ ] Same-org users appear in directory; other orgs never do.
- [ ] Non-participants cannot read/send.
- [ ] Creating a 1:1 twice returns the same conversation.
- [ ] Cursor pagination returns older messages correctly.
- [ ] Soft fields (`clientMessageId`) reject duplicates per sender.

## Contabo

```bash
docker exec -it postgres psql -U creativecloud -d inspect360_dev
# run addMessaging.sql then GRANTs
```
