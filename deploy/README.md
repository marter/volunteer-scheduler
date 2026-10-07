# Deploying

Shares a Lightsail server with `fake-sportsbook` (no Kubernetes):

```
Lightsail server (Ubuntu 24.04, 2 GB, ~$12/mo) -- same server as fake-sportsbook
├── /srv/caddy               shared Caddy (lives in the fake-sportsbook repo): ports 80/443,
│                            automatic HTTPS, routes by hostname
├── /srv/fake-sportsbook     db + backend + frontend (nginx); no published ports
└── /srv/volunteer-scheduler db + backend + frontend (nginx); no published ports
```

Caddy sends `volunteer.martinteran.me/api/*` to the backend and everything else to the
frontend, so the app and API share one origin (no CORS in production).

Caddy's config lives in the `fake-sportsbook` repo (`deploy/caddy/Caddyfile` there), not
here. **Do not add a `deploy/caddy/` directory to this repo** — two repos both syncing a
Caddyfile to `/srv/caddy` would overwrite each other's routes.

## One-time setup

Most of this is already done (it was done once for `fake-sportsbook`, and the server,
domain, and Caddy are shared):

1. ~~Buy the domain / create the server / static IP / HTTPS firewall rule~~ — already done.
2. **DNS**: Route 53 → Hosted zones → `martinteran.me` → Create record: `volunteer`,
   type **A**, value = the static IP. Check it with `dig +short volunteer.martinteran.me`.
3. **Uncomment the Caddy route** in the `fake-sportsbook` repo's
   `deploy/caddy/Caddyfile` (a `volunteer.martinteran.me { ... }` block is already there,
   commented out), then deploy that repo (or just rsync `deploy/caddy/` to the server and
   reload Caddy) so it picks up the new route.
4. **This app's directory on the server**:
   ```bash
   ssh ubuntu@<static-ip> 'bash -s' < deploy/setup-server.sh
   ```
5. **Production secrets** live only on the server:
   ```bash
   ssh ubuntu@<static-ip>
   mkdir -p /srv/volunteer-scheduler/deploy
   nano /srv/volunteer-scheduler/deploy/.env.prod     # template: deploy/.env.prod.example
   ```
   Generate `POSTGRES_PASSWORD` and `JWT_SECRET_KEY` with `openssl rand -hex 32`.
6. **Snapshots**: this app holds real organizations' data (unlike the sportsbook's play
   money), so turn on the Lightsail instance's **automatic snapshots** if they aren't on
   already, and take a `pg_dump` to `~/backups/` before risky migrations.

## Every deploy

**Automatic:** push to `main`. GitHub Actions (`.github/workflows/ci.yml`) runs the backend
and frontend checks, then runs `deploy/deploy.sh` against the server. Pull requests run
checks only. You can also trigger it by hand from the Actions tab ("Run workflow").

**Manual** (same script, from your Mac):

```bash
DEPLOY_HOST=ubuntu@<static-ip> deploy/deploy.sh
```

Either way, the script rsyncs the repo to `/srv/volunteer-scheduler` and rebuilds the
containers (migrations run on backend start). It does **not** touch Caddy — that only
needs reloading once, when the route is first added (step 3 above).

## GitHub Actions setup (one time)

A dedicated SSH key for CI, separate from the sportsbook's, so it can be revoked on its
own:

```bash
ssh-keygen -t ed25519 -N "" -C github-actions-deploy-volunteer-scheduler -f ~/.ssh/volunteer_deploy
ssh-copy-id -i ~/.ssh/volunteer_deploy.pub ubuntu@<static-ip>

gh api -X PUT "repos/{owner}/{repo}/environments/production" >/dev/null   # create the environment
gh secret set DEPLOY_HOST --env production --body "ubuntu@<static-ip>"
gh secret set DEPLOY_SSH_KEY --env production < ~/.ssh/volunteer_deploy
ssh-keyscan -t ed25519 <static-ip> | gh secret set DEPLOY_KNOWN_HOSTS --env production
```

The secrets are scoped to a `production` environment. In the repo's Settings →
Environments → production, you can restrict deploys to the `main` branch.

## Handy commands (on the server)

```bash
cd /srv/volunteer-scheduler
alias dc='docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod'
dc ps
dc logs -f backend
dc exec db psql -U volunteer volunteer_scheduler   # database shell
```
