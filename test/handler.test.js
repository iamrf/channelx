'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

const { processChannelPost } = require('../src/handler');
const { DuplicateTracker } = require('../src/utils');

// Mock telegram + twitter modules used by the handler
const telegram = require('../src/telegram');
const twitter = require('../src/twitter');

const baseMsg = (overrides = {}) => ({
  message_id: 1001,
  chat: { id: -100999, username: 'demo_channel' },
  text: 'Hello from Telegram',
  ...overrides,
});

describe('processChannelPost', () => {
  it('skips posts from other channels', async () => {
    const duplicates = new DuplicateTracker();
    const result = await processChannelPost(
      {
        bot: {},
        twitter: {},
        channelId: '@demo_channel',
        duplicates,
      },
      baseMsg({ chat: { id: 1, username: 'other' } })
    );
    assert.deepEqual(result, { skipped: true, reason: 'channel_mismatch' });
    assert.equal(duplicates.size(), 0);
  });

  it('skips duplicates', async () => {
    const duplicates = new DuplicateTracker();
    duplicates.claim(1001);

    const result = await processChannelPost(
      {
        bot: {},
        twitter: {},
        channelId: '@demo_channel',
        duplicates,
      },
      baseMsg()
    );
    assert.deepEqual(result, { skipped: true, reason: 'duplicate' });
  });

  it('skips empty posts', async () => {
    const duplicates = new DuplicateTracker();
    const result = await processChannelPost(
      {
        bot: {},
        twitter: {},
        channelId: '-100999',
        duplicates,
      },
      baseMsg({ text: undefined, caption: undefined })
    );
    assert.deepEqual(result, { skipped: true, reason: 'empty' });
  });

  it('posts text-only tweets', async () => {
    const duplicates = new DuplicateTracker();
    const tweetMock = mock.method(twitter, 'postTweet', async () => ({
      data: { id: 'tw1' },
    }));

    const result = await processChannelPost(
      {
        bot: {},
        twitter: { marker: true },
        channelId: '@demo_channel',
        duplicates,
      },
      baseMsg()
    );

    assert.equal(result.skipped, false);
    assert.equal(result.tweet.data.id, 'tw1');
    assert.equal(tweetMock.mock.callCount(), 1);
    assert.equal(tweetMock.mock.calls[0].arguments[1], 'Hello from Telegram');
    assert.deepEqual(tweetMock.mock.calls[0].arguments[2], []);

    tweetMock.mock.restore();
  });

  it('downloads and uploads media then tweets', async () => {
    const duplicates = new DuplicateTracker();
    const linkMock = mock.method(telegram, 'getFileLink', async () => 'https://t.me/file.jpg');
    const uploadMock = mock.method(twitter, 'uploadMediaFromUrl', async () => 'media-99');
    const tweetMock = mock.method(twitter, 'postTweet', async (_c, text, ids) => ({
      data: { id: 'tw2', text, media: ids },
    }));

    const result = await processChannelPost(
      {
        bot: { name: 'bot' },
        twitter: { name: 'tw' },
        channelId: '@demo_channel',
        duplicates,
      },
      baseMsg({
        text: undefined,
        caption: 'With photo',
        photo: [{ file_id: 'ph1', file_size: 50 }],
      })
    );

    assert.equal(result.skipped, false);
    assert.equal(linkMock.mock.callCount(), 1);
    assert.equal(uploadMock.mock.callCount(), 1);
    assert.equal(uploadMock.mock.calls[0].arguments[2], 'photo');
    assert.deepEqual(tweetMock.mock.calls[0].arguments[2], ['media-99']);

    linkMock.mock.restore();
    uploadMock.mock.restore();
    tweetMock.mock.restore();
  });

  it('continues when one media upload fails but text remains', async () => {
    const duplicates = new DuplicateTracker();
    mock.method(telegram, 'getFileLink', async () => 'https://t.me/video.mp4');
    mock.method(twitter, 'uploadMediaFromUrl', async () => {
      throw new Error('video too long');
    });
    const tweetMock = mock.method(twitter, 'postTweet', async () => ({ data: { id: 'tw3' } }));

    const result = await processChannelPost(
      {
        bot: {},
        twitter: {},
        channelId: '@demo_channel',
        duplicates,
      },
      baseMsg({
        text: 'Fallback text',
        video: { file_id: 'vid1', file_size: 10 },
      })
    );

    assert.equal(result.skipped, false);
    assert.deepEqual(tweetMock.mock.calls[0].arguments[2], []);

    mock.reset();
  });

  it('returns media_failed when all uploads fail and there is no text', async () => {
    const duplicates = new DuplicateTracker();
    mock.method(telegram, 'getFileLink', async () => 'https://t.me/video.mp4');
    mock.method(twitter, 'uploadMediaFromUrl', async () => {
      throw new Error('upload failed');
    });

    const result = await processChannelPost(
      {
        bot: {},
        twitter: {},
        channelId: '@demo_channel',
        duplicates,
      },
      baseMsg({
        text: undefined,
        caption: undefined,
        video: { file_id: 'vid1' },
      })
    );

    assert.deepEqual(result, { skipped: true, reason: 'media_failed' });
    mock.reset();
  });
});
