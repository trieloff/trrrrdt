# Configuration Service Setup

The configuration service centralizes site configuration that was previously spread across files like `fstab.yaml`, `robots.txt`, and `.helix/config`. It supports inheritance from org → site → profile levels.

## Prerequisites

1. **GitHub org**: Your `aem.live` organization must have a corresponding GitHub org with at least one repo using AEM Code Sync
2. **Canonical site**: For multi-site setups (repoless), one site must be canonical where `org/site` matches `owner/repo`

## Creating an Organization

The org is created automatically when you set up your first site following the developer tutorial. It matches your GitHub org/username.

## Adding a Site

```bash
curl -X PUT "https://admin.hlx.page/config/{org}/sites/{site}.json" \
  -H "Content-Type: application/json" \
  -H "x-auth-token: {AUTH_TOKEN}" \
  -d '{
    "code": {
      "owner": "{github-owner}",
      "repo": "{github-repo}",
      "source": {
        "type": "github",
        "url": "https://github.com/{owner}/{repo}"
      }
    },
    "content": {
      "source": {
        "type": "markup",
        "url": "https://content.da.live/{org}/{site}"
      }
    }
  }'
```

Adjust the content source URL based on your setup:
- **DA**: `https://content.da.live/{org}/{site}`
- **SharePoint**: `https://{tenant}.sharepoint.com/sites/{site}/Shared%20Documents/{folder}`
- **Google Drive**: `https://drive.google.com/drive/folders/{folderId}`

## Updating Configuration

Update specific aspects with POST:

```bash
# Update access control
curl -X POST "https://admin.hlx.page/config/{org}/sites/{site}/access.json" \
  -H "Content-Type: application/json" \
  -H "x-auth-token: {AUTH_TOKEN}" \
  -d '{"admin": {"role": ["user@example.com"]}}'

# Update CDN config
curl -X POST "https://admin.hlx.page/config/{org}/sites/{site}/cdn.json" \
  -H "Content-Type: application/json" \
  -H "x-auth-token: {AUTH_TOKEN}" \
  -d '{"prod": {"host": "www.example.com"}}'
```

## Clean Up Legacy Files

Once the config service is active, remove legacy config files from GitHub:
- `fstab.yaml`
- `robots.txt` (now managed via config service)
- Any `.helix/config` files

## Troubleshooting

**403 on config endpoints**: Your user account needs `admin` role in the org's access configuration. The GitHub Code Sync App installer is added as admin by default. If you're getting 403 with valid auth, the org may not exist in the config service yet.

**401 vs 403**: 401 means the token is invalid/expired. 403 means the token is valid but you lack permissions.

**Config not taking effect**: After updating config, you may need to purge cache or re-preview content for changes to propagate.
