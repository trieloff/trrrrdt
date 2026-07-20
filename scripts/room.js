/*
 * Room tone — per-page ambience for playlist and artist pages.
 *
 * Every record gets its own room: the page samples its hero artwork (or the
 * first cover on the page), derives a palette, and re-tints the environment —
 * the charcoal band, the cream panels, the selection color — while a faint
 * halftone "print echo" of the artwork hangs behind the whole page like a
 * poster seen through tracing paper. No two playlist pages feel alike, and
 * none of it needs code changes when a new page is authored.
 *
 * Content contract (page metadata, all optional — the block named "metadata"
 * in DA; keys become <meta> tags):
 *   mood:   free-text style prompt, same spirit as a Suno prompt. Hashed into
 *           hues + an echo pattern when the page has no artwork to sample
 *           (and it opts non-playlist/artist pages into a room).
 *   accent: CSS color that overrides the extracted accent.
 *   echo:   off | subtle (default) | bold — the artwork echo backdrop.
 *   room:   off — opt the page out entirely.
 *
 * Everything here is decorative: backgrounds and ornament only, body text
 * colors untouched; the echo layers are position:fixed (zero layout shift)
 * and built once (no per-frame work). Drift animation is CSS, gated behind
 * prefers-reduced-motion.
 */
import { getMetadata } from './aem.js';
import { wallpaperFromStyle } from './player/visualizer.js';

/* ---- small color helpers (0..255 rgb triplets) ---- */

function lum([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

function css([r, g, b], alpha = 1) {
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

function hsl(h, s, l) {
  // h 0..1 → rgb triplet, for mood-derived palettes
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/* Pull a palette from an image: the average tone plus the most vivid
   mid-bright pixel as an accent (same approach as the turntable's sleeve
   sampling). Returns null on a tainted canvas or zero-size image. */
function samplePalette(img) {
  try {
    const S = 24;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, S, S);
    const { data } = ctx.getImageData(0, 0, S, S);
    let ar = 0; let ag = 0; let ab = 0; let n = 0;
    let best = null; let bestScore = -1;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      ar += r; ag += g; ab += b; n += 1;
      const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const l = (mx + mn) / 2;
      const score = sat * (1 - Math.abs(l - 150) / 150);
      if (score > bestScore) { bestScore = score; best = [r, g, b]; }
    }
    const avg = [ar / n, ag / n, ab / n].map(Math.round);
    return { avg, accent: best || avg };
  } catch (e) {
    return null; // tainted (cross-origin) canvas — fall back to mood/none
  }
}

/* Derive the room tokens from a sampled palette, with readability clamps:
   the wash stays light enough for charcoal text, the deep stays dark enough
   for cream text, whatever the artwork throws at us. */
const CREAM = [245, 230, 211];
const INK = [28, 28, 28];

function deriveTokens({ avg, accent }) {
  // keep the accent lively but never neon-bright on cream
  let acc = accent;
  if (lum(acc) > 0.75) acc = mix(acc, INK, 0.35);
  // the wash leans toward the accent so the panels carry the record's
  // character rather than washing out to generic tan, then gets clamped
  // light enough for charcoal text
  let wash = mix(mix(avg, acc, 0.22), CREAM, 0.5);
  while (lum(wash) < 0.72) wash = mix(wash, CREAM, 0.25);
  let deep = mix(avg, [12, 11, 10], 0.68);
  while (lum(deep) > 0.16) deep = mix(deep, [8, 8, 8], 0.3);
  return {
    accent: acc, tone: avg, deep, wash,
  };
}

/* ---- echo backdrops (built once, set as a background-image data URL) ---- */

/* A three-tone ordered-dither print of the artwork — the record as a riso
   poster glimpsed behind the page. Low resolution on purpose: the halftone
   chunks read as print, not as a photo. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function echoFromImage(img, { deep, tone, wash }, coarse) {
  const w = coarse ? 132 : 176;
  const h = Math.max(16, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  let px;
  try {
    px = ctx.getImageData(0, 0, w, h);
  } catch (e) {
    return null;
  }
  const { data } = px;
  const shades = [deep, mix(deep, tone, 0.55), tone, wash];
  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4;
    const x = p % w; const y = (p - x) / w;
    const l = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    const t = l + ((BAYER[y % 4][x % 4] / 16) - 0.5) * 0.3;
    let band = 3;
    if (t < 0.3) band = 0;
    else if (t < 0.55) band = 1;
    else if (t < 0.8) band = 2;
    const [sr, sg, sb] = shades[band];
    data[i] = sr;
    data[i + 1] = sg;
    data[i + 2] = sb;
  }
  ctx.putImageData(px, 0, 0);
  return c.toDataURL('image/png');
}

/* Mood-only pages (no artwork anywhere) get a quiet procedural print instead:
   dots, hatch or rings, picked from the mood hash. */
function echoFromMood(hash, { deep, tone, wash }) {
  const c = document.createElement('canvas');
  c.width = 220;
  c.height = 220;
  const ctx = c.getContext('2d');
  ctx.fillStyle = css(mix(wash, CREAM, 0.4));
  ctx.fillRect(0, 0, 220, 220);
  const kind = hash % 3;
  ctx.fillStyle = css(mix(tone, deep, 0.25));
  ctx.strokeStyle = ctx.fillStyle;
  if (kind === 0) {
    // halftone dot grid, sized on a slow diagonal ramp
    for (let y = 10; y < 220; y += 20) {
      for (let x = 10; x < 220; x += 20) {
        const r = 2 + (((x + y) / 440) * 5);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 1) {
    // diagonal hatch
    ctx.lineWidth = 3;
    for (let d = -220; d < 440; d += 16) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + 220, 220);
      ctx.stroke();
    }
  } else {
    // record grooves
    ctx.lineWidth = 2;
    for (let r = 8; r < 320; r += 14) {
      ctx.beginPath();
      ctx.arc(110, 110, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return c.toDataURL('image/png');
}

function moodHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 1000003;
  return h;
}

/* ---- wiring ---- */

function findArtwork() {
  // hero art first, then the first cover anywhere on the page
  return document.querySelector('main .section:first-of-type picture img')
    || document.querySelector('main picture img')
    || document.querySelector('main img');
}

function whenLoaded(img) {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth) { resolve(img); return; }
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
  });
}

function apply(tokens, echoURL, echoMode) {
  const root = document.documentElement;
  const {
    accent, tone, deep, wash,
  } = tokens;
  root.style.setProperty('--room-accent', css(accent));
  // a slightly inked accent that keeps cream button text readable even when
  // the artwork hands us something bright, plus a whisper-alpha fill for hovers
  root.style.setProperty('--room-accent-strong', css(mix(accent, INK, 0.18)));
  root.style.setProperty('--room-accent-soft', css(accent, 0.12));
  root.style.setProperty('--room-deep', css(deep));
  root.style.setProperty('--room-wash', css(wash));
  root.style.setProperty('--room-tone-glow', css(tone, 0.42));
  root.style.setProperty('--room-accent-glow', css(accent, 0.34));
  root.style.setProperty('--room-echo-opacity', echoMode === 'bold' ? '0.4' : '0.26');

  const glow = document.createElement('div');
  glow.className = 'room-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.prepend(glow);

  if (echoURL) {
    const echo = document.createElement('div');
    echo.className = 'room-echo';
    echo.setAttribute('aria-hidden', 'true');
    echo.style.backgroundImage = `url(${echoURL})`;
    document.body.prepend(echo);
  }

  // tint the browser chrome to the room (mobile address bar, PWA title bar)
  let theme = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement('meta');
    theme.name = 'theme-color';
    document.head.append(theme);
  }
  theme.content = css(deep);

  document.body.classList.add('room-on');
}

export default async function initRoom() {
  if ((getMetadata('room') || '').toLowerCase() === 'off') return;
  const echoMode = (getMetadata('echo') || 'subtle').toLowerCase();
  const mood = getMetadata('mood') || '';
  const accentMeta = getMetadata('accent') || '';

  let palette = null;
  let echoURL = null;

  const art = findArtwork();
  const img = art ? await whenLoaded(art) : null;
  if (img) palette = samplePalette(img);

  if (!palette && mood) {
    // no artwork to sample — build the palette from the mood prompt, using the
    // same hue-hashing the players' wallpapers use, so the language matches
    const { hues } = wallpaperFromStyle(mood);
    palette = {
      avg: hsl(hues[0], 0.38, 0.52),
      accent: hsl(hues[2], 0.72, 0.5),
    };
  }
  if (!palette) return; // nothing to tune to — leave the page alone

  if (accentMeta) {
    // resolve any CSS color the author wrote to an rgb triplet
    const probe = document.createElement('div');
    probe.style.color = accentMeta;
    document.body.append(probe);
    const m = getComputedStyle(probe).color.match(/\d+/g);
    probe.remove();
    if (m) palette.accent = m.slice(0, 3).map(Number);
  }

  const tokens = deriveTokens(palette);
  if (echoMode !== 'off') {
    echoURL = img
      ? echoFromImage(img, tokens, echoMode === 'bold')
      : echoFromMood(moodHash(mood), tokens);
  }
  apply(tokens, echoURL, echoMode);
}
