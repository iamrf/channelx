'use strict';

const telegram = require('./telegram');
const twitterApi = require('./twitter');
const {
  matchesChannel,
  extractText,
  extractMedia,
  DuplicateTracker,
} = require('./utils');

/**
 * Process a single Telegram channel_post: filter, dedupe, download media, tweet.
 *
 * @param {object} deps
 * @param {import('node-telegram-bot-api')} deps.bot
 * @param {import('twitter-api-v2').TwitterApi} deps.twitter
 * @param {string} deps.channelId
 * @param {DuplicateTracker} deps.duplicates
 * @param {object} msg - Telegram channel_post message
 */
const processChannelPost = async ({ bot, twitter, channelId, duplicates }, msg) => {
  const messageId = msg?.message_id;
  console.log(`[handler] Received channel_post message_id=${messageId} chat=${msg?.chat?.id}`);

  try {
    if (!matchesChannel(msg?.chat, channelId)) {
      console.log(
        `[handler] Skipping message_id=${messageId}: chat does not match CHANNEL_ID=${channelId}`
      );
      return { skipped: true, reason: 'channel_mismatch' };
    }

    // TODO: Persist processed message IDs in Redis or SQLite so duplicates
    // are still skipped after process restarts / multi-instance deploys.
    if (!duplicates.claim(messageId)) {
      console.log(`[handler] Skipping duplicate message_id=${messageId}`);
      return { skipped: true, reason: 'duplicate' };
    }

    const text = extractText(msg);
    const mediaItems = extractMedia(msg);

    console.log(
      `[handler] Processing message_id=${messageId} textLength=${text.length} mediaCount=${mediaItems.length}`
    );

    if (!text && mediaItems.length === 0) {
      console.log(`[handler] Nothing to post for message_id=${messageId} (empty)`);
      return { skipped: true, reason: 'empty' };
    }

    const mediaIds = [];

    for (const item of mediaItems) {
      try {
        console.log(`[handler] Handling media type=${item.type} fileId=${item.fileId}`);
        const fileLink = await telegram.getFileLink(bot, item.fileId);
        const mediaId = await twitterApi.uploadMediaFromUrl(twitter, fileLink, item.type);
        mediaIds.push(mediaId);
      } catch (mediaErr) {
        // Continue with remaining media / text if one asset fails (e.g. video limits)
        console.error(
          `[handler] Failed to upload media type=${item.type}:`,
          mediaErr?.message || mediaErr
        );
      }
    }

    if (!text && mediaIds.length === 0) {
      console.error(
        `[handler] Aborting message_id=${messageId}: all media uploads failed and no text`
      );
      return { skipped: true, reason: 'media_failed' };
    }

    try {
      const result = await twitterApi.postTweet(twitter, text, mediaIds);
      console.log(`[handler] Successfully reposted message_id=${messageId}`);
      return { skipped: false, tweet: result };
    } catch (tweetErr) {
      console.error(
        `[handler] Failed to post tweet for message_id=${messageId}:`,
        tweetErr?.message || tweetErr
      );
      throw tweetErr;
    }
  } catch (err) {
    console.error(`[handler] Unhandled error for message_id=${messageId}:`, err?.message || err);
    throw err;
  }
};

module.exports = {
  processChannelPost,
  DuplicateTracker,
};
