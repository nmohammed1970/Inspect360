# Image loading UX — implementation plan

## Root causes

1. **Web** `PreviewableImage` showed no loading feedback; empty boxes on slow networks; error text without Retry.
2. **Mobile** most inspection photos used raw RN `Image` on `/objects/...` without cookies; only gallery tiles used auth-aware `RemoteImage`.
3. Neither platform distinguished slow load vs failure vs offline.

## Architecture (reuse)

| Layer | Component |
|-------|-----------|
| Shared constants | `shared/imageLoadingUx.ts` |
| Web wrapper + lightbox | `client/src/components/ImagePreview.tsx` |
| Mobile auth + cache | `mobile/src/components/ui/RemoteImage.tsx` + `resolveMediaUrl` |
| Auth | Web: cookie `/objects/`; Mobile: fetch `/api/objects/content/` → disk cache |

## Behaviour

- Threshold: **1500ms** → exact message: *Poor network connection detected. Please wait while we load your images.*
- Cached / local images: show immediately; no poor-network flash.
- Failure: stop spinner, Retry (user-initiated).
- Offline + no local copy: offline placeholder (mobile).
- Slow ≠ failed; do not abort valid loads on threshold.

## Manual checklist

1. Fast image: no poor-network message.
2. Throttle network: message after ~1.5s; image replaces placeholder.
3. Fail URL: error + Retry.
4. Offline mobile + local file: shows local.
5. Offline mobile + remote only: offline message.
6. Gallery scroll remains responsive.
7. Lightbox inherits slow/error UX.
8. Logos/decorative assets unchanged.

## Automated tests

See `shared/imageLoadingUx.test.ts` (executed during implementation).

### Results

```
npx tsx shared/imageLoadingUx.test.ts → ok
```

Device/network throttling and offline gallery scenarios remain manual (checklist above).
