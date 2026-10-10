# 00 Audit and architecture

## Objective

Freeze the Inspect360 audit and target architecture before code.

## Existing code

- Org isolation via `organizationId` on domain tables (`shared/schema.ts`)
- Properties, `tenant_assignments`, `users` (role tenant), `contacts`
- Fixflo pattern: `server/services/fixflo-*`, Settings Integrations
- Background: `setInterval` in `server/index.ts` (no Redis)
- Route split example: `server/creditRequestRoutes.ts`

## Required changes

None in this slice except documentation.

## Implementation steps

1. Confirm Reapit is one-way into Inspect360.
2. Place code under `server/reapit/` + `server/reapitRoutes.ts`.
3. Use Postgres jobs, not Redis.

## Completion criteria

Architecture documented in `docs/integrations/reapit/`.
