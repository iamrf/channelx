'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  loadConfig,
  resolveRunMode,
  CORE_REQUIRED,
} = require('../src/config');

const completeEnv = {
  TELEGRAM_TOKEN: ' tok ',
  CHANNEL_ID: ' @chan ',
  TWITTER_API_KEY: 'k',
  TWITTER_API_SECRET: 's',
  TWITTER_ACCESS_TOKEN: 'at',
  TWITTER_ACCESS_SECRET: 'as',
};

describe('resolveRunMode', () => {
  it('defaults to polling', () => {
    assert.equal(resolveRunMode({}), 'polling');
  });

  it('accepts webhook via RUN_MODE or TELEGRAM_MODE', () => {
    assert.equal(resolveRunMode({ RUN_MODE: 'webhook' }), 'webhook');
    assert.equal(resolveRunMode({ TELEGRAM_MODE: 'WEBHOOK' }), 'webhook');
  });
});

describe('loadConfig', () => {
  it('requires core keys', () => {
    const result = loadConfig({});
    assert.equal(result.ok, false);
    for (const key of CORE_REQUIRED) {
      assert.ok(result.missing.includes(key));
    }
  });

  it('returns polling config', () => {
    const result = loadConfig(completeEnv);
    assert.equal(result.ok, true);
    assert.equal(result.env.runMode, 'polling');
    assert.equal(result.env.telegramToken, 'tok');
    assert.equal(result.env.channelId, '@chan');
  });

  it('requires WEBHOOK_URL in webhook mode', () => {
    const result = loadConfig({ ...completeEnv, RUN_MODE: 'webhook' });
    assert.equal(result.ok, false);
    assert.ok(result.missing.includes('WEBHOOK_URL'));
  });

  it('accepts webhook config with URL + secret', () => {
    const result = loadConfig({
      ...completeEnv,
      RUN_MODE: 'webhook',
      WEBHOOK_URL: ' https://x.vercel.app/api/webhook ',
      WEBHOOK_SECRET: ' sec ',
    });
    assert.equal(result.ok, true);
    assert.equal(result.env.runMode, 'webhook');
    assert.equal(result.env.webhookUrl, 'https://x.vercel.app/api/webhook');
    assert.equal(result.env.webhookSecret, 'sec');
  });
});
