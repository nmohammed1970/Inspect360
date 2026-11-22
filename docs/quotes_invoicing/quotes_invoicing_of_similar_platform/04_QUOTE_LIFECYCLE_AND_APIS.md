# Phase 04 — Quote Lifecycle & Admin APIs

## Purpose
Implement server-side quote CRUD, status machine, send/share tokens, revision/versioning, convert-to-invoice, and expiry.

## Prerequisites
Phases 01–03. Customers exist. Branding prefixes available.

---

## 1. Status transition map (confirmed)

From `server/lib/quote-lifecycle.ts`:

| From | Allowed to |
| --- | --- |
| `new_quote_enquiry` | `draft`, `archived` |
| `draft` | `sent`, `archived` |
| `sent` | `change_requested`, `accepted`, `declined`, `expired`, `superseded`, `archived` |
| `change_requested` | `draft`, `superseded`, `archived` |
| `accepted` | `converted`, `archived` |
| `declined` / `expired` / `converted` / `superseded` | `archived` |
| `archived` | `draft` (restore) |

Enforce with `assertQuoteTransition` on lifecycle mutations.  
**Confirmed caveat:** archive route in HeyTeam may set archived without calling the helper — prefer enforcing transitions in a new implementation.

---

## 2. Admin API inventory (HeyTeam `server/quote-routes.ts`)

Auth: authenticated team admin + organisation middleware.

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | `/api/quotes` | List; filters: status, date range, jobId, q, archivedOnly |
| POST | `/api/quotes` | Create **draft**; allocate number/reference; snapshot client; compute lines/totals |
| GET | `/api/quotes/:id` | `{ row, lines, attachments, history, audit, versions }` |
| PATCH | `/api/quotes/:id` | Draft: in-place edit. `sent`/`change_requested`: create **new version** draft, mark old `superseded`, link parent/supersededBy; may email supersession |
| POST | `/api/quotes/:id/send` | → `sent`; create share token (~30d); PDF + email; set `sentAt` |
| POST | `/api/quotes/:id/archive` | Archive |
| POST | `/api/quotes/:id/restore` | archived → draft |
| POST | `/api/quotes/:id/convert-enquiry-to-draft` | enquiry → draft (widget path) |
| POST | `/api/quotes/:id/attachments` | Multipart ≤10MB |
| POST | `/api/quotes/:id/convert-to-invoice` | Only `accepted` → create draft invoice + quote `converted` |
| POST | `/api/quotes/ai/generate-lines` | Optional AI lines (billing credits) — implement only if target needs AI |

### Create body (conceptual)
`clientId`, `quoteDate`, `expiryDate`, `lines[]` (min 1), optional `jobId`, `subject`, notes/terms fields, `discountPence`, `currency`, optional prefix override.

### Public token routes (detail Phase 06)
`GET/POST /api/public/quotes/:token` (+ accept/decline/request-change/pdf).

---

## 3. Reference & versioning rules

- Allocate monotonic `quoteNumber` per organisation.
- `quoteReference` = prefix + number (and possibly version decoration — match HeyTeam `quote-reference.ts`).
- Unique `(organizationId, quoteNumber, versionNumber)`.
- Editing a **sent** quote creates `versionNumber + 1` draft; prior version `superseded`.

---

## 4. Send flow (confirmed)

1. Assert current status can go to `sent` (from `draft`).
2. Persist status + `sentAt`; write status history + audit.
3. Generate opaque token; store **SHA-256 hash** only; expiry ~30 days.
4. Build public URL `{APP_BASE}/quote/{bareToken}`.
5. Render PDF; email customer using template (e.g. `new_quote_sent`) with PDF attach.
6. Return `{ ok, shareUrl }`.

Share tokens: never store plaintext; lookup by hash.

---

## 5. Convert to invoice (confirmed)

Preconditions: quote `accepted`.

Create invoice draft copying:
- client + snapshots  
- currency, subject/notes/terms as appropriate  
- line items (recompute with **invoice** tax rules)  
- link `quoteId`  
- payment terms from org defaults  

Then transition quote → `converted`, set `convertedAt`.

---

## 6. Expiry job

Scheduler `processExpiredQuotes`: for org quotes in `sent` with `expiryDate` < today → `expired`.

---

## 7. Implementation steps

1. Port transition helper.
2. Implement list/create/get/patch with org scoping.
3. Implement reference allocation.
4. Implement send + share tokens + hook for email/PDF (Phase 10 can flesh rendering).
5. Implement convert-to-invoice using Phase 07 invoice create primitives (coordinate stub).
6. Implement archive/restore + expiry cron.
7. Add status history + audit on every transition.

## 8. Acceptance criteria

- [ ] Cannot send non-draft quote.
- [ ] Cannot convert unless accepted.
- [ ] Patch on sent creates new version; old superseded.
- [ ] Public token works only for unexpired, unrevoked hashes.
- [ ] All queries filtered by organisation.

## 9. Security

- Team admin only for mutating admin routes.
- Validate client belongs to same org.
- If `jobId` provided, validate job belongs to org (boundary check only).

## 10. References

- `server/quote-routes.ts`
- `server/lib/quote-lifecycle.ts`
- `server/lib/quote-reference.ts`
