# Phase 02 — Quotation Management

## Objective

Authorised **non-tenant** users with maintenance access can create and edit **Draft** quotations **on an already-existing work order** (lines, tax, recipient contact **or** manual), save, download PDF, and **submit** for internal owner approval. Entry is always “open this WO → quotation”. No owner decision UI, no customer send, no convert yet. No request/WO-create work.

## Prerequisites

- Phase 01 complete.  
- OD-01 resolved.  
- Work orders available from existing product flows (this phase does not create them).

## Existing functionality to reuse

| Piece | Path |
|---|---|
| WO access | `server/workOrderAccess.ts` + Phase 01 finance access helper |
| WO → MR → property/block joins | `server/storage.ts` |
| Contacts API | `/api/contacts` |
| Landlord default | `properties.landlord_contact_id` |
| PDF | `server/pdfService.ts`, `pdfBrowserPool.ts`, org branding |
| UI | shadcn, `PageHeader`, React Query, RHF + zod |
| Entry | **From existing WO only** — deep link / WO detail; never from a “create request” flow |

## Implementation tasks

1. Quote service: create draft (`work_order_id` required, same org); allocate number; **currency = org `preferred_currency` snapshot**; reject later WO changes.  
2. Prefill recipient from property landlord when present; support contact vs manual modes (OD-01).  
3. Edit while `draft` or `owner_changes_requested` (and after revise returns to draft).  
4. Line editor with **per-line tax dropdown** (OD-08): common % presets (e.g. 5/10/15/20), Exempt, 0%/Zero-rated, Other/custom %; persist type/rate/label; server recomputes line tax + totals.  
5. **Submit:** `draft` | `owner_changes_requested` → `pending_owner_approval`; require ≥1 line and valid totals; event `quote_submitted`. Recipient email not required until Send (Phase 03).  
6. Staff quote builder UI + Submit CTA; show status; linked WO / property or block; show currency from snapshot.  
7. PDF for users with read access (correct currency + tax labels).  
8. Events on create/update/submit. **No** org tax-settings screen.

## Recipient UI

Same as previously confirmed: contact search + landlord preselect **or** manual entry without creating a contact; snapshots editable; draft may omit email.

## Backend changes

| Method | Path | Actor |
|---|---|---|
| GET/POST | `/api/work-orders/:id/quotes` | Non-tenant + WO access |
| GET/PATCH | `.../quotes/:quoteId` | Same; PATCH only editable statuses |
| PUT | `.../lines` | Same |
| POST | `.../quotes/:quoteId/submit` | Preparer with access → `pending_owner_approval` |
| GET | `.../pdf` | Non-tenant + WO access |

**Do not implement:** owner-decision, send, public token, convert.

## Database changes

None if Phase 01 complete.

## Frontend changes

| Screen | Notes |
|---|---|
| Quote builder | Prototype layout; line tax dropdown; **Submit for approval** |
| Status badge | Draft / Pending owner approval / Owner changes requested |

## UI references

- `#screen-quote`, `screens/quote_screen.png` — use Approve only in Phase 03 for **owner**; here show Submit for staff.

## Integration points

- Quotes only under WO; property/block via join.  
- Do not write `cost_estimate`.  
- Do not set customer-accepted fields.

## Permissions and security

- Create/edit/submit: non-tenant + maintenance module + `canAccessWorkOrder`.  
- Tenants: 403.  
- Owner uses same draft/submit APIs when they create quotes.

## Acceptance criteria

- [ ] Non-tenant with WO access creates/edits draft; owner can too.  
- [ ] Document currency equals org preferred currency at create.  
- [ ] Per-line tax presets/exempt/zero/custom calculate correctly server-side.  
- [ ] Submit → `pending_owner_approval` with audit.  
- [ ] Recipient modes A/B work; no auto contact create.  
- [ ] WO immutable; property/block displayed.  
- [ ] PDF shows currency + tax; no send/customer side effects.  
- [ ] Tenant denied.

## Testing

Manual: clerk/contractor/owner draft → submit; tenant denied; block-level WO + manual recipient.

## Out of scope

- Creating or triaging maintenance requests  
- Creating/assigning work orders  
- Owner approve/reject UI  
- Customer send/link  
- Convert / invoice  
- Start gate  
- Org-wide tax admin module  
- Appointments
