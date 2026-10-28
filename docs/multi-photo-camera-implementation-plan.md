# Multi-photo camera capture — implementation plan

## Root cause

Inspection “Take Photo” used the **OS system camera** via `ImagePicker.launchCameraAsync`. That API returns **one asset** and dismisses. Callers closed their picker and uploaded that single URI. There was no in-app continuous capture UI.

`expo-camera` was already installed but used mainly for permissions, not `CameraView`.

## Existing architecture (reused)

| Concern | Location |
|---------|----------|
| Field capture UI | `mobile/src/components/inspections/FieldWidget.tsx` |
| Gallery tab | `mobile/src/components/inspections/InspectionGalleryPanel.tsx` |
| Object upload (single-file) | `mobile/src/services/objectUpload.ts` → `POST /api/objects/upload-direct` |
| Gallery register (batched metadata) | `POST /api/inspections/:id/gallery/register` |
| Offline files + SQLite | `mobile/src/services/offline/storage.ts`, `database.ts`, `syncService.ts` |
| Field photo cap | `GALLERY_FIELD_PHOTO_MAX = 10` in `shared/inspectionGallery.ts` |

**Backend / DB:** no changes. Batch UX loops the existing single-file upload.

## Proposed change

1. Shared `MultiPhotoCameraModal` (`expo-camera` `CameraView` + `takePictureAsync`).
2. Stage local URIs in-session; review / remove; confirm returns URIs only.
3. FieldWidget + InspectionGalleryPanel confirm via existing upload / offline paths.
4. Checklist / maintenance / tenant / assets remain on single-shot `launchCameraAsync`.

## Session limits

- Field: remaining slots = `GALLERY_FIELD_PHOTO_MAX - currentPhotos.length`
- Gallery camera session: `min(50, GALLERY_UPLOAD_SELECT_MAX)` (memory-safe)

## Compatibility risks

- First production use of `CameraView` on device (permissions already configured).
- Must not upload inside the shutter loop (keeps capture responsive).
- Partial upload failures must leave successes intact and queue the rest.

## Manual device test checklist

1. Camera stays open after each shot; counter updates.
2. Review strip removes photos; continue capturing.
3. Cancel with staged photos prompts and discards.
4. Rapid shutter does not duplicate.
5. Permission denied handled.
6. Field: confirm associates all photos; respects max 10.
7. Gallery: confirm uses `uploadUris`; offline staging works.
8. Offline capture → reconnect sync; no duplicate objects when `objectId` reused.
9. Library multi-pick and single “Add 1 Photo” still work.
10. Checklist / reports / AI unchanged.

## Automated tests

- `mobile/src/components/camera/multiPhotoSession.test.ts` — slots, cap, debounce, session mutate.
- Existing `galleryOfflineHelpers.test.ts` remains green.

### Results (executed)

```
npx tsx mobile/src/components/camera/multiPhotoSession.test.ts  → ok
npx tsx mobile/src/services/offline/galleryOfflineHelpers.test.ts → all assertions passed
```

Device-level camera UI items in the checklist above were not run in this environment (require a physical device / simulator with camera).
