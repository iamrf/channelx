'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { DuplicateTracker } = require('../src/utils');

const okConfig = {
  ok: true,
  env: {
    telegramToken: 't',
    channelId: '@demo_channel',
    runMode: 'polling',
    webhookUrl: '',
    webhookSecret: 's3cret',
    port: 3000,
    twitter: {
      appKey: 'k',
      appSecret: 's',
      accessToken: 'at',
      accessSecret: 'as',
    },
  },
};

describe('createApp', () => {
  it('returns missing when config invalid', () => {
    const app = createApp({ config: { ok: false, missing: ['TELEGRAM_TOKEN'] } });
    assert.equal(app.ok, false);
    assert.deepEqual(app.missing, ['TELEGRAM_TOKEN']);
  });

  it('handles channel_post updates and ignores others', async () => {
    const duplicates = new DuplicateTracker();
    class FakeBot {
      constructor() {
        this.handlers = {};
      }
      on() {}
    }

    const app = createApp({
      config: okConfig,
      duplicates,
      BotClass: FakeBot,
      polling: false,
      twitter: {
        v2: { tweet: async () => ({ data: { id: '1' } }) },
      },
    });

    assert.equal(app.ok, true);
    assert.equal(app.verifyWebhookSecret('s3cret'), true);
    assert.equal(app.verifyWebhookSecret('nope'), false);

    const ignored = await app.handleUpdate({ update_id: 1, message: {} });
    assert.equal(ignored.reason, 'not_channel_post');

    const posted = await app.handleUpdate({
      update_id: 2,
      channel_post: {
        message_id: 9,
        chat: { username: 'demo_channel' },
        text: 'hi',
      },
    });
    assert.equal(posted.skipped, false);
    assert.equal(duplicates.has(9), true);
  });
});
