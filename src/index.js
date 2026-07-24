'use strict';

require('dotenv').config();

const { createBot, stopBot } = require('./telegram');
const { createTwitterClient } = require('./twitter');
const { processChannelPost } = require('./handler');
const { DuplicateTracker } = require('./utils');

const requiredEnv = [
  'TELEGRAM_TOKEN',
  'CHANNEL_ID',
  'TWITTER_API_KEY',
  'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_SECRET',
];

/**
 * Validate required environment variables.
 * @returns {{ ok: true, env: object } | { ok: false, missing: string[] }}
 */
const loadConfig = (env = process.env) => {
  const missing = requiredEnv.filter((key) => !env[key] || String(env[key]).trim() === '');
  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    env: {
      telegramToken: env.TELEGRAM_TOKEN.trim(),
      channelId: env.CHANNEL_ID.trim(),
      twitter: {
        appKey: env.TWITTER_API_KEY.trim(),
        appSecret: env.TWITTER_API_SECRET.trim(),
        accessToken: env.TWITTER_ACCESS_TOKEN.trim(),
        accessSecret: env.TWITTER_ACCESS_SECRET.trim(),
      },
    },
  };
};

/**
 * Wire Telegram channel_post → Twitter and start polling.
 * @param {object} [overrides] — injectable deps for tests
 */
const start = async (overrides = {}) => {
  const config = overrides.config || loadConfig();
  if (!config.ok) {
    console.error(
      `[config] Missing required environment variables: ${config.missing.join(', ')}`
    );
    console.error('[config] Copy .env.example to .env and fill in your credentials.');
    process.exitCode = 1;
    return null;
  }

  const { telegramToken, channelId, twitter: twitterCreds } = config.env;

  // TODO: Replace in-memory Set with Redis/SQLite for durable deduplication across restarts.
  const duplicates = overrides.duplicates || new DuplicateTracker();
  const bot = overrides.bot || createBot(telegramToken, { polling: true });
  const twitter = overrides.twitter || createTwitterClient(twitterCreds);

  console.log(`[main] Listening for channel_post events from CHANNEL_ID=${channelId}`);

  const onChannelPost = async (msg) => {
    try {
      await processChannelPost({ bot, twitter, channelId, duplicates }, msg);
    } catch (err) {
      // Already logged in handler; keep the process alive
      console.error('[main] channel_post handler error:', err?.message || err);
    }
  };

  bot.on('channel_post', onChannelPost);

  const shutdown = async (signal) => {
    console.log(`[main] Received ${signal}; shutting down gracefully…`);
    try {
      bot.removeListener('channel_post', onChannelPost);
      await stopBot(bot);
    } finally {
      console.log('[main] Exit');
      if (!overrides.keepAlive) {
        process.exit(0);
      }
    }
  };

  if (!overrides.skipSignalHandlers) {
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }

  console.log('[main] Bot is running. Press Ctrl+C to stop.');

  return { bot, twitter, duplicates, shutdown, onChannelPost };
};

if (require.main === module) {
  start().catch((err) => {
    console.error('[main] Fatal startup error:', err?.message || err);
    process.exit(1);
  });
}

module.exports = {
  start,
  loadConfig,
  requiredEnv,
};
