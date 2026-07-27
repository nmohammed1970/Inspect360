# Contabo Ubuntu + Caddy + Docker runbook

Replaces IIS/iisnode hosting for production. See also:

- [CONTABO_PHASE0_INVENTORY.md](./CONTABO_PHASE0_INVENTORY.md)
- [Caddyfile.snippet](./Caddyfile.snippet)
- [DATA_MIGRATION.md](./DATA_MIGRATION.md)
- [CUTOVER_CHECKLIST.md](./CUTOVER_CHECKLIST.md)

## Architecture

```text
Internet → Caddy :80/:443
              └─ reverse_proxy inspect360:5000
                    ├─ Postgres @ postgres:5432 (Docker network `caddy`)
                    └─ Volume inspect360_storage → /app/storage
```

- **One app container** for API + React SPA + WebSocket
- **No public ports** on the app container
- Secrets only in `/opt/inspect360/.env`

## Server bootstrap (once)

```bash
# 1) Free 80/443 from Coolify Traefik if present
docker stop coolify-proxy
docker stop coolify coolify-db coolify-redis coolify-realtime coolify-sentinel

# 2) Install Caddy (Ubuntu)
# ... official Caddy apt repo, then:
systemctl enable --now caddy

# 3) Shared network + attach postgres
docker network create caddy
docker network connect caddy postgres

# 4) Create DB
docker exec -it postgres psql -U postgres -c "CREATE USER inspect360 WITH PASSWORD '...';"
docker exec -it postgres psql -U postgres -c "CREATE DATABASE inspect360 OWNER inspect360;"

# 5) Env + compose on server
mkdir -p /opt/inspect360
# copy docker-compose.contabo.yml from repo to /opt/inspect360/
# write /opt/inspect360/.env from deployment/env.contabo.template

# 6) First start (after image exists)
cd /opt/inspect360
export IMAGE=ghcr.io/<org>/<repo>:latest
docker compose -f docker-compose.contabo.yml up -d

# 7) Caddy site block — see Caddyfile.snippet
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

## Deploy

Push to `main` → GitHub Actions builds GHCR image → SSHs to Contabo → `docker compose up -d`.

Manual:

```bash
docker pull ghcr.io/<org>/<repo>:latest
cd /opt/inspect360 && IMAGE=ghcr.io/<org>/<repo>:latest docker compose -f docker-compose.contabo.yml up -d
```

## App DATABASE_URL

```env
DATABASE_URL=postgresql://inspect360:PASSWORD@postgres:5432/inspect360
```

GUI tools use SSH tunnel → `localhost:5432` (not the Docker hostname).
