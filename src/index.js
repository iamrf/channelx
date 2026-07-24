'use strict';

require('dotenv').config();

const { createApp } = require('./app');
const { loadConfig, requiredEnv, CORE_REQUIRED } = require('./config');
const { stopBot } = require('./telegram');

/**
 * Wire Telegram channel_post → Twitter and start polling (Ubuntu / local).
 * @param {object} [overrides] — injectable deps for tests
 */
const start = async (overrides = {}) => {
  const config = overrides.config || loadConfig(overrides.processEnv || process.env);
  if (!config.ok) {
    console.error(
      `[config] Missing required environment variables: ${config.missing.join(', ')}`
    );
    console.error('[config] Copy .env.example to .env and fill in your credentials.');
    process.exitCode = 1;
    return null;
  }

  if (config.env.runMode === 'webhook' && !overrides.forcePolling) {
    console.error(
      '[main] RUN_MODE=webhook — use the Vercel/webhook HTTP entrypoint, not npm start.\n' +
        '        For Ubuntu long-polling set RUN_MODE=polling (default).'
    );
    process.exitCode = 1;
    return null;
  }

  const app = createApp({
    ...overrides,
    config,
    polling: true,
  });

  if (!app.ok) {
    process.exitCode = 1;
    return null;
  }

  const { bot, twitter, duplicates, handleChannelPost, config: cfg } = app;

  console.log(`[main] Listening for channel_post events from CHANNEL_ID=${cfg.channelId}`);

  const onChannelPost = async (msg) => {
    try {
      await handleChannelPost(msg);
    } catch (err) {
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

  console.log('[main] Bot is running (polling). Press Ctrl+C to stop.');

  return { bot, twitter, duplicates, shutdown, onChannelPost, app };
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
  CORE_REQUIRED,
};
