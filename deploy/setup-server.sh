#!/usr/bin/env bash
# One-time setup for this app's directory on the shared server. Docker, the swap file,
# automatic security updates, and the "web" network were already set up for
# fake-sportsbook -- this script is idempotent and just adds what's missing. Run from
# your Mac:
#   ssh ubuntu@<server-ip> 'bash -s' < deploy/setup-server.sh
set -euo pipefail

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

sudo docker network inspect web >/dev/null 2>&1 || sudo docker network create web

sudo mkdir -p /srv/volunteer-scheduler
sudo chown "$USER:$USER" /srv/volunteer-scheduler

echo "Done."
