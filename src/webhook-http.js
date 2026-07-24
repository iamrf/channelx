'use strict';

/**
 * Framework-agnostic webhook HTTP helpers (used by Vercel and local/Ubuntu HTTP).
 */

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    // Express / Vercel-style
    return res.status(status).json(body);
  }
  if (typeof res.writeHead === 'function') {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
    return res;
  }
  res.statusCode = status;
  res.setHeader?.('Content-Type', 'application/json');
  res.end?.(payload);
  return res;
};

/**
 * Handle an incoming Telegram webhook HTTP request.
 * @param {object} app — from createApp()
 * @param {{ method?: string, headers?: object, body?: object }} req
 * @param {object} res
 */
const handleWebhookRequest = async (app, req, res) => {
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET' || method === 'HEAD') {
    return json(res, 200, {
      ok: true,
      service: 'channelx',
      mode: 'webhook',
    });
  }

  if (method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const secretHeader =
    req.headers?.['x-telegram-bot-api-secret-token'] ||
    req.headers?.['X-Telegram-Bot-Api-Secret-Token'];

  if (!app.verifyWebhookSecret(secretHeader)) {
    console.error('[webhook] Rejected request: invalid secret token');
    return json(res, 401, { ok: false, error: 'unauthorized' });
  }

  const update = req.body;
  if (!update || typeof update !== 'object') {
    return json(res, 400, { ok: false, error: 'invalid_body' });
  }

  try {
    const result = await app.handleUpdate(update);
    return json(res, 200, { ok: true, result: result || null });
  } catch (err) {
    const detail =
      err?.data?.detail ||
      err?.data?.title ||
      err?.message ||
      String(err);
    const status = err?.code || err?.status || err?.data?.status || null;
    console.error('[webhook] Processing failed:', detail, status ? `(status=${status})` : '');
    // Still 200 so Telegram does not retry forever on app bugs;
    // flip to 500 if you prefer Telegram retries.
    return json(res, 200, {
      ok: false,
      error: 'processing_failed',
      detail,
      status,
    });
  }
};

/**
 * Health check response.
 */
const handleHealthRequest = (_req, res) =>
  json(res, 200, {
    ok: true,
    service: 'channelx',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });

module.exports = {
  json,
  handleWebhookRequest,
  handleHealthRequest,
};
