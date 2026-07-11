import createVarmblixtModel from './varmblixt-model.js';

async function initScene(block) {
  const THREE = await import('../../scripts/vendor/three.module.min.js');
  const { RoomEnvironment } = await import('../../scripts/vendor/RoomEnvironment.js');
  const viewport = block.querySelector('.varmblixt-viewport');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe4dfd5);
  scene.fog = new THREE.Fog(0xe4dfd5, 8, 16);

  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
  camera.position.set(4.3, 3.15, 4.55);
  const target = new THREE.Vector3(0.12, 0.42, 0);
  camera.lookAt(target);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.append(renderer.domElement);

  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment, 0.035).texture;
  environment.dispose();
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xfff8ed, 2.15);
  key.position.set(-3.5, 6, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xcddcf4, 0.9);
  fill.position.set(4, 2.5, -3);
  scene.add(fill, new THREE.HemisphereLight(0xfffbf4, 0x8e887e, 1.1));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.86, metalness: 0 }),
  );
  floor.name = 'Studio surface';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.005;
  floor.receiveShadow = true;
  scene.add(floor);

  const model = createVarmblixtModel(THREE);
  model.rotation.y = 0;
  scene.add(model);

  let pointerId = null;
  let pointerX = 0;
  let rotationVelocity = 0;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const onPointerDown = (event) => {
    pointerId = event.pointerId;
    pointerX = event.clientX;
    rotationVelocity = 0;
    renderer.domElement.setPointerCapture(pointerId);
    block.classList.add('varmblixt-dragging');
  };
  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId) return;
    const delta = event.clientX - pointerX;
    pointerX = event.clientX;
    rotationVelocity = delta * 0.006;
    model.rotation.y += rotationVelocity;
  };
  const onPointerUp = (event) => {
    if (event.pointerId !== pointerId) return;
    renderer.domElement.releasePointerCapture(pointerId);
    pointerId = null;
    block.classList.remove('varmblixt-dragging');
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);

  const intensityControl = block.querySelector('.varmblixt-intensity');
  intensityControl.addEventListener('input', () => {
    model.userData.setLightIntensity(Number(intensityControl.value) / 100);
  });

  const resize = () => {
    const { width, height } = viewport.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.set(
      camera.aspect < 0.8 ? 5.35 : 4.3,
      camera.aspect < 0.8 ? 3.45 : 3.15,
      camera.aspect < 0.8 ? 5.65 : 4.55,
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewport);
  resize();

  let active = true;
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting;
  });
  visibilityObserver.observe(block);

  const clock = new THREE.Clock();
  const render = () => {
    requestAnimationFrame(render);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (!active) return;
    if (pointerId === null) {
      if (!prefersReducedMotion) model.rotation.y += delta * 0.045;
      model.rotation.y += rotationVelocity;
      rotationVelocity *= 0.92;
    }
    renderer.render(scene, camera);
  };
  render();
  block.classList.add('varmblixt-ready');
}

/**
 * Decorates an empty authored block with an interactive procedural lamp study.
 * @param {Element} block the varmblixt block
 */
export default async function decorate(block) {
  block.textContent = '';

  const viewport = document.createElement('div');
  viewport.className = 'varmblixt-viewport';
  viewport.setAttribute('role', 'img');
  viewport.setAttribute('aria-label', 'Interactive three-dimensional study of a white glass ring lamp');

  const copy = document.createElement('div');
  copy.className = 'varmblixt-copy';
  copy.innerHTML = `
    <p class="varmblixt-kicker">Procedural glass study</p>
    <h1>Light, shaped from a curve.</h1>
    <p>Generated from mathematical surfaces in Three.js. Drag to rotate.</p>
  `;

  const control = document.createElement('label');
  control.className = 'varmblixt-control';
  control.innerHTML = `
    <span>Intensity</span>
    <input class="varmblixt-intensity" type="range" min="0" max="100" value="72" aria-label="Lamp intensity">
  `;

  const status = document.createElement('p');
  status.className = 'varmblixt-loading';
  status.setAttribute('role', 'status');
  status.textContent = 'Shaping glass…';

  block.append(viewport, copy, control, status);

  try {
    await initScene(block);
    status.textContent = '';
  } catch (error) {
    block.classList.add('varmblixt-error');
    status.textContent = 'The 3D study could not be rendered on this device.';
    // eslint-disable-next-line no-console
    console.error('Could not initialize the procedural lamp', error);
  }
}
