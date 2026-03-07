# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See @AGENTS.md for full project standards, block development guidelines, deployment process, and skill usage instructions.

## Project Context

TRRRRDT Records is a fictional record label website showcasing AI-generated music and audio dramas. The name is an onomatopoeia for the sound a record makes. The aesthetic is **cassette-futurism** — retro-analog visuals (CRT screens, tape decks, analog dials) implemented with modern web tech including 3D-rendered models of record players and TV sets for audio/video playback.

### Content Sources

- **Artist personas** (7 fictional musicians): Songs as MP3s + lyrics in `../suno/songs/` — each artist has a distinct genre, nationality, and philosophical framework
- **Playlists/Samplers**: Multi-artist compilations in `../suno/playlists/` (e.g., TITAN, AI Confessions Soundtrack)
- **AI Confessions Hörspiel**: Audio drama with its own soundtrack
- **Morro Bay Murder Investigations** (future): Audio drama podcast in `../MBMI/` — will need Apple Music integration for listeners to hear original songs alongside the Hörspiel

Audio/video content is hosted externally (not in this repo). The DA (Document Authoring) MCP server is used for content authoring at `trieloff/trrrrdt`.

### Site Structure

Multi-page site: homepage, artist pages (one per persona), playlist/sampler pages, Hörspiel pages. The vibe is whimsical 90s with even older aesthetics layered in.

### 3D Assets

- **Sony PS-F9 turntable model**: FBX files in `~/Desktop/7114844/` — needs conversion to glTF/GLB for Three.js
- **Yunost-402 Soviet portable TV**: FBX + textures in `~/Desktop/2315123.5c1515b78b497.rar` — needs extraction and glTF conversion

## Quick Reference Commands

- **Install**: `npm install`
- **Dev server**: `npx -y @adobe/aem-cli up --no-open --forward-browser-logs` (serves at `http://localhost:3000`)
- **Lint**: `npm run lint`
- **Lint fix**: `npm run lint:fix`
- **Lint JS only**: `npm run lint:js`
- **Lint CSS only**: `npm run lint:css`
- **Inspect page content**: `curl http://localhost:3000/path/to/page.plain.html`
- **Discover skills**: `./.agents/discover-skills`
- **Search docs**: `curl -s https://www.aem.live/docpages-index.json | jq -r '.data[] | select(.content | test("KEYWORD"; "i")) | "\(.path): \(.title)"'`

There is no build step, test suite, or bundler. Linting is the only automated check.

## Architecture

This is an AEM Edge Delivery Services site. There is no build pipeline — vanilla JS/CSS is served directly from the repository and executed in the browser.

### Page Loading Flow

`scripts/scripts.js` is the entry point. It calls `loadPage()` which runs three phases sequentially:

1. **Eager** (`loadEager`): Decorates main content (sections, blocks, buttons, icons), loads first section, triggers LCP
2. **Lazy** (`loadLazy`): Loads header/footer blocks, remaining sections, `lazy-styles.css`, fonts
3. **Delayed** (`loadDelayed`): Imports `scripts/delayed.js` after 3s for analytics/martech

### Block Loading

Blocks are auto-loaded by the framework (`scripts/aem.js` — never modify this file). When a block element is encountered, AEM automatically imports `blocks/{name}/{name}.js` and `blocks/{name}/{name}.css`. Each block JS exports a default `decorate(block)` function.

### Current Blocks

`cards`, `columns`, `footer`, `fragment`, `header`, `hero` — each in `blocks/{name}/` with paired `.js` and `.css` files.

### Key Utilities (from `aem.js`)

- `buildBlock(name, content)` — programmatically create block elements
- `loadCSS(href)` / `loadScript(src)` — async resource loading
- `getMetadata(name)` — read `<meta>` tag values
- `createOptimizedPicture(src, alt, eager, breakpoints)` — responsive images
- `readBlockConfig(block)` — extract key-value config from block rows
- `toClassName(str)` / `toCamelCase(str)` — string sanitization
- `decorateIcons(element)` — convert `span.icon-*` to `<img>` from `/icons/`

### Auto-Blocking

`buildAutoBlocks` in `scripts.js` handles two patterns:
- Links to `*/fragments/*` are auto-loaded as fragment blocks
- Pages with a leading picture + h1 get an auto-generated hero block

## Code Style Essentials

- **JS**: Airbnb ESLint rules, ES6+ modules with `.js` extensions in imports, no dependencies
- **CSS**: Stylelint standard, mobile-first with `min-width` breakpoints at 600/900/1200px, all selectors scoped to block name
- Avoid `-container` and `-wrapper` class suffixes (reserved by the framework for sections)

## DA Content Authoring Loop

Content is authored in DA (Document Authoring) at `trieloff/trrrrdt`. The authoring workflow has three steps:

1. **Edit content** via the DA MCP tools (`da_create_source`, `da_update_source`, `da_get_source`)
2. **Preview content** by clicking the Preview button in the DA editor UI — the admin API cannot fetch from DA's content source directly (gets 401 from `content.da.live`), so a browser session with the user's Adobe login is required
3. **Verify** on the dev server at `http://localhost:3001/path.plain.html`

### DA HTML Structure

DA stores content as HTML. Key conventions:
- Wrap content in `<body><header></header><main>...</main><footer></footer></body>`
- Sections inside `<main>` are `<div>` elements separated by `<hr>` tags
- Blocks are `<table>` elements with the block name in a `<th>` header row
- Bold links (`<strong><a>`) become primary buttons, italic links (`<em><a>`) become secondary buttons
- The nav fragment (`nav.html`) needs separate sections for brand, nav links, and tools (3 divs separated by `<hr>`)

### Browser Preview via Playwright

Keep a persistent Playwright session open for DA preview clicks:
```bash
npx @playwright/cli@latest -s=da --headed --persistent open "https://da.live/edit#/trieloff/trrrrdt/{page}"
```
After editing content via MCP, navigate to the page and click Send → Preview. The session persists login across navigations within the same session.

## Git Conventions

Always use the `--prompt` parameter when committing, e.g. `git commit --prompt "what you were asked to do"`. Use semantic commit messages (e.g. `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `style:`, `test:`).

## Skills

This project has skills installed in `.claude/skills/`. Run `./.agents/discover-skills` at the start of each session. For any block development work, start with the `content-driven-development` skill.
