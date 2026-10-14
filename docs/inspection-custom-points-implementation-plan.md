# Custom Inspection Points — Implementation Plan

## Objective

Allow inspectors to add custom inspection points to any applicable section during capture. Custom points must behave like native points (Door Condition): same FieldWidget, photos, condition/cleanliness, notes, AI, gallery, reports, and entry persistence.

## Existing architecture

Capture is **snapshot-driven**:

| Layer | Role |
|--------|------|
| `inspection_templates.structure_json` | Org-wide editable blueprint (Template Builder) |
| `inspections.template_snapshot_json` | Frozen/mutated copy for **this** inspection; capture UI reads only this |
| `inspection_entries` | Responses keyed by `(inspectionId, sectionRef, fieldKey)` |

Native room points (e.g. Door Condition) use:

```json
{
  "id": "field_checkin_entry_door_condition",
  "key": "field_checkin_entry_door_condition",
  "label": "Door Condition",
  "type": "photo_array",
  "required": false,
  "includeCondition": true,
  "includeCleanliness": true
}
```

Property rooms already mutate **only** the inspection snapshot (precedent for per-inspection fields).

`PATCH /api/inspections/:id` does **not** accept `templateSnapshotJson` from clients — a dedicated endpoint is required.

## Chosen approach

1. Append a Door Condition–shaped field to the target section inside **this inspection’s** `template_snapshot_json` only.
2. Do **not** modify org templates or other inspections.
3. Reuse existing FieldWidget + `POST /api/inspection-entries` for all responses.
4. No new database tables or migrations.

### Field shape for custom points

- `type: "photo_array"`
- `includeCondition: true`, `includeCleanliness: true`
- `required: false`
- `id` / `key`: `field_custom_${uuid}` (never the display name)
- `label`: trimmed inspector-entered name
- Flags: `custom: true`, `addedAt`, optional `clientRequestId` (idempotency)

### UI rules

- Button **“+ Add Inspection Point”** at the bottom of every eligible section’s content (shared section renderer).
- Hide on **General Information**, Sign-Off sections, and when inspection status is `completed`.
- Dialog: “Inspection Point Name”, Add / Cancel, trim + reject empty.
- Custom points show a **Remove** control; delete removes the field from the inspection snapshot and related entries.
- Duplicate labels allowed (distinct ids).
- Repeatable sections: field added to section definition (appears on every instance).

## Files

| Area | Path |
|------|------|
| Shared helper | `shared/inspectionCustomPoints.ts` |
| Tests | `shared/inspectionCustomPoints.test.ts` |
| API | `POST /api/inspections/:id/custom-points` in `server/routes.ts` |
| AI label resolve | `processInspectionAIAnalysis` in `server/routes.ts` |
| Web UI | `client/src/pages/InspectionCapture.tsx` |
| Mobile UI | `mobile/src/screens/inspections/InspectionCaptureScreen.tsx` |

## API

`POST /api/inspections/:id/custom-points`

- Body: `{ sectionId, label, clientRequestId? }`
- Auth: same org + inspector/owner/compliance as inspection PATCH
- Reject completed inspections
- Returns `{ field, templateSnapshotJson }`

## Integration

| Workflow | Behaviour |
|----------|-----------|
| Progress | Custom fields count like other optional `photo_array` fields |
| Sign-Off / complete | Same validation as other non-required photo points |
| Per-field AI | Uses `field.label` from FieldWidget |
| Full-report AI | Resolves label from snapshot (not raw fieldKey) |
| Report / PDF / gallery | Iterate snapshot fields → custom points included automatically |
| Comparison | Matches on `fieldKey` (id), not display name |
| Check-out create | Inherits latest check-in’s snapshot (sections, customs, floor-plan rooms); no check-in → org Check Out / default template |
| copy-from-checkin | Aligns checkout snapshot to check-in first when customs/rooms missing |

## Backward compatibility

- Existing inspections unchanged until an inspector adds a point.
- Orphan entries without a snapshot field remain invisible in reports (unchanged).
- No shared-template mutation.

## Testing

- Unit tests for normalize, append, idempotency, Sign-Off helper, label resolve.
- `npm run check` (tsc).
- Manual: add point → fill → navigate → refresh → report.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Shared template mutation | Dedicated endpoint writes inspection snapshot only |
| Double-click duplicates | UI disable + `clientRequestId` idempotency |
| Completed edits | API + UI guards |
| Opaque AI titles | Resolve label from snapshot |
