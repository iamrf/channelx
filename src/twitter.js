'use strict';

const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');
const {
  TWITTER_VIDEO_MAX_BYTES,
  withRetry,
} = require('./utils');

/**
 * Build an authenticated Twitter client (v1.1 for media, v2 for tweets).
 * @param {{
 *   appKey: string,
 *   appSecret: string,
 *   accessToken: string,
 *   accessSecret: string,
 * }} credentials
 */
const createTwitterClient = (credentials) => {
  const { appKey, appSecret, accessToken, accessSecret } = credentials || {};
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error(
      'Twitter credentials are required: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET'
    );
  }

  console.log('[twitter] Creating authenticated Twitter API client');
  return new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });
};

/**
 * Download a remote file into a Buffer via axios.
 * @param {string} url
 * @param {{ httpGet?: typeof axios }} [deps] — injectable for tests
 * @returns {Promise<Buffer>}
 */
const downloadBuffer = async (url, deps = {}) => {
  const httpGet = deps.httpGet || axios;
  console.log(`[twitter] Downloading media from URL…`);
  try {
    const response = await httpGet({
      method: 'get',
      url,
      responseType: 'arraybuffer',
      timeout: 120_000,
      maxContentLength: TWITTER_VIDEO_MAX_BYTES,
      maxBodyLength: TWITTER_VIDEO_MAX_BYTES,
    });
    const buffer = Buffer.from(response.data);
    console.log(`[twitter] Downloaded ${buffer.length} bytes`);
    return buffer;
  } catch (err) {
    console.error('[twitter] Media download failed:', err?.message || err);
    throw err;
  }
};

/**
 * Map our media type to twitter-api-v2 upload options.
 * @param {'photo'|'video'|'gif'} type
 */
const mediaTypeToMime = (type) => {
  switch (type) {
    case 'video':
      return 'video/mp4';
    case 'gif':
      return 'image/gif';
    case 'photo':
    default:
      return 'image/jpeg';
  }
};

/**
 * Upload one media buffer to Twitter via v1.1 media upload.
 * Videos/GIFs use chunked upload under the hood (twitter-api-v2).
 *
 * @param {import('twitter-api-v2').TwitterApi} client
 * @param {Buffer} buffer
 * @param {'photo'|'video'|'gif'} type
 * @returns {Promise<string>} media_id_string
 */
const uploadMediaBuffer = async (client, buffer, type = 'photo') => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Cannot upload empty media buffer');
  }

  if (type === 'video' && buffer.length > TWITTER_VIDEO_MAX_BYTES) {
    throw new Error(
      `Video exceeds Twitter size limit (${buffer.length} > ${TWITTER_VIDEO_MAX_BYTES} bytes)`
    );
  }

  const mimeType = mediaTypeToMime(type);
  console.log(`[twitter] Uploading media type=${type} mime=${mimeType} size=${buffer.length}`);

  try {
    const mediaId = await withRetry(
      () =>
        client.v1.uploadMedia(buffer, {
          mimeType,
          // long videos need additionalOwners sometimes; default chunked path is fine
          target: type === 'video' || type === 'gif' ? 'tweet' : undefined,
        }),
      { label: 'twitter.v1.uploadMedia', maxRetries: 5, baseDelayMs: 2000 }
    );

    console.log(`[twitter] Media uploaded, media_id=${mediaId}`);
    return String(mediaId);
  } catch (err) {
    // Do not transcode — surface a clear error for oversized / unsupported videos
    console.error('[twitter] Media upload failed:', err?.message || err);
    throw err;
  }
};

/**
 * Download from Telegram file link and upload to Twitter.
 * @param {import('twitter-api-v2').TwitterApi} client
 * @param {string} fileLink
 * @param {'photo'|'video'|'gif'} type
 * @param {{ httpGet?: typeof axios }} [deps]
 */
const uploadMediaFromUrl = async (client, fileLink, type = 'photo', deps = {}) => {
  const buffer = await downloadBuffer(fileLink, deps);
  return uploadMediaBuffer(client, buffer, type);
};

/**
 * Post a tweet via Twitter API v2 with optional media IDs (max 4).
 * @param {import('twitter-api-v2').TwitterApi} client
 * @param {string} text
 * @param {string[]} [mediaIds]
 */
const postTweet = async (client, text, mediaIds = []) => {
  const body = {};
  const trimmed = (text || '').trim();

  if (trimmed) {
    body.text = trimmed;
  }

  const ids = (mediaIds || []).filter(Boolean).slice(0, 4);
  if (ids.length > 0) {
    body.media = { media_ids: ids };
  }

  if (!body.text && !body.media) {
    throw new Error('Cannot post empty tweet (no text and no media)');
  }

  // Twitter requires text OR media; media-only tweets need at least one media_id
  // and may require a placeholder — API v2 allows media-only with media.media_ids
  console.log(
    `[twitter] Posting tweet textLength=${trimmed.length} mediaCount=${ids.length}`
  );

  try {
    const result = await withRetry(
      () => client.v2.tweet(body),
      { label: 'twitter.v2.tweet', maxRetries: 5, baseDelayMs: 2000 }
    );

    const tweetId = result?.data?.id;
    console.log(`[twitter] Tweet posted successfully id=${tweetId}`);
    return result;
  } catch (err) {
    console.error('[twitter] Tweet post failed:', err?.message || err);
    throw err;
  }
};

module.exports = {
  createTwitterClient,
  downloadBuffer,
  uploadMediaBuffer,
  uploadMediaFromUrl,
  postTweet,
  mediaTypeToMime,
};
