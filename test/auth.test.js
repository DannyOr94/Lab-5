'use strict';
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const createAuth = require('../server/auth');

describe('Auth0 session boundaries', function () {
  let app;
  beforeEach(function () {
    app = express();
    const auth = createAuth({ AUTH0_DOMAIN: 'example.auth0.com', AUTH0_CLIENT_ID: 'test-client', APP_BASE_URL: 'https://chat.example.com' });
    auth.setClientSecret('test-secret-used-only-in-unit-tests');
    app.use(auth.router);
    app.get('/sala', auth.requireAuth, (_req, res) => res.send('protected'));
  });
  it('publishes only public configuration', async function () {
    const res = await request(app).get('/auth/config').expect(200);
    assert.deepEqual(res.body, { enabled: true, domain: 'example.auth0.com', clientId: 'test-client' });
  });
  it('rejects a request without a session', async function () {
    await request(app).get('/sala').expect(401);
  });
  it('uses PKCE, state, nonce and a secure HTTP-only cookie', async function () {
    const res = await request(app).get('/auth/login').expect(302);
    const url = new URL(res.headers.location);
    assert.equal(url.origin, 'https://example.auth0.com');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    for (const field of ['state', 'nonce', 'code_challenge']) assert.ok(url.searchParams.get(field).length >= 43);
    assert.equal(url.searchParams.get('client_secret'), null);
    assert.match(res.headers['set-cookie'][0], /HttpOnly; SameSite=Lax.*Secure/);
  });
  it('rejects an unsolicited callback before exchanging a code', async function () {
    await request(app).get('/auth/callback?state=forged&code=forged').expect(400);
  });
});
