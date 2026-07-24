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
2. Create a Project + App with **OAuth 1.0a** user context.
3. Set App permissions to **Read and Write**.
4. Generate **API Key**, **API Key Secret**, **Access Token**, and **Access Token Secret**.
5. Map them to:
   - `TWITTER_API_KEY`
   - `TWITTER_API_SECRET`
   - `TWITTER_ACCESS_TOKEN`
   - `TWITTER_ACCESS_SECRET`

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

## License

MIT
