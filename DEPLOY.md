# ChannelX Deployment Guide

Complete guide to run ChannelX in production via **GitHub Actions CI/CD**, with two supported targets:

| Target | Runtime | Telegram mode | Best for |
|--------|---------|---------------|----------|
| **Ubuntu server** | `systemd` + long-lived Node process | **Polling** | Reliable, simple, full control |
| **Vercel** | Serverless functions | **Webhook** | Zero server ops, auto HTTPS |

> **Important:** Do **not** run Ubuntu polling and Vercel webhook against the **same** bot token at the same time. Telegram allows only one update delivery method. Pick one target (or use two bots).

---

## Architecture

```text
                    ┌─────────────────────┐
   push / PR  ─────►│  GitHub Actions CI  │  npm ci + npm test (Node 18/20/22)
                    └─────────┬───────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼                                   ▼
   DEPLOY_TARGET=vercel                DEPLOY_TARGET=ubuntu
   (or workflow_dispatch)              (or workflow_dispatch)
            │                                   │
            ▼                                   ▼
   ┌─────────────────┐                 ┌─────────────────┐
   │     Vercel      │                 │  Ubuntu + SSH   │
   │  /api/webhook   │◄── Telegram     │  systemd poll   │◄── Telegram
   │  /api/health    │    HTTPS POST   │  channelx.service│    getUpdates
   └────────┬────────┘                 └────────┬────────┘
            │                                   │
            └─────────────┬─────────────────────┘
                          ▼
                   Twitter / X API
              (media v1.1 + tweet v2)
```

### Repo layout (deploy-related)

```text
.github/workflows/
  ci.yml                 # Always runs tests
  deploy-vercel.yml      # CD → Vercel + setWebhook
  deploy-ubuntu.yml      # CD → rsync + systemd restart
api/
  webhook.js             # Vercel Telegram webhook
  health.js              # Health probe
deploy/
  channelx.service       # systemd unit
  setup-ubuntu.sh        # One-time server bootstrap
  remote-deploy.sh       # Post-rsync install + restart
scripts/telegram-webhook.js
vercel.json
```

---

## 0. Prerequisites (both targets)

1. Telegram bot token + bot is **admin** of the channel.
2. Twitter/X app with **Read and Write** + OAuth 1.0a user tokens.
3. GitHub repo with Actions enabled.
4. Copy `.env.example` → fill secrets (never commit `.env`).

Core env vars:

| Variable | Required | Notes |
|----------|----------|-------|
| `TELEGRAM_TOKEN` | yes | BotFather token |
| `CHANNEL_ID` | yes | `@username` or numeric id |
| `TWITTER_API_KEY` | yes | |
| `TWITTER_API_SECRET` | yes | |
| `TWITTER_ACCESS_TOKEN` | yes | |
| `TWITTER_ACCESS_SECRET` | yes | |
| `RUN_MODE` | no | `polling` (default) or `webhook` |
| `WEBHOOK_URL` | webhook only | e.g. `https://….vercel.app/api/webhook` |
| `WEBHOOK_SECRET` | recommended | Random string; Telegram secret token header |

---

## 1. GitHub CI (always on)

Workflow: `.github/workflows/ci.yml`

Runs on every push/PR to `main` / `master`:

- `npm ci`
- `npm test` on Node **18 / 20 / 22**
- Verifies deploy assets exist (`vercel.json`, systemd unit, `DEPLOY.md`, …)

No secrets required for CI.

---

## 2. Choose a deploy target

Set a **repository variable** (Settings → Secrets and variables → Actions → **Variables**):

| `DEPLOY_TARGET` value | Auto-deploy on push to main |
|-----------------------|-----------------------------|
| `ubuntu` | Ubuntu only |
| `vercel` | Vercel only |
| `both` | Both (only if you use **separate** bot tokens / projects — rare) |
| _(unset)_ | No auto-deploy; use **Actions → Run workflow** manually |

Manual runs always work via **workflow_dispatch**, regardless of `DEPLOY_TARGET`.

---

## 3. Deploy to Ubuntu (recommended for bots)

### 3.1 One-time server setup

On a fresh Ubuntu 22.04+ host (as root):

```bash
# Clone once (or copy deploy/ only), then:
sudo bash deploy/setup-ubuntu.sh
```

This will:

- Install Node.js 20.x (if missing)
- Create system user `channelx`
- Create `/opt/channelx`
- Install and enable `channelx.service`

Create the env file **on the server** (never via git):

```bash
sudo -u channelx cp /opt/channelx/.env.example /opt/channelx/.env
sudo -u channelx nano /opt/channelx/.env
```

Set:

```env
RUN_MODE=polling
TELEGRAM_TOKEN=...
CHANNEL_ID=...
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...
```

Leave `WEBHOOK_URL` empty. Polling does not need a public URL.

Give the GitHub deploy user passwordless restart (example):

```bash
# Create a deploy user with rsync access, or use channelx + sudoers:
echo 'deploy ALL=(root) NOPASSWD: /bin/systemctl restart channelx, /bin/systemctl status channelx' \
  | sudo tee /etc/sudoers.d/channelx-deploy
```

Ensure `deploy` (or `UBUNTU_USER`) can write `/opt/channelx` and run `remote-deploy.sh`.

SSH key: generate a deploy key, add the **public** key to `~deploy/.ssh/authorized_keys`, store the **private** key in GitHub secrets.

### 3.2 GitHub secrets (Environment: `ubuntu`)

Create environment **ubuntu** (Settings → Environments) and add:

| Secret | Example |
|--------|---------|
| `UBUNTU_HOST` | `203.0.113.10` or `bots.example.com` |
| `UBUNTU_USER` | `deploy` |
| `UBUNTU_SSH_KEY` | Full PEM private key |
| `UBUNTU_SSH_PORT` | `22` (optional) |
| `UBUNTU_APP_DIR` | `/opt/channelx` (optional) |

### 3.3 First deploy

1. Set repo variable `DEPLOY_TARGET=ubuntu` **or** run **Deploy Ubuntu** manually.
2. Push to `main`.
3. Workflow rsyncs the repo (excluding `.env` / `node_modules`), runs `npm ci --omit=dev`, deletes any Telegram webhook, restarts systemd.

### 3.4 Ops commands

```bash
sudo systemctl status channelx
sudo journalctl -u channelx -f
sudo systemctl restart channelx

# If you previously used Vercel, clear webhook before polling:
cd /opt/channelx && sudo -u channelx npm run webhook:delete
```

### 3.5 Local / manual deploy without Actions

```bash
rsync -az --delete --exclude node_modules --exclude .env ./ user@host:/opt/channelx/
ssh user@host 'APP_DIR=/opt/channelx bash /opt/channelx/deploy/remote-deploy.sh'
```

---

## 4. Deploy to Vercel (webhook mode)

Long polling cannot run on Vercel. ChannelX exposes:

- `POST /api/webhook` — Telegram updates
- `GET  /api/health` — liveness
- Aliases: `/webhook`, `/health` (via `vercel.json` rewrites)

### 4.1 Create the Vercel project

```bash
npm i -g vercel
vercel login
vercel link   # creates .vercel (gitignored)
```

In the Vercel dashboard → Project → **Settings → Environment Variables**, add for Production:

| Name | Value |
|------|-------|
| `TELEGRAM_TOKEN` | … |
| `CHANNEL_ID` | … |
| `TWITTER_API_KEY` | … |
| `TWITTER_API_SECRET` | … |
| `TWITTER_ACCESS_TOKEN` | … |
| `TWITTER_ACCESS_SECRET` | … |
| `RUN_MODE` | `webhook` |
| `WEBHOOK_URL` | `https://YOUR_PROJECT.vercel.app/api/webhook` |
| `WEBHOOK_SECRET` | long random string (e.g. `openssl rand -hex 32`) |

> After the first deploy you will know the exact production URL — update `WEBHOOK_URL` if needed and redeploy.

### 4.2 GitHub secrets (Environment: `vercel`)

| Secret | How to get it |
|--------|----------------|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` → `projectId` |
| `TELEGRAM_TOKEN` | Bot token (used by Actions to call `setWebhook`) |
| `WEBHOOK_SECRET` | Same as Vercel env |

### 4.3 Deploy

1. Set `DEPLOY_TARGET=vercel` **or** run **Deploy Vercel** manually.
2. Push to `main`.
3. Workflow: test → `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod` → `setWebhook` to `{deployUrl}/api/webhook`.

### 4.4 Verify

```bash
curl -sS https://YOUR_PROJECT.vercel.app/api/health
npm run webhook:info   # locally with TELEGRAM_TOKEN in .env
```

Post in the Telegram channel; check Vercel function logs.

### 4.5 Switching away from Vercel

Before starting Ubuntu polling:

```bash
npm run webhook:delete
```

Or let `deploy/remote-deploy.sh` delete the webhook automatically on Ubuntu deploy.

---

## 5. Local development

```bash
cp .env.example .env
# RUN_MODE=polling
npm install
npm test
npm start
```

Webhook helpers:

```bash
npm run webhook:set
npm run webhook:delete
npm run webhook:info
```

---

## 6. Security checklist

- [ ] `.env` never committed (see `.gitignore`)
- [ ] `WEBHOOK_SECRET` set on Vercel + matching GitHub secret
- [ ] Ubuntu: deploy key scoped to one host; sudoers limited to `systemctl restart/status channelx`
- [ ] Twitter tokens rotated if leaked
- [ ] Prefer numeric `CHANNEL_ID` over public `@username` when possible
- [ ] GitHub Environments (`vercel` / `ubuntu`) with required reviewers for production (optional)

---

## 7. Limitations & production notes

1. **Duplicate detection** uses an in-memory `Set`.  
   - Ubuntu: lost on process restart.  
   - Vercel: lost on every cold start / across isolates.  
   - TODO in code: Redis or SQLite for durable dedupe (strongly recommended on Vercel).

2. **Vercel `maxDuration`** is 60s (`vercel.json`). Large video uploads may time out — prefer Ubuntu for heavy media.

3. **Hobby Vercel** plans may have lower timeouts / concurrency — check your plan.

4. **Album posts** arrive as multiple `channel_post` updates; each is handled separately (up to 4 media per tweet).

---

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| CI fails on tests | Run `npm test` locally; Node ≥ 18 |
| Vercel 500 `misconfigured` | Missing env vars in Vercel project settings |
| Webhook 401 | `WEBHOOK_SECRET` mismatch |
| Ubuntu service exit | `journalctl -u channelx -e`; check `.env` |
| No Telegram updates on Ubuntu | `npm run webhook:info` — delete webhook if URL is set |
| No updates on Vercel | Confirm `setWebhook` URL; bot must be channel admin |
| Both targets fighting | Set a single `DEPLOY_TARGET`; delete webhook or stop systemd |

---

## 9. Quick start cheat sheets

### Ubuntu path

```bash
# Server
sudo bash deploy/setup-ubuntu.sh
# fill /opt/channelx/.env with RUN_MODE=polling

# GitHub
# secrets: UBUNTU_HOST, UBUNTU_USER, UBUNTU_SSH_KEY
# variable: DEPLOY_TARGET=ubuntu

git push origin main
```

### Vercel path

```bash
vercel link
# set Production env vars including RUN_MODE=webhook + WEBHOOK_URL + WEBHOOK_SECRET

# GitHub
# secrets: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, TELEGRAM_TOKEN, WEBHOOK_SECRET
# variable: DEPLOY_TARGET=vercel

git push origin main
```
