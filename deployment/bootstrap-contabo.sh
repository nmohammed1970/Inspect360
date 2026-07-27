#!/usr/bin/env bash
# Bootstrap helpers for Contabo (run as root). Review before executing.
set -euo pipefail

echo "==> Ensuring Docker network 'caddy' exists"
docker network create caddy 2>/dev/null || true

if docker ps -a --format '{{.Names}}' | grep -qx postgres; then
  echo "==> Connecting postgres to caddy network"
  docker network connect caddy postgres 2>/dev/null || true
else
  echo "WARN: container 'postgres' not found"
fi

echo "==> Preparing /opt/inspect360"
mkdir -p /opt/inspect360
chmod 755 /opt/inspect360

if [ ! -f /opt/inspect360/.env ]; then
  echo "Create /opt/inspect360/.env from deployment/env.contabo.template"
fi

echo "==> Done. Next:"
echo "  1) Install Caddy and free ports 80/443 from Traefik if needed"
echo "  2) Create DB user/database inspect360"
echo "  3) Copy docker-compose.contabo.yml to /opt/inspect360/"
echo "  4) Apply deployment/Caddyfile.snippet"
echo "  5) docker compose -f /opt/inspect360/docker-compose.contabo.yml up -d"
