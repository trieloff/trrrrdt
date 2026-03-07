---
name: admin-api
description: >
  Work with the AEM Edge Delivery Services Admin API (admin.hlx.page) to manage content lifecycle —
  preview, publish, unpublish, check status, purge cache, manage code sync, indexing, snapshots,
  configuration, and API keys. Use this skill whenever the user wants to interact with the admin API,
  preview or publish content programmatically, check page status, purge CDN cache, manage site
  configuration, create API keys, or automate any EDS admin operations. Also use when the user
  mentions "admin API", "hlx admin", "aem admin", "sidekick operations", "bulk publish",
  "bulk preview", or needs to set up authentication for programmatic access to their EDS site.
---

# AEM Edge Delivery Services Admin API

The Admin API at `https://admin.hlx.page` manages the content and code lifecycle for Edge Delivery Services sites. It handles preview, publish, unpublish, cache purge, code sync, indexing, snapshots, site configuration, and API key management.

## Determining org, site, and ref

Before making any API call, you need three values:

- **org**: The GitHub owner (user or organization)
- **site**: The GitHub repository name
- **ref**: The git branch (usually `main`)

Derive these from the git remote:

```bash
# Extract org and site from git remote
git remote get-url origin | sed -E 's#.*[:/]([^/]+)/([^/.]+)(\.git)?$#\1/\2#'
```

This gives you `{org}/{site}`. The ref is the current branch (`git branch --show-current`).

If the values can't be determined from the remote, check `README.md` for links like `https://main--{site}--{org}.aem.page/` and ask the user to confirm. If the README doesn't have this info, ask the user and suggest adding it to the README for future reference.

## Authentication

Before making authenticated API calls, follow this sequence to find or establish credentials:

### Step 1: Check for an existing API key

Check if an API key is already stored in a secret vault (e.g., MCPecrets, environment variables, or `.env` files). The naming convention for stored keys is `{SITE_UPPER}_ADMIN_API_KEY` — for example, `TRRRRDT_ADMIN_API_KEY` for the site `trrrrdt`.

If you have access to MCPecrets, check the user's vault repository:
```
MCPecrets → get_secret(repo: "{org}/vault", name: "{SITE_UPPER}_ADMIN_API_KEY")
```

If a key is found, verify it still works by hitting the status endpoint:
```bash
curl -s -o /dev/null -w '%{http_code}' \
  -H "x-auth-token: {API_KEY}" \
  https://admin.hlx.page/status/{org}/{site}/{ref}/
```

A `200` means the key is valid. A `401` means it's expired — proceed to Step 2.

### Step 2: If no key exists, authenticate via browser login

This is a one-time setup to get a temporary session cookie, which you'll then use to create a persistent API key.

1. Ask the user to open this URL in their browser:
   ```
   https://admin.hlx.page/login/{org}/{site}/{ref}
   ```
   This automatically redirects to the configured identity provider (typically Adobe IMS). The user just completes whatever login flow appears — there's no provider selection step.

2. After login completes, ask the user to copy the `auth_token` cookie value:
   - Open DevTools (F12) → Application tab → Cookies → `admin.hlx.page`
   - Copy the full value of the `auth_token` cookie (it's a long JWT string)

3. Use the cookie in curl requests:
   ```bash
   curl -H "Cookie: auth_token={JWT_VALUE}" https://admin.hlx.page/...
   ```

Cookie tokens expire after about 24 hours. Don't stop here — proceed to Step 3 to create a persistent key.

### Step 3: Create a persistent API key

Using the cookie from Step 2, create an API key that won't expire for a year:

```bash
curl -X POST \
  -H "Cookie: auth_token={JWT_VALUE}" \
  -H "Content-Type: application/json" \
  -d '{"description":"Claude Code agent","roles":["publish"]}' \
  https://admin.hlx.page/config/{org}/sites/{site}/apiKeys.json
```

The response includes a `value` field — **this is the API key and it is only shown once.**

Available roles: `publish` (preview + live write), `admin` (full config access), `read` (status only). The `publish` role is the right default for agent workflows.

After the key is created:
1. Tell the user to store it in a password manager
2. Store it in MCPecrets for future agent sessions:
   ```
   MCPecrets → set_secret(repo: "{org}/vault", name: "{SITE_UPPER}_ADMIN_API_KEY", value: "{key}")
   ```
3. Verify it works:
   ```bash
   curl -s -H "x-auth-token: {API_KEY}" \
     https://admin.hlx.page/status/{org}/{site}/{ref}/
   ```

If the API key endpoint returns **403**, the site's configuration service isn't set up yet, or the user's account doesn't have admin access. See `references/config-service.md` for setup instructions. In this case, fall back to cookie auth for now and let the user know they need to set up the config service to get persistent API keys.

### Using API keys in requests

Once you have an API key, authenticate all requests with either header format:

```bash
curl -H "x-auth-token: {API_KEY}" https://admin.hlx.page/...
# or
curl -H "Authorization: token {API_KEY}" https://admin.hlx.page/...
```

The `x-auth-token` header is preferred — it's shorter and unambiguous.

## Getting Started Recipe

When a user first asks you to do something with the admin API (e.g., "publish my page", "check the status"), follow this sequence:

1. **Determine org/site/ref** from the git remote (see above)
2. **Check for an existing API key** in MCPecrets or environment variables (Step 1 of Authentication)
3. **If no key found**, walk the user through browser login → create API key → store it (Steps 2–3)
4. **Perform the requested operation** using the API key
5. **If the README.md doesn't contain the preview/live URLs**, suggest adding them:
   ```
   - Preview: https://main--{site}--{org}.aem.page/
   - Live: https://main--{site}--{org}.aem.live/
   ```

This setup only needs to happen once per site. After that, the stored API key handles all future sessions automatically.

## Quick Reference

Most operations follow this pattern:
```
https://admin.hlx.page/{operation}/{org}/{site}/{ref}/{path}
```

Operations: `status`, `preview`, `live`, `code`, `cache`, `index`, `job`, `snapshot`

For bulk operations, use `/*` as the path and POST a JSON body with a `paths` array.

See `references/endpoints.md` for the complete endpoint reference.

## Common Operations

### Check page status

```bash
curl https://admin.hlx.page/status/{org}/{site}/{ref}/{path}
```

Returns status for preview, live, edit, and code environments. Works without authentication for basic info. Add `?editUrl=auto` to also query the content source.

### Preview content (update from source)

```bash
curl -X POST -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/preview/{org}/{site}/{ref}/{path}
```

Pulls the latest content from the source (SharePoint, Google Docs, DA) and updates the preview environment. Returns the preview URL and metadata.

### Publish content (preview → live)

```bash
curl -X POST -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/live/{org}/{site}/{ref}/{path}
```

Copies content from preview to the live CDN and purges caches.

### Unpublish content

```bash
curl -X DELETE -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/live/{org}/{site}/{ref}/{path}
```

### Purge CDN cache

```bash
curl -X POST -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/cache/{org}/{site}/{ref}/{path}
```

### Bulk operations

Preview, publish, and unpublish support bulk mode. POST to the `/*` path with a JSON body:

```bash
curl -X POST -H "x-auth-token: {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"paths":["/en","/en/*","/blog/"],"forceUpdate":true}' \
  https://admin.hlx.page/live/{org}/{site}/{ref}/*
```

Bulk operations run asynchronously and return a job ID. Use `forceUpdate: true` to force-refresh even if the source hasn't changed. Use `delete: true` for bulk unpublish.

Paths support wildcards: `/en/*` processes all pages under `/en/`. The `/*` pattern processes the entire site. Note: `/.helix/config` is excluded from bulk operations.

### Check bulk job status

```bash
# List all jobs
curl -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/job/{org}/{site}/{ref}

# Check specific job
curl -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/job/{org}/{site}/{ref}/{topic}/{jobName}

# Stop a job
curl -X DELETE -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/job/{org}/{site}/{ref}/{topic}/{jobName}
```

### Update code (sync from GitHub)

```bash
curl -X POST -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/code/{org}/{site}/{ref}/{path}
```

Usually happens automatically via Code Sync, but this forces a manual sync.

### Indexing

```bash
# Reindex a specific page
curl -X POST -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/index/{org}/{site}/{ref}/{path}

# Bulk reindex
curl -X POST -H "x-auth-token: {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"paths":["/blog/*"]}' \
  https://admin.hlx.page/index/{org}/{site}/{ref}/*

# Remove from index
curl -X DELETE -H "x-auth-token: {TOKEN}" \
  https://admin.hlx.page/index/{org}/{site}/{ref}/{path}
```

## Error Handling

The API returns standard HTTP status codes:
- **200/204**: Success
- **202**: Async job created (bulk operations)
- **400**: Bad request (check path format, request body)
- **401**: Not authenticated (token missing or expired)
- **403**: Not authorized (insufficient permissions or config service not set up)
- **404**: Resource not found
- **429/503**: Rate limited (respect `x-ratelimit-*` headers)

Error details are in the `x-error` header. Common patterns:
- `[admin] not authenticated` → Re-authenticate (cookie may have expired)
- `[admin] not authorized` → Check permissions/roles, or config service isn't set up
- `[admin] expected .json or .yaml` → Add `.json` extension to config URLs
- `[Fastly] Invalid path format` → Check the URL path structure

For backend-specific errors, see `references/error-codes.md`.

## Rate Limits

The API enforces rate limits. Check response headers:
- `x-ratelimit-limit`: Max requests in window
- `x-ratelimit-rate`: Current rate

When rate limited (429), back off and retry. For bulk operations, use the bulk endpoints rather than making many individual calls.

## Further Reference

- `references/endpoints.md` — Complete endpoint reference with all HTTP methods, paths, and parameters
- `references/config-service.md` — Setting up and managing the configuration service
- `references/error-codes.md` — Backend error codes and troubleshooting
