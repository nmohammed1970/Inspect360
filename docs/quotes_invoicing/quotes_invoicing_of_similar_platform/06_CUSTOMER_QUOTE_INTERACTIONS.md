# Phase 06 — Customer Quote Interactions

## Purpose
Implement customer-facing quote view and response flows: public share link and authenticated customer portal.

## Prerequisites
Phase 04 send/share tokens and lifecycle transitions.

---

## 1. Two channels (confirmed)

| Channel | Auth | Routes (HeyTeam) |
| --- | --- | --- |
| Public share | Opaque token in URL | `/quote/:token` → `public-quote-view.tsx` |
| Customer portal | Customer login | `/customer/billing`, `/customer/billing/quotes/:id` |

Both ultimately transition the same quote statuses.

---

## 2. Public API

| Method | Path | Rules |
| --- | --- | --- |
| GET | `/api/public/quotes/:token` | Hash token; return quote + lines (+ date format); mark viewed |
| POST | `/api/public/quotes/:token/accept` | Only if status `sent` → `accepted` |
| POST | `/api/public/quotes/:token/decline` | Body `{ reason? }`; only `sent` → `declined` |
| POST | `/api/public/quotes/:token/request-change` | Body `{ message }` **required**; only `sent` → `change_requested` |
| GET | `/api/public/quotes/:token/pdf` | PDF bytes |

Reject expired/revoked tokens. Do not leak whether a token exists beyond generic 404.

---

## 3. Portal API (`server/lib/customer-portal-billing.ts`)

Auth: customer session + portal billing entitlement.

| Method | Path |
| --- | --- |
| GET | `/api/customer-portal/quotes` |
| GET | `/api/customer-portal/quotes/:id` |
| POST | `/api/customer-portal/quotes/:id/accept` |
| POST | `/api/customer-portal/quotes/:id/decline` |
| POST | `/api/customer-portal/quotes/:id/request-change` |
| GET | `/api/customer-portal/quotes/:id/pdf` |

**Visibility filter (confirmed):** statuses `sent`, `change_requested`, `accepted`, `converted`.  
Ownership: quote’s `clientId` must belong to the portal customer account (`assertCustomerOwnsDocument` pattern).

---

## 4. UI behaviour

### Public page (`public-quote-view.tsx`)
- Show letterhead-ish summary, lines, totals, terms.
- If `status === "sent"`: buttons Accept / Decline / Request change.
- Decline: optional reason.
- Request change: message required (client validation).
- PDF download link.
- After action: show confirmation; hide action buttons.

### Portal
- List quotes with status badges.
- Detail mirrors public actions via portal APIs.

---

## 5. Business rules

- Accept/decline/request-change from public path check `status === "sent"` **directly** (stricter than full transition map for accept from other states).
- Request-change notifies admin workflow by status; email optional (confirm in Phase 10 if sent).
- No payment on quotes — payment is invoice-only (Phase 09).

---

## 6. Implementation steps

1. Token hash lookup + GET public payload.
2. Accept/decline/request-change with history/audit.
3. Public React page.
4. Portal list/detail + ownership checks.
5. PDF endpoints (can stub until Phase 10).

## 7. Acceptance criteria

- [ ] Valid token shows quote; invalid → 404.
- [ ] Accept only when `sent`; becomes `accepted`.
- [ ] Request change requires message; becomes `change_requested`.
- [ ] Portal user cannot open another customer’s quote.
- [ ] PDF downloads for authorized viewers.

## 8. Security

- Rate-limit public POSTs.
- Store only token hashes.
- Never expose internal notes on public/portal payloads.

## 9. References

- `server/quote-routes.ts` (public section)
- `server/lib/customer-portal-billing.ts`
- `client/src/pages/public-quote-view.tsx`
- `client/src/pages/customer-billing.tsx`, `customer-billing-quote-detail.tsx`
