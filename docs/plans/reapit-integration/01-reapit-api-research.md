# 01 Reapit API research

Official docs (authoritative):

- REST: https://foundations-documentation.reapit.cloud/api/api-documentation
- Connect: https://foundations-documentation.reapit.cloud/api/reapit-connect
- Webhooks: https://foundations-documentation.reapit.cloud/api/webhooks

Facts used in implementation:

- API base `https://platform.reapit.cloud/`
- Auth: Bearer access token + `reapit-customer` header
- Pagination: `pageSize` (max 100), `pageNumber`, `totalPageCount`
- Access tokens expire in ~60 minutes; auth-code refresh tokens rotate
- Client credentials grant for machine sync when the app type allows it
- Webhook signature: Ed25519 `X-Signature` (`s:keyId:timestamp:signature`), public key `GET /webhooks/signing/{id}`
- Topics v1: application.install/uninstall, properties.created/modified, contacts.created/modified, landlords.created/modified, tenancies.created/modified
- `tenancies.modified` requires scope `tenancies.write` even if Inspect360 never writes tenancies
