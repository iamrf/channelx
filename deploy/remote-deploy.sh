#!/usr/bin/env bash
# Remote deploy steps run ON the Ubuntu host after rsync.
# Invoked by GitHub Actions over SSH.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/channelx}"
cd "${APP_DIR}"

echo "==> Installing production dependencies"
npm ci --omit=dev

echo "==> Ensuring webhook is cleared for polling mode"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -n "${TELEGRAM_TOKEN:-}" ]]; then
  node scripts/telegram-webhook.js delete || true
fi

echo "==> Restarting channelx service"
sudo systemctl restart channelx
sleep 2
sudo systemctl --no-pager --full status channelx || true

echo "==> Deploy complete"
