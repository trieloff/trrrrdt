import { toClassName, getMetadata } from '../../scripts/aem.js';
import PATTERNS from './patterns/index.js';

const MODEL_PATH = '/models/psf9.glb';
const FADE_MS = 400;
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

/* djb2 — the style prompt is the seed; same prompt, same room, forever */
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; // eslint-disable-line no-bitwise
  }
  return h;
}

/*
 * Derive a wallpaper from a style prompt: background, foreground, accent
 * hues plus a pattern and its motion parameters, all from the hash bits.
 */
function wallpaperFromStyle(style) {
  /* eslint-disable no-bitwise */
  const h = hashString(style.toLowerCase());
  const hueA = h % 360;
  const hueB = (hueA + 120 + ((h >>> 3) % 100)) % 360;
  const hueC = (hueA + 180 + ((h >>> 7) % 80)) % 360;
  const pattern = (h >>> 9) % PATTERNS.length;
  const speed = 0.4 + ((h >>> 13) % 100) / 90;
  const scale = 3 + ((h >>> 17) % 6);
  // remix for an independent second draw: where you stand in the room
  const h2 = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  const pose = {
    camAzimuth: ((h2 % 200) / 200 - 0.5) * 1.0,
    camHeight: 1.8 + (((h2 >>> 8) % 100) / 100) * 0.95,
    camDist: 4.4 + (((h2 >>> 16) % 100) / 100) * 1.2,
    lightAzimuth: (((h2 >>> 4) % 200) / 200 - 0.5) * 2.4,
    lightHeight: 3.5 + (((h2 >>> 12) % 100) / 100) * 2.5,
  };
  /* eslint-enable no-bitwise */
  return {
    hues: [hueA / 360, hueB / 360, hueC / 360],
    pattern,
    speed,
    scale,
    pose,
  };
}

/* URL-safe slug from a title — ASCII survives, diacritics strip, Cyrillic/CJK
   drop out (the romanised part usually remains); empty falls back to track-N */
function slugify(str) {
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* Recognise an Apple Music web link and pull the catalog id + kind out of it.
   Songs:    music.apple.com/{sf}/song/{slug}/{id}
             music.apple.com/{sf}/album/{slug}/{albumId}?i={songId}
   Playlists music.apple.com/{sf}/playlist/{slug}/{pl.xxxx}
   Albums    music.apple.com/{sf}/album/{slug}/{albumId}   (no ?i — whole album) */
function classifyAppleUrl(href) {
  let u;
  try { u = new URL(href); } catch (e) { return null; }
  if (!/(^|\.)music\.apple\.com$/.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const storefront = /^[a-z]{2}$/.test(parts[0] || '') ? parts[0] : 'us';
  const type = parts[1];
  const last = parts[parts.length - 1] || '';
  const songParam = u.searchParams.get('i');
  if (songParam) return { kind: 'song', id: songParam, storefront };
  if (type === 'song') return { kind: 'song', id: last, storefront };
  if (type === 'playlist') return { kind: 'playlist', id: last, storefront };
  if (type === 'album') return { kind: 'album', id: last, storefront };
  return null;
}

/* Build a partial track from a block row. Apple rows carry an appleId instead of
   an <audio> src; plain rows keep the mp3 href. finalize() adds slug/wallpaper/room. */
function rowToEntry(cells) {
  const title = cells[0]?.textContent?.trim() || '';
  const link = cells[3]?.querySelector('a')?.href
    || [...cells].map((c) => c.querySelector('a')?.href).find(Boolean)
    || '';
  const apple = classifyAppleUrl(link);
  if (apple && (apple.kind === 'playlist' || apple.kind === 'album')) {
    return { kind: 'expand', apple };
  }
  const artist = cells[1]?.textContent?.trim() || '';
  const partial = {
    title,
    artist,
    meta: cells[2]?.textContent?.trim() || '',
    style: cells[4]?.textContent?.trim() || '',
    source: apple ? 'apple' : 'file',
    appleId: apple ? apple.id : null,
    storefront: apple ? apple.storefront : 'us',
    audio: apple ? '' : link,
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

function createAudioEngine() {
  const players = [new Audio(), new Audio()];
  players.forEach((p) => {
    p.preload = 'auto';
    p.loop = false;
    // Suno's CDN sends ACAO:* — anonymous mode keeps Web Audio analysis legal
    p.crossOrigin = 'anonymous';
  });
  let active = 0;
  let fadeFrame = null;
  let analyser = null;
  let freqData = null;
  const levels = { bass: 0, mid: 0, treble: 0 };

  function ensureAnalyser() {
    if (analyser !== null) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      players.forEach((p) => {
        const source = ctx.createMediaElementSource(p);
        source.connect(analyser);
      });
      analyser.connect(ctx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      analyser = false; // tried and failed — stay element-only, no analysis
    }
  }

  function fadeTo(inPlayer, outPlayer) {
    if (fadeFrame) cancelAnimationFrame(fadeFrame);
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / FADE_MS, 1);
      inPlayer.volume = t;
      outPlayer.volume = 1 - t;
      if (t < 1) {
        fadeFrame = requestAnimationFrame(step);
      } else {
        outPlayer.pause();
        fadeFrame = null;
      }
    }
    fadeFrame = requestAnimationFrame(step);
  }

  function bandAverage(from, to) {
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += freqData[i];
    return sum / ((to - from) * 255);
  }

  return {
    async play(src) {
      ensureAnalyser();
      const next = players[1 - active];
      const prev = players[active];
      if (next.src !== src) next.src = src;
      next.volume = 0;
      await next.play();
      active = 1 - active;
      fadeTo(next, prev);
    },
    pause() {
      players.forEach((p) => p.pause());
    },
    onEnded(callback) {
      players.forEach((p) => p.addEventListener('ended', () => {
        if (p === players[active]) callback();
      }));
    },
    /* bass / mid / treble in 0..1, or null when analysis is unavailable */
    getLevels() {
      if (!analyser || !freqData) return null;
      analyser.getByteFrequencyData(freqData);
      // 128 bins over ~24kHz: bass <560Hz, mid <4.5kHz, treble above
      levels.bass = bandAverage(1, 4);
      levels.mid = bandAverage(4, 24);
      levels.treble = bandAverage(24, 96);
      return levels;
    },
  };
}

/*
 * Procedural desk grain — long wandering streaks plus speckle, drawn once
 * on a canvas. Grayscale so the room palette tints it via material.color.
 */
function makeDeskGrain() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b0a89c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 320; i += 1) {
    const y0 = Math.random() * size;
    const amp = 1.5 + Math.random() * 3;
    const period = 90 + Math.random() * 260;
    const alpha = 0.05 + Math.random() * 0.09;
    const shade = Math.random() > 0.42 ? 30 : 235;
    ctx.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const y = y0 + Math.sin(((x / period) + i) * Math.PI * 2) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // occasional knots
  for (let i = 0; i < 3; i += 1) {
    const kx = Math.random() * size;
    const ky = Math.random() * size;
    const kr = 3 + Math.random() * 9;
    const grad = ctx.createRadialGradient(kx, ky, 1, kx, ky, kr);
    grad.addColorStop(0, 'rgba(40, 36, 30, 0.5)');
    grad.addColorStop(1, 'rgba(40, 36, 30, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI * 2);
    ctx.fill();
  }
  // fine speckle
  for (let i = 0; i < 5000; i += 1) {
    const v = Math.floor(Math.random() * 70);
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.05)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
  }
  return canvas;
}

/* psychedelic wallpaper — five patterns, colors and motion from the style hash */
const WALLPAPER_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * Shared wallpaper fragment. Each pattern module (patterns/*.js) supplies a
 * `float field(vec2 p, float t)`; this wrapper injects it at __FIELD__, then owns
 * the colour mapping, the mid-driven accent band, treble sparkle, and vignette.
 * One shader is compiled per pattern and they all share the same uniforms.
 */
const WALLPAPER_FRAGMENT_TEMPLATE = `
  precision highp float;
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uSpeed;
  uniform float uScale;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  varying vec2 vUv;

  __FIELD__

  void main() {
    // plane is ~30x14 units — square up the coordinate system
    vec2 p = vUv * vec2(2.143, 1.0);
    float t = uTime * uSpeed;
    float v = field(p, t);

    float m = smoothstep(-0.9, 0.9, v);
    vec3 col = mix(uColA, uColB, m);

    // accent band pulses with the mids
    float band = smoothstep(0.82 - uMid * 0.35, 1.0, v);
    col = mix(col, uColC, band * (0.4 + uMid * 0.6));

    // treble sparkle — analog noise floor
    float n = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * (0.03 + uTreble * 0.10);

    // vignette so the device stays the subject
    float vig = smoothstep(1.35, 0.3, length(vUv - vec2(0.5, 0.55)));
    col *= mix(0.4, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* Fallback wall for tracks with no style prompt: a flat, vignetted room colour. */
const WALLPAPER_SOLID_FRAGMENT = `
  precision highp float;
  uniform vec3 uColA;
  varying vec2 vUv;
  void main() {
    float vig = smoothstep(1.35, 0.3, length(vUv - vec2(0.5, 0.55)));
    gl_FragColor = vec4(uColA * mix(0.4, 1.0, vig), 1.0);
  }
`;

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

  // wallpaper — the animated psychedelic wall
  const wallUniforms = {
    uTime: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uTreble: { value: 0 },
    uSpeed: { value: 1 },
    uScale: { value: 5 },
    uColA: { value: new THREE.Color(0x1c1c1c) },
    uColB: { value: new THREE.Color(0x2c2c2c) },
    uColC: { value: new THREE.Color(0xd93025) },
  };
  // one shader per pattern module — all share these uniforms, swapped per track
  const patternMats = PATTERNS.map((pat) => new THREE.ShaderMaterial({
    uniforms: wallUniforms,
    vertexShader: WALLPAPER_VERTEX,
    fragmentShader: WALLPAPER_FRAGMENT_TEMPLATE.replace('__FIELD__', pat.glsl),
  }));
  const solidMat = new THREE.ShaderMaterial({
    uniforms: wallUniforms,
    vertexShader: WALLPAPER_VERTEX,
    fragmentShader: WALLPAPER_SOLID_FRAGMENT,
  });
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

  // tap the device to play/pause
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(model, true).length) state.requestPlay();
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const over = raycaster.intersectObject(model, true).length > 0;
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

const MUSICKIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';

function msToClock(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function appleSongToTrack(song, storefront) {
  const a = song.attributes || {};
  const genre = (a.genreNames && a.genreNames[0]) || '';
  const dur = a.durationInMillis ? msToClock(a.durationInMillis) : '';
  return {
    title: a.name || 'Untitled',
    artist: a.artistName || '',
    meta: [genre, dur].filter(Boolean).join(' · '),
    style: (a.genreNames && a.genreNames.join(', ')) || a.artistName || '',
    source: 'apple',
    appleId: song.id,
    storefront,
    audio: '',
    playable: true,
  };
}

/*
 * The Apple Music side of the player. Wraps MusicKit v3, which is loaded lazily
 * from Apple's CDN the first time an Apple track is touched (a pure-Suno deck
 * never pays for it). The developer token comes from our worker's
 * /tools/apple-token endpoint; the listener supplies their own Music-User-Token
 * by authorizing once. Full playback needs an active Apple Music subscription —
 * when that's missing we fall back to the 30-second catalog preview.
 */
function createAppleBackend(tokenEndpoint) {
  let configurePromise = null;
  let music = null;
  let active = false;
  const listeners = { ended: () => {}, authChange: () => {} };

  async function fetchToken() {
    const res = await fetch(tokenEndpoint, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`apple token ${res.status}`);
    const data = await res.json();
    if (!data.token) throw new Error('apple token missing');
    return data.token;
  }

  function loadScript() {
    return new Promise((resolve, reject) => {
      if (window.MusicKit) { resolve(); return; }
      let s = document.querySelector('script[data-musickit]');
      if (!s) {
        s = document.createElement('script');
        s.src = MUSICKIT_SRC;
        s.async = true;
        s.dataset.musickit = '';
        document.head.append(s);
      }
      document.addEventListener('musickitloaded', () => resolve(), { once: true });
      s.addEventListener('error', () => reject(new Error('musickit failed to load')));
    });
  }

  function configure() {
    if (configurePromise) return configurePromise;
    configurePromise = (async () => {
      await loadScript();
      const token = await fetchToken();
      music = await window.MusicKit.configure({
        developerToken: token,
        app: { name: 'TRRRRDT Records', build: '1.0' },
      }) || window.MusicKit.getInstance();
      music.addEventListener('playbackStateDidChange', ({ state }) => {
        const S = window.MusicKit.PlaybackStates;
        if (active && (state === S.completed || state === S.ended)) listeners.ended();
      });
      // fires when the listener signs in/out — lets the UI relabel the button
      // from "Connect Apple Music" the instant authorization completes
      music.addEventListener('authorizationStatusDidChange', () => listeners.authChange());
      return music;
    })();
    // a transient token/network failure shouldn't poison the whole session —
    // drop the cached rejection so the next interaction can retry
    configurePromise.catch(() => { configurePromise = null; });
    return configurePromise;
  }

  async function catalog(path, params) {
    const m = await configure();
    const res = await m.api.music(path, params);
    return (res && res.data) || res;
  }

  return {
    configure,
    onEnded(cb) { listeners.ended = cb; },
    onAuthChange(cb) { listeners.authChange = cb; },
    setActive(v) { active = v; },
    isActive: () => active,
    isConfigured: () => !!music,
    isAuthorized: () => !!(music && music.isAuthorized),
    // must be called synchronously inside a user gesture — MusicKit opens a
    // sign-in popup and Safari blocks it otherwise
    authorize: () => (music ? music.authorize() : Promise.reject(new Error('not configured'))),
    async play(appleId, { userGesture }) {
      const m = await configure();
      if (!m.isAuthorized) {
        if (!userGesture) {
          const e = new Error('authorization required');
          e.code = 'auth-required';
          throw e;
        }
        await m.authorize();
      }
      await m.setQueue({ songs: [appleId] });
      await m.play();
      active = true;
    },
    pause() { if (music && active) music.pause(); },
    async expand({ kind, id, storefront }) {
      const rel = kind === 'album' ? 'albums' : 'playlists';
      const body = await catalog(`/v1/catalog/${storefront}/${rel}/${id}`, { include: 'tracks', 'limit[tracks]': 100 });
      const tracks = body?.data?.[0]?.relationships?.tracks?.data || [];
      return tracks
        .filter((s) => s.type === 'songs')
        .map((s) => appleSongToTrack(s, storefront));
    },
  };
}

/* Turn parsed entries into the final ordered track list, expanding any Apple
   playlist/album references via the catalog API. Expansion failures drop that
   entry rather than breaking the whole deck. */
async function resolveEntries(entries, apple) {
  const resolved = await Promise.all(entries.map(async (e) => {
    if (e.kind === 'track') return [e.track];
    if (!apple) return [];
    try { return await apple.expand(e.apple); } catch (err) { return []; }
  }));
  return resolved.flat().map((t, i) => finalize(t, i));
}

export default async function decorate(block) {
  const entries = parseEntries(block);
  if (!entries.length) return;

  const tokenEndpoint = getMetadata('apple-token-endpoint') || '/tools/apple-token';
  const hasApple = entries.some((e) => e.kind === 'expand' || e.track.source === 'apple');
  const apple = hasApple ? createAppleBackend(tokenEndpoint) : null;

  const needsExpand = entries.some((e) => e.kind === 'expand');
  if (needsExpand) block.classList.add('turntable-resolving');
  const tracks = await resolveEntries(entries, apple);
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
      await apple.play(track.appleId, { userGesture });
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
}
