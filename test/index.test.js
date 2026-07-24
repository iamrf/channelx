'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { loadConfig, requiredEnv } = require('../src/index');
const { DuplicateTracker } = require('../src/utils');

describe('loadConfig', () => {
  it('lists all required keys', () => {
    assert.ok(requiredEnv.includes('TELEGRAM_TOKEN'));
    assert.ok(requiredEnv.includes('CHANNEL_ID'));
    assert.ok(requiredEnv.includes('TWITTER_API_KEY'));
  });

  it('fails when env vars are missing', () => {
    const result = loadConfig({});
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, requiredEnv);
  });

  it('fails on blank values', () => {
    const env = Object.fromEntries(requiredEnv.map((k) => [k, '  ']));
    const result = loadConfig(env);
    assert.equal(result.ok, false);
  });

  it('returns trimmed config when complete', () => {
    const env = {
      TELEGRAM_TOKEN: ' tok ',
      CHANNEL_ID: ' @chan ',
      TWITTER_API_KEY: 'k',
      TWITTER_API_SECRET: 's',
      TWITTER_ACCESS_TOKEN: 'at',
      TWITTER_ACCESS_SECRET: 'as',
    };
    const result = loadConfig(env);
    assert.equal(result.ok, true);
    assert.equal(result.env.telegramToken, 'tok');
    assert.equal(result.env.channelId, '@chan');
    assert.equal(result.env.twitter.appKey, 'k');
  });
});

describe('start (integration wiring)', () => {
  it('wires channel_post listener and shutdown', async () => {
    const listeners = {};
    const bot = {
      on(event, fn) {
        listeners[event] = fn;
      },
      removeListener(event, fn) {
        if (listeners[event] === fn) delete listeners[event];
      },
      stopPolling: async () => {
        bot.stopped = true;
      },
    };

    const { start } = require('../src/index');
    const duplicates = new DuplicateTracker();

    const handle = await start({
      config: {
        ok: true,
        env: {
          telegramToken: 't',
          channelId: '@demo_channel',
          twitter: {
            appKey: 'k',
            appSecret: 's',
            accessToken: 'at',
            accessSecret: 'as',
          },
        },
      },
      bot,
      twitter: {
        v2: { tweet: async () => ({ data: { id: 'x' } }) },
      },
      duplicates,
      skipSignalHandlers: true,
      keepAlive: true,
    });

    assert.ok(handle);
    assert.equal(typeof listeners.channel_post, 'function');
    assert.equal(typeof handle.shutdown, 'function');

    await listeners.channel_post({
      message_id: 7,
      chat: { username: 'demo_channel' },
      text: 'wired',
    });

    assert.equal(duplicates.has(7), true);

    await handle.shutdown('SIGTERM');
    assert.equal(bot.stopped, true);
    assert.equal(listeners.channel_post, undefined);
  });

  it('returns null and sets exitCode when config invalid', async () => {
    const prev = process.exitCode;
    process.exitCode = undefined;
    const { start } = require('../src/index');
    const handle = await start({
      config: { ok: false, missing: ['TELEGRAM_TOKEN'] },
      skipSignalHandlers: true,
      keepAlive: true,
    });
    assert.equal(handle, null);
    assert.equal(process.exitCode, 1);
    process.exitCode = prev;
  });
});
