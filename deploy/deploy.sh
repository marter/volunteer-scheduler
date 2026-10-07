#!/usr/bin/env bash
# Copies the repo to the server and rebuilds the stack. Run from your Mac:
#   DEPLOY_HOST=ubuntu@<server-ip> deploy/deploy.sh
#
# Caddy's config lives in the fake-sportsbook repo (deploy/caddy/ there), not here --
# two repos syncing to /srv/caddy would overwrite each other. This script only touches
# /srv/volunteer-scheduler.
set -euo pipefail

HOST="${DEPLOY_HOST:?Set DEPLOY_HOST, e.g. DEPLOY_HOST=ubuntu@1.2.3.4}"
APP_DIR=/srv/volunteer-scheduler
cd "$(dirname "$0")/.."

# deploy/.env.prod is excluded, so --delete never removes the server's copy.
rsync -az --delete \
  --exclude .git --exclude .DS_Store --exclude deploy/.env.prod \
  --exclude node_modules --exclude dist --exclude .venv --exclude .env \
  --exclude __pycache__ --exclude .pytest_cache --exclude .mypy_cache --exclude .ruff_cache \
  ./ "$HOST:$APP_DIR/"

ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
test -f $APP_DIR/deploy/.env.prod || { echo "Missing $APP_DIR/deploy/.env.prod (see .env.prod.example)"; exit 1; }
cd $APP_DIR
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build --remove-orphans
docker image prune -f >/dev/null
REMOTE

echo "Deployed."
