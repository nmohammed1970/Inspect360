# Reapit → Inspect360 architecture

Inspect360 organisation owns a `reapit_connections` row. Reapit customer id binds webhooks to that organisation. Tokens never leave the server.

```
Owner clicks Connect
  → OAuth authorization code (state HMAC includes organizationId)
  → store customer id + encrypted tokens
  → enqueue initial sync job
Worker (SKIP LOCKED)
  → page properties, landlords/contacts, tenancies
  → upsert via mappings
Webhook
  → verify Ed25519 → unique eventId → enqueue fetch-by-id
```

Inspect360 owns inspections, maintenance, compliance, assets, disputes, comparison reports.
Reapit owns property identity, address, landlord, tenant identity, tenancy dates, rent figures on mapped rows only.
