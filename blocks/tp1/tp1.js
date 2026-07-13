/*
 * TP1 — the site's offline player. A 3D Braun TP1 (Dieter Rams, 1959) on a desk,
 * whose "record crate" is whatever you've saved for offline (IndexedDB), so it
 * plays with no network at all. Shares the audio engine + visualizer with the
 * turntable and yunost blocks.
 *
 * The track list is NOT authored content — it is the offline library. Adding songs
 * happens elsewhere on the site (the "save offline" control); this block lists what
 * is on the device, plays it from stored blobs, and lets you remove it.
 */
import { buildWallpaper, wallpaperFromStyle, makeDeskGrain } from '../../scripts/player/visualizer.js';
import createAudioEngine from '../../scripts/player/audio.js';
import * as offline from '../../scripts/player/offline.js';

const MODEL_PATH = '/models/tp1.glb';

function makeLeatherColorMap(THREE, renderer) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 512;
  colorCanvas.height = 128;
  const colorCtx = colorCanvas.getContext('2d');
  colorCtx.fillStyle = '#583b29';
  colorCtx.fillRect(0, 0, colorCanvas.width, colorCanvas.height);

  // Deterministic, elongated grain: enough surface relief to stop the handle
  // reading as smooth plastic without adding another downloaded asset.
  let seed = 0x5f3759df;
  const random = () => {
    // eslint-disable-next-line no-bitwise
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 28; i += 1) {
    const x = random() * colorCanvas.width;
    const width = 8 + random() * 30;
    const shade = Math.round(48 + random() * 126);
    colorCtx.fillStyle = `rgb(${shade} ${Math.round(shade * 0.66)} ${Math.round(shade * 0.4)})`;
    colorCtx.fillRect(x, 0, width, colorCanvas.height);
  }
  for (let i = 0; i < 42; i += 1) {
    const x = random() * colorCanvas.width;
    const y = random() * colorCanvas.height;
    const radiusX = 10 + random() * 42;
    const radiusY = 4 + random() * 14;
    const shade = Math.round(48 + random() * 130);
    colorCtx.beginPath();
    colorCtx.ellipse(x, y, radiusX, radiusY, random() * 0.35, 0, Math.PI * 2);
    colorCtx.fillStyle = `rgb(${shade} ${Math.round(shade * 0.66)} ${Math.round(shade * 0.4)})`;
    colorCtx.fill();
  }
  for (let i = 0; i < 90; i += 1) {
    const x = random() * colorCanvas.width;
    const y = random() * colorCanvas.height;
    const length = 24 + random() * 120;
    const cp1y = y + (random() - 0.5) * 12;
    const cp2y = y + (random() - 0.5) * 12;
    const endY = y + (random() - 0.5) * 8;
    const width = 1.2 + random() * 5.4;
    const shade = Math.round(42 + random() * 136);
    colorCtx.beginPath();
    colorCtx.moveTo(x, y);
    colorCtx.bezierCurveTo(
      x + length * 0.32,
      cp1y,
      x + length * 0.68,
      cp2y,
      x + length,
      endY,
    );
    colorCtx.lineWidth = width;
    colorCtx.strokeStyle = `rgb(${shade} ${Math.round(shade * 0.68)} ${Math.round(shade * 0.43)})`;
    colorCtx.stroke();
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.flipY = false;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return colorMap;
}

function findGrilleHoleCenters(THREE, mesh) {
  const position = mesh.geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  const points = [];
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    if (vertex.x > -0.46 && vertex.x < -0.02
      && vertex.y > 1.02 && vertex.y < 1.47
      && vertex.z > 0.104 && vertex.z < 0.108) {
      points.push({ x: vertex.x, y: vertex.y });
    }
  }

  const parent = points.map((point, i) => i);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let current = index;
    while (parent[current] !== current) {
      const next = parent[current];
      parent[current] = root;
      current = next;
    }
    return root;
  };
  const unite = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  const cellSize = 0.006;
  const thresholdSq = 0.000026;
  const cells = new Map();
  points.forEach((point, i) => {
    const cellX = Math.floor(point.x / cellSize);
    const cellY = Math.floor(point.y / cellSize);
    for (let x = cellX - 1; x <= cellX + 1; x += 1) {
      for (let y = cellY - 1; y <= cellY + 1; y += 1) {
        (cells.get(`${x}:${y}`) || []).forEach((otherIndex) => {
          const other = points[otherIndex];
          const dx = point.x - other.x;
          const dy = point.y - other.y;
          if (dx * dx + dy * dy < thresholdSq) unite(i, otherIndex);
        });
      }
    }
    const key = `${cellX}:${cellY}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  });

  const groups = new Map();
  points.forEach((point, i) => {
    const root = find(i);
    const group = groups.get(root) || { x: 0, y: 0, count: 0 };
    group.x += point.x;
    group.y += point.y;
    group.count += 1;
    groups.set(root, group);
  });
  return [...groups.values()]
    .filter(({ count }) => count >= 18)
    .map(({ x, y, count }) => ({ x: x / count, y: y / count }));
}

function makeGrilleFace(THREE, grilleMesh, meterMesh, material, backingMaterial) {
  const holes = findGrilleHoleCenters(THREE, grilleMesh);
  if (holes.length < 100) return null;

  const xs = holes.map(({ x }) => x);
  const ys = holes.map(({ y }) => y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const panelBox = new THREE.Box3().setFromObject(grilleMesh);
  const panelCenter = panelBox.getCenter(new THREE.Vector3());
  const panelSize = panelBox.getSize(new THREE.Vector3());
  const meterBox = new THREE.Box3().setFromObject(meterMesh);
  const meterSize = meterBox.getSize(new THREE.Vector3());
  const meterPadX = 0.008;
  const meterPadY = 0.006;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = 1024;
  maskCanvas.height = Math.round((maskCanvas.width * panelSize.y) / panelSize.x);
  const ctx = maskCanvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  ctx.fillStyle = '#000';
  holes.forEach(({ x, y }) => {
    ctx.beginPath();
    ctx.arc(
      ((x - panelBox.min.x) / panelSize.x) * maskCanvas.width,
      ((panelBox.max.y - y) / panelSize.y) * maskCanvas.height,
      (0.0092 / panelSize.x) * maskCanvas.width,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });
  ctx.fillRect(
    ((meterBox.min.x - meterPadX - panelBox.min.x) / panelSize.x) * maskCanvas.width,
    ((panelBox.max.y - meterBox.max.y - meterPadY) / panelSize.y) * maskCanvas.height,
    ((meterSize.x + meterPadX * 2) / panelSize.x) * maskCanvas.width,
    ((meterSize.y + meterPadY * 2) / panelSize.y) * maskCanvas.height,
  );
  const alphaMap = new THREE.CanvasTexture(maskCanvas);
  const faceMaterial = material.clone();
  faceMaterial.alphaMap = alphaMap;
  faceMaterial.alphaTest = 0.5;
  faceMaterial.alphaToCoverage = true;
  faceMaterial.needsUpdate = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(panelSize.x, panelSize.y), faceMaterial);
  face.position.set(panelCenter.x, panelCenter.y, 0.132);
  face.receiveShadow = true;
  face.renderOrder = 2;

  const backing = new THREE.Mesh(new THREE.CircleGeometry(0.25, 96), backingMaterial);
  backing.position.set(centerX, centerY, 0.128);
  const group = new THREE.Group();
  group.add(backing, face);
  grilleMesh.visible = false;
  return group;
}

function addDialFace(THREE, scene, materials) {
  const layers = [
    [0.242, materials.metal, 0.133],
    [0.235, materials.black, 0.1336],
    [0.227, materials.dialRing, 0.1342],
    [0.194, materials.black, 0.1348],
    [0.187, materials.dialFace, 0.1354],
  ];
  layers.forEach(([radius, material, z]) => {
    const layer = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), material);
    layer.position.set(0.186, 0.2971, z);
    layer.receiveShadow = true;
    layer.renderOrder = 2;
    scene.add(layer);
  });
}

function fmtBytes(b) {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  const mb = b / 1024 / 1024;
  if (mb < 1024) return `${mb < 100 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const HTML_ESC = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => HTML_ESC[c]);
}

async function initScene(block, state) {
  const THREE = await import('../../scripts/vendor/three.module.min.js');
  const { GLTFLoader } = await import('../../scripts/vendor/GLTFLoader.js');
  const { RoomEnvironment } = await import('../../scripts/vendor/RoomEnvironment.js');
  const container = block.querySelector('.tp1-canvas');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0d);
  scene.fog = new THREE.Fog(0x0b0b0d, 8, 24);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const lookTarget = new THREE.Vector3(0, 0.78, 0);
  const camPose = { az: 0.32, h: 0.8, d: 2.95 };
  const camDrift = { az: 0, h: 0 };
  const halfFov = Math.tan((camera.fov / 2) * (Math.PI / 180));
  function placeCamera() {
    const fit = 1.1 / (halfFov * Math.min(camera.aspect, 1.75));
    const d = Math.max(camPose.d, fit);
    const az = camPose.az + camDrift.az;
    camera.position.set(Math.sin(az) * d, camPose.h + camDrift.h, Math.cos(az) * d);
    camera.lookAt(lookTarget);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // cap the pixel ratio harder on phones — a full-DPR heavy scene trips the iOS
  // WebContent memory limit and blanks the tab
  const dprCap = window.innerWidth < 700 ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    block.classList.add('tp1-no-3d');
  }, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

  scene.add(new THREE.HemisphereLight(0x2a3448, 0x0a0a0a, 0.5));
  const keyLight = new THREE.DirectionalLight(0xf0e6d6, 1.1);
  keyLight.position.set(-2.4, 4, 2.6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);
  const rim = new THREE.DirectionalLight(0x88a0c0, 0.6);
  rim.position.set(3, 2, -2);
  scene.add(rim);
  const dialLight = new THREE.SpotLight(0xfff4e2, 0.8, 4, 0.24, 0.7, 2);
  dialLight.position.set(-0.7, 1.25, 1.55);
  dialLight.target.position.set(0.186, 0.297, 0.13);
  scene.add(dialLight, dialLight.target);
  // warm glow off the dial face, riding the audio
  const glow = new THREE.PointLight(0xc8b48c, 0.0, 6, 2);
  glow.position.set(0.2, 0.4, 0.8);
  scene.add(glow);

  // wallpaper wall — the shared visualizer, behind the set
  const { uniforms: wallUniforms, patternMats, solidMat } = buildWallpaper(THREE);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), solidMat);
  wall.position.set(0, 6, -6);
  scene.add(wall);
  state.applyWallpaper = (style) => {
    if (!style) { wall.material = solidMat; return; }
    const w = wallpaperFromStyle(style);
    wall.material = patternMats[w.pattern] || solidMat;
    wallUniforms.uColA.value.setHSL(w.hues[0], 0.45, 0.10);
    wallUniforms.uColB.value.setHSL(w.hues[1], 0.5, 0.18);
    wallUniforms.uColC.value.setHSL(w.hues[2], 0.7, 0.45);
    wallUniforms.uSpeed.value = w.speed;
    wallUniforms.uScale.value = w.scale;
  };

  // wooden desk
  const deskCanvas = makeDeskGrain();
  const deskMap = new THREE.CanvasTexture(deskCanvas);
  deskMap.colorSpace = THREE.SRGBColorSpace;
  deskMap.wrapS = THREE.RepeatWrapping;
  deskMap.wrapT = THREE.RepeatWrapping;
  deskMap.repeat.set(9, 9);
  deskMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const desk = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({
      map: deskMap, color: 0x6f5f4c, roughness: 0.78, metalness: 0.0,
    }),
  );
  desk.rotation.x = -Math.PI / 2;
  desk.receiveShadow = true;
  scene.add(desk);

  const model = await new Promise((resolve, reject) => {
    new GLTFLoader().load(MODEL_PATH, (g) => resolve(g.scene), undefined, reject);
  });

  // fit to ~1.6 units, sit on the floor, centre — before the classifier so it can
  // reason in final scene coordinates
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(1.6 / Math.max(size.x, size.y, size.z));
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  scene.add(model);
  model.updateWorldMatrix(true, true);

  // The 3DS conversion truncated several source material names to
  // "/Plastic_Simple_". Classify the known CAD parts explicitly so meter marks,
  // dial rings, controls, and the two body tones keep their intended identities.
  const leatherColorMap = makeLeatherColorMap(THREE, renderer);
  // a missing normal map must not take down the whole scene
  const leatherNormalMap = await new THREE.TextureLoader()
    .loadAsync('/blocks/tp1/leather-normal.jpg')
    .catch(() => null);
  if (leatherNormalMap) {
    leatherNormalMap.flipY = false;
    leatherNormalMap.wrapS = THREE.RepeatWrapping;
    leatherNormalMap.wrapT = THREE.RepeatWrapping;
    leatherNormalMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  const plastic = (color, {
    roughness = 0.58,
    clearcoat = 0.04,
    clearcoatRoughness = 0.65,
    envMapIntensity = 0.8,
  } = {}) => new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    clearcoat,
    clearcoatRoughness,
    envMapIntensity,
    side: THREE.DoubleSide,
  });
  const materials = {
    upperBody: plastic(0xd8d4bf, { roughness: 0.62 }),
    lowerBody: plastic(0xd5dad4, { roughness: 0.58 }),
    ivory: plastic(0xefeee8, { roughness: 0.42, clearcoat: 0.08 }),
    dialFace: plastic(0xffffff, {
      roughness: 0.22,
      clearcoat: 0.32,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.1,
    }),
    dialRing: new THREE.MeshStandardMaterial({
      color: 0x5a5956,
      roughness: 0.48,
      metalness: 0,
      envMapIntensity: 0.9,
      side: THREE.DoubleSide,
    }),
    dialKnob: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.05,
      clearcoat: 0.48,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide,
    }),
    charcoal: plastic(0x30302e, { roughness: 0.58, clearcoat: 0 }),
    black: plastic(0x101111, { roughness: 0.52, clearcoat: 0 }),
    grilleBlack: new THREE.MeshBasicMaterial({
      color: 0x050505,
      side: THREE.DoubleSide,
    }),
    red: plastic(0xc72e25, { roughness: 0.4, clearcoat: 0.08 }),
    meterFace: plastic(0xe9e8df, { roughness: 0.48 }),
    metal: new THREE.MeshStandardMaterial({
      color: 0xc8c7c2,
      roughness: 0.18,
      metalness: 0.78,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
    }),
    leather: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0,
      map: leatherColorMap,
      normalMap: leatherNormalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      clearcoat: 0.1,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.85,
      side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xf4f2e9,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.2,
      transmission: 0.38,
      ior: 1.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
  const materialByMesh = new Map([
    ['3DSMesh_0', materials.red],
    ['3DSMesh_1', materials.ivory],
    ['3DSMesh_2', materials.meterFace],
    ['3DSMesh_3', materials.upperBody],
    ['3DSMesh_4', materials.lowerBody],
    ['3DSMesh_5', materials.lowerBody],
    ['3DSMesh_6', materials.leather],
    ['3DSMesh_7', materials.upperBody],
    ['3DSMesh_8', materials.dialFace],
    ['3DSMesh_9', materials.dialKnob],
    ['3DSMesh_10', materials.dialRing],
    ['3DSMesh_11', materials.charcoal],
    ['3DSMesh_12', materials.ivory],
    ['3DSMesh_13', materials.ivory],
    ['3DSMesh_14', materials.charcoal],
    ['3DSMesh_15', materials.metal],
    ['3DSMesh_16', materials.ivory],
    ['3DSMesh_17', materials.ivory],
    ['3DSMesh_18', materials.ivory],
    ['3DSMesh_19', materials.dialRing],
    ['3DSMesh_20', materials.dialFace],
    ['3DSMesh_21', materials.metal],
    ['3DSMesh_22', materials.metal],
    ['3DSMesh_23', materials.metal],
    ['3DSMesh_24', materials.metal],
    ['3DSMesh_25', materials.glass],
    ['3DSMesh_26', materials.charcoal],
    ['3DSMesh_27', materials.charcoal],
    ['3DSMesh_28', materials.charcoal],
    ['3DSMesh_29', materials.charcoal],
    ['3DSMesh_30', materials.charcoal],
    ['3DSMesh_31', materials.charcoal],
    ['3DSMesh_32', materials.charcoal],
    ['3DSMesh_33', materials.charcoal],
    ['3DSMesh_34', materials.meterFace],
    ['3DSMesh_35', materials.metal],
  ]);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.material = materialByMesh.get(o.name) || materials.lowerBody;
  });

  // The CAD model is hollow open shells, so any real opening (grille perforations,
  // tuning window, dial ring, meter) would show straight through to the background.
  // DoubleSide above closes the single-sided surfaces; this dark core fills the
  // hollow body so openings read as the dark interior of the set, not see-through.
  const coreSize = box.getSize(new THREE.Vector3());
  const coreCenter = box.getCenter(new THREE.Vector3());
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(coreSize.x * 0.8, coreSize.y * 0.88, coreSize.z * 0.55),
    new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.95, metalness: 0 }),
  );
  core.position.copy(coreCenter);
  scene.add(core);

  const grilleFace = makeGrilleFace(
    THREE,
    model.getObjectByName('3DSMesh_7'),
    model.getObjectByName('3DSMesh_2'),
    materials.upperBody,
    materials.grilleBlack,
  );
  if (grilleFace) scene.add(grilleFace);

  addDialFace(THREE, scene, materials);

  const dialPivot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0048, 20),
    materials.black,
  );
  dialPivot.position.set(0.186, 0.2865, 0.163);
  scene.add(dialPivot);

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    placeCamera();
  }
  resize();
  // A ResizeObserver on the canvas box catches orientation changes reliably,
  // after the layout has settled — a plain window 'resize' on iOS can fire
  // mid-rotation with stale metrics, which stretched the model to a wrong aspect.
  const resizeObs = new ResizeObserver(() => resize());
  resizeObs.observe(container);
  window.addEventListener('orientationchange', () => { requestAnimationFrame(resize); });

  const clock = new THREE.Clock();
  let raf = null;
  const lv = { bass: 0, mid: 0, treble: 0 };
  function tick() {
    const t = clock.getElapsedTime();
    wallUniforms.uTime.value = t;
    const l = state.audio.getLevels();
    if (l) {
      lv.bass += (l.bass - lv.bass) * 0.3;
      lv.mid += (l.mid - lv.mid) * 0.3;
      lv.treble += (l.treble - lv.treble) * 0.3;
    } else {
      lv.bass *= 0.9; lv.mid *= 0.9; lv.treble *= 0.9;
    }
    wallUniforms.uBass.value = lv.bass;
    wallUniforms.uMid.value = lv.mid;
    wallUniforms.uTreble.value = lv.treble;
    glow.intensity = state.playing ? 0.4 + lv.bass * 2.2 : 0;
    // gentle handheld sway while playing
    const amp = state.playing && !state.reducedMotion ? 1 : 0;
    camDrift.az += ((Math.sin(t * 0.16) * 0.03) * amp - camDrift.az) * 0.04;
    camDrift.h += ((Math.sin(t * 0.22) * 0.03) * amp - camDrift.h) * 0.04;
    placeCamera();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  function start() { if (!raf) tick(); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
  start();

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? start() : stop()));
  });
  obs.observe(container);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });

  block.querySelector('.tp1-loading')?.classList.add('tp1-done');
}

export default async function decorate(block) {
  block.textContent = '';
  const stage = document.createElement('div');
  stage.className = 'tp1-stage';
  stage.innerHTML = `
    <div class="tp1-canvas"></div>
    <div class="tp1-loading"><p>Warming up the TP1…</p></div>
    <div class="tp1-ui">
      <header class="tp1-bar">
        <a class="tp1-brand" href="/">TP1 <span>· offline</span></a>
        <div class="tp1-net" role="status"><span class="tp1-net-dot"></span><span class="tp1-net-label">Online</span></div>
      </header>
      <section class="tp1-crate" aria-label="Songs saved on this device">
        <button class="tp1-crate-toggle" type="button" aria-expanded="true" aria-label="Show or hide saved songs"><span class="tp1-crate-grip"></span></button>
        <div class="tp1-crate-head">
          <div class="tp1-crate-heading">
            <h1>On this device</h1>
            <span class="tp1-plate" aria-hidden="true"><span class="tp1-plate-a">Export set</span><span class="tp1-plate-b">No network</span></span>
          </div>
          <div class="tp1-meter"><div class="tp1-meter-bar"><i></i></div><span class="tp1-meter-label"></span></div>
        </div>
        <div class="tp1-list" role="list"></div>
        <p class="tp1-empty" hidden>Nothing saved yet. Anywhere on the site, tap <b>Save offline</b> on a song, a player, or an artist to keep it here — then it plays with no connection.</p>
      </section>
      <div class="tp1-now">
        <button class="tp1-skip tp1-prev" type="button" disabled aria-label="Previous song">◀◀</button>
        <button class="tp1-play" type="button" disabled>Play</button>
        <button class="tp1-skip tp1-next" type="button" disabled aria-label="Next song">▶▶</button>
        <div class="tp1-now-title"></div>
      </div>
    </div>
  `;
  block.append(stage);

  const list = stage.querySelector('.tp1-list');
  const empty = stage.querySelector('.tp1-empty');
  const meterBar = stage.querySelector('.tp1-meter-bar i');
  const meterLabel = stage.querySelector('.tp1-meter-label');
  const netDot = stage.querySelector('.tp1-net-dot');
  const netLabel = stage.querySelector('.tp1-net-label');
  const playBtn = stage.querySelector('.tp1-play');
  const prevBtn = stage.querySelector('.tp1-prev');
  const nextBtn = stage.querySelector('.tp1-next');
  const nowTitle = stage.querySelector('.tp1-now-title');
  const crate = stage.querySelector('.tp1-crate');
  const crateToggle = stage.querySelector('.tp1-crate-toggle');

  // collapse the crate to its header so the device shows through (mobile only —
  // on desktop the crate is a side column). Playback stays live in the now-bar.
  crateToggle.addEventListener('click', () => {
    const collapsed = crate.classList.toggle('tp1-crate-collapsed');
    crateToggle.setAttribute('aria-expanded', String(!collapsed));
  });

  const state = {
    // play the stored audio DIRECTLY (no Web Audio analyser) so it keeps going
    // when the phone locks / the app backgrounds — the whole point of an offline
    // player. Costs the reactive wall (it falls back to the idle animation).
    audio: createAudioEngine({ analyse: false }),
    songs: [],
    usedBytes: 0,
    current: null,
    currentURL: null,
    playing: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    applyWallpaper: null,
    coverURLs: new Map(),
  };

  function setMediaMetadata(song) {
    if (!('mediaSession' in navigator)) return;
    try {
      // eslint-disable-next-line no-undef
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: 'TRRRRDT · Offline',
        artwork: song.cover ? [{ src: song.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
    } catch (e) { /* mediaSession unavailable */ }
  }

  function hydrateCover(row, id) {
    if (state.coverURLs.has(id)) {
      const img = row.querySelector('img');
      if (img) img.src = state.coverURLs.get(id);
      return;
    }
    offline.coverURL(id).then((u) => {
      if (!u) return;
      state.coverURLs.set(id, u);
      const img = row.querySelector('img');
      if (img) img.src = u;
    });
  }

  function renderUI() {
    const pct = Math.min(100, (state.usedBytes / offline.BUDGET) * 100);
    meterBar.style.width = `${pct}%`;
    meterLabel.textContent = state.songs.length
      ? `${state.songs.length} song${state.songs.length > 1 ? 's' : ''} · ${fmtBytes(state.usedBytes)} of 1 GB`
      : '';
    empty.hidden = state.songs.length > 0;

    list.textContent = '';
    state.songs.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'tp1-song';
      row.setAttribute('role', 'listitem');
      row.dataset.id = s.id;
      if (s.id === state.current) row.classList.add('tp1-song-current');
      row.innerHTML = `
        <button class="tp1-song-play" type="button" aria-label="Play ${esc(s.title)}">
          <span class="tp1-song-art">${s.hasCover ? '<img alt="">' : ''}</span>
          <span class="tp1-song-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        </button>
        <div class="tp1-song-meta">
          <p class="tp1-song-title">${esc(s.title)}</p>
          <p class="tp1-song-artist">${esc(s.artist)}${s.duration ? ` · ${esc(s.duration)}` : ''}</p>
        </div>
        <button class="tp1-song-del" type="button" aria-label="Remove ${esc(s.title)} from this device">Remove</button>`;
      list.append(row);
      if (s.hasCover) hydrateCover(row, s.id);
    });

    const cur = state.songs.find((s) => s.id === state.current);
    nowTitle.textContent = cur ? `${cur.title} — ${cur.artist}` : '';
    playBtn.textContent = state.playing ? 'Pause' : 'Play';
    playBtn.disabled = state.songs.length === 0;
    // prev/next skip within the crate; disabled at the ends (and with no current song)
    const idx = state.songs.findIndex((s) => s.id === state.current);
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx < 0 || idx >= state.songs.length - 1;
    block.classList.toggle('tp1-is-playing', state.playing);
  }

  async function playSong(id) {
    const song = state.songs.find((s) => s.id === id);
    if (!song) return;
    const url = await offline.objectURL(id);
    if (!url) return;
    if (state.currentURL) URL.revokeObjectURL(state.currentURL);
    state.currentURL = url;
    state.current = id;
    try {
      await state.audio.play(url);
      state.playing = true;
      if (state.applyWallpaper) state.applyWallpaper(song.style);
      setMediaMetadata(song);
    } catch (e) {
      state.playing = false;
    }
    renderUI();
  }

  function advance(dir) {
    const i = state.songs.findIndex((s) => s.id === state.current);
    const next = state.songs[i + (dir || 1)];
    if (next) playSong(next.id);
    else { state.playing = false; renderUI(); }
  }

  async function togglePlay() {
    if (state.playing) {
      state.audio.pause();
      state.playing = false;
    } else if (state.current) {
      await state.audio.resume();
      state.playing = state.audio.isPlaying();
    } else if (state.songs[0]) {
      await playSong(state.songs[0].id);
      return;
    }
    renderUI();
  }

  async function removeSong(id) {
    if (id === state.current) {
      state.audio.pause();
      state.playing = false;
      state.current = null;
      if (state.currentURL) { URL.revokeObjectURL(state.currentURL); state.currentURL = null; }
      if (state.applyWallpaper) state.applyWallpaper(null);
    }
    const u = state.coverURLs.get(id);
    if (u) { URL.revokeObjectURL(u); state.coverURLs.delete(id); }
    await offline.remove(id); // fires tp1:change → refresh
  }

  async function refresh() {
    state.songs = await offline.list();
    const { bytes } = await offline.usage();
    state.usedBytes = bytes;
    if (state.current && !state.songs.some((s) => s.id === state.current)) {
      state.current = null;
    }
    renderUI();
  }

  function updateNet() {
    const off = !navigator.onLine;
    block.classList.toggle('tp1-offline', off);
    netDot.classList.toggle('tp1-net-off', off);
    netLabel.textContent = off ? 'Offline' : 'Online';
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.tp1-song');
    if (!row) return;
    const { id } = row.dataset;
    if (e.target.closest('.tp1-song-del')) removeSong(id);
    else playSong(id);
  });
  playBtn.addEventListener('click', () => togglePlay());
  // prev/next are only enabled when a valid neighbour exists, so advance() lands safely
  prevBtn.addEventListener('click', () => advance(-1));
  nextBtn.addEventListener('click', () => advance(1));
  state.audio.onEnded(() => advance(1));
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('nexttrack', () => advance(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => advance(-1));
    } catch (e) { /* not supported */ }
  }
  window.addEventListener(offline.CHANGE_EVENT, refresh);
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);

  updateNet();
  refresh();

  // The crate (the offline library) is the point. Paint it first, then boot the 3D
  // as a deferred, isolated enhancement — a WebGL failure or an iOS memory-pressure
  // kill of the scene must never blank the library.
  const boot3d = () => {
    try {
      const probe = document.createElement('canvas');
      if (!probe.getContext('webgl2') && !probe.getContext('webgl')) throw new Error('no webgl');
      initScene(block, state).catch(() => block.classList.add('tp1-no-3d'));
    } catch (e) {
      block.classList.add('tp1-no-3d');
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(boot3d));
}
