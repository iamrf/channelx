# ChannelX — Telegram → Twitter (X) Reposter

Automatically reposts new posts from a Telegram channel to Twitter (X) using long polling, media download/upload, and Twitter API v2.

## Features

- Long-polls Telegram for `channel_post` events (**Ubuntu**) or receives webhooks (**Vercel**)
- Filters by `CHANNEL_ID` (numeric ID or `@username`)
- Extracts text/captions and media (photos, videos, GIFs)
- Downloads Telegram files and uploads them to Twitter (v1.1 media upload)
- Posts tweets via Twitter API v2 (up to 4 media attachments)
- In-memory duplicate detection by `message_id`
- Exponential backoff retries on Twitter rate limits
- Graceful shutdown on `SIGINT` / `SIGTERM`
- GitHub Actions CI + CD for **Vercel** and **Ubuntu/systemd**

## Deploy

Production setup (Vercel webhook, Ubuntu polling, secrets, workflows): see **[DEPLOY.md](./DEPLOY.md)**.

## Prerequisites

- Node.js **18+**
- A Telegram bot (via [@BotFather](https://t.me/BotFather))
- A Twitter / X developer app with **Read and Write** permissions
- Access to the target Telegram channel (bot must be an **admin**)

## Setup

### 1. Create a Telegram bot

1. Open [@BotFather](https://t.me/BotFather) and run `/newbot`.
2. Copy the bot token — this is `TELEGRAM_TOKEN`.
3. Add the bot as an **administrator** of your channel (it needs permission to read channel messages / posts).
4. Note your channel username (`@mychannel`) or numeric ID (e.g. `-1001234567890`).

> Tip: Forward a channel post to [@userinfobot](https://t.me/userinfobot) or similar to discover the numeric chat ID.

### 2. Create Twitter / X API credentials

1. Go to the [X Developer Portal](https://developer.x.com/).
2. Create a Project + App with **OAuth 1.0a** user context (not OAuth 2.0-only).
3. Set App permissions to **Read and Write**, save, then **regenerate** the Access Token.
4. Under **Keys and tokens**, copy the **OAuth 1.0a** values:
   - API Key → `TWITTER_API_KEY`
   - API Key Secret → `TWITTER_API_SECRET`
   - Access Token → `TWITTER_ACCESS_TOKEN` (usually looks like `1234567890-abcd…`)
   - Access Token Secret → `TWITTER_ACCESS_SECRET`
5. Ensure the project has **API credits / a paid write plan**. Free tier often returns `402 credits depleted` when posting.

> Do **not** paste OAuth 2.0 **Client ID** / **Client Secret** into the Access Token fields — that causes `401 Unauthorized`.

### 3. Install and configure

```bash
git clone <your-repo-url> channelx
cd channelx
npm install
cp .env.example .env
```

Edit `.env`:

```env
TELEGRAM_TOKEN=123456:ABC-...
CHANNEL_ID=@your_channel_username
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...
```

`CHANNEL_ID` accepts either `@username` or a numeric ID like `-1001234567890`.

### 4. Run

```bash
npm start
```

You should see logs like:

```text
[telegram] Initializing bot (polling=true)
[main] Listening for channel_post events from CHANNEL_ID=@your_channel_username
[main] Bot is running. Press Ctrl+C to stop.
```

Post something in the channel; the bot will download media (if any), upload to Twitter, and tweet.

Stop cleanly with `Ctrl+C` (SIGINT) or `SIGTERM`.

## Tests

```bash
npm test
```

Tests cover channel matching, media/text extraction, duplicate tracking, retry/backoff, the channel-post handler (mocked Telegram/Twitter), and config validation. No live API credentials are required.

## Project structure

```text
├── .github/workflows/   # CI + Vercel/Ubuntu CD
├── api/                 # Vercel serverless (webhook + health)
├── deploy/              # systemd + Ubuntu scripts
├── scripts/             # set/delete Telegram webhook
├── vercel.json
├── DEPLOY.md
├── .env.example
├── package.json
├── README.md
├── src/
│   ├── index.js         # Polling entry (Ubuntu/local)
│   ├── app.js           # Shared runtime
│   ├── config.js        # Env validation
│   ├── webhook-http.js  # HTTP helpers
│   ├── telegram.js
│   ├── twitter.js
│   ├── handler.js
│   └── utils.js
└── test/
```

## Notes & limits

- **Duplicates:** Processed `message_id`s are kept in an in-memory `Set`. After a restart, the same post could be tweeted again if Telegram redelivers it.
  - TODO in code: persist IDs in Redis or SQLite.
- **Media:** Up to **4** attachments per tweet. Oversized / unsupported videos are skipped gracefully (no transcoding).
- **Rate limits:** Twitter 429 / rate-limit errors trigger exponential backoff (up to 5 retries).
- **Empty posts:** Posts with neither text nor successfully uploaded media are skipped.
- **Vercel vs Ubuntu:** Do not run polling and webhook on the **same** bot token at once. Pick one target (see [DEPLOY.md](./DEPLOY.md)).

## Troubleshooting

Common failures seen in production (Telegram channel posts not appearing on X):

### 1. Telegram webhook was never registered (`url` empty)

On Vercel, Telegram must POST to your app. If `getWebhookInfo` shows `"url": ""`, nothing reaches the server.

```bash
# Set WEBHOOK_URL=https://YOUR_APP.vercel.app/api/webhook in .env
npm run webhook:info
npm run webhook:set
npm run webhook:info   # must show your /api/webhook URL
```

Health check:

```bash
curl -sS https://YOUR_APP.vercel.app/api/health
```

### 2. Wrong Twitter tokens (401 Unauthorized)

`v2.me` / posting fails with **401** when OAuth **2.0 Client ID/Secret** were pasted into `TWITTER_ACCESS_TOKEN` / `TWITTER_ACCESS_SECRET`.

- Use **OAuth 1.0a** Access Token + Access Token Secret only.
- App permission must be **Read and Write**, then regenerate the access token.
- After changing env on Vercel, **redeploy** (env updates do not apply to old deployments).

Verify locally:

```bash
node -e "require('dotenv').config(); const {TwitterApi}=require('twitter-api-v2'); new TwitterApi({appKey:process.env.TWITTER_API_KEY,appSecret:process.env.TWITTER_API_SECRET,accessToken:process.env.TWITTER_ACCESS_TOKEN,accessSecret:process.env.TWITTER_ACCESS_SECRET}).v2.me().then(r=>console.log('OK',r.data)).catch(e=>console.error('FAIL',e.data||e.message))"
```

### 3. X API credits depleted (402 Payment Required)

Auth can succeed (`OK` from `v2.me`) while **posting** still fails:

```json
{ "status": 402, "title": "Payment Required", "detail": "credits depleted" }
```

Add credits / upgrade the X developer plan so tweet create is allowed, then retry:

```bash
node -e "require('dotenv').config(); const {createTwitterClient,postTweet}=require('./src/twitter'); postTweet(createTwitterClient({appKey:process.env.TWITTER_API_KEY,appSecret:process.env.TWITTER_API_SECRET,accessToken:process.env.TWITTER_ACCESS_TOKEN,accessSecret:process.env.TWITTER_ACCESS_SECRET}),'channelx credit check '+Date.now()).then(r=>console.log('OK',r.data)).catch(e=>console.error('FAIL',e.data||e.message))"
```

Until this returns `OK`, channel posts will not appear on Twitter.

### 4. Webhook secret mismatch (401 unauthorized)

If `WEBHOOK_SECRET` is set, Telegram sends `X-Telegram-Bot-Api-Secret-Token`. Vercel and `.env` must use the **same** value, and `setWebhook` must be called with that `secret_token`. A POST without the header returns `{"error":"unauthorized"}`.

### 5. Bot is not a channel admin

The bot must be an **administrator** of the channel or it will not receive `channel_post` updates.

```bash
# Replace TOKEN / @channel / BOT_ID as needed
curl -sS "https://api.telegram.org/bot$TELEGRAM_TOKEN/getChatMember" \
  --data-urlencode "chat_id=$CHANNEL_ID" \
  --data-urlencode "user_id=BOT_NUMERIC_ID"
```

Expect `"status":"administrator"`.

### 6. `CHANNEL_ID` does not match the chat

Posts from other chats are skipped (`channel_mismatch`). Use `@username` or the numeric id (e.g. `-1002170047183`). Username matching is case-insensitive; a wrong username silently skips.

### 7. Local `.env` works but Vercel does not

Vercel does not read your laptop `.env`. Set the same variables in **Vercel → Project → Settings → Environment Variables** (Production), including:

`TELEGRAM_TOKEN`, `CHANNEL_ID`, all four Twitter keys, `RUN_MODE=webhook`, `WEBHOOK_URL`, `WEBHOOK_SECRET`

Then **redeploy**. Simulate a post:

```bash
curl -sS -X POST "https://YOUR_APP.vercel.app/api/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $WEBHOOK_SECRET" \
  -d '{"update_id":1,"channel_post":{"message_id":1,"chat":{"id":-100…,"username":"yourchannel","type":"channel"},"text":"probe"}}'
```

- `processing_failed` → check Vercel function logs (often Twitter 401/402).
- `unauthorized` → secret mismatch.
- `misconfigured` → missing env vars on Vercel.

### 8. Polling and webhook fighting each other

Only one delivery mode per bot token. If Ubuntu is polling while Vercel has a webhook (or the reverse), updates go to one place only. Use `DEPLOY_TARGET=ubuntu` **or** `vercel`, and run `npm run webhook:delete` before polling.

### 9. There is no “Twitter webhook URL”

You do **not** give Twitter a webhook. Twitter is called **outbound** with OAuth 1.0a. The webhook URL (`/api/webhook`) is registered with **Telegram** only.

## License

MIT
