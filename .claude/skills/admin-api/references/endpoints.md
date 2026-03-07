# Admin API Endpoint Reference

Base URL: `https://admin.hlx.page`

All paths use `{org}/{site}/{ref}` as the base path segment (e.g., `trieloff/trrrrdt/main`).
For config endpoints, the base is `{org}/sites/{site}` or `{org}` for org-level operations.

## Status

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status/{org}/{site}/{ref}/{path}` | Get resource status across all environments |
| POST | `/status/{org}/{site}/{ref}/*` | Bulk status query |

**GET query params:** `editUrl` (optional, set to `auto` to query content source directly)

**POST body:**
```json
{
  "paths": ["/en", "/blog/*"],
  "select": ["edit", "preview", "live"],
  "forceAsync": false,
  "pathsOnly": false
}
```

**Response includes:** `webPath`, `resourcePath`, and for each environment (`preview`, `live`, `edit`, `code`): `url`, `status`, `contentBusId`, `contentType`, `lastModified`, `sourceLocation`, `sourceLastModified`, `permissions[]`.

Also includes a `links` object with URLs for status, preview, live, and code operations.

## Preview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/preview/{org}/{site}/{ref}/{path}` | Get preview status |
| POST | `/preview/{org}/{site}/{ref}/{path}` | Update preview from source |
| DELETE | `/preview/{org}/{site}/{ref}/{path}` | Delete from preview |
| POST | `/preview/{org}/{site}/{ref}/*` | Bulk preview |

**POST query params:** `forceUpdateRedirects` (optional)

**Bulk POST body:**
```json
{
  "paths": ["/en", "/en/*"],
  "forceUpdate": true,
  "forceAsync": false,
  "delete": false
}
```

## Live (Publish)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/live/{org}/{site}/{ref}/{path}` | Get live status |
| POST | `/live/{org}/{site}/{ref}/{path}` | Publish (preview → live) |
| DELETE | `/live/{org}/{site}/{ref}/{path}` | Unpublish (remove from live) |
| POST | `/live/{org}/{site}/{ref}/*` | Bulk publish/unpublish |

**POST query params:** `forceUpdateRedirects`, `disableNotifications`

**DELETE query params:** `disableNotifications`

**Bulk POST body:**
```json
{
  "paths": ["/en", "/en/*"],
  "forceUpdate": false,
  "forceAsync": false,
  "delete": false
}
```

Set `delete: true` for bulk unpublish.

## Code

| Method | Path | Description |
|--------|------|-------------|
| GET | `/code/{owner}/{repo}/{ref}/{path}` | Get code status |
| POST | `/code/{owner}/{repo}/{ref}/{path}` | Sync code from GitHub |
| DELETE | `/code/{owner}/{repo}/{ref}/{path}` | Delete code resource |
| POST | `/code/{owner}/{repo}/{ref}` | Batch code changes |

**Query params (all):** `branch` (optional)

**Batch POST query params:** `tag` ("true" or "false")

**Batch POST body:**
```json
{
  "source": "github",
  "changes": [
    {"path": "/blocks/hero/hero.js", "type": "modified"},
    {"path": "/blocks/old/old.js", "type": "deleted"}
  ],
  "baseRef": "abc123"
}
```

## Cache

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cache/{org}/{site}/{ref}/{path}` | Purge CDN cache |

Also triggers custom CDN hooks if configured.

## Index

| Method | Path | Description |
|--------|------|-------------|
| GET | `/index/{org}/{site}/{ref}/{path}` | Get index status |
| POST | `/index/{org}/{site}/{ref}/{path}` | Reindex a page |
| DELETE | `/index/{org}/{site}/{ref}/{path}` | Remove from index |
| POST | `/index/{org}/{site}/{ref}/*` | Bulk reindex |

**Bulk POST body:**
```json
{
  "paths": ["/blog/*"]
}
```

**GET response includes:** index name, GitHub config link, last modification timestamp.

## Sitemap

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sitemap/{org}/{site}/{ref}/{path}` | Generate sitemap |

## Snapshots

| Method | Path | Description |
|--------|------|-------------|
| GET | `/snapshot/{org}/{site}/main` | List all snapshots |
| GET | `/snapshot/{org}/{site}/main/{snapshotId}` | Get snapshot details |
| POST | `/snapshot/{org}/{site}/main/{snapshotId}` | Update snapshot metadata |
| DELETE | `/snapshot/{org}/{site}/main/{snapshotId}` | Delete snapshot |
| POST | `/snapshot/{org}/{site}/main/{snapshotId}/*` | Bulk snapshot operations |

**POST body (update):**
```json
{
  "locked": true,
  "title": "Q4 Release",
  "description": "Content snapshot for Q4",
  "metadata": {}
}
```

Permissions: `preview:write` to lock, `live:write` to unlock.

## Jobs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/job/{org}/{site}/{ref}` | List all jobs |
| GET | `/job/{org}/{site}/{ref}/{topic}` | Job status by topic |
| GET | `/job/{org}/{site}/{ref}/{topic}/{jobName}` | Specific job details |
| DELETE | `/job/{org}/{site}/{ref}/{topic}/{jobName}` | Stop a job |

**Response includes:** topic, state, progress info, and tracking links.

## Configuration Service

Config endpoints use a different path structure: `/config/{org}/...`

### Organization

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/{org}.json` | Read org config |
| PUT | `/config/{org}.json` | Create org config |
| POST | `/config/{org}.json` | Update org config |
| DELETE | `/config/{org}.json` | Delete org config |

### Organization Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/{org}/users.json` | List users |
| POST | `/config/{org}/users.json` | Create user |
| GET | `/config/{org}/users/{userId}.json` | Get user |
| DELETE | `/config/{org}/users/{userId}.json` | Delete user |

### Organization Secrets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/{org}/secrets.json` | List secrets |
| POST | `/config/{org}/secrets.json` | Create secret |
| GET | `/config/{org}/secrets/{secretId}.json` | Get secret |
| DELETE | `/config/{org}/secrets/{secretId}.json` | Delete secret |

### Organization API Keys

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/{org}/apikeys.json` | List org API keys |
| POST | `/config/{org}/apikeys.json` | Create/import org API key |
| GET | `/config/{org}/apikeys/{keyId}.json` | Get API key |
| DELETE | `/config/{org}/apikeys/{keyId}.json` | Delete API key |

### Sites

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/{org}/sites/{site}.json` | Read site config |
| PUT | `/config/{org}/sites/{site}.json` | Create site config |
| POST | `/config/{org}/sites/{site}.json` | Update site config |
| DELETE | `/config/{org}/sites/{site}.json` | Delete site config |
| GET | `/config/{org}/sites/{site}/aggregated.json` | Read aggregated config |

### Site Sub-configurations

Replace `{configName}` with: `access`, `cdn`, `code`, `content`, `headers`, `redirects`, `metadata`, etc.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/{org}/sites/{site}/{configName}.json` | Read config |
| PUT | `/config/{org}/sites/{site}/{configName}.json` | Create config |
| POST | `/config/{org}/sites/{site}/{configName}.json` | Update config |
| DELETE | `/config/{org}/sites/{site}/{configName}.json` | Delete config |

### Site robots.txt

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/{org}/sites/{site}/robots.txt` | Read robots.txt |
| POST | `/config/{org}/sites/{site}/robots.txt` | Update robots.txt |

### Site Tokens, Secrets, API Keys

Same pattern as org-level, but under `/config/{org}/sites/{site}/`:

- `tokens.json` — Access tokens
- `secrets.json` — Site secrets
- `apikeys.json` — Site-level API keys

### Site Index & Sitemap Config

| Method | Path | Description |
|--------|------|-------------|
| GET/PUT/POST/DELETE | `/config/{org}/sites/{site}/index.json` | Index configuration |
| GET/PUT/POST/DELETE | `/config/{org}/sites/{site}/sitemap.json` | Sitemap configuration |

### Profile Config

Profiles allow per-environment or per-hostname configuration overrides. Same structure as site config but under `/config/{org}/sites/{site}/profile/`:

- `/config/{org}/sites/{site}/profile.json` — List profiles
- `/config/{org}/sites/{site}/profile/{profileName}.json` — CRUD
- Plus: `robots.txt`, `tokens`, `secrets`, `apikeys` under the profile path

### Config Versioning

Each level (org, site, profile) supports version history:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/{org}/versions.json` | List org config versions |
| GET | `/config/{org}/versions/{versionId}.json` | Get specific version |
| DELETE | `/config/{org}/versions/{versionId}.json` | Delete version |
| POST | `/config/{org}/versions/{versionId}/restore.json` | Restore version |

Same pattern for site (`/config/{org}/sites/{site}/versions/...`) and profile.
