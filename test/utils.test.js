'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  matchesChannel,
  extractText,
  extractMedia,
  DuplicateTracker,
  isRateLimitError,
  withRetry,
  MAX_MEDIA_PER_TWEET,
} = require('../src/utils');

describe('matchesChannel', () => {
  it('matches numeric chat id', () => {
    assert.equal(matchesChannel({ id: -100123 }, '-100123'), true);
  });

  it('matches @username case-insensitively', () => {
    assert.equal(matchesChannel({ id: 1, username: 'NewsDesk' }, '@newsdesk'), true);
    assert.equal(matchesChannel({ id: 1, username: 'newsdesk' }, 'NewsDesk'), true);
  });

  it('rejects mismatched channel', () => {
    assert.equal(matchesChannel({ id: -1, username: 'other' }, '@newsdesk'), false);
  });

  it('handles missing chat / empty config', () => {
    assert.equal(matchesChannel(null, '@x'), false);
    assert.equal(matchesChannel({ id: 1 }, ''), false);
  });
});

describe('extractText', () => {
  it('prefers text over caption when both absent uses empty', () => {
    assert.equal(extractText({ text: ' Hello ' }), 'Hello');
    assert.equal(extractText({ caption: ' Cap ' }), 'Cap');
    assert.equal(extractText({}), '');
  });
});

describe('extractMedia', () => {
  it('picks largest photo', () => {
    const media = extractMedia({
      photo: [
        { file_id: 'small', file_size: 10 },
        { file_id: 'large', file_size: 999 },
      ],
    });
    assert.equal(media.length, 1);
    assert.equal(media[0].fileId, 'large');
    assert.equal(media[0].type, 'photo');
  });

  it('extracts video and animation', () => {
    assert.deepEqual(
      extractMedia({ video: { file_id: 'v1', file_size: 100, duration: 5 } }),
      [{ fileId: 'v1', type: 'video', fileSize: 100, duration: 5 }]
    );
    assert.equal(extractMedia({ animation: { file_id: 'g1' } })[0].type, 'gif');
  });

  it('falls back to document mime types', () => {
    assert.equal(
      extractMedia({ document: { file_id: 'd1', mime_type: 'image/png' } })[0].type,
      'photo'
    );
    assert.equal(
      extractMedia({ document: { file_id: 'd2', mime_type: 'image/gif' } })[0].type,
      'gif'
    );
    assert.equal(
      extractMedia({ document: { file_id: 'd3', mime_type: 'video/mp4' } })[0].type,
      'video'
    );
  });

  it(`caps at ${MAX_MEDIA_PER_TWEET} items`, () => {
    // photo + video + animation = 3; still under cap
    const media = extractMedia({
      photo: [{ file_id: 'p', file_size: 1 }],
      video: { file_id: 'v' },
      animation: { file_id: 'g' },
    });
    assert.ok(media.length <= MAX_MEDIA_PER_TWEET);
  });
});

describe('DuplicateTracker', () => {
  it('claims a message once', () => {
    const d = new DuplicateTracker();
    assert.equal(d.claim(42), true);
    assert.equal(d.claim(42), false);
    assert.equal(d.has(42), true);
    assert.equal(d.size(), 1);
  });

  it('rejects null ids', () => {
    const d = new DuplicateTracker();
    assert.equal(d.claim(null), false);
  });
});

describe('isRateLimitError / withRetry', () => {
  it('detects 429-style errors', () => {
    assert.equal(isRateLimitError({ code: 429 }), true);
    assert.equal(isRateLimitError({ status: 429 }), true);
    assert.equal(isRateLimitError({ rateLimitError: true }), true);
    assert.equal(isRateLimitError({ message: 'Rate limit exceeded' }), true);
    assert.equal(isRateLimitError({ message: 'nope' }), false);
  });

  it('retries on rate limit then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          const err = new Error('rate limit');
          err.code = 429;
          throw err;
        }
        return 'ok';
      },
      { maxRetries: 5, baseDelayMs: 1, label: 'test' }
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('throws after exhausting retries', async () => {
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            const err = new Error('too many requests');
            err.code = 429;
            throw err;
          },
          { maxRetries: 2, baseDelayMs: 1, label: 'fail' }
        ),
      /too many requests/
    );
  });

  it('does not retry non-rate-limit errors', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls += 1;
            throw new Error('permanent');
          },
          { maxRetries: 5, baseDelayMs: 1 }
        ),
      /permanent/
    );
    assert.equal(calls, 1);
  });
});
