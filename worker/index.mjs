/*
 * TRRRRDT Records production worker.
 *
 * Two jobs:
 *  1. Front the production domain and proxy every request to the AEM Edge
 *     Delivery origin (main--trrrrdt--trieloff.aem.live) — the canonical
 *     "bring your own CDN" worker (see aem.live/docs/byo-cdn-cloudflare-worker-setup).
 *  2. Mint short-lived Apple Music *developer* tokens at /tools/apple-token so the
 *     turntable block can boot MusicKit without shipping the signing key to the
 *     browser. The developer token is public by design; only the .p8 private key
 *     is secret, and it never leaves the worker.
 */

const TOKEN_PATH = '/tools/apple-token';

/* ------------------------------------------------------------------ *
 * Apple Music developer token (ES256 JWT), signed with Web Crypto.
 * No npm dependency — Workers ship SubtleCrypto, which returns ECDSA
 * signatures already in the raw r||s form JWS/ES256 expects.
 * ------------------------------------------------------------------ */

const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12h token; Apple caps at ~6 months
let cachedToken = null; // { jwt, exp } reused across requests in this isolate

function base64url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJSON(obj) {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) der[i] = bin.charCodeAt(i);
  return der.buffer;
}

async function mintDeveloperToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - now > 300) return cachedToken;

  const pem = env.APPLE_MUSIC_PRIVATE_KEY;
  const kid = (env.APPLE_MUSIC_KEY_ID || '').trim();
  const iss = (env.APPLE_MUSIC_TEAM_ID || '').trim();
  if (!pem || !kid || !iss) {
    const missing = [
      !pem && 'APPLE_MUSIC_PRIVATE_KEY',
      !kid && 'APPLE_MUSIC_KEY_ID',
      !iss && 'APPLE_MUSIC_TEAM_ID',
    ].filter(Boolean).join(', ');
    const err = new Error(`Apple Music secrets not configured: ${missing}`);
    err.code = 'not-configured';
    throw err;
  }

  const exp = now + TOKEN_TTL_SECONDS;
  const header = base64urlJSON({ alg: 'ES256', kid });
  const payload = base64urlJSON({ iss, iat: now, exp });
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  cachedToken = { jwt: `${signingInput}.${base64url(signature)}`, exp };
  return cachedToken;
}

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  };
}

async function handleTokenRequest(request, env) {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }
  try {
    const now = Math.floor(Date.now() / 1000);
    const { jwt, exp } = await mintDeveloperToken(env);
    return new Response(JSON.stringify({ token: jwt, expiresIn: exp - now }), {
      status: 200,
      headers: {
        ...cors,
        'content-type': 'application/json',
        // let the CDN cache the token most of its life; the block re-fetches on expiry
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    const status = e.code === 'not-configured' ? 503 : 500;
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
}

/* ------------------------------------------------------------------ *
 * EDS origin proxy — lifted from the canonical aem.live BYO-CDN worker.
 * ------------------------------------------------------------------ */

const getExtension = (path) => {
  const basename = path.split('/').pop();
  const pos = basename.lastIndexOf('.');
  return basename === '' || pos < 1 ? '' : basename.slice(pos + 1);
};

const isMediaRequest = (url) => /\/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\.[0-9a-z]+$/.test(url.pathname);

const isRUMRequest = (url) => /\/\.(rum|optel)\/.*/.test(url.pathname);

async function handleOrigin(request, env) {
  const url = new URL(request.url);

  if (url.port) {
    const redirectTo = new URL(request.url);
    redirectTo.port = '';
    return new Response(`Moved permanently to ${redirectTo.href}`, {
      status: 301,
      headers: { location: redirectTo.href },
    });
  }

  if (isRUMRequest(url) && !['GET', 'POST', 'OPTIONS'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const extension = getExtension(url.pathname);
  const savedSearch = url.search;
  const { searchParams } = url;

  const keepParams = (allowed) => {
    [...searchParams.keys()].forEach((key) => {
      if (!allowed.includes(key)) searchParams.delete(key);
    });
  };
  if (isMediaRequest(url)) keepParams(['format', 'height', 'optimize', 'width']);
  else if (extension === 'json') keepParams(['limit', 'offset', 'sheet']);
  else url.search = '';
  searchParams.sort();

  url.hostname = env.ORIGIN_HOSTNAME;
  if (!url.origin.match(/^https:\/\/main--.*--.*\.(?:aem|hlx)\.live/)) {
    return new Response('Invalid ORIGIN_HOSTNAME', { status: 500 });
  }

  const req = new Request(url, request);
  req.headers.set('x-forwarded-host', req.headers.get('host'));
  req.headers.set('x-byo-cdn-type', 'cloudflare');
  if (env.PUSH_INVALIDATION !== 'disabled') req.headers.set('x-push-invalidation', 'enabled');
  if (env.ORIGIN_AUTHENTICATION) req.headers.set('authorization', `token ${env.ORIGIN_AUTHENTICATION}`);

  let resp = await fetch(req, { method: req.method, cf: { cacheEverything: true } });
  resp = new Response(resp.body, resp);

  if (resp.status === 301 && savedSearch) {
    const location = resp.headers.get('location');
    if (location && !location.match(/\?.*$/)) resp.headers.set('location', `${location}${savedSearch}`);
  }
  if (resp.status === 304) resp.headers.delete('Content-Security-Policy');
  resp.headers.delete('age');
  resp.headers.delete('x-robots-tag');
  return resp;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // apex → www (env.CANONICAL_HOST, e.g. www.trrrrdt.studio)
    if (env.CANONICAL_HOST && url.hostname !== env.CANONICAL_HOST
      && url.hostname.endsWith(env.CANONICAL_HOST.replace(/^www\./, ''))) {
      url.hostname = env.CANONICAL_HOST;
      return new Response(`Moved permanently to ${url.href}`, {
        status: 301,
        headers: { location: url.href },
      });
    }

    if (url.pathname === TOKEN_PATH) return handleTokenRequest(request, env);
    return handleOrigin(request, env);
  },
};
