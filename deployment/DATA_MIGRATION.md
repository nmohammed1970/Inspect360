# Contabo / Caddy — data migration runbook

Move Postgres data and uploaded files from GoDaddy (Windows) to Contabo.
Do a **dry run** before DNS cutover.

## Prerequisites

- Contabo DB `inspect360` exists (empty for first restore)
- DBeaver/pgAdmin SSH tunnel to Contabo works (`localhost:5432`)
- Docker volume `inspect360_storage` exists (created on first `compose up`)
- App container may be stopped during restore to avoid writes

## 1. Dump from current (GoDaddy) database

On a machine that can reach the old DB:

```bash
pg_dump -Fc -d "$OLD_DATABASE_URL_OR_NAME" -f inspect360.dump
```

Or with discrete flags:

```bash
pg_dump -h OLD_HOST -p 5432 -U OLD_USER -Fc -d OLD_DB -f inspect360.dump
```

## 2. Restore into Contabo Postgres

Via SSH tunnel (GUI or CLI). Example CLI through tunnel already open on local 5432:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  -h localhost -p 5432 -U inspect360 -d inspect360 \
  inspect360.dump
```

Or:

```bash
# Copy dump to Contabo, then:
scp inspect360.dump root@169.58.40.94:/tmp/
ssh root@169.58.40.94
docker cp /tmp/inspect360.dump postgres:/tmp/inspect360.dump
docker exec -i postgres pg_restore --clean --if-exists --no-owner --no-acl \
  -U postgres -d inspect360 /tmp/inspect360.dump
```

**Schema rule:** if this is a full dump, do **not** also run `npm run db:push` afterward.

## 3. Copy uploads (`storage/`)

Preserve `private/` and `public/` layout used by `server/objectStorage.ts`.

Find the volume mount on Contabo:

```bash
docker volume inspect inspect360_storage
# or while container is running:
docker inspect inspect360 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
```

Sync from GoDaddy (example with scp/rsync after packing):

```bash
# On GoDaddy / build machine
tar -czf storage-backup.tgz -C /path/to/app storage

# To Contabo
scp storage-backup.tgz root@169.58.40.94:/tmp/
ssh root@169.58.40.94
# Stop app briefly if needed
docker compose -f /opt/inspect360/docker-compose.contabo.yml stop inspect360
# Copy into volume (adjust Source path from docker volume inspect)
VOL=$(docker volume inspect inspect360_storage -f '{{.Mountpoint}}')
tar -xzf /tmp/storage-backup.tgz -C /tmp
rsync -a /tmp/storage/ "$VOL"/
chown -R 1000:1000 "$VOL"   # node user in image is uid 1000
docker compose -f /opt/inspect360/docker-compose.contabo.yml start inspect360
```

## 4. Verify before DNS cutover

```bash
docker logs --tail 100 inspect360
# From laptop with hosts file pointing portal.inspect360.ai -> Contabo IP
# or curl via temporary Caddy / IP test
```

Check:

- Login works
- Existing inspection images load
- New upload lands under `/app/storage`
- PDF export works

## 5. Final cutover sync

Repeat dump + storage rsync in a short maintenance window, then flip DNS (see `CUTOVER_CHECKLIST.md`).
