'use strict';

/**
 * Vercel Serverless Function — Telegram webhook receiver.
 * POST https://<project>.vercel.app/api/webhook
 */

const { createApp } = require('../src/app');
const { handleWebhookRequest } = require('../src/webhook-http');

/** Reuse warm isolate when possible */
let cachedApp = null;

const getApp = () => {
  if (cachedApp?.ok) return cachedApp;
  // Force webhook-friendly config (no polling inside serverless)
  process.env.RUN_MODE = process.env.RUN_MODE || 'webhook';
  cachedApp = createApp({ polling: false });
  return cachedApp;
};

module.exports = async (req, res) => {
  const app = getApp();
  if (!app.ok) {
    console.error('[api/webhook] Missing env:', app.missing?.join(', '));
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: false,
        error: 'misconfigured',
        missing: app.missing || [],
      })
    );
    return;
  }

  await handleWebhookRequest(app, req, res);
};
