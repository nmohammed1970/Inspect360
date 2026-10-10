# Remaining executable slices

See `docs/integrations/reapit/` for mapping, OAuth, and architecture.

02 Database: `shared/schema.ts`, `server/migrations/addReapitIntegration.sql` + `.ts`
03 Crypto + connections: `server/reapit/crypto.ts`, `server/reapit/repository.ts`
04 OAuth + routes: `server/reapit/auth.ts`, `server/reapitRoutes.ts`
05 Client: `server/reapit/client.ts`
06 Mappers: `server/reapit/mappers.ts`
07 Sync + jobs: `server/reapit/sync.ts`, `server/reapit/jobs.ts`, `server/reapit/worker.ts`
08 Webhooks: `server/reapit/webhook.ts`, `POST /api/webhooks/reapit`
09 Admin UI: `ReapitIntegrationSettings.tsx`, Property Detail badge
10 Tests + report: `server/reapit/*.test.ts`, `docs/integrations/reapit/IMPLEMENTATION-REPORT.md`
