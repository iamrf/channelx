'use strict';

/**
 * Pure helpers for channel matching, media extraction, and duplicate tracking.
 */

/** Twitter allows at most 4 media attachments per tweet. */
const MAX_MEDIA_PER_TWEET = 4;

/** Soft limit guidance for video uploads (Twitter: ~512 MB / ~140s). We do not transcode. */
const TWITTER_VIDEO_MAX_BYTES = 512 * 1024 * 1024;

/**
 * Returns true if the Telegram chat matches CHANNEL_ID (numeric id or @username).
 * @param {{ id?: number, username?: string }} chat
 * @param {string} channelId
 */
const matchesChannel = (chat, channelId) => {
  if (!chat || channelId == null || channelId === '') {
    return false;
  }

  const configured = String(channelId).trim();
  const withoutAt = configured.startsWith('@') ? configured.slice(1) : configured;

  if (chat.username) {
    const username = String(chat.username).replace(/^@/, '');
    if (username.toLowerCase() === withoutAt.toLowerCase()) {
      return true;
    }
  }

  if (chat.id != null && String(chat.id) === withoutAt) {
    return true;
  }

  return false;
};

/**
 * Extract tweet text from a channel post (text or caption).
 * @param {object} msg
 * @returns {string}
 */
const extractText = (msg) => {
  if (!msg) return '';
  const raw = msg.text ?? msg.caption ?? '';
  return String(raw).trim();
};

/**
 * Collect downloadable media descriptors from a Telegram channel_post.
 * Supports photo (largest size), video, animation/GIF, and video_note.
 * Caps at MAX_MEDIA_PER_TWEET.
 *
 * @param {object} msg
 * @returns {Array<{ fileId: string, type: 'photo'|'video'|'gif', fileSize?: number }>}
 */
const extractMedia = (msg) => {
  if (!msg) return [];

  const items = [];

  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largest = msg.photo.reduce((best, p) =>
      (p.file_size || 0) >= (best.file_size || 0) ? p : best
    );
    items.push({
      fileId: largest.file_id,
      type: 'photo',
      fileSize: largest.file_size,
    });
  }

  if (msg.video?.file_id) {
    items.push({
      fileId: msg.video.file_id,
      type: 'video',
      fileSize: msg.video.file_size,
      duration: msg.video.duration,
    });
  }

  if (msg.animation?.file_id) {
    items.push({
      fileId: msg.animation.file_id,
      type: 'gif',
      fileSize: msg.animation.file_size,
    });
  }

  // Document that is clearly an image/video/gif (optional fallback)
  if (msg.document?.file_id && items.length === 0) {
    const mime = msg.document.mime_type || '';
    if (mime.startsWith('image/')) {
      items.push({
        fileId: msg.document.file_id,
        type: mime === 'image/gif' ? 'gif' : 'photo',
        fileSize: msg.document.file_size,
      });
    } else if (mime.startsWith('video/')) {
      items.push({
        fileId: msg.document.file_id,
        type: 'video',
        fileSize: msg.document.file_size,
      });
    }
  }

  return items.slice(0, MAX_MEDIA_PER_TWEET);
};

/**
 * In-memory duplicate guard by Telegram message_id.
 *
 * TODO: Persist processed message IDs in Redis or SQLite so duplicates
 * are still skipped after process restarts / multi-instance deploys.
 */
class DuplicateTracker {
  constructor() {
    /** @type {Set<number|string>} */
    this.seen = new Set();
  }

  /**
   * @param {number|string} messageId
   * @returns {boolean} true if this is the first time we see the id
   */
  claim(messageId) {
    if (messageId == null) return false;
    if (this.seen.has(messageId)) return false;
    this.seen.add(messageId);
    return true;
  }

  has(messageId) {
    return this.seen.has(messageId);
  }

  size() {
    return this.seen.size;
  }

  clear() {
    this.seen.clear();
  }
}

/**
 * Detect Twitter API rate-limit style errors.
 * @param {unknown} err
 */
const isRateLimitError = (err) => {
  if (!err || typeof err !== 'object') return false;
  const e = /** @type {{ code?: number, status?: number, rateLimitError?: boolean, data?: { status?: number } }} */ (err);
  if (e.rateLimitError === true) return true;
  if (e.code === 429 || e.status === 429) return true;
  if (e.data?.status === 429) return true;
  const msg = String(/** @type {{ message?: string }} */ (err).message || '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('too many requests');
};

/**
 * Sleep helper for backoff.
 * @param {number} ms
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry an async fn with exponential backoff when rate-limited.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxRetries?: number, baseDelayMs?: number, label?: string }} [opts]
 * @returns {Promise<T>}
 */
const withRetry = async (fn, opts = {}) => {
  const maxRetries = opts.maxRetries ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const label = opts.label ?? 'operation';

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (!isRateLimitError(err) || attempt > maxRetries) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.log(
        `[retry] ${label} hit rate limit (attempt ${attempt}/${maxRetries}); waiting ${delay}ms`
      );
      await sleep(delay);
    }
  }
};

module.exports = {
  MAX_MEDIA_PER_TWEET,
  TWITTER_VIDEO_MAX_BYTES,
  matchesChannel,
  extractText,
  extractMedia,
  DuplicateTracker,
  isRateLimitError,
  sleep,
  withRetry,
};
