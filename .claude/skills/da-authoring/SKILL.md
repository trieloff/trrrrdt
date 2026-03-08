# DA Content Authoring

Edit, preview, and verify content in DA (Document Authoring) for the `trieloff/trrrrdt` site. Use this skill whenever you need to create or update page content, then make it available on the local dev server.

## Prerequisites

- A persistent Playwright browser session (`-s=da`) must be running and logged in. **NEVER close this session.**
- If no session exists, open one and ask the user to log in:
  ```bash
  npx @playwright/cli@latest -s=da --headed --persistent open "https://da.live/edit#/trieloff/trrrrdt/index"
  ```
- The local dev server must be running at `http://localhost:3001`

## DA HTML Structure

DA stores content as HTML. Follow these conventions exactly:

```html
<body>
  <header></header>
  <main>
    <div>
      <!-- Section 1 content -->
    </div>
    <hr>
    <div>
      <!-- Section 2 content -->
    </div>
    <hr>
    <div>
      <!-- Section 3 content -->
    </div>
  </main>
  <footer></footer>
</body>
```

### Rules

- Sections inside `<main>` are `<div>` elements separated by `<hr>` tags
- Do NOT leave empty `<div></div>` elements — they render as blank sections
- Blocks are `<table>` elements with the block name in a `<th>` header row:
  ```html
  <table>
    <tr><th colspan="2">Cards</th></tr>
    <tr>
      <td><p>Title</p><p>Description</p></td>
      <td><p>Title</p><p>Description</p></td>
    </tr>
  </table>
  ```
- Bold links (`<strong><a>`) become primary buttons
- Italic links (`<em><a>`) become secondary buttons
- The nav fragment (`nav.html`) needs exactly 3 sections separated by `<hr>`: brand, nav links, tools

## The Authoring Loop

### Step 1: Edit Content via MCP

Use the DA MCP tools to create or update content. Never edit content through the browser — only use the browser for preview clicks.

**Create a new page:**
```
mcp__da__da_create_source(org: "trieloff", repo: "trrrrdt", path: "path/to/page.html", content: "<body>...</body>")
```

**Update an existing page:**
```
mcp__da__da_update_source(org: "trieloff", repo: "trrrrdt", path: "path/to/page.html", content: "<body>...</body>")
```

**Read current content:**
```
mcp__da__da_get_source(org: "trieloff", repo: "trrrrdt", path: "path/to/page.html")
```

### Step 2: Preview via Playwright Browser

The admin API cannot preview DA content directly (it gets 401 from content.da.live). You must use the Playwright browser session to click the Preview button in the DA editor UI.

Follow this exact sequence:

```bash
# 1. Navigate to the page in the DA editor
npx @playwright/cli@latest -s=da goto "https://da.live/edit#/trieloff/trrrrdt/{path-without-extension}"

# 2. Click the Send button to reveal preview/publish options
npx @playwright/cli@latest -s=da click e78

# 3. Take a snapshot to find the Preview button ref (it changes between pages)
npx @playwright/cli@latest -s=da snapshot
```

Read the snapshot file and look for buttons labeled "Preview" and "Publish" inside the Send dropdown. The refs will look like:

```yaml
- button "Send" [ref=eXXX]: Preview
- button "Send" [ref=eYYY]: Publish
- button "Send" [ref=e78]
```

```bash
# 4. Click the Preview button using its ref from the snapshot
npx @playwright/cli@latest -s=da click eXXX
```

**Important:**
- The Send button (`e78`) is stable across pages
- The Preview/Publish button refs change when navigating to a different page — always snapshot first
- If a ref is not found, take a fresh snapshot and try again
- NEVER close the `-s=da` browser session

### Step 3: Verify on Dev Server

After previewing, verify the rendered output on the local dev server:

```bash
# Check the plain HTML output
curl -s http://localhost:3001/{path}.plain.html

# Look for:
# - Correct section structure (no empty <div></div>)
# - Blocks rendering properly
# - Links and formatting intact
```

You can also open the page in a separate (non-DA) browser session for visual verification:

```bash
npx @playwright/cli@latest open http://localhost:3001/{path}
npx @playwright/cli@latest screenshot --filename=/tmp/verify-{page-name}.png
npx @playwright/cli@latest close
```

## Bulk Operations

When creating multiple pages (e.g., all artist pages), you can batch the MCP edits first, then preview them all in sequence:

1. Create/update all pages via MCP
2. For each page, navigate → Send → Preview in the DA browser
3. Verify all pages on the dev server

## Common Patterns

### Artist Page Template

```html
<body>
  <header></header>
  <main>
    <div>
      <h1>{Artist Name}</h1>
      <p>{Tagline}</p>
    </div>
    <hr>
    <div>
      <h2>{Bio Section Title}</h2>
      <p>{Bio paragraph 1}</p>
      <p>{Bio paragraph 2}</p>
      <p>"{Artist quote}"</p>
    </div>
    <hr>
    <div>
      <h2>Philosophy</h2>
      <p>{Philosophy paragraph 1}</p>
      <p>"{Philosophy quote}"</p>
    </div>
    <hr>
    <div>
      <h2>Discography</h2>
    </div>
    <div>
      <table>
        <tr><th colspan="2">Cards</th></tr>
        <tr>
          <td><p>{Song Title}</p><p>{Genre description}</p></td>
          <td><p>{Song Title}</p><p>{Genre description}</p></td>
        </tr>
        <!-- more rows -->
      </table>
    </div>
    <hr>
    <div>
      <h2>Appears On</h2>
      <p><strong><a href="/playlists/{playlist}">{PLAYLIST}</a></strong> — {Song Title}</p>
      <p><em><a href="/">← Back to all artists</a></em></p>
    </div>
  </main>
  <footer></footer>
</body>
```

### Nav Fragment

```html
<body>
  <header></header>
  <main>
    <div><p><a href="/">TRRRRDT Records</a></p></div>
    <hr>
    <div>
      <ul>
        <li><a href="/artists">Artists</a></li>
        <li><a href="/playlists">Playlists</a></li>
        <li><a href="/hoerspiele">Hörspiele</a></li>
      </ul>
    </div>
    <hr>
    <div><p></p></div>
  </main>
  <footer></footer>
</body>
```

## Troubleshooting

- **Empty sections / duplicate breaks**: Check for empty `<div></div>` or missing `<hr>` tags in the DA source
- **Preview button not found**: The Send dropdown may have closed — click `e78` again, then snapshot
- **401 on admin API preview**: This is expected for DA content — always use the browser
- **Content not updating on dev server**: Make sure you clicked Preview in the DA editor, not just saved via MCP
- **Browser session expired**: Ask the user to log in again — do NOT close and reopen the session
