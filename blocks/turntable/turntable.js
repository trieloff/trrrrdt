import { toClassName } from '../../scripts/aem.js';

const MODEL_PATH = '/models/psf9.glb';
const FADE_MS = 400;
const ENV_LERP = 0.05;
const SPIN_SPEED = 2.2; // radians per second, ~33rpm feel

/*
 * Room environments per artist, from the stardust audio-player briefing:
 * wallpaper (upper 2/3), table surface (lower 1/3), rim glow.
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

function parseTracks(block) {
  const tracks = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const title = cells[0]?.textContent?.trim();
    if (!title) return;
    const artist = cells[1]?.textContent?.trim() || '';
    tracks.push({
      title,
      artist,
      meta: cells[2]?.textContent?.trim() || '',
      audio: cells[3]?.querySelector('a')?.href || '',
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
    <button type="button" class="turntable-play" aria-pressed="false">Drop the needle</button>
    <div class="turntable-dots" role="presentation"></div>
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
  });
  let active = 0;
  let fadeFrame = null;

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

  return {
    async play(src) {
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
  };
}

async function initScene(block, tracks, state) {
  const THREE = await import('../../scripts/vendor/three.module.min.js');
  const { GLTFLoader } = await import('../../scripts/vendor/GLTFLoader.js');
  const container = block.querySelector('.turntable-canvas');
  const loading = block.querySelector('.turntable-loading');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 2.3, 4.8);
  camera.lookAt(0, 0.7, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  const keyLight = new THREE.DirectionalLight(0xffd4a0, 2.5);
  keyLight.position.set(-3, 5, 2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);
  scene.add(new THREE.DirectionalLight(0x8899bb, 0.4));
  scene.add(new THREE.AmbientLight(0x443322, 0.7));
  const rimLight = new THREE.PointLight(0xe8a317, 0.8, 12);
  rimLight.position.set(0, 2, -3);
  scene.add(rimLight);

  const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), wallMat);
  wall.position.set(0, 7, -6);
  scene.add(wall);

  const tableMat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  scene.fog = new THREE.Fog(0x000000, 9, 26);

  // environment color state
  const env = {
    wall: new THREE.Color(tracks[0].room.wall),
    table: new THREE.Color(tracks[0].room.table),
    glow: new THREE.Color(tracks[0].room.glow),
  };
  const target = {
    wall: new THREE.Color(tracks[0].room.wall),
    table: new THREE.Color(tracks[0].room.table),
    glow: new THREE.Color(tracks[0].room.glow),
  };
  state.setRoom = (room) => {
    target.wall.set(room.wall);
    target.table.set(room.table);
    target.glow.set(room.glow);
    if (state.reducedMotion) {
      env.wall.copy(target.wall);
      env.table.copy(target.table);
      env.glow.copy(target.glow);
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

  // group vinyl meshes under a pivot, spin around the disc normal
  let vinyl = null;
  let spinAxis = null;
  if (vinylMeshes.length) {
    const vinylBox = new THREE.Box3();
    vinylMeshes.forEach((m) => vinylBox.expandByObject(m));
    const vinylCenter = vinylBox.getCenter(new THREE.Vector3());
    vinyl = new THREE.Group();
    vinyl.position.copy(vinylCenter);
    scene.add(vinyl);
    vinylMeshes.forEach((m) => vinyl.attach(m));
    const vinylSize = vinylBox.getSize(new THREE.Vector3());
    const dims = [vinylSize.x, vinylSize.y, vinylSize.z];
    const thin = dims.indexOf(Math.min(...dims));
    spinAxis = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ][thin];
  }

  const scaledBox = new THREE.Box3().setFromObject(model);
  camera.lookAt(0, (scaledBox.max.y - scaledBox.min.y) * 0.48, 0);
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
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  function frame() {
    if (!state.rendering) return;
    requestAnimationFrame(frame);
    const delta = clock.getDelta();
    env.wall.lerp(target.wall, ENV_LERP);
    env.table.lerp(target.table, ENV_LERP);
    env.glow.lerp(target.glow, ENV_LERP);
    wallMat.color.copy(env.wall);
    tableMat.color.copy(env.table);
    rimLight.color.copy(env.glow);
    scene.background = env.wall;
    scene.fog.color.copy(env.wall);
    if (vinyl && spinAxis && state.playing && !state.reducedMotion) {
      vinyl.rotateOnAxis(spinAxis, SPIN_SPEED * delta);
    }
    renderer.render(scene, camera);
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
  const dots = [...stage.querySelectorAll('.turntable-dot')];
  const audio = createAudioEngine();

  const state = {
    current: -1,
    playing: false,
    rendering: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    setRoom: () => {},
    startRender: () => {},
    stopRender: () => {},
  };

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
    state.setRoom(track.room);
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
