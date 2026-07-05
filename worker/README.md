# TRRRRDT production worker

A single Cloudflare Worker that fronts the production domain and does two things:

1. **EDS origin proxy** — proxies every request to `main--trrrrdt--trieloff.aem.live`
   (the canonical [BYO-CDN Cloudflare worker](https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup)).
   The apex `trrrrdt.studio` 301-redirects to `www.trrrrdt.studio`.
2. **Apple Music developer token** — `GET /tools/apple-token` returns
   `{ "token": "<ES256 JWT>", "expiresIn": <seconds> }`, signed on the fly from the
   `.p8` key. The turntable block fetches this to boot MusicKit. The developer token is
   meant to be client-visible; only the signing key is secret and it stays in the worker.

## Deploy

```bash
cd worker
npx wrangler@latest deploy
```

`workers_dev = true`, so before DNS is wired you can test the token endpoint at
`https://trrrrdt.<your-subdomain>.workers.dev/tools/apple-token`.

## Secrets (required for the token endpoint)

Get these from the Apple Developer portal → Certificates, Identifiers & Profiles →
Keys → a key with **MusicKit** enabled. Download the `AuthKey_XXXXXXXXXX.p8` once.

```bash
cd worker
# paste the FULL .p8 contents, including the BEGIN/END lines:
npx wrangler@latest secret put APPLE_MUSIC_PRIVATE_KEY < ~/path/to/AuthKey_XXXXXXXXXX.p8
npx wrangler@latest secret put APPLE_MUSIC_KEY_ID      # the 10-char Key ID
npx wrangler@latest secret put APPLE_MUSIC_TEAM_ID     # your Apple Developer Team ID
```

Without the secrets the site still works — Apple tracks just report
"Apple Music unavailable" and non-Apple (Suno) tracks are unaffected.

## Domain binding

`wrangler.toml` already declares the routes for `www.trrrrdt.studio/*` and
`trrrrdt.studio/*` on zone `trrrrdt.studio`. Add the zone to the same Cloudflare
account (`155ec15a52a18a14801e04b019da5e5a`) and point the domain's nameservers at
Cloudflare; `wrangler deploy` then binds the routes.

## Local dev of the token endpoint

```bash
cd worker
npx wrangler@latest dev            # serves http://localhost:8787
# provide secrets for local runs via worker/.dev.vars (git-ignored):
#   APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
#   APPLE_MUSIC_KEY_ID="XXXXXXXXXX"
#   APPLE_MUSIC_TEAM_ID="YYYYYYYYYY"
```

When developing the site on `localhost:3000` (which is *not* behind this worker),
point the block at the running worker with a page/site metadata override:
`apple-token-endpoint = http://localhost:8787/tools/apple-token`. In production the
block just uses the same-origin `/tools/apple-token`.
