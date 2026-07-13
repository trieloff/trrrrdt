/*
 * Liner notes for the player blocks. The author drops a link to a
 * /fragments/… page in the player's section (the standard EDS fragment block);
 * we fetch it, typeset the text onto up to four A4 canvases, and hand back a
 * paper "stack" the block lays on the desk. Clicking it blends the camera to a
 * reading pose.
 *
 * Long notes paginate across up to MAX_PAGES sheets, fanned slightly on the
 * desk. Back-compatible with the single-sheet callers: `createPaper` still
 * returns an Object3D the block adds to the scene, toggles `.visible` on, and
 * raycasts (recursively) for the read tap; its `userData.paperSize` (and the
 * turntable's `focusSize ?? paperSize.h`) still drives the reading pose.
 * `loadNotesCanvas` returns a truthy value (an array of canvases) or null, and
 * `setPaperCanvas` accepts either one canvas or that array.
 */

const MAX_PAGES = 4;

/* Does this href point at a liner-notes fragment (`…-notes` or /fragments/)? */
export function isNotesLink(href) {
  try {
    return /(-notes(?:$|[./?])|\/fragments\/)/.test(new URL(href, window.location).pathname);
  } catch (e) { return false; }
}

/* The pathname of an href, or ''. */
export function notesPathOf(href) {
  try { return new URL(href, window.location).pathname; } catch (e) { return ''; }
}

/* Find the page-level liner-notes fragment path from a link in the block's
   section (the fallback when a track carries none of its own). */
export function findFragmentPath(block) {
  const scope = block.closest('.section') || block;
  const a = [...scope.querySelectorAll('a[href]')].find((el) => isNotesLink(el.href));
  return a ? notesPathOf(a.href) : null;
}

async function loadNotes(path) {
  const res = await fetch(`${path}.plain.html`);
  if (!res.ok) throw new Error(`liner notes ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const title = doc.querySelector('h1, h2')?.textContent?.trim() || 'Liner Notes';
  const paras = [...doc.querySelectorAll('h2, h3, p, li')]
    .map((el) => ({ head: /^H[23]$/.test(el.tagName), text: el.textContent.trim() }))
    .filter((p) => p.text && p.text !== title);
  return { title, paras };
}

/* Break `text` into lines that fit `maxW` under the context's current font. */
function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

/* Paint a fresh sheet: parchment, faint fibres, vignette. */
function paintParchment(c, W, H) {
  c.fillStyle = '#f2e7cf';
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i += 1) {
    c.strokeStyle = `rgba(120, 96, 60, ${0.015 + Math.random() * 0.03})`;
    c.lineWidth = Math.random() * 1.4;
    const y = Math.random() * H;
    const wob = () => y + (Math.random() - 0.5) * 8;
    c.beginPath();
    c.moveTo(0, y);
    c.bezierCurveTo(W / 3, wob(), (2 * W) / 3, wob(), W, wob());
    c.stroke();
  }
  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(70, 46, 20, 0.14)');
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);
}

/*
 * Typeset the notes across 1–MAX_PAGES A4 canvases. Page 1 carries the
 * masthead + title; overflow flows onto continuation sheets. Page 1 gets a
 * "continued on sheet 2 →" footer when it spills, and the last sheet gets a
 * graceful truncation line if the text outruns MAX_PAGES.
 */
function renderNotesCanvases({ title, paras }) {
  const W = 1000;
  const H = Math.round(W * Math.SQRT2); // A4 ratio
  const M = 92;
  const BOTTOM = H - 120; // keep the last line clear of the folio/footer band
  const pages = [];
  let c;
  let y;

  const startPage = () => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    c = cv.getContext('2d');
    paintParchment(c, W, H);
    c.textBaseline = 'alphabetic';
    pages.push(cv);
    if (pages.length === 1) {
      y = 156;
      c.fillStyle = '#8a6a34';
      c.font = '700 24px "Space Mono", monospace';
      c.fillText('LINER NOTES', M, y);
      y += 66;
      c.fillStyle = '#221810';
      c.font = '600 62px Fraunces, Georgia, serif';
      wrapLines(c, title, W - 2 * M).forEach((ln) => { c.fillText(ln, M, y); y += 66; });
      y += 14;
      c.strokeStyle = '#221810';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(M, y);
      c.lineTo(W - M, y);
      c.stroke();
      y += 52;
    } else {
      y = 150;
      c.fillStyle = '#8a6a34';
      c.font = '700 20px "Space Mono", monospace';
      c.textAlign = 'right';
      c.fillText(`SHEET ${pages.length}`, W - M, 96);
      c.textAlign = 'left';
    }
  };

  startPage();

  let truncated = false;
  for (let p = 0; p < paras.length && !truncated; p += 1) {
    const para = paras[p];
    const font = para.head
      ? '600 32px "Space Grotesk", sans-serif'
      : '400 27px "Space Mono", monospace';
    const color = para.head ? '#221810' : '#3a2c1a';
    const lh = para.head ? 42 : 40;
    c.font = font;
    const lines = wrapLines(c, para.text, W - 2 * M);
    for (let l = 0; l < lines.length; l += 1) {
      if (y > BOTTOM) {
        if (pages.length >= MAX_PAGES) { truncated = true; break; }
        startPage();
      }
      c.fillStyle = color;
      c.font = font;
      c.fillText(lines[l], M, y);
      y += lh;
    }
    y += para.head ? 16 : 22;
  }

  if (pages.length > 1) {
    const c1 = pages[0].getContext('2d');
    c1.fillStyle = '#8a6a34';
    c1.font = '700 22px "Space Mono", monospace';
    c1.textAlign = 'right';
    c1.fillText('continued on sheet 2 →', W - M, H - 60);
    c1.textAlign = 'left';
  }

  if (truncated) {
    c.fillStyle = '#8a6a34';
    c.font = 'italic 400 24px Fraunces, Georgia, serif';
    c.fillText('…continued in the printed edition', M, Math.min(y + 10, H - 56));
  }

  return pages;
}

/*
 * Fetch + typeset the liner notes. Returns an array of 1–MAX_PAGES A4 canvases
 * (truthy), or null if there are none / it failed. Kept truthy-compatible with
 * the single-canvas callers, which only test the result and hand it straight to
 * setPaperCanvas.
 */
export async function loadNotesCanvas(path) {
  try {
    const notes = await loadNotes(path);
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* system fonts fine */ }
    }
    return renderNotesCanvases(notes);
  } catch (e) {
    return null;
  }
}

/* One blank A4 sheet mesh, lying in the group's local XY plane. */
function makePage(THREE, w, h) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: 0xf2e7cf, roughness: 0.92, metalness: 0 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* Fan sheet `i` slightly behind/beneath sheet 0 so the stack peeks at the edges.
   Sheet 0 stays at the group origin — identical to the old single plane. */
function layoutPage(mesh, i, w, h) {
  const dir = i % 2 ? 1 : -1;
  const step = Math.ceil(i / 2);
  // local +Z → world up (the block lays the group flat), so a small -Z tucks
  // lower sheets beneath the readable top one; -Y nudges them toward the viewer.
  mesh.position.set(dir * step * w * 0.03, -i * h * 0.02, -i * h * 0.006);
  mesh.rotation.set(0, 0, dir * i * 0.02);
}

/*
 * Build the A4 paper stack — a group holding 1–MAX_PAGES sheet meshes, blank
 * and hidden until a canvas (or canvas array) is set. Lies flat; the block
 * positions/rotates it onto the desk. `worldWidth` sizes each sheet. Its
 * `userData.paperSize` preserves the single-sheet reading-pose contract.
 */
export function createPaper(THREE, worldWidth = 0.72) {
  const w = worldWidth;
  const h = w * Math.SQRT2;
  const group = new THREE.Group();
  group.visible = false;
  group.userData.paperSize = { w, h };
  group.userData.pages = [];
  // pre-create the top sheet so the group always has geometry and a single-page
  // note skins with no extra allocation
  const first = makePage(THREE, w, h);
  layoutPage(first, 0, w, h);
  group.add(first);
  group.userData.pages.push(first);
  return group;
}

/*
 * Skin the paper with a notes canvas — or an array of up to MAX_PAGES canvases,
 * one per sheet. Grows the stack as needed, disposes replaced textures, and
 * hides any surplus sheets left from a longer previous note.
 */
export function setPaperCanvas(THREE, paper, canvas) {
  const canvases = Array.isArray(canvas) ? canvas : [canvas];
  const { paperSize, pages } = paper.userData;
  const { w, h } = paperSize;
  const n = Math.min(canvases.length, MAX_PAGES);
  for (let i = 0; i < n; i += 1) {
    let mesh = pages[i];
    if (!mesh) {
      mesh = makePage(THREE, w, h);
      layoutPage(mesh, i, w, h);
      paper.add(mesh);
      pages[i] = mesh;
    }
    if (mesh.material.map) mesh.material.map.dispose();
    const tex = new THREE.CanvasTexture(canvases[i]);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
    mesh.visible = true;
  }
  for (let i = n; i < pages.length; i += 1) pages[i].visible = false;
}
