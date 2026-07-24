'use strict';

const TelegramBot = require('node-telegram-bot-api');

/**
 * Create and configure the Telegram bot with long polling enabled.
 * @param {string} token
 * @param {{ polling?: boolean, BotClass?: typeof TelegramBot }} [options]
 * @returns {import('node-telegram-bot-api')}
 */
const createBot = (token, options = {}) => {
  if (!token) {
    throw new Error('TELEGRAM_TOKEN is required');
  }

  const polling = options.polling !== false;
  const BotClass = options.BotClass || TelegramBot;

  console.log(`[telegram] Initializing bot (polling=${polling})`);

  const bot = new BotClass(token, {
    polling,
    onlyFirstMatch: true,
  });

  if (typeof bot.on === 'function') {
    bot.on('polling_error', (err) => {
      console.error('[telegram] polling_error:', err?.message || err);
    });

    bot.on('error', (err) => {
      console.error('[telegram] error:', err?.message || err);
    });
  }

  return bot;
};

/**
 * Resolve a Telegram file_id to a downloadable HTTPS URL.
 * @param {import('node-telegram-bot-api')} bot
 * @param {string} fileId
 * @returns {Promise<string>}
 */
const getFileLink = async (bot, fileId) => {
  console.log(`[telegram] Resolving file link for file_id=${fileId}`);
  try {
    const link = await bot.getFileLink(fileId);
    console.log(`[telegram] File link resolved`);
    return link;
  } catch (err) {
    console.error(`[telegram] getFileLink failed for ${fileId}:`, err?.message || err);
    throw err;
  }
};

/**
 * Stop polling cleanly (graceful shutdown).
 * @param {import('node-telegram-bot-api')} bot
 */
const stopBot = async (bot) => {
  if (!bot) return;
  console.log('[telegram] Stopping polling…');
  try {
    if (typeof bot.stopPolling === 'function') {
      await bot.stopPolling();
    }
    console.log('[telegram] Polling stopped');
  } catch (err) {
    console.error('[telegram] Error while stopping polling:', err?.message || err);
  }
};

module.exports = {
  createBot,
  getFileLink,
  stopBot,
};
