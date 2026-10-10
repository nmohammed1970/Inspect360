# OAuth and environment

## Reapit Developer Portal

Register an app with redirect `{BASE_URL}/api/reapit/oauth/callback`.

Scopes: `properties.read`, `contacts.read`, `landlords.read`, `tenancies.read`, `tenancies.write` (webhook subscription only).

Webhook URL: `{BASE_URL}/api/webhooks/reapit`

## Env vars

- `REAPIT_CLIENT_ID`
- `REAPIT_CLIENT_SECRET`
- `REAPIT_CONNECT_URL` (default `https://connect.reapit.cloud`)
- `REAPIT_API_URL` (default `https://platform.reapit.cloud`)
- `REAPIT_REDIRECT_URI` (optional override)
- `INTEGRATION_ENCRYPTION_KEY` (32-byte hex or raw 32-byte secret) — token encryption + OAuth state
- `ENABLE_REAPIT_WORKER` (default `true`; set `false` to disable)
- `REAPIT_SKIP_WEBHOOK_VERIFY` (dev-only; ignored in production)

Connect uses authorization code. Sync prefers client credentials + `reapit-customer`; falls back to stored rotating refresh token.
