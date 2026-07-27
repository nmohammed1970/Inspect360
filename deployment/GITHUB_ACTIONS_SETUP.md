# GitHub Actions deploy — one-time setup

After this, every push to `main` (or **Run workflow** in GitHub) builds the image and deploys to Contabo. No more manual `docker build` / `scp` / `docker load`.

## What the workflow does

1. Builds Docker image on GitHub
2. Pushes to **GHCR** (`ghcr.io/<your-org>/<repo>:latest`)
3. Copies `docker-compose.contabo.yml` → `/opt/inspect360/` on Contabo
4. SSHs in, pulls image, runs `docker compose up -d --force-recreate`
5. Waits for container health check

You still create **`/opt/inspect360/.env` once** on the server (secrets never go in GitHub for the app env).

---

## Step 1 — One-time server prep (SSH)

On Contabo (`169.58.40.94`):

```bash
mkdir -p /opt/inspect360
docker network create caddy 2>/dev/null || true
docker network connect caddy postgres 2>/dev/null || true
```

Create env file (copy from `deployment/env.contabo.template`):

```bash
nano /opt/inspect360/.env
```

Required: `DATABASE_URL` (host = `postgres`), `SESSION_SECRET`, `BASE_URL=https://portal.inspect360.ai`, Stripe, Resend, OpenAI, etc.

---

## Step 2 — SSH key for GitHub Actions

On **your PC** (PowerShell):

```powershell
ssh-keygen -t ed25519 -C "github-actions-inspect360" -f "$env:USERPROFILE\.ssh\inspect360_deploy" -N '""'
```

Add the **public** key to Contabo:

```powershell
type $env:USERPROFILE\.ssh\inspect360_deploy.pub
```

On Contabo:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# paste the public key line, save
chmod 600 ~/.ssh/authorized_keys
```

Test from PC:

```powershell
ssh -i $env:USERPROFILE\.ssh\inspect360_deploy root@169.58.40.94
```

---

## Step 3 — GitHub repository secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret name | Value |
|-------------|--------|
| `SSH_HOST` | `169.58.40.94` |
| `SSH_USER` | `root` (or your deploy user) |
| `SSH_KEY` | Full **private** key file contents (`inspect360_deploy`, not `.pub`) |

To copy private key into clipboard (PowerShell):

```powershell
Get-Content $env:USERPROFILE\.ssh\inspect360_deploy | Set-Clipboard
```

Paste into the `SSH_KEY` secret field in GitHub.

`GITHUB_TOKEN` is automatic — no extra secret needed for build/push.

---

## Step 4 — GHCR package visibility (first deploy only)

After the first successful workflow run:

1. GitHub → your repo → **Packages** (or org Packages)
2. Open the new container package
3. **Package settings** → link to this repo if asked
4. If the package is **private**, the workflow still works (it logs in with `GITHUB_TOKEN` on the server during deploy)

If `docker pull` fails on the server with **denied**, create a **Classic PAT** with `read:packages` + `write:packages`, add secret `GHCR_READ_TOKEN`, and we can switch the deploy step to use it (ask if needed).

---

## Step 5 — Push workflow to GitHub

Commit and push the workflow file (and your code) to `main`:

```powershell
cd "d:\Work-Projects\New Server\Inspect360NewServer"
git add .github/workflows/deploy-contabo.yml
git commit -m "Add GitHub Actions deploy to Contabo"
git push origin main
```

Or run manually: **Actions** → **Build and deploy Inspect360** → **Run workflow**.

---

## Step 6 — After deploy succeeds

1. Add Caddy block for `portal.inspect360.ai` → `inspect360:5000` (if not done)
2. Test with hosts file: `169.58.40.94 portal.inspect360.ai`
3. Migrate DB + storage (see `DATA_MIGRATION.md`)
4. DNS cutover (see `CUTOVER_CHECKLIST.md`)

---

## Day-to-day deploy

```text
git add .
git commit -m "your message"
git push origin main
```

Watch: **Actions** tab → green check = live on Contabo.

Check server:

```bash
ssh root@169.58.40.94
docker ps --filter name=inspect360
docker logs --tail 50 inspect360
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Missing `.env` | Create `/opt/inspect360/.env` on server |
| DB connection error | `DATABASE_URL` host must be `postgres`, both containers on network `caddy` |
| `network caddy not found` | `docker network create caddy` + `docker network connect caddy postgres` |
| Health check fails | `docker logs inspect360` — often DB password or missing env var |
| SSH fails | Re-check `SSH_KEY` (full private key, including `BEGIN`/`END` lines) |
