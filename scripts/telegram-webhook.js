'use strict';

/**
 * Register or remove the Telegram webhook.
 *
 *   node scripts/telegram-webhook.js set
 *   node scripts/telegram-webhook.js delete
 *   node scripts/telegram-webhook.js info
 */

require('dotenv').config();

const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;
const webhookUrl = process.env.WEBHOOK_URL;
const secret = process.env.WEBHOOK_SECRET || '';

const api = (method, params = {}) =>
  axios.get(`https://api.telegram.org/bot${token}/${method}`, { params, timeout: 30_000 });

const usage = () => {
  console.log('Usage: node scripts/telegram-webhook.js <set|delete|info>');
  process.exit(1);
};

const main = async () => {
  const cmd = (process.argv[2] || '').toLowerCase();
  if (!token) {
    console.error('TELEGRAM_TOKEN is required');
    process.exit(1);
  }
  if (!['set', 'delete', 'info'].includes(cmd)) usage();

  if (cmd === 'info') {
    const { data } = await api('getWebhookInfo');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'delete') {
    const { data } = await api('deleteWebhook', { drop_pending_updates: false });
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (!webhookUrl) {
    console.error('WEBHOOK_URL is required for set');
    process.exit(1);
  }

  const params = {
    url: webhookUrl,
    allowed_updates: JSON.stringify(['channel_post']),
    drop_pending_updates: false,
  };
  if (secret) params.secret_token = secret;

  const { data } = await api('setWebhook', params);
  console.log(JSON.stringify(data, null, 2));
};

main().catch((err) => {
  console.error(err?.response?.data || err.message || err);
  process.exit(1);
});
