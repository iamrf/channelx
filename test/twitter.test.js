'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const twitter = require('../src/twitter');
const { TWITTER_VIDEO_MAX_BYTES } = require('../src/utils');

describe('mediaTypeToMime', () => {
  it('maps types to mime strings', () => {
    assert.equal(twitter.mediaTypeToMime('photo'), 'image/jpeg');
    assert.equal(twitter.mediaTypeToMime('video'), 'video/mp4');
    assert.equal(twitter.mediaTypeToMime('gif'), 'image/gif');
  });
});

describe('createTwitterClient', () => {
  it('requires all credentials', () => {
    assert.throws(() => twitter.createTwitterClient({}), /Twitter credentials/);
  });
});

describe('uploadMediaBuffer', () => {
  it('rejects empty buffers', async () => {
    await assert.rejects(
      () => twitter.uploadMediaBuffer({}, Buffer.alloc(0), 'photo'),
      /empty media/
    );
  });

  it('rejects oversized videos without uploading', async () => {
    const huge = Buffer.alloc(10);
    Object.defineProperty(huge, 'length', { value: TWITTER_VIDEO_MAX_BYTES + 1 });
    await assert.rejects(
      () => twitter.uploadMediaBuffer({}, huge, 'video'),
      /exceeds Twitter size limit/
    );
  });

  it('uploads via client.v1.uploadMedia', async () => {
    const client = {
      v1: {
        uploadMedia: async (buf, opts) => {
          assert.ok(Buffer.isBuffer(buf));
          assert.equal(opts.mimeType, 'image/jpeg');
          return 'mid-1';
        },
      },
    };
    const id = await twitter.uploadMediaBuffer(client, Buffer.from('abc'), 'photo');
    assert.equal(id, 'mid-1');
  });
});

describe('postTweet', () => {
  it('rejects empty tweets', async () => {
    await assert.rejects(() => twitter.postTweet({}, '', []), /empty tweet/);
  });

  it('posts text and media_ids via v2 (max 4)', async () => {
    const client = {
      v2: {
        tweet: async (body) => ({ data: { id: '99', ...body } }),
      },
    };
    const result = await twitter.postTweet(client, 'hi', ['a', 'b', 'c', 'd', 'e']);
    assert.equal(result.data.id, '99');
    assert.equal(result.data.text, 'hi');
    assert.deepEqual(result.data.media.media_ids, ['a', 'b', 'c', 'd']);
  });

  it('allows media-only tweets', async () => {
    const client = {
      v2: {
        tweet: async (body) => ({ data: { id: '1', ...body } }),
      },
    };
    const result = await twitter.postTweet(client, '  ', ['m1']);
    assert.equal(result.data.text, undefined);
    assert.deepEqual(result.data.media.media_ids, ['m1']);
  });
});

describe('downloadBuffer', () => {
  it('fetches arraybuffer and returns a Buffer', async () => {
    let calledWith;
    const httpGet = async (opts) => {
      calledWith = opts;
      return { data: Uint8Array.from([9, 8, 7]) };
    };

    const buf = await twitter.downloadBuffer('https://example.com/f.jpg', { httpGet });
    assert.ok(Buffer.isBuffer(buf));
    assert.deepEqual([...buf], [9, 8, 7]);
    assert.equal(calledWith.method, 'get');
    assert.equal(calledWith.url, 'https://example.com/f.jpg');
    assert.equal(calledWith.responseType, 'arraybuffer');
  });

  it('surfaces download errors', async () => {
    await assert.rejects(
      () =>
        twitter.downloadBuffer('https://example.com/x', {
          httpGet: async () => {
            throw new Error('network down');
          },
        }),
      /network down/
    );
  });
});

describe('uploadMediaFromUrl', () => {
  it('downloads then uploads', async () => {
    const client = {
      v1: {
        uploadMedia: async () => 'uploaded-id',
      },
    };
    const id = await twitter.uploadMediaFromUrl(client, 'https://cdn/x.jpg', 'photo', {
      httpGet: async () => ({ data: Buffer.from('img') }),
    });
    assert.equal(id, 'uploaded-id');
  });
});
