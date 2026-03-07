# Backend Error Codes

The Admin API returns error details in the `x-error` and `x-error-code` response headers.

## Admin-Level Errors

| Error | Meaning | Fix |
|-------|---------|-----|
| `[admin] not authenticated` | Missing or expired auth token | Re-login or refresh API key |
| `[admin] not authorized` | Valid auth but insufficient permissions | Check roles, or config service not set up |
| `[admin] expected .json or .yaml` | Config URL missing file extension | Add `.json` to the URL |
| `[Fastly] Invalid path format` | Malformed URL path | Check path structure matches `/{op}/{org}/{site}/{ref}/{path}` |
| `[AWS] Not Found` | Resource doesn't exist in the backend | Check org/site/path spelling |

## Backend Content Errors

| Error Code | Issue | Fix |
|------------|-------|-----|
| `AEM_BACKEND_FETCH_FAILED` | Network/permissions/server error fetching source | Check content source access |
| `AEM_BACKEND_NOT_FOUND` | Source document missing | Verify file exists in content source |
| `AEM_BACKEND_TYPE_UNSUPPORTED` | File type not supported for preview | Convert to supported format |
| `AEM_BACKEND_NO_HANDLER` | No processor for this file type | Check supported formats |
| `AEM_BACKEND_NON_MATCHING_MEDIA` | Content-type mismatch | Verify file extension matches content |
| `AEM_BACKEND_VALIDATION_FAILED` | Document failed validation | Review document structure |
| `AEM_BACKEND_FILE_EMPTY` | Empty source file | Add content to file |
| `AEM_BACKEND_FILE_TOO_BIG` | Document > 100MB | Split or compress |
| `AEM_BACKEND_JSON_INVALID` | Malformed JSON in markup | Fix JSON syntax |

## Media-Specific Errors

| Error Code | Issue | Limit |
|------------|-------|-------|
| `AEM_BACKEND_DOC_IMAGE_TOO_BIG` | Embedded image too large | Reduce image size |
| `AEM_BACKEND_IMAGE_TOO_BIG` | Image exceeds limits | Downsize or compress |
| `AEM_BACKEND_MP4_PARSING_FAILED` | Corrupted MP4 | Re-encode video |
| `AEM_BACKEND_MP4_TOO_LONG` | Video > 2 minutes | Use shorter clip |
| `AEM_BACKEND_MP4_BIT_RATE_TOO_HIGH` | Bitrate > 300 KB/s | Re-encode at lower bitrate |
| `AEM_BACKEND_ICO_TOO_BIG` | ICO > 16KB | Create smaller icon |
| `AEM_BACKEND_PDF_TOO_BIG` | PDF > 10MB | Reduce PDF size |
| `AEM_BACKEND_SVG_SCRIPTING_DETECTED` | SVG contains scripts | Remove `<script>` and event handlers |
| `AEM_BACKEND_SVG_ROOT_ITEM_MISSING` | SVG missing `<svg>` root | Add proper SVG wrapper |
| `AEM_BACKEND_SVG_PARSING_FAILED` | Invalid SVG XML | Validate and fix SVG |
| `AEM_BACKEND_SVG_TOO_BIG` | SVG > 20KB | Optimize SVG |
| `AEM_BACKEND_UNSUPPORTED_MEDIA` | Format not supported by backend | Use alternative format |
| `AEM_BACKEND_NO_CONTENT_TYPE` | Missing Content-Type header | Fix source server headers |

## Configuration Errors

| Error Code | Issue | Fix |
|------------|-------|-----|
| `AEM_BACKEND_CONFIG_EXISTS` | Config already created | Use POST to update instead of PUT |
| `AEM_BACKEND_CONFIG_TYPE_MISSING` | Missing config type | Include Content-Type header |
| `AEM_BACKEND_CONFIG_TYPE_INVALID` | Malformed config | Check JSON/YAML syntax |
| `AEM_BACKEND_CONFIG_MISSING` | Config doesn't exist | Use PUT to create first |
| `AEM_BACKEND_CONFIG_READ` | Config read failed | Check permissions |
| `AEM_BACKEND_CONFIG_CREATE` | Config create failed | Check permissions and payload |
| `AEM_BACKEND_CONFIG_UPDATE` | Config update failed | Check permissions and payload |
| `AEM_BACKEND_CONFIG_DELETE` | Config delete failed | Check permissions |
