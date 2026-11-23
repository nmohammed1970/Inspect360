# Phase 03 — Owner Approval, Customer Send & Revisions

> Filename retained. This phase covers **both** internal owner approval **and** customer delivery/response.

## Objective

1. Owner reviews submitted quotes: **approve / reject / request changes** (audited; self-approve allowed).  
2. **Send / resend** to customer **only** when status is `owner_approved` (name + email required).  
3. Customer Accept / Decline / Request Changes **only** via hashed secure link (OD-03/OD-04).  
4. Revisions and variations re-enter owner-approval before any resend.  
5. Customer `accepted` triggers final authorisation helper (shared with Phase 04).

Owner approval and customer acceptance are **independent**. **No offline/phone owner-recorded customer decision.**

## Prerequisites

- Phase 02 complete.  
- OD-03/OD-04 resolved (link-only customer decisions).  
- Token hash + Resend available.

## Existing functionality to reuse

| Piece | Path |
|---|---|
| Token hashing | `server/passwordResetService.ts` |
| Email | `server/resend.ts` |
| Quote PDF | Phase 02 |
| Events | Phase 01 `appendWorkOrderEvent` |
| Reference | `04_QUOTE_LIFECYCLE_AND_APIS.md`, `06_CUSTOMER_QUOTE_INTERACTIONS.md` (add owner gate before send) |

## Implementation tasks

1. **Transition helper** (single module):

| From | To | Actor |
|---|---|---|
| `pending_owner_approval` | `owner_approved` | owner (incl. self) |
| `pending_owner_approval` | `owner_rejected` | owner |
| `pending_owner_approval` | `owner_changes_requested` | owner |
| `owner_changes_requested` | `pending_owner_approval` | submit (Phase 02) |
| `owner_approved` | `sent` | owner send |
| `sent` | `accepted` \| `declined` \| `customer_changes_requested` \| `expired` | customer / system |
| `customer_changes_requested` / `declined` / `owner_rejected` | new version `draft` | revise |
| `accepted` | `converted` | Phase 05 |

Forbidden: `draft`→`sent`; `pending_owner_approval`→`sent`; `owner_approved`→`accepted` without customer action.

2. Owner decision API + UI (reason required for reject / changes).  
3. Send/resend: only `owner_approved`; create hashed token with expiry; revoke prior tokens on resend/decision; email link (+ optional PDF). After `customer_changes_requested`, require revise → owner path again before resend.  
4. Public customer page + APIs (accept / decline / request-changes / pdf).  
5. **Do not** implement record-offline-customer-decision.  
6. Revise → new version `draft` → submit → owner again → send.  
7. Variation after `accepted`: same WO; full owner+customer cycle.  
8. On customer accept via token: `onQuoteAccepted`.  
9. Emails: notify preparer on owner decision; notify customer on send; notify owner/staff when customer responds.

## Backend changes

### Authenticated

| Method | Path | Actor |
|---|---|---|
| POST | `.../quotes/:quoteId/owner-decision` | `owner` — `{ decision: approve\|reject\|request_changes, reason? }` |
| POST | `.../quotes/:quoteId/send` | `owner` — requires `owner_approved` + recipient name/email |
| POST | `.../quotes/:quoteId/resend` | `owner` |
| POST | `.../quotes/:quoteId/revise` | Non-tenant with access |
| POST | `/api/work-orders/:id/quotes` variation | Non-tenant with access |

### Public

| Method | Path |
|---|---|
| GET/POST | `/api/public/maintenance-quotes/:token` (+ accept / reject / request-changes / pdf) |

## Database changes

Ensure owner vs customer decision columns from Phase 01; additive if missing.

## Frontend changes

| Screen | Purpose |
|---|---|
| Quote detail (owner) | Approve / Reject / Request changes when `pending_owner_approval`; Send when `owner_approved` |
| Quote detail (staff) | Status; revise when changes requested; no Send |
| Public customer page | Accept / Decline / Request changes |
| Pipeline UI | Draft → Owner review → Sent → Customer accepted (two distinct approval steps visible) |

## UI references

- Prototype Approve button → **owner** approval only.  
- Add Send after owner approval (prototype conflates roles — split in product UI).

## Integration points

- Email to snapshot recipient on send.  
- Customer accept ≠ owner approve.  
- Same `work_order_id` forever.

## Permissions and security

- Owner-decision + send: `owner` only.  
- Self-approve: allowed; write `owner_decided_by_user_id` even when same as preparer.  
- Customer: token only.  
- Tenants: no staff APIs.

## Acceptance criteria

- [ ] Cannot send from `draft` or `pending_owner_approval`.  
- [ ] Owner approve does not set `accepted` or unlock work by itself.  
- [ ] Owner self-approve is a separate audited action before send.  
- [ ] Customer accept via token reaches `accepted` with separate audit.  
- [ ] No offline customer-decision endpoint or UI.  
- [ ] Expired/revoked tokens fail closed; resend revokes old token.  
- [ ] Owner/customer request-changes → revise → resubmit to owner → approve → resend.  
- [ ] Manual recipient send works.  
- [ ] Variation keeps same WO and full approval chain.

## Testing

Transition unit tests; manual owner self-approve path; staff submit → owner approve → send → customer accept; attempt send without approve → 409.

## Out of scope

- Request/WO creation or triage  
- Pending-approvals list page (Phase 04)  
- Convert to invoice (Phase 05)  
- Payment recording  
- Offline customer approval  
- Contractor AP (OD-13)  
- Appointments / completion-review redesign (OD-14/15)
