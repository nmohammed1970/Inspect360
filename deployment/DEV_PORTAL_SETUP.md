# Dev portal setup (`dev.inspect360.ai`)

Workflow: **develop → deploy to DEV → test → PR → main → production**.

| Env | URL | Image tag | Server dir | Stripe |
|-----|-----|-----------|------------|--------|
| Dev | https://dev.inspect360.ai | `:dev` | `/opt/inspect360-dev` | Test |
| Prod | https://portal.inspect360.ai | `:latest` | `/opt/inspect360` | Live |

---

## Phase A — Contabo (one-time)

### 1. DNS
A record: `dev.inspect360.ai` → same Contabo IP as `portal.inspect360.ai`.

### 2. Database
`postgres` role cannot log in. Create empty DB as `creativecloud`:

```bash
docker exec -it postgres psql -U creativecloud -d postgres -c "CREATE DATABASE inspect360_dev OWNER creativecloud;"
```

Do **not** use the production database name `inspect360`.

### 3. App folder + env
```bash
mkdir -p /opt/inspect360-dev
# Start from template: deployment/env.contabo-dev.template
nano /opt/inspect360-dev/.env
```

Required differences from prod:

- `BASE_URL` / `CORS_ORIGINS` = `https://dev.inspect360.ai`
- `DATABASE_URL` = `postgresql://creativecloud:…@postgres:5432/inspect360_dev`
- New `SESSION_SECRET` (`openssl rand -hex 32`)
- Stripe **test** keys + test webhook `whsec`

### 4. Caddy (Docker container `caddy`)
Real file: **`/opt/caddy/Caddyfile`** (not `/etc/caddy/Caddyfile` on the host).

```bash
cp /opt/caddy/Caddyfile /opt/caddy/Caddyfile.bak.$(date +%F)
nano /opt/caddy/Caddyfile
```

Add:

```
dev.inspect360.ai {
    encode gzip
    reverse_proxy inspect360-dev:5000
}
```

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### 5. Stripe test webhook
Dashboard → **Test mode** → Webhooks → Add endpoint:

`https://dev.inspect360.ai/api/billing/webhook`

Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Put signing secret in `/opt/inspect360-dev/.env` as `STRIPE_WEBHOOK_SECRET`.

---

## Phase B — Repo (already in this project)

- [`docker-compose.contabo-dev.yml`](../docker-compose.contabo-dev.yml)
- [`deployment/env.contabo-dev.template`](./env.contabo-dev.template)
- [`.github/workflows/deploy-contabo-dev.yml`](../.github/workflows/deploy-contabo-dev.yml) — push to **`develop`**
- Prod remains [`.github/workflows/deploy-contabo.yml`](../.github/workflows/deploy-contabo.yml) — push to **`main`**

Reuse GitHub secrets: `SSH_HOST`, `SSH_USER`, `SSH_KEY`.

---

## Phase C — First bring-up

### Create `develop` (once)
```bash
git checkout main
git pull
git checkout -b develop
git push -u origin develop
```

Pushing to `develop` builds `:dev`, copies compose to `/opt/inspect360-dev/`, and recreates `inspect360-dev`.

### Manual deploy (optional)
```bash
cd /opt/inspect360-dev
IMAGE=ghcr.io/nmohammed1970/inspect360:dev docker compose -f docker-compose.contabo-dev.yml up -d --force-recreate
docker logs --tail 50 inspect360-dev
```

### Smoke test
- HTTPS loads on `https://dev.inspect360.ai`
- Signup / login
- Billing with test card `4242…`
- Stripe test webhook deliveries return **200**

---

## Day-to-day

1. Branch from / work on `develop` → push → auto-deploy to **dev**
2. Test on `https://dev.inspect360.ai`
3. Fail → fix on `develop`
4. Pass → open PR `develop` → `main`
5. Merge → auto-deploy to **production**

Optional: protect `main` so merges require a PR from `develop`.

---

## Isolation checklist

- [ ] Dev container `inspect360-dev` ≠ prod `inspect360`
- [ ] Dev DB `inspect360_dev` ≠ prod `inspect360`
- [ ] Dev Stripe = test; prod = live
- [ ] Dev webhook = `dev.inspect360.ai/api/billing/webhook`
- [ ] Prod webhook = `portal.inspect360.ai/api/billing/webhook`
- [ ] Separate `SESSION_SECRET` and Docker volumes
