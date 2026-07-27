# Contabo Phase 0 — Server inventory

Recorded during Inspect360 migration setup. Update this file if names change on the server.

## Server

| Item | Value |
|------|--------|
| Host / IP | `169.58.40.94` (Contabo VPS) |
| Hostname | `vmi3450363` |
| OS | Ubuntu 24.04 |
| Access | SSH as `root` (prefer SSH over RDP) |
| Docker | 24.0.7 |
| Compose | v2.24.1 |

## Containers (at inventory time)

| Name | Role | Notes |
|------|------|--------|
| `postgres` | Shared app Postgres 16 | Bound to `127.0.0.1:5432` only (SSH tunnel for GUI) |
| `coolify-proxy` (Traefik) | Was holding 80/443 | **Stop** before installing Caddy |
| Other Coolify stack | coolify, coolify-db, redis, realtime, sentinel | Stop if not using Coolify |

## Networks

| Name | Use |
|------|-----|
| `coolify` | Coolify stack (legacy) |
| `infra_internal` | Existing infra |
| `caddy` | **Create and use this** for Caddy + apps + `postgres` |

## Locked names for Inspect360

| Item | Value |
|------|--------|
| Container | `inspect360` |
| Image | `ghcr.io/<ORG>/inspect360` (set ORG in GitHub Actions) |
| Docker network | `caddy` (external) |
| Internal port | `5000` |
| Database | `inspect360` |
| DB user | `inspect360` |
| Env file on server | `/opt/inspect360/.env` |
| Storage volume | `inspect360_storage` → `/app/storage` |
| Domain | `portal.inspect360.ai` |
| Caddyfile | `/etc/caddy/Caddyfile` |

## Database access

**GUI (DBeaver / pgAdmin):** SSH tunnel → Host `localhost` Port `5432` → enable Show all DBs.

**App in Docker:**

```text
DATABASE_URL=postgresql://inspect360:PASSWORD@postgres:5432/inspect360
```

Host must be `postgres` (container name), not `localhost`.

## Secrets

Use your local production `.env` (or GoDaddy live values if they differ). Write them only to `/opt/inspect360/.env` on Contabo — never commit.

## Checklist before coding deploy

- [x] SSH works
- [x] Docker + Compose present
- [x] Shared `postgres` container identified
- [ ] Coolify Traefik stopped; Caddy owns 80/443
- [ ] Docker network `caddy` created; `postgres` attached
- [ ] DB user/database `inspect360` created
- [ ] `/opt/inspect360/.env` created
