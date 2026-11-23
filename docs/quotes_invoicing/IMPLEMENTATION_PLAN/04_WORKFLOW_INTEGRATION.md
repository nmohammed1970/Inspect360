# Phase 04 — Maintenance Workflow Integration

## Objective

Connect **customer-accepted** quotations to **existing** work-order status/cost behaviour; lock `cost_estimate`; refuse deletes when finance docs exist; ship **Pending Owner Approvals** and **awaiting customer response** tracking. Do **not** change how WOs are created or how requests are triaged. Preserve completion, HMO, Fixflo.

## Prerequisites

- Phase 03 complete (`owner_approved` → `sent` → customer token `accepted`).  
- OD-06 resolved (new WOs only gated). Delete protection when finance docs exist.

## Existing functionality to reuse

| Piece | Path |
|---|---|
| Status PATCH | `server/routes.ts` work-order routes |
| Completion gate | `server/workOrderCompletionGate.ts` (unchanged) |
| HMO | `server/hmo/maintenanceVerification.ts` |
| Deletes | `server/storage.ts` |
| Cost writes | PATCH cost / WO patch / certificate service |
| Lists | `Maintenance.tsx`, `Analytics.tsx` |

## Implementation tasks

1. Block start/complete only when `authorisation_status` requires a quote (new WOs); **existing `not_required` WOs remain unblocked**.  
2. `onQuoteAccepted` (token customer `accepted` only): set authorised fields + `cost_estimate`. Owner approval alone must not.  
3. Lock manual `cost_estimate` when approved quote linked.  
4. Refuse delete of WO/request when quotes/invoices exist; WOs without finance docs keep prior delete behaviour.  
5. **Pending Owner Approvals** page/API.  
6. **Customer response tracking** (`sent` / customer changes, etc.).  
7. Badges on Maintenance/Analytics; WO detail access.  
8. Mobile: tolerate fields only.  
9. HMO/Fixflo smoke.

## Backend changes

| Area | Change |
|---|---|
| `assertWorkOrderMayStart` | Requires customer-accepted quote when gate applies |
| Cost PATCH | Locked after accept |
| DELETE | 409 if finance docs |
| GET | `/api/maintenance-finance/pending-owner-approvals` — owner |
| GET | `/api/maintenance-finance/tracking` — awaiting customer / finance buckets |

## Database changes

Indexes on quote `(organization_id, status)` for pending/tracking queries.

## Frontend changes

| Screen | Change |
|---|---|
| `/maintenance/pending-approvals` (or equivalent) | Owner queue for `pending_owner_approval` |
| Tracking page | Awaiting customer; customer changes requested; ready to convert (`accepted` not converted) |
| Maintenance / Analytics | Status badges (pending owner vs sent vs accepted) |

## UI references

- Prototype “needs approval before work starts” → distinguish **owner review** vs **awaiting customer** vs **authorised after customer accept**.

## Integration points

- Completion unchanged after start allowed.  
- Fixflo untouched.

## Permissions and security

- Pending owner approvals + decisions: owner.  
- Tracking: owner (staff may see own submitted items if useful — optional).  
- Tenants excluded.

## Acceptance criteria

- [ ] Owner approve alone does **not** allow start or set cost_estimate.  
- [ ] Customer accept allows start; cost_estimate locked to authorised total.  
- [ ] Pending Owner Approvals lists only owner-pending quotes.  
- [ ] Tracking lists sent / customer-waiting states separately.  
- [ ] Legacy `not_required` WOs start without quotes.  
- [ ] Delete with finance docs refused.  
- [ ] HMO/Fixflo OK.

## Testing

Manual: submit → approve → try start (blocked) → send → customer accept → start; pending list; tracking list; self-approve path still needs customer accept.

## Out of scope

- MR/WO create or triage  
- Appointment scheduling (OD-14)  
- New owner completion-review stage (OD-15)  
- Convert/invoice UI (Phase 05)  
- Payments (Phase 06)  
- Contractor AP (OD-13)
