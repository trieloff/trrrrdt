import { getMetadata } from '../../scripts/aem.js';
import createAudioEngine from '../../scripts/player/audio.js';
import { createAppleBackend, classifyAppleUrl, hydrateArtwork } from '../../scripts/player/apple.js';
import { wallpaperFromStyle, buildWallpaper } from '../../scripts/player/visualizer.js';
import { slugify, resolveEntries } from '../../scripts/player/content.js';

const MODEL_PATH = '/models/yunost.glb';
const ENV_LERP = 0.05;

/*
 * Where the picture sits on the TV. The Yunost-402 is a single baked mesh, so
 * the "screen" is a plane placed over its front face. Values are fractions of
 * the scaled model box (tuned visually); a video/image texture rides on it.
 */
const SCREEN = {
  cx: -0.09, cy: 0.53, cz: 0.9, w: 0.58, h: 0.5, rx: 0, ry: 0,
};

/* A channel is one row: title, meta, screen media (image|video), optional audio
   track, style prompt for the wallpaper. The picture is on the tube; the audio
   is either its own track (Suno/Apple) or, if none is authored and the screen is
   a video, the video's own sound. */
function rowToEntry(cells) {
  const title = cells[0]?.textContent?.trim() || '';
  const links = [...cells].map((c) => c.querySelector('a')?.href);
  const img = [...cells].map((c) => c.querySelector('img')?.src).find(Boolean) || '';
  // screen media: an <img>, or a link that looks like a video/image file
  const mediaLink = links.find((h) => h && /\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(h)) || '';
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(mediaLink);
  const screen = img || mediaLink;
  // audio: an Apple link, or an mp3/audio link that isn't the screen media
  const audioLink = links.find((h) => h && (classifyAppleUrl(h) || /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(h)) && h !== mediaLink) || '';
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
  const camPose = { az: 0, h: 1.5, d: 3.4 };
  const camGoal = { az: 0, h: 1.5, d: 3.4 };
  const halfFov = Math.tan((camera.fov / 2) * (Math.PI / 180));
  function placeCamera() {
    const fit = 1.25 / (halfFov * Math.min(camera.aspect, 1.75));
    const d = Math.max(camPose.d, fit);
    camera.position.set(Math.sin(camPose.az) * d, camPose.h, Math.cos(camPose.az) * d);
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

  // floor
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x140d07, roughness: 0.7, metalness: 0.05,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // the picture plane — image or video texture rides here, over the tube face.
  // depthTest off + high renderOrder so it always draws on top of the (single-
  // mesh) tube glass; sized to the tube opening so it doesn't spill over the bezel
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, toneMapped: false, depthTest: false });
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat);
  screenMesh.renderOrder = 10;
  scene.add(screenMesh);
  let videoEl = null;

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
    screenMat.map = null;
    screenMat.color.set(0x0a0a0a);
    const src = track.screen || track.image; // Apple artwork fills in after hydrate
    if (!src) { screenMat.needsUpdate = true; return; }
    if (track.screenIsVideo && track.screen) {
      videoEl = document.createElement('video');
      videoEl.src = src;
      videoEl.crossOrigin = 'anonymous';
      videoEl.loop = !track.playable || track.source !== 'video';
      videoEl.muted = state.videoMuted;
      videoEl.playsInline = true;
      const tex = new THREE.VideoTexture(videoEl);
      tex.colorSpace = THREE.SRGBColorSpace;
      screenMat.map = tex;
      screenMat.color.set(0xffffff);
      screenMat.needsUpdate = true;
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
        screenMat.map = tex;
        screenMat.color.set(0xffffff);
        screenMat.needsUpdate = true;
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
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) child.material.envMapIntensity = 0.5;
    }
  });
  // scale to ~2 units, sit on the floor, centre on x/z
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(2.0 / Math.max(size.x, size.y, size.z));
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  scene.add(model);
  model.updateMatrixWorld(true);

  // place the picture plane over the front face, from the SCREEN fractions
  const fbox = new THREE.Box3().setFromObject(model);
  const fsize = fbox.getSize(new THREE.Vector3());
  const fcenter = fbox.getCenter(new THREE.Vector3());
  screenMesh.scale.set(fsize.x * SCREEN.w, fsize.y * SCREEN.h, 1);
  screenMesh.position.set(
    fcenter.x + fsize.x * SCREEN.cx,
    fbox.min.y + fsize.y * SCREEN.cy,
    fbox.max.z * SCREEN.cz + 0.01,
  );
  screenMesh.rotation.set(SCREEN.rx, SCREEN.ry, 0);
  lookTarget.set(0, fbox.min.y + fsize.y * SCREEN.cy, 0);
  screenGlow.position.set(0, lookTarget.y, fbox.max.z + 0.3);
  camGoal.h = lookTarget.y + 0.3; // slight sofa angle — just above screen centre
  camPose.h = camGoal.h;
  placeCamera();
  loading.classList.add('yunost-done');

  // tap the set to play/pause
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObjects([model, screenMesh], true).length) state.requestPlay();
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
    item.id = track.slug;
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
    if (state.videoEl) state.videoEl.pause();
  }

  // returns 'audio' | 'video' — what actually produced sound
  async function playTrack(track, userGesture) {
    if (track.source === 'apple' && apple) {
      file.pause();
      if (state.videoEl) state.videoEl.pause();
      await apple.play(track.appleId, { userGesture, storefront: track.storefront });
      return 'audio';
    }
    if (apple) { apple.setActive(false); apple.pause(); }
    if (track.audio) {
      if (state.videoEl) state.videoEl.pause();
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

  const trackObserver = new IntersectionObserver((obsEntries) => {
    obsEntries.forEach((entry) => {
      if (entry.isIntersecting) setTrack(Number(entry.target.dataset.index), false);
    });
  }, { threshold: 0.6 });
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
    const el = feed.querySelector(`.yunost-track[data-index="${startIndex}"]`);
    if (el) el.scrollIntoView({ behavior: 'auto' });
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
