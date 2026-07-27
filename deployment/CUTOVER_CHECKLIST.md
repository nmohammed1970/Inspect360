# Contabo cutover checklist

Use after dry-run migration succeeds. Keep GoDaddy warm 48–72 hours for rollback.

## Before cutover day

- [ ] Lower DNS TTL for `portal.inspect360.ai` (e.g. 300s) 24h ahead
- [ ] Contabo: Caddy installed, owns 80/443 (Coolify Traefik stopped)
- [ ] Network `caddy` has `postgres` + `inspect360`
- [ ] `/opt/inspect360/.env` complete (`DATABASE_URL` host = `postgres`)
- [ ] Image deploys via GitHub Actions (or manual compose up)
- [ ] Dry-run DB restore + storage copy verified on Contabo
- [ ] `caddy validate` OK with `portal.inspect360.ai` site block ready

## Cutover window

1. [ ] Put GoDaddy in maintenance / pause writes if possible
2. [ ] Final `pg_dump` + restore to Contabo
3. [ ] Final `storage/` rsync into `inspect360_storage`
4. [ ] Restart `inspect360` container; check `docker logs -f inspect360`
5. [ ] Point DNS A/AAAA for `portal.inspect360.ai` → Contabo public IP (`169.58.40.94`)
6. [ ] Wait for propagation; confirm HTTPS (Caddy Let's Encrypt)
7. [ ] Smoke tests:
   - [ ] Login / logout (secure cookies)
   - [ ] Upload image
   - [ ] WebSocket `/ws`
   - [ ] PDF export
   - [ ] Stripe test webhook delivery
8. [ ] Stripe Dashboard → webhook URL  
      `https://portal.inspect360.ai/api/webhooks/stripe`  
      Update `STRIPE_WEBHOOK_SECRET` in `/opt/inspect360/.env` and recreate container
9. [ ] Resend: confirm domain; emails use `BASE_URL=https://portal.inspect360.ai`
10. [ ] Mobile app: confirm API host is `portal.inspect360.ai` (or ship update)

## Rollback (if needed)

1. Point DNS back to GoDaddy
2. Leave Contabo containers running but idle
3. Investigate with `docker logs inspect360` before retrying

## After 48–72 hours confidence

- [ ] Final backup of GoDaddy DB + storage
- [ ] Stop IIS / Node on GoDaddy
- [ ] Confirm only Caddy is public on Contabo (`ss -tulpn | grep -E ':80|:443'`)
- [ ] Confirm Postgres still bound to `127.0.0.1:5432` only
- [ ] Note previous working image digest/tag for rollback

## GitHub Actions secrets (one-time)

| Secret | Purpose |
|--------|---------|
| `SSH_HOST` | Contabo IP / hostname |
| `SSH_USER` | Deploy user (often `root` or limited deploy user) |
| `SSH_KEY` | Private key for deploy |
| `GITHUB_TOKEN` | Provided automatically for GHCR push |

Also place on Contabo:

- `/opt/inspect360/.env`
- `/opt/inspect360/docker-compose.contabo.yml` (copy from repo)
