# Phase 04 — Media & file sharing

**Depends on:** Phase 03  
**Unlocks:** Phase 05

## Objective

Multi-attachment messages with private ACL, DnD, previews, progress, and secure download.

## Tasks

1. `POST /api/messaging/attachments/prepare` — MIME/size validation; return upload path.
2. Store `messaging_attachments` on send; serve download only after participant check.
3. Limits: images 10MB; other docs 25MB; max 5 attachments/message; allow image/*, video/mp4, PDF, common office MIME.
4. UI: DnD on composer, multi-file picker, upload progress, image/video/PDF preview chips, download button.
5. Reuse `ObjectStorageService` + private ACL (feedback/maintenance docs pattern).

## Acceptance criteria

- [ ] Non-participants cannot download attachment URLs.
- [ ] Oversize / bad MIME rejected with 400.
- [ ] Multiple attachments render on one message bubble.
- [ ] Progress visible during upload; failures toast and do not send orphan paths.
