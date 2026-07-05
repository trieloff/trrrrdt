/*
 * Liner notes for the player blocks. The author drops a link to a
 * /fragments/… page in the player's section (the standard EDS fragment block);
 * we fetch it, typeset the text onto an A4 canvas, and hand back a paper mesh
 * the block lays on the desk. Clicking it blends the camera to a reading pose.
 */

/* Find the liner-notes fragment path from a link in the block's section (or the
   block itself) — either a `…/{name}-notes` page or a /fragments/ page. Returns
   the pathname, or null. */
export function findFragmentPath(block) {
  const scope = block.closest('.section') || block;
  const a = scope.querySelector('a[href*="-notes"], a[href*="/fragments/"]');
  if (!a) return null;
  try { return new URL(a.href, window.location).pathname; } catch (e) { return null; }
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

function wrapText(ctx, text, x, startY, maxW, lh) {
  const words = text.split(/\s+/);
  let line = '';
  let y = startY;
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
    } else {
      line = test;
    }
  });
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}

async function renderNotesCanvas({ title, paras }) {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* system fonts fine */ }
  }
  const W = 1000;
  const H = Math.round(W * Math.SQRT2); // A4 ratio
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  // parchment + faint fibres + vignette
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

  const M = 92;
  let y = 156;
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#8a6a34';
  c.font = '700 24px "Space Mono", monospace';
  c.fillText('LINER NOTES', M, y);
  y += 66;
  c.fillStyle = '#221810';
  c.font = '600 62px Fraunces, Georgia, serif';
  y = wrapText(c, title, M, y, W - 2 * M, 66) + 14;
  c.strokeStyle = '#221810';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(M, y);
  c.lineTo(W - M, y);
  c.stroke();
  y += 52;
  paras.forEach((p) => {
    if (y > H - 96) return;
    if (p.head) {
      c.fillStyle = '#221810';
      c.font = '600 32px "Space Grotesk", sans-serif';
      y = wrapText(c, p.text, M, y, W - 2 * M, 42) + 16;
    } else {
      c.fillStyle = '#3a2c1a';
      c.font = '400 27px "Space Mono", monospace';
      y = wrapText(c, p.text, M, y, W - 2 * M, 40) + 22;
    }
  });
  return cv;
}

/* Fetch + typeset the liner notes to an A4 canvas. Returns null if none/failed. */
export async function loadNotesCanvas(path) {
  try {
    const notes = await loadNotes(path);
    return await renderNotesCanvas(notes);
  } catch (e) {
    return null;
  }
}

/*
 * Build the A4 paper mesh (notes on the front). Lies flat by default; the block
 * positions/rotates it onto the desk. `worldWidth` sizes it in scene units.
 */
export function createPaper(THREE, canvas, worldWidth = 0.72) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const w = worldWidth;
  const h = w * Math.SQRT2;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.paperSize = { w, h };
  return mesh;
}
