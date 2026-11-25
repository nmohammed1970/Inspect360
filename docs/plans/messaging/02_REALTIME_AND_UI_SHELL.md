# Phase 02 — Realtime + UI shell

**Depends on:** Phase 01  
**Unlocks:** Phase 03

## Objective

Live message delivery over existing `/ws`, Messages nav + unread badge, and a working `/messages` list + thread for text chat.

## Tasks

1. Extend `server/websocket.ts`: fanout helpers + inbound typing/ack/heartbeat; update `lastSeenAt`.
2. On send/read: emit `messaging_message`, `messaging_unread_count`; create `direct_message` notification when peer not in thread.
3. Client: handle new WS types in `useNotifications` (or dedicated messaging hook) → invalidate/append React Query.
4. Add Messages item + `SidebarMenuBadge` to `app-sidebar.tsx` and `tenant-sidebar.tsx`.
5. Feature UI under `client/src/features/messaging/`: conversation list, chat pane, composer, new-conversation directory dialog.
6. Routes in `App.tsx`: `/messages`, `/messages/:conversationId`.
7. Responsive: desktop split pane; narrow view list → thread.

## Acceptance criteria

- [ ] New messages appear without refresh for online participants.
- [ ] Sidebar unread badge updates on receive and mark-read.
- [ ] In-app notification/toast for background recipients.
- [ ] Tenants and staff both reach Messages from their sidebar.
- [ ] Empty states for no conversations / empty thread.
