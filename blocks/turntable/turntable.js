import { toClassName } from '../../scripts/aem.js';

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
  const pattern = (h >>> 9) % 5;
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

function parseTracks(block) {
  const tracks = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const title = cells[0]?.textContent?.trim();
    if (!title) return;
    const artist = cells[1]?.textContent?.trim() || '';
    const style = cells[4]?.textContent?.trim() || '';
    tracks.push({
      title,
      artist,
      meta: cells[2]?.textContent?.trim() || '',
      audio: cells[3]?.querySelector('a')?.href || '',
      style,
      wallpaper: style ? wallpaperFromStyle(style) : null,
      room: ROOMS[toClassName(artist)] || ROOMS.default,
    });
  });
  return tracks;
}

function buildStage(tracks) {
  const stage = document.createElement('div');
  stage.className = 'turntable-stage';
  stage.innerHTML = `
    <div class="turntable-canvas"></div>
    <div class="turntable-loading"><span class="turntable-spinner"></span><span class="turntable-loading-label">Loading PS-F9…</span></div>
    <div class="turntable-info">
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

const WALLPAPER_FRAGMENT = `
  precision highp float;
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uSpeed;
  uniform float uScale;
  uniform int uPattern;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  varying vec2 vUv;

  float wave(vec2 p, float t) {
    // liquid stripes — tape warp
    float x = p.x * uScale + sin(p.y * 2.5 + t) * (0.35 + uBass * 1.2);
    return sin(x * 6.2831);
  }

  float rings(vec2 p, float t) {
    float d = length(p - vec2(1.07, 0.5));
    return sin(d * uScale * 6.0 - t * 2.0 - uBass * 4.0);
  }

  float plasma(vec2 p, float t) {
    float v = sin(p.x * uScale + t);
    v += sin((p.y * uScale + t) * 0.7);
    v += sin((p.x + p.y) * uScale * 0.6 + t * 1.3 + uBass * 3.0);
    v += sin(length(p - 0.5) * uScale * 1.5 - t);
    return sin(v * 1.5708);
  }

  float moire(vec2 p, float t) {
    float a = t * 0.08;
    mat2 r1 = mat2(cos(a), -sin(a), sin(a), cos(a));
    mat2 r2 = mat2(cos(-a * 1.3), -sin(-a * 1.3), sin(-a * 1.3), cos(-a * 1.3));
    vec2 q1 = r1 * (p - 0.5) * (uScale * 2.0 + uBass * 3.0);
    vec2 q2 = r2 * (p - 0.5) * (uScale * 2.0);
    float c1 = step(0.0, sin(q1.x * 6.2831) * sin(q1.y * 6.2831));
    float c2 = step(0.0, sin(q2.x * 6.2831) * sin(q2.y * 6.2831));
    return c1 * (1.0 - c2) + c2 * (1.0 - c1);
  }

  float rays(vec2 p, float t) {
    vec2 d = p - vec2(1.07, 0.42);
    float ang = atan(d.y, d.x);
    return sin(ang * uScale + t + uBass * 2.0 + length(d) * 3.0);
  }

  void main() {
    // plane is ~30x14 units — square up the coordinate system
    vec2 p = vUv * vec2(2.143, 1.0);
    float t = uTime * uSpeed;
    float v = 0.0;
    if (uPattern == 0) v = wave(p, t);
    else if (uPattern == 1) v = rings(p, t);
    else if (uPattern == 2) v = plasma(p, t);
    else if (uPattern == 3) v = moire(p, t) * 2.0 - 1.0;
    else if (uPattern == 4) v = rays(p, t);

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

    if (uPattern < 0) col = uColA;
    gl_FragColor = vec4(col, 1.0);
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
    uPattern: { value: -1 },
    uColA: { value: new THREE.Color(0x1c1c1c) },
    uColB: { value: new THREE.Color(0x2c2c2c) },
    uColC: { value: new THREE.Color(0xd93025) },
  };
  const wallMat = new THREE.ShaderMaterial({
    uniforms: wallUniforms,
    vertexShader: WALLPAPER_VERTEX,
    fragmentShader: WALLPAPER_FRAGMENT,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wallMat);
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
      wallUniforms.uPattern.value = pattern;
    } else {
      target.bg.set(track.room.wall);
      target.fg.set(track.room.wall).multiplyScalar(1.8);
      target.accent.set(track.room.glow);
      target.table.set(track.room.table);
      wallUniforms.uPattern.value = -1;
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
    if (raycaster.intersectObject(model, true).length) state.togglePlay();
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
    if (!state.reducedMotion) elapsed += delta;

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
      vinyl.rotateOnAxis(spinAxis, SPIN_SPEED * delta);
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
  state.startRender();
}

export default function decorate(block) {
  const tracks = parseTracks(block);
  if (!tracks.length) return;

  block.textContent = '';
  const stage = buildStage(tracks);
  const feed = document.createElement('div');
  feed.className = 'turntable-feed';
  feed.append(stage);
  tracks.forEach((track, i) => {
    const item = document.createElement('div');
    item.className = 'turntable-track';
    item.dataset.index = i;
    item.setAttribute('aria-label', `${track.title} — ${track.artist}`);
    feed.append(item);
  });
  block.append(feed);

  const info = {
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
  const audio = createAudioEngine();

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
    dofAmount: Number.isFinite(storedDof) && storedDof >= 0 ? storedDof : 0.2,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    setEnvironment: () => {},
    getLevels: () => audio.getLevels(),
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

  function updateOverlay() {
    const track = tracks[state.current];
    info.artist.textContent = track.artist;
    info.title.textContent = track.title;
    info.meta.textContent = track.meta;
    info.status.textContent = state.playing
      ? `Playing: ${track.title} by ${track.artist}` : '';
    playBtn.textContent = state.playing ? 'Lift the needle' : 'Drop the needle';
    playBtn.setAttribute('aria-pressed', String(state.playing));
    playBtn.disabled = !track.audio;
    if (!track.audio) playBtn.textContent = 'Not yet pressed';
    dots.forEach((d, i) => d.classList.toggle('turntable-dot-active', i === state.current));
  }

  async function setTrack(i, autoplay) {
    if (i === state.current || !tracks[i]) return;
    state.current = i;
    const track = tracks[i];
    state.setEnvironment(track);
    if ((autoplay || state.playing) && track.audio) {
      try {
        await audio.play(track.audio);
        state.playing = true;
        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: 'TRRRRDT Records',
          });
        }
      } catch (e) {
        state.playing = false;
      }
    } else if (!track.audio) {
      audio.pause();
      state.playing = false;
    }
    updateOverlay();
  }

  state.togglePlay = async () => {
    const track = tracks[state.current];
    if (!track?.audio) return;
    if (state.playing) {
      audio.pause();
      state.playing = false;
    } else {
      playBtn.textContent = 'Cueing…';
      try {
        await audio.play(track.audio);
        state.playing = true;
      } catch (e) {
        state.playing = false;
      }
    }
    updateOverlay();
  };

  playBtn.addEventListener('click', () => state.togglePlay());
  audio.onEnded(() => {
    const next = feed.querySelector(`.turntable-track[data-index="${state.current + 1}"]`);
    if (next) {
      next.scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth' });
    } else {
      state.playing = false;
      updateOverlay();
    }
  });

  // active track follows scroll
  const trackObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) setTrack(Number(entry.target.dataset.index), false);
    });
  }, { threshold: 0.6 });
  feed.querySelectorAll('.turntable-track').forEach((t) => trackObserver.observe(t));

  // render only while on screen
  const stageObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) state.startRender();
      else state.stopRender();
    });
  });
  stageObserver.observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.stopRender();
    else state.startRender();
  });

  setTrack(0, false);

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
