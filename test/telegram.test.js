'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createBot, getFileLink, stopBot } = require('../src/telegram');

describe('createBot', () => {
  it('requires a token', () => {
    assert.throws(() => createBot(''), /TELEGRAM_TOKEN/);
  });

  it('constructs bot with polling enabled by default', () => {
    const calls = [];
    class FakeBot {
      constructor(token, opts) {
        calls.push({ token, opts });
        this.handlers = {};
      }
      on(event, fn) {
        this.handlers[event] = fn;
      }
    }

    const bot = createBot('tok-1', { BotClass: FakeBot });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].token, 'tok-1');
    assert.equal(calls[0].opts.polling, true);
    assert.ok(bot.handlers.polling_error);
    assert.ok(bot.handlers.error);
  });
});

describe('getFileLink', () => {
  it('delegates to bot.getFileLink', async () => {
    const bot = {
      getFileLink: async (id) => `https://api.telegram.org/file/${id}`,
    };
    const link = await getFileLink(bot, 'abc');
    assert.equal(link, 'https://api.telegram.org/file/abc');
  });

  it('surfaces errors', async () => {
    const bot = {
      getFileLink: async () => {
        throw new Error('not found');
      },
    };
    await assert.rejects(() => getFileLink(bot, 'x'), /not found/);
  });
});

describe('stopBot', () => {
  it('calls stopPolling when available', async () => {
    let stopped = false;
    await stopBot({
      stopPolling: async () => {
        stopped = true;
      },
    });
    assert.equal(stopped, true);
  });

  it('no-ops on null bot', async () => {
    await stopBot(null);
  });
});
