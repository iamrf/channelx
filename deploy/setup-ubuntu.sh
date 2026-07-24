#!/usr/bin/env bash
# One-time Ubuntu server bootstrap for ChannelX.
# Usage (as root): bash deploy/setup-ubuntu.sh
set -euo pipefail

APP_USER="${APP_USER:-channelx}"
APP_DIR="${APP_DIR:-/opt/channelx}"
NODE_MAJOR="${NODE_MAJOR:-20}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/setup-ubuntu.sh"
  exit 1
fi

echo "==> Installing Node.js ${NODE_MAJOR}.x"
apt-get update -y
apt-get install -y ca-certificates curl gnupg rsync
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

node -v
npm -v

echo "==> Creating user ${APP_USER}"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

echo "==> Preparing ${APP_DIR}"
mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "==> Installing systemd unit"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 0644 "${SCRIPT_DIR}/channelx.service" /etc/systemd/system/channelx.service
systemctl daemon-reload
systemctl enable channelx.service

echo "==> Done."
echo "Next:"
echo "  1. Deploy app files into ${APP_DIR} (GitHub Actions or rsync)"
echo "  2. Create ${APP_DIR}/.env from .env.example (RUN_MODE=polling)"
echo "  3. Delete any Telegram webhook: npm run webhook:delete"
echo "  4. systemctl start channelx && journalctl -u channelx -f"
