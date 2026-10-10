# Reapit integration implementation report

## What shipped

- Per-organisation Reapit connection with encrypted tokens (`reapit_connections`).
- Mapping table as source of truth (`reapit_entity_mappings`) — no `reapit_*_id` columns on properties.
- Postgres job queue (`reapit_jobs`, `FOR UPDATE SKIP LOCKED`) and in-process worker (`ENABLE_REAPIT_WORKER`, default on).
- OAuth authorization-code Connect flow; sync prefers client credentials + `reapit-customer`, with mutexed refresh-token rotation as fallback.
- One-way sync: properties (lettings) → landlords/contacts → tenancies. Tenant users are created with portal access off. Ended tenancies set `isActive=false`. Mapped identity fields overwrite; inspections/maintenance/compliance/assets are never written.
- Webhooks at `POST /api/webhooks/reapit`: Ed25519 `X-Signature`, unique `eventId`, organisation bound from Reapit `customerId` only.
- Settings → Integrations card; property detail “Source: Reapit” for owner/clerk.
- Contabo SQL: `server/migrations/addReapitIntegration.sql` (run as `creativecloud`, then GRANT).

## Security notes

- Tokens never sent to the browser.
- `INTEGRATION_ENCRYPTION_KEY` (AES-256-GCM). Do not log ciphertext or secrets.
- Skip webhook verify only when `REAPIT_SKIP_WEBHOOK_VERIFY=true` **and** not production.
- `/api/reapit` is entitlement-locked; `/api/webhooks/reapit` is not.
- Disconnect drops tokens and disables the connection; Inspect360 data and mappings remain.

## Ops

1. Register the Reapit app (redirect `{BASE_URL}/api/reapit/oauth/callback`, webhook `{BASE_URL}/api/webhooks/reapit`).
2. Set env vars from `docs/integrations/reapit/oauth-and-env.md`.
3. Run `addReapitIntegration.sql` as `creativecloud`.
4. Owner connects from Settings → Integrations.

## Tests

```bash
npx tsx server/reapit/mappers.test.ts
npx tsx server/reapit/crypto.test.ts
npx tsx server/reapit/webhook.test.ts
npx tsx server/reapit/client.test.ts
npx tsx shared/entitlement.test.ts
```

## Out of scope (v1)

Write-back, Redis/Bull, sales-only stock, document binaries, Marketplace billing, auto-created blocks.
