'use strict';

const crypto = require('node:crypto');
const express = require('express');

const SESSION_COOKIE = 'una_chat_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function parseCookies(header) {
  const result = Object.create(null);
  for (const item of String(header || '').split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(value);
      } catch (_) {
        result[key] = '';
      }
    }
  }
  return result;
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function createAuth(env = process.env) {
  const router = express.Router();
  const sessions = new Map();
  const domain = String(env.AUTH0_DOMAIN || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const clientId = String(env.AUTH0_CLIENT_ID || '').trim();
  const appBaseUrl = String(env.APP_BASE_URL || 'http://localhost:3000')
    .trim()
    .replace(/\/+$/, '');
  const hasDomain = Boolean(domain);
  const hasClientId = Boolean(clientId);
  let clientSecret = null;
  let jwksCache = null;
  let jwksCacheExpiresAt = 0;

  if (hasDomain !== hasClientId) {
    throw new Error('Set AUTH0_DOMAIN and AUTH0_CLIENT_ID together, or leave both empty.');
  }
  if (hasDomain && !/^[a-z0-9.-]+(?::\d+)?$/i.test(domain)) {
    throw new Error('AUTH0_DOMAIN must be a hostname without a scheme or path.');
  }

  let baseUrl;
  try {
    baseUrl = new URL(appBaseUrl);
  } catch (_) {
    throw new Error('APP_BASE_URL must be a valid HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.pathname !== '/') {
    throw new Error('APP_BASE_URL must be an origin without a path.');
  }

  const issuer = hasDomain ? 'https://' + domain + '/' : '';
  const callbackUrl = hasDomain ? new URL('/auth/callback', appBaseUrl).toString() : '';
  const cookieSecure = baseUrl.protocol === 'https:';

  function isReady() {
    return hasDomain && hasClientId && typeof clientSecret === 'string' && clientSecret.length > 16;
  }

  function setSessionCookie(res, sessionId, maxAge) {
    const secure = cookieSecure ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      SESSION_COOKIE + '=' + encodeURIComponent(sessionId) +
        '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + String(maxAge) + secure
    );
  }

  function getSessionId(cookieHeader) {
    return parseCookies(cookieHeader)[SESSION_COOKIE] || '';
  }

  function getSessionFromHeader(cookieHeader) {
    const id = getSessionId(cookieHeader);
    const session = id && sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(id);
      return null;
    }
    return session;
  }

  function getSession(req) {
    return req.authSession || getSessionFromHeader(req.headers && req.headers.cookie);
  }

  function requireAuth(req, res, next) {
    if (!isReady()) return next();
    const session = getSession(req);
    if (!session || !session.user) {
      return res.status(401).json({ error: 'authentication_required' });
    }
    req.authUser = session.user;
    return next();
  }

  async function getJwks() {
    if (jwksCache && jwksCacheExpiresAt > Date.now()) return jwksCache;
    const response = await fetch(issuer + '.well-known/jwks.json', {
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('jwks_unavailable');
    const body = await response.json();
    if (!body || !Array.isArray(body.keys)) throw new Error('jwks_invalid');
    jwksCache = body.keys;
    jwksCacheExpiresAt = Date.now() + 15 * 60 * 1000;
    return jwksCache;
  }

  async function verifyIdToken(token, expectedNonce) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('id_token_invalid');

    let header;
    let claims;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (_) {
      throw new Error('id_token_invalid');
    }

    if (header.alg !== 'RS256' || !header.kid) throw new Error('id_token_algorithm_invalid');
    let keys = await getJwks();
    let jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig');
    if (!jwk) {
      jwksCache = null;
      jwksCacheExpiresAt = 0;
      keys = await getJwks();
      jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig');
    }
    if (!jwk) throw new Error('id_token_key_not_found');

    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const signedData = Buffer.from(parts[0] + '.' + parts[1]);
    const signature = Buffer.from(parts[2], 'base64url');
    if (!crypto.verify('RSA-SHA256', signedData, publicKey, signature)) {
      throw new Error('id_token_signature_invalid');
    }

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== issuer || !audiences.includes(clientId)) throw new Error('id_token_issuer_or_audience_invalid');
    if (audiences.length > 1 && claims.azp !== clientId) throw new Error('id_token_authorized_party_invalid');
    if (!Number.isFinite(claims.exp) || claims.exp <= now) throw new Error('id_token_expired');
    if (!Number.isFinite(claims.iat) || claims.iat > now + 60) throw new Error('id_token_issued_at_invalid');
    if (claims.nonce !== expectedNonce) throw new Error('id_token_nonce_invalid');
    if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('id_token_subject_invalid');
    return claims;
  }

  router.use((req, _res, next) => {
    req.authSession = getSessionFromHeader(req.headers && req.headers.cookie);
    next();
  });

  router.get('/auth/config', (_req, res) => {
    res.json({
      enabled: isReady(),
      domain: hasDomain ? domain : '',
      clientId: hasClientId ? clientId : ''
    });
  });

  router.get('/auth/me', (req, res) => {
    res.json({ user: req.authSession && req.authSession.user ? req.authSession.user : null });
  });

  router.get('/auth/login', (_req, res) => {
    if (!isReady()) return res.status(503).json({ error: 'authentication_not_configured' });

    const sessionId = randomToken(32);
    const session = {
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      user: null,
      pending: {
        state: randomToken(32),
        nonce: randomToken(32),
        codeVerifier: randomToken(32)
      }
    };
    sessions.set(sessionId, session);
    setSessionCookie(res, sessionId, Math.floor(SESSION_TTL_MS / 1000));

    const challenge = crypto.createHash('sha256')
      .update(session.pending.codeVerifier)
      .digest('base64url');
    const authorizeUrl = new URL('https://' + domain + '/authorize');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizeUrl.searchParams.set('scope', 'openid profile email');
    authorizeUrl.searchParams.set('state', session.pending.state);
    authorizeUrl.searchParams.set('nonce', session.pending.nonce);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    return res.redirect(302, authorizeUrl.toString());
  });

  router.get('/auth/callback', async (req, res) => {
    const session = req.authSession;
    const pending = session && session.pending;
    if (!pending || !req.query.state || req.query.state !== pending.state) {
      return res.status(400).send('The sign-in state could not be verified.');
    }
    if (req.query.error || typeof req.query.code !== 'string' || !req.query.code) {
      session.pending = null;
      return res.status(401).send('Sign-in was not completed.');
    }

    try {
      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: req.query.code,
        redirect_uri: callbackUrl,
        code_verifier: pending.codeVerifier
      });
      const response = await fetch('https://' + domain + '/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        session.pending = null;
        return res.status(502).send('Auth0 could not complete the token exchange.');
      }

      const tokens = await response.json();
      const claims = await verifyIdToken(tokens.id_token, pending.nonce);
      session.user = {
        sub: claims.sub,
        name: typeof claims.name === 'string' && claims.name ? claims.name :
          (typeof claims.email === 'string' && claims.email ? claims.email : claims.sub),
        email: typeof claims.email === 'string' ? claims.email : ''
      };
      session.pending = null;
      session.expiresAt = Date.now() + SESSION_TTL_MS;
      return res.redirect(303, '/sala');
    } catch (error) {
      session.pending = null;
      const code = error && typeof error.message === 'string' ? error.message : 'callback_failed';
      console.error('Auth0 callback failed:', code);
      return res.status(502).send('The Auth0 sign-in response could not be verified.');
    }
  });

  router.get('/auth/logout', (req, res) => {
    const sessionId = getSessionId(req.headers && req.headers.cookie);
    if (sessionId) sessions.delete(sessionId);
    setSessionCookie(res, '', 0);
    if (!isReady()) return res.redirect(303, '/');

    const logoutUrl = new URL('https://' + domain + '/v2/logout');
    logoutUrl.searchParams.set('client_id', clientId);
    logoutUrl.searchParams.set('returnTo', appBaseUrl + '/');
    return res.redirect(302, logoutUrl.toString());
  });

  const socketMiddleware = (socket, next) => {
    if (!isReady()) return next();
    const session = getSessionFromHeader(socket.handshake.headers && socket.handshake.headers.cookie);
    if (!session || !session.user) return next(new Error('unauthorized'));
    socket.data.user = session.user;
    return next();
  };

  return {
    router,
    hasConfig: () => hasDomain && hasClientId,
    isReady,
    setClientSecret(value) {
      if (typeof value !== 'string' || value.length <= 16) {
        throw new Error('Vault returned an invalid Auth0 client secret.');
      }
      clientSecret = value;
    },
    getSession,
    requireAuth,
    socketMiddleware
  };
}

module.exports = createAuth;
