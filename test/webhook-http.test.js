'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  json,
  handleWebhookRequest,
  handleHealthRequest,
} = require('../src/webhook-http');

const mockRes = () => {
  const res = {
    statusCode: 0,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(payload) {
      if (payload && !this.body) this.body = JSON.parse(payload);
    },
  };
  return res;
};

describe('json helper', () => {
  it('uses status/json when available', () => {
    const res = mockRes();
    json(res, 201, { ok: true });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { ok: true });
  });
});

describe('handleHealthRequest', () => {
  it('returns ok payload', () => {
    const res = mockRes();
    handleHealthRequest({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.service, 'channelx');
  });
});

describe('handleWebhookRequest', () => {
  const app = {
    verifyWebhookSecret: (v) => v === 'good',
    handleUpdate: async (update) => ({ skipped: false, update }),
  };

  it('answers GET', async () => {
    const res = mockRes();
    await handleWebhookRequest(app, { method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mode, 'webhook');
  });

  it('rejects bad method', async () => {
    const res = mockRes();
    await handleWebhookRequest(app, { method: 'PUT' }, res);
    assert.equal(res.statusCode, 405);
  });

  it('rejects bad secret', async () => {
    const res = mockRes();
    await handleWebhookRequest(
      app,
      {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'bad' },
        body: { update_id: 1 },
      },
      res
    );
    assert.equal(res.statusCode, 401);
  });

  it('rejects invalid body', async () => {
    const res = mockRes();
    await handleWebhookRequest(
      app,
      {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'good' },
        body: null,
      },
      res
    );
    assert.equal(res.statusCode, 400);
  });

  it('processes valid update', async () => {
    const res = mockRes();
    await handleWebhookRequest(
      app,
      {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'good' },
        body: { update_id: 3, channel_post: { message_id: 1 } },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
  });

  it('returns ok:false on handler throw without 5xx', async () => {
    const res = mockRes();
    await handleWebhookRequest(
      {
        verifyWebhookSecret: () => true,
        handleUpdate: async () => {
          throw new Error('boom');
        },
      },
      { method: 'POST', headers: {}, body: { update_id: 1 } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, false);
  });
});
