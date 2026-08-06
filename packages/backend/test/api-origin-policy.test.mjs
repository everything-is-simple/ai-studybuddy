import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';

import { createApiOriginPolicy, parseAllowedOrigins } from '../dist/middleware/api-origin-policy.js';

async function withServer(t, allowedOrigins) {
  const app = express();
  app.use('/api', createApiOriginPolicy(allowedOrigins));
  app.get('/api/ping', (_req, res) => res.json({ success: true, data: 'pong' }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/api/ping`;
}

test('Origin policy accepts fixed development/production loopback origins, additions, and origin-less CLI', async (t) => {
  const allowed = parseAllowedOrigins('http://127.0.0.1:4174');
  const url = await withServer(t, allowed);

  for (const origin of [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:4174',
  ]) {
    const response = await fetch(url, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  assert.equal((await fetch(url)).status, 200);
});

test('Origin policy validates preflight before returning CORS headers', async (t) => {
  const url = await withServer(t, parseAllowedOrigins());
  const accepted = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:4173',
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get('access-control-allow-origin'), 'http://localhost:4173');
  assert.match(accepted.headers.get('access-control-allow-methods') ?? '', /(?:^|,)PATCH(?:,|$)/);

  const rejected = await fetch(url, {
    method: 'OPTIONS',
    headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.has('access-control-allow-origin'), false);
  const body = await rejected.json();
  assert.equal(body.error.code, 'CONFIG_ORIGIN_REJECTED');
  assert.doesNotMatch(JSON.stringify(body), /evil\.example|http:\/\//);
});

test('Origin additions reject remote, wildcard, credentials, paths, and missing ports', () => {
  for (const value of [
    '*',
    'https://localhost:4174',
    'http://evil.example:4174',
    'http://user:pass@localhost:4174',
    'http://localhost:4174/path',
    'http://localhost',
  ]) {
    assert.throws(
      () => parseAllowedOrigins(value),
      (error) => {
        assert.equal(error.code, 'CONFIG_ALLOWED_ORIGINS_INVALID');
        assert.equal(error.message.includes(value), false);
        return true;
      }
    );
  }
});
