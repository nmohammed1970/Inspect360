# HMO document security checklist

- Uploads are size/MIME gated in `documentPipeline.ts`.
- Original bytes are stored immutably with content hash + version row.
- **Malware scan:** `malwareScanHook` currently returns `{ deferred: true }`. Treat uploads as unscanned until a real scanner (e.g. ClamAV queue) is enabled via env flag. Do not present deferred as a clean bill of health in admin UI.
- Extraction output is untrusted until a human confirms via `POST /api/hmo/licence-versions/:id/confirm`.
- Assessment requires confirmed licence version (unless impact worker `allowUnconfirmed`).
