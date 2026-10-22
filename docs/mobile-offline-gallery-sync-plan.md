# Mobile offline gallery sync — implementation plan

## 1. Existing offline inspection architecture

- **SQLite** (`expo-sqlite`): `inspect360_offline.db` — `inspections`, `inspection_entries`, `sync_queue`, `local_images`.
- **Files**: `{documentDirectory}offline_images/` via `mobile/src/services/offline/storage.ts`.
- **Connectivity**: `expo-network` (`backgroundSync.ts`, `useOnlineStatus`); sync on reconnect, AppState foreground, and every 5 minutes.
- **Sync** (`syncService.ts`): upload pending `local_images` → sync pending entries → drain `sync_queue`.
- **Field photos**: already offline via `storeImageLocally`; after upload, entries are updated and gallery `register` is called.

## 2. Existing gallery and image-upload flow

Two-step online pipeline:

1. `POST /api/objects/upload-direct` (multipart) → `/objects/<id>.<ext>`
2. `POST /api/inspections/:id/gallery/register` with `objectUrl` (+ optional GPS / assign)

Gallery UI (`InspectionGalleryPanel`) previously blocked when offline and never persisted picker URIs.

## 3. Why gallery uploads did not work offline

- Hard online gate in the Gallery panel.
- Upload-before-register with no durable local copy for gallery picks.
- Queue ops `gallery_register` / `gallery_assign` expect server `objectUrl`s / image IDs.
- Uploads omitted `?objectId=`, so retries minted new object paths (register only dedupes by URL).

## 4. Reused components

- `storeImageLocally`, `local_images`, `syncService`, `backgroundSync`, `addToSyncQueue`
- `upload-direct` + `gallery/register` / `assign` / `delete`
- Shared `listPhotoDestinations` for offline assign destinations

## 5. Required changes

| Area | Change |
|------|--------|
| Mobile SQLite | `purpose`, `metaJson` on `local_images`; stable UUID `id` as upload `objectId` |
| Gallery panel | Persist first; merge local pending + server; offline assign/delete; sync badges |
| Sync | Upload with `objectId`; register gallery-purpose images; queue assign/delete |
| Server | No new endpoints; no Postgres migration (URL uniqueness already exists) |

## 6. Sync, retry, duplicate prevention

1. Persist file + row (`purpose: gallery`, GPS in `metaJson`).
2. On sync: `upload-direct?objectId=<local id>` → same path on retry.
3. `gallery/register` with that `objectUrl` (idempotent on `(inspectionId, objectUrl)`).
4. If register fails after upload, enqueue `gallery_register` with known URL (do not re-upload).
5. Assign/delete: queue until server IDs exist; map local id → server id via `objectUrl`.

## 7. File lifecycle

- Copy into `offline_images/` before showing in UI.
- Keep until upload + register succeed; cleanup via existing 7-day synced cleanup.
- Do not delete on upload *start*.

## 8. Testing

- Unit: merge helpers, upload URL with stable `objectId`.
- Manual: offline add → app restart → reconnect → no duplicates → assign offline → sync → visible on web.

## Manual device checklist

1. Open inspection offline; add camera + library photos to Gallery — appear immediately with Pending.
2. Navigate away / kill app — photos still present.
3. Go online — sync uploads; badges clear; no duplicates.
4. Assign while offline; reconnect — assignment on server.
5. Delete pending local photo before sync — must not upload.
6. Field offline photos and online gallery uploads still work.
