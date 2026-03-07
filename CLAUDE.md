# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See @AGENTS.md for full project standards, block development guidelines, deployment process, and skill usage instructions.

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

## Git Conventions

Always use the `--prompt` parameter when committing, e.g. `git commit --prompt "what you were asked to do"`. Use semantic commit messages (e.g. `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `style:`, `test:`).

## Skills

This project has skills installed in `.claude/skills/`. Run `./.agents/discover-skills` at the start of each session. For any block development work, start with the `content-driven-development` skill.
