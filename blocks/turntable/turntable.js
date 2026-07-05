import { toClassName, getMetadata } from '../../scripts/aem.js';
import createAudioEngine from '../../scripts/player/audio.js';
import { createAppleBackend, classifyAppleUrl, hydrateArtwork } from '../../scripts/player/apple.js';
import { wallpaperFromStyle, buildWallpaper, makeDeskGrain } from '../../scripts/player/visualizer.js';
import { slugify, resolveEntries } from '../../scripts/player/content.js';
import {
  findFragmentPath, loadNotesCanvas, createPaper, setPaperCanvas, isNotesLink, notesPathOf,
} from '../../scripts/player/linernotes.js';

const MODEL_PATH = '/models/psf9.glb';
const ENV_LERP = 0.05;
const SPIN_SPEED = 2.2; // radians per second, ~33rpm feel

/*
 * Fallback room palettes per artist (briefing-derived) — used when a track
 * has no style prompt to hash a wallpaper from.
 */
const ROOMS = {
  'sylvaine-eternelle': { wall: 0x352b44, table: 0x6e5a80, glow: 0xb9a0e8 },
  'helle-raud': { wall: 0x2e3a42, table: 0x8a939b, glow: 0xa8c4d4 },
  'natsuko-terada': { wall: 0x1c070b, table: 0xb3202e, glow: 0xff2e4d },
  'dmitri-volkov': { wall: 0x0e1f14, table: 0x4a5a52, glow: 0x3d8a5f },
  'kevin-mayfield': { wall: 0x2a1a08, table: 0x6a4e2a, glow: 0xe8a317 },
  'the-moss-twins': { wall: 0x28322a, table: 0x55604f, glow: 0x8fa588 },
  'cassidy-diane': { wall: 0x1d1c30, table: 0x4a4262, glow: 0x8f7fd4 },
  'ann-francon': { wall: 0x2d130a, table: 0x7a3d20, glow: 0xff6b2e },
  'itzik-kagan': { wall: 0x3d1030, table: 0xd98a2b, glow: 0xff4fa0 },
  default: { wall: 0x1c1c1c, table: 0x3a3a3a, glow: 0xc9bfae },
};

/* Build a partial track from a block row. Apple rows carry an appleId instead of
   an <audio> src; plain rows keep the mp3 href. finalize() adds slug/wallpaper/room. */
function rowToEntry(cells) {
  const title = cells[0]?.textContent?.trim() || '';
  const links = [...cells].map((c) => c.querySelector('a')?.href).filter(Boolean);
  const notes = links.find(isNotesLink); // per-song liner notes, if any
  const link = links.find((h) => h !== notes) || ''; // audio (mp3 / Apple)
  const apple = classifyAppleUrl(link);
  if (apple && (apple.kind === 'playlist' || apple.kind === 'album')) {
    return { kind: 'expand', apple };
  }
  const artist = cells[1]?.textContent?.trim() || '';
  // cover art may sit in any cell as an <img> (DA content-addresses it, so the
  // same asset can appear on the card, the hero, and here at no extra cost)
  const image = [...cells].map((c) => c.querySelector('img')?.src).find(Boolean) || '';
  const partial = {
    title,
    artist,
    image,
    meta: cells[2]?.textContent?.trim() || '',
    style: cells[4]?.textContent?.trim() || '',
    source: apple ? 'apple' : 'file',
    appleId: apple ? apple.id : null,
    storefront: apple ? apple.storefront : 'us',
    audio: apple ? '' : link,
    notes: notes ? notesPathOf(notes) : '',
    playable: apple ? true : !!link,
  };
  return { kind: 'track', track: partial };
}

function parseEntries(block) {
  return [...block.children]
    .map((row) => rowToEntry([...row.children]))
    // a plain (file) row with neither title nor audio is empty filler — drop it
    .filter((e) => e.kind === 'expand' || e.track.title || e.track.playable);
}

/* Fill in the derived fields once a track's final position in the list is known. */
function finalize(t, i) {
  const style = t.style || (t.source === 'apple' ? t.artist : '') || '';
  return {
    ...t,
    style,
    slug: slugify(t.title || '') || `track-${i + 1}`,
    wallpaper: style ? wallpaperFromStyle(style) : null,
    room: ROOMS[toClassName(t.artist || '')] || ROOMS.default,
  };
}

function buildStage(tracks) {
  const stage = document.createElement('div');
  stage.className = 'turntable-stage';
  stage.innerHTML = `
    <div class="turntable-canvas"></div>
    <div class="turntable-loading"><span class="turntable-spinner"></span><span class="turntable-loading-label">Loading PS-F9…</span></div>
    <div class="turntable-info">
      <p class="turntable-source" aria-hidden="true"></p>
      <p class="turntable-artist"></p>
      <p class="turntable-title"></p>
      <p class="turntable-meta"></p>
    </div>
    <p class="turntable-status" aria-live="polite"></p>
    <a class="turntable-eject" href="/">⏏ Eject</a>
    <button type="button" class="turntable-play" aria-pressed="false">Drop the needle</button>
    <div class="turntable-dots" role="presentation"></div>
    <label class="turntable-dof">
      <span class="turntable-dof-label">Focus <span class="turntable-dof-value"></span></span>
      <input class="turntable-dof-range" type="range" min="0" max="100" step="1" aria-label="Depth of field amount">
    </label>
  `;
  const dots = stage.querySelector('.turntable-dots');
  tracks.forEach(() => {
    const dot = document.createElement('span');
    dot.className = 'turntable-dot';
    dots.append(dot);
  });
  return stage;
}

async function initScene(block, tracks, state) {
  const THREE = await import('../../scripts/vendor/three.module.min.js');
  const { GLTFLoader } = await import('../../scripts/vendor/GLTFLoader.js');
  const { RoomEnvironment } = await import('../../scripts/vendor/RoomEnvironment.js');
  const { RectAreaLightUniformsLib } = await import('../../scripts/vendor/RectAreaLightUniformsLib.js');
  const { EffectComposer } = await import('../../scripts/vendor/EffectComposer.js');
  const { RenderPass } = await import('../../scripts/vendor/RenderPass.js');
  const { BokehPass } = await import('../../scripts/vendor/BokehPass.js');
  const container = block.querySelector('.turntable-canvas');
  const loading = block.querySelector('.turntable-loading');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 2.3, 4.8);
  const lookTarget = new THREE.Vector3(0, 0.7, 0);
  const camPose = { az: 0, h: 2.3, d: 4.8 };
  const camGoal = { az: 0, h: 2.3, d: 4.8 };
  const lightTarget = new THREE.Vector3(-3, 5, 2);
  const halfFov = Math.tan((camera.fov / 2) * (Math.PI / 180));
  // pull back on narrow viewports so the device always fits the frame
  function placeCamera() {
    const fit = 1.75 / (halfFov * Math.min(camera.aspect, 1.75));
    const d = Math.max(camPose.d, fit);
    camera.position.set(Math.sin(camPose.az) * d, camPose.h, Math.cos(camPose.az) * d);
    camera.lookAt(lookTarget);
  }
  placeCamera();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  // post: depth of field keeps the device crisp and lets the room fall away
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 5.0, aperture: 0, maxblur: 0 });
  composer.addPass(bokeh);

  // image-based light so the plastics and glass pick up reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const keyLight = new THREE.DirectionalLight(0xffd9ab, 2.9);
  keyLight.position.set(-3, 5, 2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.radius = 5;
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xaabbd0, 0.45);
  fillLight.position.set(3, 3, 3);
  scene.add(fillLight);
  scene.add(new THREE.HemisphereLight(0xffe8cc, 0x1a140e, 0.38));
  const rimLight = new THREE.PointLight(0xe8a317, 1.5, 14);
  rimLight.position.set(0, 2.4, -3);
  scene.add(rimLight);

  // the wall is a light source — its glow washes coloured bounce across the
  // desk wood and the vinyl's plastic, pulsing and shifting hue with the music
  RectAreaLightUniformsLib.init();
  const wallGlow = new THREE.RectAreaLight(0xd93025, 4, 26, 12);
  wallGlow.position.set(0, 6, -5.5);
  wallGlow.lookAt(0, 1, 0);
  scene.add(wallGlow);
  const wallGlowColor = new THREE.Color(0xd93025);

  // wallpaper — the shared animated psychedelic wall (one shader per pattern)
  const { uniforms: wallUniforms, patternMats, solidMat } = buildWallpaper(THREE);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), solidMat);
  wall.position.set(0, 7, -6);
  scene.add(wall);

  const deskCanvas = makeDeskGrain();
  const deskMap = new THREE.CanvasTexture(deskCanvas);
  deskMap.colorSpace = THREE.SRGBColorSpace;
  deskMap.wrapS = THREE.RepeatWrapping;
  deskMap.wrapT = THREE.RepeatWrapping;
  deskMap.repeat.set(7, 7);
  deskMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const deskBump = new THREE.CanvasTexture(deskCanvas);
  deskBump.wrapS = THREE.RepeatWrapping;
  deskBump.wrapT = THREE.RepeatWrapping;
  deskBump.repeat.set(7, 7);
  const tableMat = new THREE.MeshStandardMaterial({
    map: deskMap,
    bumpMap: deskBump,
    bumpScale: 0.6,
    roughness: 0.62,
    metalness: 0.08,
  });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  scene.fog = new THREE.Fog(0x000000, 9, 26);
  scene.background = new THREE.Color(0x1c1c1c);

  // environment color state — lerped toward targets each frame
  const env = {
    bg: new THREE.Color(0x1c1c1c),
    fg: new THREE.Color(0x2c2c2c),
    accent: new THREE.Color(0xd93025),
    table: new THREE.Color(0x3a3a3a),
    speed: 1,
    scale: 5,
  };
  const target = {
    bg: env.bg.clone(),
    fg: env.fg.clone(),
    accent: env.accent.clone(),
    table: env.table.clone(),
    speed: 1,
    scale: 5,
  };

  // a record sleeve propped on the table, showing the current track's cover art
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x0e0e0e, roughness: 0.82, metalness: 0.0,
  });
  const sleeve = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), sleeveMat);
  // lying flat on the table, front-right of the device, casually angled
  sleeve.position.set(1.3, 0.015, 0.8);
  sleeve.rotation.set(-Math.PI / 2, 0, 0.32);
  sleeve.castShadow = true;
  sleeve.receiveShadow = true;
  sleeve.visible = false;
  sleeve.userData.focusSize = 1.2; // how tall it reads when the camera zooms in
  scene.add(sleeve);

  // the desk prop the camera is currently zoomed onto (cover or notes), or null
  let focusObj = null;

  const sampleCanvas = document.createElement('canvas');
  let artworkToken = 0;

  /* Pull a palette from the cover: the average tone, plus the most vivid
     mid-bright pixel as an accent. Returns null on a tainted (non-CORS) canvas. */
  function samplePalette(img) {
    try {
      const S = 24;
      sampleCanvas.width = S;
      sampleCanvas.height = S;
      const c = sampleCanvas.getContext('2d');
      c.drawImage(img, 0, 0, S, S);
      const { data } = c.getImageData(0, 0, S, S);
      let ar = 0; let ag = 0; let ab = 0; let n = 0;
      let best = null; let bestScore = -1;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
        ar += r; ag += g; ab += b; n += 1;
        const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        const lum = (mx + mn) / 2;
        const score = sat * (1 - Math.abs(lum - 150) / 150);
        if (score > bestScore) { bestScore = score; best = [r, g, b]; }
      }
      return { avg: [ar / n, ag / n, ab / n], accent: best || [ar / n, ag / n, ab / n] };
    } catch (e) {
      return null;
    }
  }

  /* Drive the room colours from the cover instead of the style hash. */
  function applyPalette(pal) {
    const toColor = (rgb) => new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    const avg = toColor(pal.avg);
    target.bg.copy(avg).multiplyScalar(0.42);
    target.fg.copy(avg).multiplyScalar(1.15);
    target.accent.copy(toColor(pal.accent));
    target.table.copy(avg).multiplyScalar(0.55);
    if (state.reducedMotion) {
      env.bg.copy(target.bg);
      env.fg.copy(target.fg);
      env.accent.copy(target.accent);
      env.table.copy(target.table);
    }
  }

  function loadArtwork(url) {
    artworkToken += 1;
    const token = artworkToken;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (token !== artworkToken) return; // a newer track superseded this load
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      sleeveMat.map = tex;
      sleeveMat.color.set(0xffffff);
      sleeveMat.needsUpdate = true;
      sleeve.visible = true;
      const pal = samplePalette(img);
      if (pal) applyPalette(pal);
    };
    img.onerror = () => { if (token === artworkToken) sleeve.visible = false; };
    img.src = url;
  }

  state.setEnvironment = (track) => {
    if (track.wallpaper) {
      const {
        hues, pattern, speed, scale, pose,
      } = track.wallpaper;
      camGoal.az = pose.camAzimuth;
      camGoal.h = pose.camHeight;
      camGoal.d = pose.camDist;
      lightTarget.set(
        Math.sin(pose.lightAzimuth) * 4.5,
        pose.lightHeight,
        Math.cos(pose.lightAzimuth) * 4.5,
      );
      target.bg.setHSL(hues[0], 0.55, 0.14);
      target.fg.setHSL(hues[1], 0.55, 0.34);
      target.accent.setHSL(hues[2], 0.85, 0.55);
      target.table.setHSL(hues[0], 0.30, 0.16);
      target.speed = speed;
      target.scale = scale;
      wall.material = patternMats[pattern] || solidMat;
    } else {
      target.bg.set(track.room.wall);
      target.fg.set(track.room.wall).multiplyScalar(1.8);
      target.accent.set(track.room.glow);
      target.table.set(track.room.table);
      wall.material = solidMat;
      camGoal.az = 0;
      camGoal.h = 2.3;
      camGoal.d = 4.8;
      lightTarget.set(-3, 5, 2);
    }
    // cover art (when present) drives both the sleeve and the room palette,
    // overriding the hash/room colours above once it loads
    if (track.image) {
      loadArtwork(track.image);
    } else {
      artworkToken += 1;
      sleeve.visible = false;
      if (focusObj === sleeve) focusObj = null;
    }
    if (state.reducedMotion) {
      env.bg.copy(target.bg);
      env.fg.copy(target.fg);
      env.accent.copy(target.accent);
      env.table.copy(target.table);
      camPose.az = camGoal.az;
      camPose.h = camGoal.h;
      camPose.d = camGoal.d;
      placeCamera();
      keyLight.position.copy(lightTarget);
    }
    if (state.showNotes) state.showNotes(track);
  };

  // load the PS-F9
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().load(MODEL_PATH, resolve, (progress) => {
      if (progress.total) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        loading.querySelector('.turntable-loading-label').textContent = `Loading PS-F9… ${pct}%`;
      }
    }, reject);
  });

  const model = gltf.scene;
  const vinylMeshes = [];
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) child.material.envMapIntensity = 0.35;
      const mat = (child.material?.name || '').toLowerCase();
      if (mat === 'carbon' || mat === 'label') vinylMeshes.push(child);
    }
  });

  // scale to ~2 units and sit on the table
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(2.0 / Math.max(size.x, size.y, size.z));
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  scene.add(model);
  // compose world matrices NOW — the pivot center is measured from them
  model.updateMatrixWorld(true);

  // group vinyl meshes under a pivot, spin around the disc normal
  let vinyl = null;
  let spinAxis = null;
  if (vinylMeshes.length) {
    // measure the disc from the grooves mesh alone so the label can't bias it,
    // in LOCAL geometry space — the disc leans, so its true center and normal
    // must be transformed to world, not read off an axis-aligned box
    const disc = vinylMeshes.find((m) => (m.material?.name || '').toLowerCase() === 'carbon')
      || vinylMeshes[0];
    disc.geometry.computeBoundingBox();
    const localBox = disc.geometry.boundingBox;
    const localSize = localBox.getSize(new THREE.Vector3());
    const dims = [localSize.x, localSize.y, localSize.z];
    const thin = dims.indexOf(Math.min(...dims));
    const vinylCenter = disc.localToWorld(localBox.getCenter(new THREE.Vector3()));
    spinAxis = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ][thin].applyQuaternion(disc.getWorldQuaternion(new THREE.Quaternion())).normalize();
    vinyl = new THREE.Group();
    vinyl.position.copy(vinylCenter);
    scene.add(vinyl);
    vinylMeshes.forEach((m) => vinyl.attach(m));
  }

  const scaledBox = new THREE.Box3().setFromObject(model);
  lookTarget.set(0, (scaledBox.max.y - scaledBox.min.y) * 0.48, 0);
  camera.lookAt(lookTarget);
  loading.classList.add('turntable-done');

  // liner notes — an A4 sheet on the desk, per song. Built once, re-skinned when
  // the current track changes; click it and the camera eases down to read it,
  // click again (or anywhere) to return.
  const paper = createPaper(THREE, 0.72);
  // front-left of the device, so it sits beside the cover sleeve (front-right)
  paper.rotation.set(-Math.PI / 2, 0, -0.16);
  paper.position.set(-1.05, 0.02, 1.15);
  scene.add(paper);
  let focusBlend = 0;
  const pageNotes = findFragmentPath(block); // fallback when a track has none
  const notesCache = new Map();
  const pPos = new THREE.Vector3();
  const pCam = new THREE.Vector3();
  const pLook = new THREE.Vector3();
  state.showNotes = async (track) => {
    const path = (track && track.notes) || pageNotes;
    const hide = () => { paper.visible = false; if (focusObj === paper) focusObj = null; };
    if (!path) { hide(); return; }
    if (!notesCache.has(path)) notesCache.set(path, await loadNotesCanvas(path));
    const canvas = notesCache.get(path);
    if (!canvas) { hide(); return; }
    setPaperCanvas(THREE, paper, canvas);
    paper.visible = true;
  };

  // tap the device to play/pause; tap the sheet to read
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const setPointer = (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  };
  renderer.domElement.addEventListener('pointerdown', (e) => {
    setPointer(e);
    if (paper.visible && raycaster.intersectObject(paper).length) {
      focusObj = focusObj === paper ? null : paper;
      return;
    }
    if (sleeve.visible && raycaster.intersectObject(sleeve).length) {
      focusObj = focusObj === sleeve ? null : sleeve;
      return;
    }
    if (focusObj) { focusObj = null; return; }
    if (raycaster.intersectObject(model, true).length) state.requestPlay();
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    setPointer(e);
    const over = raycaster.intersectObject(model, true).length > 0
      || (paper.visible && raycaster.intersectObject(paper).length > 0)
      || (sleeve.visible && raycaster.intersectObject(sleeve).length > 0);
    renderer.domElement.style.cursor = over ? 'pointer' : 'default';
  });

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
    composer.setSize(clientWidth, clientHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let elapsed = 0;
  function frame() {
    if (!state.rendering) return;
    requestAnimationFrame(frame);
    const delta = clock.getDelta();
    // reduced-motion freezes time entirely; an unfocused window crawls at 1/100
    const timeScale = state.reducedMotion ? 0 : state.focusScale;
    elapsed += delta * timeScale;

    env.bg.lerp(target.bg, ENV_LERP);
    env.fg.lerp(target.fg, ENV_LERP);
    env.accent.lerp(target.accent, ENV_LERP);
    env.table.lerp(target.table, ENV_LERP);
    env.speed += (target.speed - env.speed) * ENV_LERP;
    env.scale += (target.scale - env.scale) * ENV_LERP;

    wallUniforms.uTime.value = elapsed;
    wallUniforms.uSpeed.value = env.speed;
    wallUniforms.uScale.value = env.scale;
    wallUniforms.uColA.value.copy(env.bg);
    wallUniforms.uColB.value.copy(env.fg);
    wallUniforms.uColC.value.copy(env.accent);

    // audio drive: real analysis when available, a slow breathing LFO otherwise
    const levels = state.playing ? state.getLevels() : null;
    if (levels && !state.reducedMotion) {
      wallUniforms.uBass.value += (levels.bass - wallUniforms.uBass.value) * 0.3;
      wallUniforms.uMid.value += (levels.mid - wallUniforms.uMid.value) * 0.3;
      wallUniforms.uTreble.value += (levels.treble - wallUniforms.uTreble.value) * 0.3;
    } else if (!state.reducedMotion) {
      const idle = (state.playing ? 0.22 : 0.08) + Math.sin(elapsed * 0.7) * 0.06;
      wallUniforms.uBass.value += (idle - wallUniforms.uBass.value) * 0.05;
      wallUniforms.uMid.value += (idle - wallUniforms.uMid.value) * 0.05;
      wallUniforms.uTreble.value += (0.05 - wallUniforms.uTreble.value) * 0.05;
    }

    if (!state.reducedMotion) {
      camPose.az += (camGoal.az - camPose.az) * 0.045;
      camPose.h += (camGoal.h - camPose.h) * 0.045;
      camPose.d += (camGoal.d - camPose.d) * 0.045;
      placeCamera();
      keyLight.position.lerp(lightTarget, 0.045);
    }

    // tapping a desk prop (cover or notes) blends the camera down onto it
    if (state.reducedMotion) placeCamera();
    focusBlend += ((focusObj ? 1 : 0) - focusBlend) * 0.06;
    if (focusObj && focusBlend > 0.001) {
      focusObj.getWorldPosition(pPos);
      const fs = focusObj.userData.focusSize ?? focusObj.userData.paperSize?.h ?? 1;
      pCam.set(pPos.x, pPos.y + fs * 1.55, pPos.z + fs * 0.5);
      camera.position.lerp(pCam, focusBlend);
      pLook.lerpVectors(lookTarget, pPos, focusBlend);
      camera.lookAt(pLook);
    }

    tableMat.color.copy(env.table);
    rimLight.color.copy(env.accent);
    scene.background.copy(env.bg);
    scene.fog.color.copy(env.bg);

    // the wall's emitted colour: the mid tone flashing toward the accent band,
    // brightness riding the bass — so the bounce on desk and vinyl breathes
    wallGlowColor.copy(env.fg).lerp(env.accent, 0.3 + wallUniforms.uMid.value * 0.55);
    wallGlow.color.copy(wallGlowColor);
    wallGlow.intensity = 3.0 + wallUniforms.uBass.value * 7.0 + wallUniforms.uMid.value * 2.5;

    const spinning = state.playing || window.location.hash === '#spin';
    if (vinyl && spinAxis && spinning && !state.reducedMotion) {
      vinyl.rotateOnAxis(spinAxis, SPIN_SPEED * delta * state.focusScale);
    }

    // focus tracks the device as the camera glides between rooms;
    // aperture/maxblur come from the live Focus slider (0 = everything sharp)
    bokeh.uniforms.focus.value = camera.position.distanceTo(lookTarget);
    bokeh.uniforms.aperture.value = state.dofAmount * 0.008;
    bokeh.uniforms.maxblur.value = state.dofAmount * 0.016;
    composer.render(delta);
  }
  state.startRender = () => {
    if (state.rendering) return;
    state.rendering = true;
    clock.getDelta();
    frame();
  };
  state.stopRender = () => {
    state.rendering = false;
  };
  // apply the (possibly deep-linked) current track's room now the scene exists
  state.setEnvironment(tracks[Math.max(0, state.current)]);
  state.startRender();
}

/* Apple artwork is a URL template with {w}/{h} placeholders; fill in a square. */
/*
 * The Apple Music side of the player. Wraps MusicKit v3, which is loaded lazily
 * from Apple's CDN the first time an Apple track is touched (a pure-Suno deck
 * never pays for it). The developer token comes from our worker's
 * /tools/apple-token endpoint; the listener supplies their own Music-User-Token
 * by authorizing once. Full playback needs an active Apple Music subscription —
 * when that's missing we fall back to the 30-second catalog preview.
 */
/* Turn parsed entries into the final ordered track list, expanding any Apple
   playlist/album references via the catalog API. Expansion failures drop that
   entry rather than breaking the whole deck. */
/* Fill in cover art for Apple tracks that don't already carry an image (authored
   per-song rows). One batched catalog call per storefront; failures are silent.
   Resolves to true if any track gained an image. */
export default async function decorate(block) {
  const entries = parseEntries(block);
  if (!entries.length) return;

  const tokenEndpoint = getMetadata('apple-token-endpoint') || '/tools/apple-token';
  const hasApple = entries.some((e) => e.kind === 'expand' || e.track.source === 'apple');
  const apple = hasApple ? createAppleBackend(tokenEndpoint) : null;

  const needsExpand = entries.some((e) => e.kind === 'expand');
  if (needsExpand) block.classList.add('turntable-resolving');
  const tracks = await resolveEntries(entries, apple, finalize);
  block.classList.remove('turntable-resolving');
  if (!tracks.length) { block.textContent = ''; return; }

  block.textContent = '';
  const stage = buildStage(tracks);
  const feed = document.createElement('div');
  feed.className = 'turntable-feed';
  feed.append(stage);
  tracks.forEach((track, i) => {
    const item = document.createElement('div');
    item.className = 'turntable-track';
    item.dataset.index = i;
    item.id = track.slug;
    item.setAttribute('aria-label', `${track.title} — ${track.artist}`);
    feed.append(item);
  });
  block.append(feed);

  const info = {
    source: stage.querySelector('.turntable-source'),
    artist: stage.querySelector('.turntable-artist'),
    title: stage.querySelector('.turntable-title'),
    meta: stage.querySelector('.turntable-meta'),
    status: stage.querySelector('.turntable-status'),
  };
  const playBtn = stage.querySelector('.turntable-play');
  const eject = stage.querySelector('.turntable-eject');
  const parent = window.location.pathname.replace(/\/[^/]*\/?$/, '');
  eject.href = parent || '/';
  const dots = [...stage.querySelectorAll('.turntable-dot')];
  const file = createAudioEngine();

  // Pre-warm MusicKit (load SDK + configure with the dev token) as soon as the
  // page has any Apple track, so that when the listener clicks "Connect Apple
  // Music" we can call authorize() synchronously inside the gesture — otherwise
  // the async config work makes Safari treat the sign-in popup as unsolicited.
  if (apple) apple.configure().catch(() => {});

  const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const dof = stage.querySelector('.turntable-dof');
  const dofRange = stage.querySelector('.turntable-dof-range');
  const dofValue = stage.querySelector('.turntable-dof-value');

  // the Focus slider is a dev-only tuning control; production is fixed at 20%
  const storedDofRaw = isLocalDev ? window.localStorage.getItem('trrrrdt-dof') : null;
  const storedDof = storedDofRaw === null ? NaN : Number(storedDofRaw);
  const state = {
    current: -1,
    playing: false,
    rendering: false,
    mode: 'full', // 'full' via MusicKit / file, or 'preview' when subscription is missing
    appleError: false,
    dofAmount: Number.isFinite(storedDof) && storedDof >= 0 ? storedDof : 0.2,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    // 1 when the window is focused, 0.01 when it isn't — the visualizer nearly
    // freezes (100× slower) while the listener is looking at another window,
    // instead of churning the GPU on animation nobody can see
    focusScale: document.hasFocus() ? 1 : 0.01,
    setEnvironment: () => {},
    // Apple's DRM stream is cross-origin, so no spectrum analysis there — fall
    // back to the idle LFO for Apple tracks; Suno tracks keep real analysis
    getLevels: () => (apple && apple.isActive() ? null : file.getLevels()),
    startRender: () => {},
    stopRender: () => {},
  };

  if (isLocalDev) {
    dofRange.value = String(Math.round(state.dofAmount * 100));
    dofValue.textContent = `${Math.round(state.dofAmount * 100)}%`;
    dofRange.addEventListener('input', () => {
      state.dofAmount = Number(dofRange.value) / 100;
      window.localStorage.setItem('trrrrdt-dof', String(state.dofAmount));
      dofValue.textContent = `${dofRange.value}%`;
    });
  } else {
    dof.remove();
  }

  function setMediaSession(track) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title, artist: track.artist, album: 'TRRRRDT Records',
      });
    }
  }

  function pauseAll() {
    file.pause();
    if (apple) apple.pause();
  }

  // Route a track to the right backend.
  // Throws { code: 'auth-required' } when an Apple track needs the listener to
  // connect and this wasn't a user gesture (so we can't open the auth popup).
  async function playTrack(track, userGesture) {
    if (track.source === 'apple' && apple) {
      file.pause();
      // Let MusicKit own Apple playback: it plays the FULL track for authorized
      // subscribers and a preview otherwise, and drives ended→advance either way.
      // (We used to fall back to a 30s file-engine clip, which masked full playback.)
      await apple.play(track.appleId, { userGesture, storefront: track.storefront });
      return 'full';
    }
    if (apple) { apple.setActive(false); apple.pause(); }
    await file.play(track.audio);
    return 'full';
  }

  function updateOverlay() {
    const track = tracks[state.current];
    const isApple = track.source === 'apple';
    const needsConnect = isApple && apple && !apple.isAuthorized() && !state.playing;
    info.artist.textContent = track.artist;
    info.title.textContent = track.title;
    info.meta.textContent = track.meta;
    block.classList.toggle('turntable-apple', isApple);
    block.classList.toggle('turntable-connect', needsConnect);

    // visible source badge for Apple tracks
    let source = '';
    if (isApple) source = state.appleError ? 'Apple Music unavailable' : 'Apple Music';
    info.source.textContent = source;

    let status = '';
    if (state.playing) {
      status = `Playing: ${track.title} by ${track.artist}`;
    } else if (isApple && state.appleError) {
      status = 'Apple Music unavailable right now';
    } else if (needsConnect) {
      status = 'Connect your Apple Music account to play the full song';
    }
    info.status.textContent = status;

    playBtn.disabled = !track.playable;
    playBtn.setAttribute('aria-pressed', String(state.playing));
    if (!track.playable) playBtn.textContent = 'Not yet pressed';
    else if (state.playing) playBtn.textContent = 'Lift the needle';
    else if (isApple && apple && !apple.isAuthorized()) playBtn.textContent = 'Connect Apple Music';
    else playBtn.textContent = 'Drop the needle';

    dots.forEach((d, i) => d.classList.toggle('turntable-dot-active', i === state.current));
  }

  async function setTrack(i, autoplay) {
    if (i === state.current || !tracks[i]) return;
    state.current = i;
    state.appleError = false;
    const track = tracks[i];
    // keep the URL on the current song so it's shareable (no scroll, no reload)
    if (window.location.hash !== `#${track.slug}` && window.location.hash !== '#spin') {
      window.history.replaceState(null, '', `#${track.slug}`);
    }
    state.setEnvironment(track);
    if ((autoplay || state.playing) && track.playable) {
      try {
        // scroll-driven autoplay is not a user gesture → can't open the Apple popup
        state.mode = await playTrack(track, false);
        state.playing = true;
        setMediaSession(track);
      } catch (e) {
        state.playing = false; // e.g. auth-required: show the Connect affordance
      }
    } else if (!track.playable) {
      pauseAll();
      state.playing = false;
    }
    updateOverlay();
  }

  state.togglePlay = async () => {
    const track = tracks[state.current];
    if (!track?.playable) return;
    if (state.playing) {
      pauseAll();
      state.playing = false;
    } else {
      playBtn.textContent = 'Cueing…';
      try {
        state.mode = await playTrack(track, true); // user gesture → may authorize
        state.playing = true;
        setMediaSession(track);
      } catch (e) {
        state.playing = false;
        state.appleError = e.code !== 'auth-required';
      }
    }
    updateOverlay();
  };

  // Entry point for every user-initiated play (button click or device tap). If
  // the current Apple track needs authorization and MusicKit is already
  // configured, open the sign-in popup *synchronously* here — inside the gesture
  // — so Safari doesn't block it; then start playback. Everything else defers to
  // togglePlay.
  state.requestPlay = () => {
    const track = tracks[state.current];
    if (track?.source === 'apple' && apple && !state.playing
      && apple.isConfigured() && !apple.isAuthorized()) {
      playBtn.textContent = 'Connecting…';
      apple.authorize()
        .then(() => state.togglePlay())
        .catch(() => updateOverlay()); // popup dismissed/denied → back to Connect
      return;
    }
    state.togglePlay();
  };

  playBtn.addEventListener('click', () => state.requestPlay());
  const advance = () => {
    const next = feed.querySelector(`.turntable-track[data-index="${state.current + 1}"]`);
    if (next) {
      next.scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth' });
    } else {
      state.playing = false;
      updateOverlay();
    }
  };
  file.onEnded(advance);
  if (apple) {
    apple.onEnded(advance);
    // relabel the button ("Connect Apple Music" → play/pause) the moment the
    // listener finishes signing in, without waiting for the next render
    apple.onAuthChange(() => updateOverlay());
  }

  // active track follows scroll
  const trackObserver = new IntersectionObserver((obsEntries) => {
    obsEntries.forEach((entry) => {
      if (entry.isIntersecting) setTrack(Number(entry.target.dataset.index), false);
    });
  }, { threshold: 0.6 });
  feed.querySelectorAll('.turntable-track').forEach((t) => trackObserver.observe(t));

  // render only while on screen
  const stageObserver = new IntersectionObserver((obsEntries) => {
    obsEntries.forEach((entry) => {
      if (entry.isIntersecting) state.startRender();
      else state.stopRender();
    });
  });
  stageObserver.observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.stopRender();
    else state.startRender();
  });
  // a visible-but-unfocused window keeps rendering, but the visualizer crawls
  window.addEventListener('blur', () => { state.focusScale = 0.01; });
  window.addEventListener('focus', () => { state.focusScale = 1; });

  // deep-link: start on the track named in the URL hash (#song-slug or #N)
  function hashToIndex() {
    const h = decodeURIComponent((window.location.hash || '').replace(/^#/, '')).toLowerCase();
    if (!h || h === 'spin') return 0;
    const bySlug = tracks.findIndex((t) => t.slug === h);
    if (bySlug >= 0) return bySlug;
    const n = Number(h);
    if (Number.isInteger(n) && n >= 1 && n <= tracks.length) return n - 1;
    return 0;
  }
  const startIndex = hashToIndex();
  if (startIndex > 0) {
    const el = feed.querySelector(`.turntable-track[data-index="${startIndex}"]`);
    if (el) el.scrollIntoView({ behavior: 'auto' });
  }
  setTrack(startIndex, false);

  // 3D is progressive enhancement: without WebGL the overlay still plays audio
  try {
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) {
      throw new Error('no webgl');
    }
    initScene(block, tracks, state).catch(() => block.classList.add('turntable-no-3d'));
  } catch (e) {
    block.classList.add('turntable-no-3d');
  }

  // pull Apple Music cover art in the background (authored song rows carry no
  // <img>); when it lands, refresh the current track so its sleeve + palette
  // load without having blocked first paint
  if (apple) {
    hydrateArtwork(tracks, apple).then((changed) => {
      if (changed) state.setEnvironment(tracks[state.current]);
    });
  }
}
