'use strict';

const CORE_REQUIRED = [
  'TELEGRAM_TOKEN',
  'CHANNEL_ID',
  'TWITTER_API_KEY',
  'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_SECRET',
];

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'polling' | 'webhook'}
 */
const resolveRunMode = (env = process.env) => {
  const raw = String(env.RUN_MODE || env.TELEGRAM_MODE || 'polling')
    .trim()
    .toLowerCase();
  return raw === 'webhook' ? 'webhook' : 'polling';
};

/**
 * Validate required environment variables and return a typed config object.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, env: object } | { ok: false, missing: string[] }}
 */
const loadConfig = (env = process.env) => {
  const missing = CORE_REQUIRED.filter(
    (key) => !env[key] || String(env[key]).trim() === ''
  );

  const runMode = resolveRunMode(env);

  if (runMode === 'webhook') {
    // Public HTTPS URL Telegram will POST updates to (Vercel or reverse-proxied Ubuntu)
    if (!env.WEBHOOK_URL || String(env.WEBHOOK_URL).trim() === '') {
      missing.push('WEBHOOK_URL');
    }
  }

  if (missing.length > 0) {
    return { ok: false, missing: [...new Set(missing)] };
  }

  return {
    ok: true,
    env: {
      telegramToken: env.TELEGRAM_TOKEN.trim(),
      channelId: env.CHANNEL_ID.trim(),
      runMode,
      webhookUrl: env.WEBHOOK_URL ? env.WEBHOOK_URL.trim() : '',
      webhookSecret: env.WEBHOOK_SECRET ? env.WEBHOOK_SECRET.trim() : '',
      port: Number(env.PORT || 3000),
      twitter: {
        appKey: env.TWITTER_API_KEY.trim(),
        appSecret: env.TWITTER_API_SECRET.trim(),
        accessToken: env.TWITTER_ACCESS_TOKEN.trim(),
        accessSecret: env.TWITTER_ACCESS_SECRET.trim(),
      },
    },
  };
};

module.exports = {
  CORE_REQUIRED,
  requiredEnv: CORE_REQUIRED,
  resolveRunMode,
  loadConfig,
};
