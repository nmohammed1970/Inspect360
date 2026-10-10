# Reapit v1 limitations

- Reapit → Inspect360 only. No write-back of inspections, maintenance, or compliance.
- Sales-only properties are skipped unless they already have a letting payload.
- Property images and document binaries are not bulk-imported.
- Blocks are not auto-created; units sync as standalone properties.
- Archived Reapit properties are not deleted in Inspect360; identity fields stop updating once archived.
- Tenant portal invites are not sent; `hasPortalAccess` is false until an owner enables it.
- Global unique `users.email`: same-org tenant emails are linked; staff or other-org emails get `reapit+{id}@noreply.inspect360.local` with the real email kept on `contacts`.
