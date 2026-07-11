import { getMetadata } from '../../scripts/aem.js';
import createAudioEngine from '../../scripts/player/audio.js';
import { createAppleBackend, classifyAppleUrl, hydrateArtwork } from '../../scripts/player/apple.js';
import { wallpaperFromStyle, buildWallpaper, makeDeskGrain } from '../../scripts/player/visualizer.js';
import { slugify, resolveEntries } from '../../scripts/player/content.js';
import { createCurrentTrackButton } from '../../scripts/player/save-offline.js';
import createLamp from '../../scripts/player/lamp.js';
import {
  findFragmentPath, loadNotesCanvas, createPaper, setPaperCanvas, isNotesLink, notesPathOf,
} from '../../scripts/player/linernotes.js';
import { physicalScale, A5_MM, YUNOST_402_HEIGHT_MM } from '../../scripts/player/scale.js';

const MODEL_PATH = '/models/yunost.glb';
const ENV_LERP = 0.05;

/*
 * Where the picture sits on the TV. The Yunost-402 is a single baked mesh, so
 * the "screen" is a plane placed over its front face. Values are fractions of
 * the scaled model box (tuned visually); a video/image texture rides on it.
 */
/* The picture rides the model's actual screen-glass mesh (TVunost402_11), so the
   shader is unlit and just does CRT feel: a subtle content bulge, scanlines,
   static/snow and audio-driven brightness. The tube's real geometry gives the
   rounded corners and curve. */
const CRT_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CRT_FRAGMENT = `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uStatic;   // 0 = clean picture, 1 = pure snow (no signal)
  uniform float uLevel;    // audio energy 0..1, brightens the tube
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 uv = vUv - 0.5;
    float r2 = dot(uv, uv);
    vec2 tuv = uv * (1.0 + 0.06 * r2) + 0.5;   // subtle content bulge

    vec3 col;
    if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) col = vec3(0.02);
    else col = texture2D(uTex, tuv).rgb;

    col *= 1.02 + 0.3 * uLevel;                              // brightness rides the audio
    col *= 0.82 + 0.18 * sin(vUv.y * 620.0);                 // scanlines
    col *= 0.97 + 0.03 * sin(vUv.y * 5.0 - uTime * 1.7);     // slow roll bar
    float n = hash(vUv * (fract(uTime) * 240.0 + 1.0));
    col += (n - 0.5) * (0.05 + uStatic * 0.7);               // static grain
    col = mix(col, vec3(n), uStatic * 0.85);                 // no-signal snow
    float vig = smoothstep(0.9, 0.3, length(uv));            // faint tube vignette
    col *= mix(0.72, 1.12, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* A channel is one row: title, meta, screen media (image|video), optional audio
   track, style prompt for the wallpaper. The picture is on the tube; the audio
   is either its own track (Suno/Apple) or, if none is authored and the screen is
   a video, the video's own sound. */
function rowToEntry(cells) {
  // the title is the first cell's text, but skip any liner-notes link an author
  // tucked into the same cell (otherwise it corrupts the title and its slug)
  const cell0 = cells[0];
  const titleP = cell0 && [...cell0.querySelectorAll('p')].find((p) => !p.querySelector('a'));
  const title = (titleP?.textContent || cell0?.textContent || '').trim();
  const links = [...cells].map((c) => c.querySelector('a')?.href);
  const img = [...cells].map((c) => c.querySelector('img')?.src).find(Boolean) || '';
  // screen media: an <img>, or a link that looks like a video/image file
  const mediaLink = links.find((h) => h && /\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(h)) || '';
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(mediaLink);
  const screen = img || mediaLink;
  // audio: an Apple link, or an mp3/audio link that isn't the screen media
  const audioLink = links.find((h) => h && (classifyAppleUrl(h) || /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(h)) && h !== mediaLink) || '';
  const notes = links.find((h) => h && isNotesLink(h)); // per-channel liner notes
  const apple = classifyAppleUrl(audioLink);
  if (apple && (apple.kind === 'playlist' || apple.kind === 'album')) {
    return { kind: 'expand', apple };
  }
  return {
    kind: 'track',
    track: {
      title,
      meta: cells[1]?.textContent?.trim() || '',
      screen,
      screenIsVideo: isVideo,
      image: img,
      style: cells[4]?.textContent?.trim() || '',
      source: apple ? 'apple' : 'file',
      appleId: apple ? apple.id : null,
      storefront: apple ? apple.storefront : 'us',
      audio: apple ? '' : audioLink,
      notes: notes ? notesPathOf(notes) : '',
      // playable when there's an audio track OR a video that carries its own sound
      playable: !!(audioLink || apple || isVideo),
    },
  };
}

function parseEntries(block) {
  return [...block.children]
    .map((row) => rowToEntry([...row.children]))
    .filter((e) => e.kind === 'expand' || e.track.title || e.track.screen);
}

function finalize(t, i) {
  const style = t.style || t.artist || '';
  // Apple-expanded rows arrive with artwork as image → use it as the screen too
  const screen = t.screen || t.image || '';
  return {
    ...t,
    style,
    screen,
    screenIsVideo: t.screenIsVideo || false,
    slug: slugify(t.title || '') || `channel-${i + 1}`,
    wallpaper: style ? wallpaperFromStyle(style) : null,
  };
}

function buildStage(tracks) {
  const stage = document.createElement('div');
  stage.className = 'yunost-stage';
  stage.innerHTML = `
    <div class="yunost-canvas"></div>
    <div class="yunost-loading"><span class="yunost-spinner"></span><span class="yunost-loading-label">Настройка…</span></div>
    <div class="yunost-card">
      <p class="yunost-channel"></p>
      <p class="yunost-title"></p>
      <p class="yunost-meta"></p>
    </div>
    <p class="yunost-source" aria-hidden="true"></p>
    <p class="yunost-status" aria-live="polite"></p>
    <a class="yunost-eject" href="/">⏏ Off</a>
    <button type="button" class="yunost-play" aria-pressed="false">Tune in</button>
    <div class="yunost-dots" role="presentation"></div>
  `;
  const dots = stage.querySelector('.yunost-dots');
  tracks.forEach(() => {
    const dot = document.createElement('span');
    dot.className = 'yunost-dot';
    dots.append(dot);
  });
  return stage;
}

async function initScene(block, tracks, state) {
  const THREE = await import('../../scripts/vendor/three.module.min.js');
  const { GLTFLoader } = await import('../../scripts/vendor/GLTFLoader.js');
  const { RoomEnvironment } = await import('../../scripts/vendor/RoomEnvironment.js');
  const container = block.querySelector('.yunost-canvas');
  const loading = block.querySelector('.yunost-loading');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080808);
  scene.fog = new THREE.Fog(0x080808, 7, 22);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const lookTarget = new THREE.Vector3(0, 0.8, 0);
  // d pulled well back from a tight crop so the whole set sits on a visible desk with
  // room in front for the A5 liner sheet, which is laid clear of (not tucked under)
  // the cabinet — a flat sheet that big can't show in a face-on shot that fills the
  // frame. Keep h low so the tube stays square to the viewer and the floor flattens
  // enough to hold the forward sheet. fit() still overrides d on narrow screens.
  const camPose = { az: 0, h: 1.5, d: 6.8 };
  const camGoal = { az: 0, h: 1.5, d: 6.8 };
  const camDrift = { az: 0, h: 0, d: 0 }; // subtle handheld sway while on air
  const halfFov = Math.tan((camera.fov / 2) * (Math.PI / 180));
  function placeCamera() {
    // higher fit factor = more room around the little set (it's a small TV on a
    // big desk beside a large lamp — the frame needs breathing space)
    const fit = 1.6 / (halfFov * Math.min(camera.aspect, 1.75));
    const d = Math.max(camPose.d, fit) + camDrift.d;
    const az = camPose.az + camDrift.az;
    camera.position.set(Math.sin(az) * d, camPose.h + camDrift.h, Math.cos(az) * d);
    camera.lookAt(lookTarget);
  }
  placeCamera();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;

  // dim room — the tube is the hero light
  scene.add(new THREE.HemisphereLight(0x223044, 0x0a0a0a, 0.35));
  const keyLight = new THREE.DirectionalLight(0x99887a, 0.5);
  keyLight.position.set(-2, 4, 2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);
  // warm CRT glow cast forward, reactive to the audio
  const screenGlow = new THREE.PointLight(0xc8b48c, 1.6, 9, 2);
  screenGlow.position.set(0, 1.1, 0.7);
  scene.add(screenGlow);

  // wallpaper wall — the shared visualizer, behind the set
  const { uniforms: wallUniforms, patternMats, solidMat } = buildWallpaper(THREE);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), solidMat);
  wall.position.set(0, 6, -6);
  scene.add(wall);

  // wooden desk — the same procedural grain as the turntable's Sony deck,
  // tinted dark and warm for the dim TV room
  const deskCanvas = makeDeskGrain();
  const deskMap = new THREE.CanvasTexture(deskCanvas);
  deskMap.colorSpace = THREE.SRGBColorSpace;
  deskMap.wrapS = THREE.RepeatWrapping;
  deskMap.wrapT = THREE.RepeatWrapping;
  deskMap.repeat.set(9, 9);
  deskMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const deskBump = new THREE.CanvasTexture(deskCanvas);
  deskBump.wrapS = THREE.RepeatWrapping;
  deskBump.wrapT = THREE.RepeatWrapping;
  deskBump.repeat.set(9, 9);
  const floorMat = new THREE.MeshStandardMaterial({
    map: deskMap,
    bumpMap: deskBump,
    bumpScale: 0.5,
    color: 0x3a2a1b,
    roughness: 0.66,
    metalness: 0.06,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // the CRT material — assigned to the model's real screen-glass mesh after load
  const screenUniforms = {
    uTex: { value: null },
    uTime: { value: 0 },
    uStatic: { value: 1 }, // no-signal snow until a channel loads
    uLevel: { value: 0 },
  };
  const screenMat = new THREE.ShaderMaterial({
    uniforms: screenUniforms,
    vertexShader: CRT_VERTEX,
    fragmentShader: CRT_FRAGMENT,
    toneMapped: false,
  });
  let videoEl = null;

  // fresh planar UVs on a mesh's two widest axes (the model ships one baked UV
  // point, useless for an image) so the picture maps across the screen glass
  function genPlanarUV(geo) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const s = bb.getSize(new THREE.Vector3());
    const dims = [s.x, s.y, s.z];
    const depth = dims.indexOf(Math.min(...dims));
    const ax = [0, 1, 2].filter((a) => a !== depth); // the two in-plane axes
    const p = geo.attributes.position;
    const arr = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i += 1) {
      const c = [p.getX(i), p.getY(i), p.getZ(i)];
      arr[i * 2] = (c[ax[0]] - bb.min.getComponent(ax[0])) / s.getComponent(ax[0]);
      arr[i * 2 + 1] = (c[ax[1]] - bb.min.getComponent(ax[1])) / s.getComponent(ax[1]);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
  }

  // environment colour state — lerped toward the current channel's wallpaper
  const env = {
    bg: new THREE.Color(0x080808),
    fg: new THREE.Color(0x2c2c2c),
    accent: new THREE.Color(0xc8b48c),
    speed: 1,
    scale: 5,
  };
  const target = {
    bg: env.bg.clone(), fg: env.fg.clone(), accent: env.accent.clone(), speed: 1, scale: 5,
  };
  let artworkToken = 0;

  function setScreenTexture(track) {
    // tear down any playing video texture
    if (videoEl) { videoEl.pause(); videoEl.src = ''; videoEl = null; }
    screenUniforms.uTex.value = null;
    screenUniforms.uStatic.value = 1; // snow until the picture arrives
    const src = track.screen || track.image; // Apple artwork fills in after hydrate
    if (!src) { state.videoEl = null; return; }
    if (track.screenIsVideo && track.screen) {
      videoEl = document.createElement('video');
      videoEl.src = src;
      videoEl.crossOrigin = 'anonymous';
      videoEl.loop = true;
      // decorative CRT video: always muted so it autoplays + loops regardless of the audio
      videoEl.muted = true;
      videoEl.playsInline = true;
      if (state.playing) videoEl.play().catch(() => {}); // only run while the set is switched on
      const tex = new THREE.VideoTexture(videoEl);
      tex.colorSpace = THREE.SRGBColorSpace;
      screenUniforms.uTex.value = tex;
      screenUniforms.uStatic.value = 0.04;
      state.videoEl = videoEl;
    } else {
      artworkToken += 1;
      const token = artworkToken;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (token !== artworkToken) return;
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        screenUniforms.uTex.value = tex;
        screenUniforms.uStatic.value = 0.04; // faint always-on grain
      };
      img.src = src;
      state.videoEl = null;
    }
  }

  state.setEnvironment = (track) => {
    if (track.wallpaper) {
      const {
        hues, pattern, speed, scale,
      } = track.wallpaper;
      target.bg.setHSL(hues[0], 0.5, 0.12);
      target.fg.setHSL(hues[1], 0.55, 0.34);
      target.accent.setHSL(hues[2], 0.85, 0.55);
      target.speed = speed;
      target.scale = scale;
      wall.material = patternMats[pattern] || solidMat;
    } else {
      target.bg.set(0x0a0a0a);
      target.fg.set(0x1a1a1a);
      target.accent.set(0xc8b48c);
      wall.material = solidMat;
    }
    setScreenTexture(track);
    if (state.showNotes) state.showNotes(track);
    if (state.reducedMotion) {
      env.bg.copy(target.bg); env.fg.copy(target.fg); env.accent.copy(target.accent);
    }
  };

  // load the Yunost
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().load(MODEL_PATH, resolve, (progress) => {
      if (progress.total) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        loading.querySelector('.yunost-loading-label').textContent = `Настройка… ${pct}%`;
      }
    }, reject);
  });
  const model = gltf.scene;
  let screenTarget = null;
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) child.material.envMapIntensity = 0.5;
      // the tube glass is its own mesh — we texture that directly
      if (child.name === 'TVunost402_11') screenTarget = child;
    }
  });
  // fallback: the flattest wide mesh in the set is the screen glass
  if (!screenTarget) {
    let best = -1;
    model.traverse((c) => {
      if (!c.isMesh) return;
      const s = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
      const [thin, mid, wide] = [s.x, s.y, s.z].sort((a, b) => a - b);
      if (mid > 100 && thin / wide < 0.25 && wide > best) { best = wide; screenTarget = c; }
    });
  }
  // scale to ~2 units, sit on the floor, centre on x/z
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(2.0 / Math.max(size.x, size.y, size.z));
  // turn the set to a 3/4 view so a bit of its side and back show (re-centred
  // below, so it still sits square on the desk)
  model.rotation.y = 0.5;
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  scene.add(model);
  model.updateMatrixWorld(true);

  // map the picture onto the real screen-glass mesh — the image now rides the
  // tube's actual shape (rounded corners, curve, depth), no floating plane
  const scBox = new THREE.Box3();
  if (screenTarget) {
    genPlanarUV(screenTarget.geometry);
    screenTarget.material = screenMat;
    scBox.setFromObject(screenTarget);
  } else {
    scBox.copy(box);
  }
  const scCenter = scBox.getCenter(new THREE.Vector3());
  lookTarget.set(0, scCenter.y, 0);
  screenGlow.position.set(0, scCenter.y, scBox.max.z + 0.3);
  camGoal.h = scCenter.y + 0.32;
  camPose.h = camGoal.h;
  placeCamera();
  loading.classList.add('yunost-done');

  // liner notes — a real A5 sheet on the desk, per channel. Anchor scene units
  // to the TV's cabinet height, so the sheet is a true A5 in front of the little set.
  // Built once, re-skinned per channel; click it to read (camera eases down).
  const cabinetHeight = box.getSize(new THREE.Vector3()).y;
  const world = physicalScale(cabinetHeight, YUNOST_402_HEIGHT_MM);
  const paperWidth = world.mmToUnits(A5_MM.w);
  const paper = createPaper(THREE, paperWidth);
  const paperH = paper.userData.paperSize.h;
  // lies flat on the desk in front of the set, its far edge set a touch beyond the
  // cabinet front (z ~0.84) so it never tucks under the TV — which otherwise shows
  // as the sheet clipping into the set, most visibly in the overhead read pose.
  // Angled slightly so it reads as a sheet set down rather than a UI panel.
  paper.rotation.set(-Math.PI / 2, 0, -0.15);
  paper.position.set(0.15, 0.02, 1.85);
  scene.add(paper);

  // a VARMBLIXT glass-donut lamp set well back on the desk, behind the little TV
  // and off to one side — it peeks past the set's shoulder and backlights it with
  // a warm amber glow against the cooler CRT light. Pushed a real ~50cm further
  // back (via the scene's mm scale) so it clears the tube with room to spare.
  const lamp = createLamp(THREE, { mmToUnits: world.mmToUnits });
  lamp.group.position.set(1.2, 0, -1.6 - world.mmToUnits(500));
  scene.add(lamp.group);
  let readBlend = 0;
  const pageNotes = findFragmentPath(block); // fallback when a channel has none
  const notesCache = new Map();
  const pPos = new THREE.Vector3();
  const pCam = new THREE.Vector3();
  const pLook = new THREE.Vector3();
  state.showNotes = async (track) => {
    const path = (track && track.notes) || pageNotes;
    if (!path) { paper.visible = false; state.reading = false; return; }
    if (!notesCache.has(path)) notesCache.set(path, await loadNotesCanvas(path));
    const canvas = notesCache.get(path);
    if (!canvas) { paper.visible = false; return; }
    setPaperCanvas(THREE, paper, canvas);
    paper.visible = true;
  };

  // tap the set to play/pause; tap the sheet to read
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (paper.visible && raycaster.intersectObject(paper).length) {
      state.reading = !state.reading;
      return;
    }
    if (state.reading) { state.reading = false; return; }
    // tap the lamp to switch its glow on/off
    if (raycaster.intersectObject(lamp.meshes, true).length) { lamp.toggle(); return; }
    if (raycaster.intersectObject(model, true).length) state.requestPlay();
  });

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
    placeCamera();
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let elapsed = 0;
  let flicker = 0;
  function frame() {
    if (!state.rendering) return;
    requestAnimationFrame(frame);
    const delta = clock.getDelta();
    if (!state.reducedMotion) elapsed += delta;

    env.bg.lerp(target.bg, ENV_LERP);
    env.fg.lerp(target.fg, ENV_LERP);
    env.accent.lerp(target.accent, ENV_LERP);
    env.speed += (target.speed - env.speed) * ENV_LERP;
    env.scale += (target.scale - env.scale) * ENV_LERP;

    wallUniforms.uTime.value = elapsed;
    wallUniforms.uSpeed.value = env.speed;
    wallUniforms.uScale.value = env.scale;
    wallUniforms.uColA.value.copy(env.bg);
    wallUniforms.uColB.value.copy(env.fg);
    wallUniforms.uColC.value.copy(env.accent);

    const levels = state.playing ? state.getLevels() : null;
    if (levels && !state.reducedMotion) {
      wallUniforms.uBass.value += (levels.bass - wallUniforms.uBass.value) * 0.3;
      wallUniforms.uMid.value += (levels.mid - wallUniforms.uMid.value) * 0.3;
      wallUniforms.uTreble.value += (levels.treble - wallUniforms.uTreble.value) * 0.3;
    } else if (!state.reducedMotion) {
      const idle = (state.playing ? 0.2 : 0.07) + Math.sin(elapsed * 0.7) * 0.05;
      wallUniforms.uBass.value += (idle - wallUniforms.uBass.value) * 0.05;
      wallUniforms.uMid.value += (idle - wallUniforms.uMid.value) * 0.05;
      wallUniforms.uTreble.value += (0.05 - wallUniforms.uTreble.value) * 0.05;
    }

    scene.background.copy(env.bg);
    scene.fog.color.copy(env.bg);
    // CRT glow flickers + rides the bass, tinted by the accent
    flicker = 1 + Math.sin(elapsed * 3.7) * 0.03 + Math.sin(elapsed * 7.1) * 0.02;
    screenGlow.color.copy(env.accent);
    screenGlow.intensity = (1.2 + wallUniforms.uBass.value * 2.2) * flicker;

    // the lamp is always on; its orange glow breathes gently with the low end
    lamp.setLevel(wallUniforms.uBass.value);

    // drive the tube: scanline/static time + brightness riding the audio
    screenUniforms.uTime.value = elapsed;
    const energy = (wallUniforms.uBass.value + wallUniforms.uMid.value) * 0.5;
    screenUniforms.uLevel.value += (energy - screenUniforms.uLevel.value) * 0.2;

    // subtle handheld camera sway while on air (settles to still when paused)
    const amp = state.playing && !state.reducedMotion ? 1 : 0;
    const dAz = Math.sin(elapsed * 0.13) * 0.035 + Math.sin(elapsed * 0.31) * 0.015;
    const dH = Math.sin(elapsed * 0.19) * 0.05 + Math.sin(elapsed * 0.43) * 0.02;
    const dD = Math.sin(elapsed * 0.11) * 0.12;
    camDrift.az += (dAz * amp - camDrift.az) * 0.04;
    camDrift.h += (dH * amp - camDrift.h) * 0.04;
    camDrift.d += (dD * amp - camDrift.d) * 0.04;
    placeCamera();

    // reading the liner sheet: blend the camera down onto the paper and back
    readBlend += ((state.reading ? 1 : 0) - readBlend) * 0.06;
    if (paper && readBlend > 0.001) {
      paper.getWorldPosition(pPos);
      pCam.set(pPos.x, pPos.y + paperH * 1.55, pPos.z + paperH * 0.5);
      camera.position.lerp(pCam, readBlend);
      pLook.lerpVectors(lookTarget, pPos, readBlend);
      camera.lookAt(pLook);
    }

    renderer.render(scene, camera);
  }
  state.startRender = () => {
    if (state.rendering) return;
    state.rendering = true;
    clock.getDelta();
    frame();
  };
  state.stopRender = () => { state.rendering = false; };
  state.setEnvironment(tracks[Math.max(0, state.current)]);
  state.startRender();
}

export default async function decorate(block) {
  const entries = parseEntries(block);
  if (!entries.length) return;

  const tokenEndpoint = getMetadata('apple-token-endpoint') || '/tools/apple-token';
  const hasApple = entries.some((e) => e.kind === 'expand' || e.track.source === 'apple');
  const apple = hasApple ? createAppleBackend(tokenEndpoint) : null;

  const tracks = await resolveEntries(entries, apple, finalize);
  if (!tracks.length) { block.textContent = ''; return; }

  block.textContent = '';
  const stage = buildStage(tracks);
  const feed = document.createElement('div');
  feed.className = 'yunost-feed';
  feed.append(stage);
  tracks.forEach((track, i) => {
    const item = document.createElement('div');
    item.className = 'yunost-track';
    item.dataset.index = i;
    // deliberately NO id=slug: deep-linking is done entirely in JS (hashToIndex +
    // data-index). Giving the panel an id matching the URL hash lets the browser's
    // native fragment scroller fight our scroll-snap container, re-snapping back to
    // the pinned track on every progressive layout shift so you can't scroll past it.
    item.setAttribute('aria-label', track.title);
    feed.append(item);
  });
  block.append(feed);

  const info = {
    channel: stage.querySelector('.yunost-channel'),
    title: stage.querySelector('.yunost-title'),
    meta: stage.querySelector('.yunost-meta'),
    source: stage.querySelector('.yunost-source'),
    status: stage.querySelector('.yunost-status'),
  };
  const playBtn = stage.querySelector('.yunost-play');
  const eject = stage.querySelector('.yunost-eject');
  eject.href = window.location.pathname.replace(/\/[^/]*\/?$/, '') || '/';
  const dots = [...stage.querySelectorAll('.yunost-dot')];

  // "Save offline" — only playable file (Suno/R2) channels; Apple is DRM'd. The
  // channel's audio track is what's stored (a video's own soundtrack isn't).
  const saveOffline = createCurrentTrackButton(() => {
    // eslint-disable-next-line no-use-before-define
    const t = tracks[state.current];
    if (!t) return null;
    if (t.source === 'apple' && t.appleId) {
      return { appleUrl: `https://music.apple.com/${t.storefront || 'us'}/song/${t.appleId}`, title: t.title };
    }
    if (t.source !== 'file' || !t.audio) return null;
    return {
      url: t.audio,
      title: t.title,
      artist: '',
      cover: t.image,
      style: t.style,
      duration: (t.meta.match(/(\d+:\d{2})\s*$/) || [])[1] || '',
      source: 'suno',
    };
  });
  stage.querySelector('.yunost-card').append(saveOffline.el);

  const file = createAudioEngine();

  if (apple) apple.configure().catch(() => {});

  const state = {
    current: -1,
    playing: false,
    rendering: false,
    videoMuted: true,
    videoEl: null,
    appleError: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    setEnvironment: () => {},
    getLevels: () => (apple && apple.isActive() ? null : file.getLevels()),
    startRender: () => {},
    stopRender: () => {},
  };

  function pauseAll() {
    file.pause();
    if (apple) apple.pause();
    // switching off stops the picture too — pause the CRT video
    if (state.videoEl) state.videoEl.pause();
  }

  // returns 'audio' | 'video' — what actually produced sound
  async function playTrack(track, userGesture) {
    if (track.source === 'apple' && apple) {
      file.pause();
      if (state.videoEl) { state.videoEl.muted = true; state.videoEl.play().catch(() => {}); }
      await apple.play(track.appleId, { userGesture, storefront: track.storefront });
      return 'audio';
    }
    if (apple) { apple.setActive(false); apple.pause(); }
    if (track.audio) {
      if (state.videoEl) { state.videoEl.muted = true; state.videoEl.play().catch(() => {}); }
      await file.play(track.audio);
      return 'audio';
    }
    // no separate audio track → a video that carries its own sound
    if (track.screenIsVideo && state.videoEl) {
      file.pause();
      state.videoMuted = false;
      state.videoEl.muted = false;
      await state.videoEl.play();
      return 'video';
    }
    throw new Error('nothing to play');
  }

  function updateOverlay() {
    const track = tracks[state.current];
    const isApple = track.source === 'apple';
    const needsConnect = isApple && apple && !apple.isAuthorized() && !state.playing;
    info.channel.textContent = `CH ${String(state.current + 1).padStart(2, '0')}`;
    info.title.textContent = track.title;
    info.meta.textContent = track.meta;
    let source = '';
    if (isApple) source = state.appleError ? 'Apple Music unavailable' : 'Apple Music';
    info.source.textContent = source;
    block.classList.toggle('yunost-apple', isApple);
    block.classList.toggle('yunost-connect', needsConnect);

    let status = '';
    if (state.playing) status = `On air: ${track.title}`;
    else if (isApple && state.appleError) status = 'Apple Music unavailable right now';
    else if (needsConnect) status = 'Connect your Apple Music account to play the full soundtrack';
    info.status.textContent = status;

    playBtn.disabled = !track.playable;
    playBtn.setAttribute('aria-pressed', String(state.playing));
    if (!track.playable) playBtn.textContent = 'No signal';
    else if (state.playing) playBtn.textContent = 'Switch off';
    else if (needsConnect) playBtn.textContent = 'Connect Apple Music';
    else playBtn.textContent = 'Tune in';

    dots.forEach((d, i) => d.classList.toggle('yunost-dot-active', i === state.current));
    saveOffline.refresh();
  }

  async function setTrack(i, autoplay) {
    if (i === state.current || !tracks[i]) return;
    state.current = i;
    state.appleError = false;
    const track = tracks[i];
    if (window.location.hash !== `#${track.slug}`) {
      window.history.replaceState(null, '', `#${track.slug}`);
    }
    state.setEnvironment(track);
    if ((autoplay || state.playing) && track.playable) {
      try {
        await playTrack(track, false);
        state.playing = true;
      } catch (e) {
        state.playing = false;
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
      playBtn.textContent = 'Tuning…';
      try {
        await playTrack(track, true);
        state.playing = true;
      } catch (e) {
        state.playing = false;
        state.appleError = e.code !== 'auth-required';
      }
    }
    updateOverlay();
  };

  // authorize synchronously inside the click when an Apple channel needs it
  state.requestPlay = () => {
    const track = tracks[state.current];
    if (track?.source === 'apple' && apple && !state.playing
      && apple.isConfigured() && !apple.isAuthorized()) {
      playBtn.textContent = 'Connecting…';
      apple.authorize().then(() => state.togglePlay()).catch(() => updateOverlay());
      return;
    }
    state.togglePlay();
  };

  playBtn.addEventListener('click', () => state.requestPlay());
  const advance = () => {
    const next = feed.querySelector(`.yunost-track[data-index="${state.current + 1}"]`);
    if (next) next.scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth' });
    else { state.playing = false; updateOverlay(); }
  };
  file.onEnded(advance);
  if (apple) {
    apple.onEnded(advance);
    apple.onAuthChange(() => updateOverlay());
  }

  // active channel follows scroll — rooted at the block, which is the scroll
  // container (a position:fixed element the channels scroll inside)
  const trackObserver = new IntersectionObserver((obsEntries) => {
    obsEntries.forEach((entry) => {
      if (entry.isIntersecting) setTrack(Number(entry.target.dataset.index), false);
    });
  }, { root: block, threshold: 0.6 });
  feed.querySelectorAll('.yunost-track').forEach((t) => trackObserver.observe(t));

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

  function hashToIndex() {
    const h = decodeURIComponent((window.location.hash || '').replace(/^#/, '')).toLowerCase();
    if (!h) return 0;
    const bySlug = tracks.findIndex((t) => t.slug === h);
    if (bySlug >= 0) return bySlug;
    const n = Number(h);
    if (Number.isInteger(n) && n >= 1 && n <= tracks.length) return n - 1;
    return 0;
  }
  const startIndex = hashToIndex();
  if (startIndex > 0) {
    // Only scroll once the block's CSS has applied — the channel is exactly as tall as
    // the (position:fixed, full-viewport) scroll container. scrollIntoView on a
    // half-laid-out block either no-ops (stuck on channel 0) or lands on the wrong one.
    let tries = 0;
    const land = () => {
      const el = feed.querySelector(`.yunost-track[data-index="${startIndex}"]`);
      const h = el ? el.getBoundingClientRect().height : 0;
      if (h && block.clientHeight && Math.abs(h - block.clientHeight) <= 2) {
        el.scrollIntoView({ behavior: 'auto' });
      } else if (tries < 60) {
        tries += 1;
        requestAnimationFrame(land);
      }
    };
    requestAnimationFrame(land);
  }
  setTrack(startIndex, false);

  try {
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) throw new Error('no webgl');
    initScene(block, tracks, state).catch(() => block.classList.add('yunost-no-3d'));
  } catch (e) {
    block.classList.add('yunost-no-3d');
  }

  if (apple) {
    hydrateArtwork(tracks, apple).then((changed) => {
      if (changed) state.setEnvironment(tracks[state.current]);
    });
  }
}
