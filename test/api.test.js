'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('deploy assets', () => {
  const root = path.join(__dirname, '..');

  it('ships vercel.json with function limits', () => {
    const raw = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
    const cfg = JSON.parse(raw);
    assert.equal(cfg.version, 2);
    assert.ok(cfg.functions['api/**/*.js'].maxDuration >= 30);
  });

  it('ships API handlers', () => {
    assert.ok(fs.existsSync(path.join(root, 'api/webhook.js')));
    assert.ok(fs.existsSync(path.join(root, 'api/health.js')));
  });

  it('ships GitHub workflows', () => {
    for (const name of ['ci.yml', 'deploy-vercel.yml', 'deploy-ubuntu.yml']) {
      assert.ok(
        fs.existsSync(path.join(root, '.github/workflows', name)),
        `missing ${name}`
      );
    }
  });

  it('ships Ubuntu deploy files', () => {
    assert.ok(fs.existsSync(path.join(root, 'deploy/channelx.service')));
    assert.ok(fs.existsSync(path.join(root, 'deploy/setup-ubuntu.sh')));
    assert.ok(fs.existsSync(path.join(root, 'deploy/remote-deploy.sh')));
    assert.ok(fs.existsSync(path.join(root, 'DEPLOY.md')));
  });
});

describe('api/health handler', () => {
  it('responds with health json', async () => {
    const health = require('../api/health');
    const res = {
      statusCode: 0,
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      },
    };
    await health({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
  });
});

describe('api/webhook handler', () => {
  it('returns 500 when misconfigured', async () => {
    const prev = { ...process.env };
    for (const key of [
      'TELEGRAM_TOKEN',
      'CHANNEL_ID',
      'TWITTER_API_KEY',
      'TWITTER_API_SECRET',
      'TWITTER_ACCESS_TOKEN',
      'TWITTER_ACCESS_SECRET',
      'WEBHOOK_URL',
      'RUN_MODE',
    ]) {
      delete process.env[key];
    }
    process.env.RUN_MODE = 'webhook';

    // Clear cached module state by re-requiring after env wipe —
    // api/webhook caches app in module scope; reset by isolating require cache.
    const webhookPath = require.resolve('../api/webhook');
    delete require.cache[webhookPath];
    delete require.cache[require.resolve('../src/app')];
    delete require.cache[require.resolve('../src/config')];

    const webhook = require('../api/webhook');
    let statusCode = 0;
    let body = '';
    const res = {
      set statusCode(v) {
        statusCode = v;
      },
      get statusCode() {
        return statusCode;
      },
      setHeader() {},
      end(payload) {
        body = payload;
      },
    };

    await webhook({ method: 'GET' }, res);
    assert.equal(statusCode, 500);
    const parsed = JSON.parse(body);
    assert.equal(parsed.error, 'misconfigured');

    // restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in prev)) delete process.env[key];
    }
    Object.assign(process.env, prev);
    delete require.cache[webhookPath];
  });
});
