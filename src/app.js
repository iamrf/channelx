'use strict';

const { createBot } = require('./telegram');
const { createTwitterClient } = require('./twitter');
const { processChannelPost } = require('./handler');
const { DuplicateTracker } = require('./utils');
const { loadConfig } = require('./config');

/**
 * Shared application context used by polling (Ubuntu) and webhook (Vercel) runtimes.
 * @param {object} [overrides]
 */
const createApp = (overrides = {}) => {
  const config = overrides.config || loadConfig(overrides.processEnv || process.env);
  if (!config.ok) {
    return { ok: false, missing: config.missing };
  }

  const { telegramToken, channelId, twitter: twitterCreds, runMode, webhookSecret } =
    config.env;

  // TODO: Persist processed message IDs in Redis/SQLite — critical on Vercel where
  // each cold start gets a fresh in-memory Set across instances.
  const duplicates = overrides.duplicates || new DuplicateTracker();
  const polling = overrides.polling != null ? overrides.polling : runMode === 'polling';
  const bot =
    overrides.bot ||
    createBot(telegramToken, {
      polling,
      BotClass: overrides.BotClass,
    });
  const twitter = overrides.twitter || createTwitterClient(twitterCreds);

  const handleChannelPost = async (msg) => {
    try {
      return await processChannelPost({ bot, twitter, channelId, duplicates }, msg);
    } catch (err) {
      console.error('[app] channel_post handler error:', err?.message || err);
      throw err;
    }
  };

  /**
   * Process a raw Telegram Update object (webhook body).
   * @param {object} update
   */
  const handleUpdate = async (update) => {
    if (!update || typeof update !== 'object') {
      return { skipped: true, reason: 'invalid_update' };
    }

    if (update.channel_post) {
      return handleChannelPost(update.channel_post);
    }

    console.log(
      `[app] Ignoring update_id=${update.update_id} (no channel_post)`
    );
    return { skipped: true, reason: 'not_channel_post' };
  };

  /**
   * Validate Telegram webhook secret token header when WEBHOOK_SECRET is set.
   * @param {string|undefined} headerValue
   */
  const verifyWebhookSecret = (headerValue) => {
    if (!webhookSecret) return true;
    return headerValue === webhookSecret;
  };

  return {
    ok: true,
    config: config.env,
    bot,
    twitter,
    duplicates,
    handleChannelPost,
    handleUpdate,
    verifyWebhookSecret,
  };
};

module.exports = {
  createApp,
};
