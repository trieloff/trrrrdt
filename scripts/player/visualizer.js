/*
 * Shared psychedelic wallpaper visualizer for the player blocks. The style
 * prompt is hashed into colours + motion + one of the pattern modules
 * (blocks/turntable/patterns/*.js), and the audio's bass/mid/treble drive it.
 * Each block builds its own wall mesh from these materials and drives the
 * uniforms in its render loop, so both the turntable and the TV share one look.
 */

import PATTERNS from '../../blocks/turntable/patterns/index.js';

/* djb2 — the style prompt is the seed; same prompt, same look, forever */
export function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; // eslint-disable-line no-bitwise
  }
  return h;
}

/*
 * Derive a wallpaper from a style prompt: background, foreground, accent hues
 * plus a pattern and its motion parameters, and a remixed camera pose — all
 * from the hash bits.
 */
export function wallpaperFromStyle(style) {
  /* eslint-disable no-bitwise */
  const h = hashString(style.toLowerCase());
  const hueA = h % 360;
  const hueB = (hueA + 120 + ((h >>> 3) % 100)) % 360;
  const hueC = (hueA + 180 + ((h >>> 7) % 80)) % 360;
  const pattern = (h >>> 9) % PATTERNS.length;
  const speed = 0.4 + ((h >>> 13) % 100) / 90;
  const scale = 3 + ((h >>> 17) % 6);
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
    hues: [hueA / 360, hueB / 360, hueC / 360], pattern, speed, scale, pose,
  };
}

export const PATTERN_COUNT = PATTERNS.length;

export const WALLPAPER_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * Each pattern module supplies a `float field(vec2 p, float t)`; this wrapper
 * injects it at __FIELD__, then owns the colour mapping, the mid-driven accent
 * band, treble sparkle, and vignette. One shader is compiled per pattern and
 * they all share the same uniforms.
 */
export const WALLPAPER_FRAGMENT_TEMPLATE = `
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
    vec2 p = vUv * vec2(2.143, 1.0);
    float t = uTime * uSpeed;
    float v = field(p, t);

    float m = smoothstep(-0.9, 0.9, v);
    vec3 col = mix(uColA, uColB, m);

    float band = smoothstep(0.82 - uMid * 0.35, 1.0, v);
    col = mix(col, uColC, band * (0.4 + uMid * 0.6));

    float n = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * (0.03 + uTreble * 0.10);

    float vig = smoothstep(1.35, 0.3, length(vUv - vec2(0.5, 0.55)));
    col *= mix(0.4, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* Fallback wall for tracks with no style prompt: a flat, vignetted room colour. */
export const WALLPAPER_SOLID_FRAGMENT = `
  precision highp float;
  uniform vec3 uColA;
  varying vec2 vUv;
  void main() {
    float vig = smoothstep(1.35, 0.3, length(vUv - vec2(0.5, 0.55)));
    gl_FragColor = vec4(uColA * mix(0.4, 1.0, vig), 1.0);
  }
`;

/*
 * Build the shared wallpaper materials for a scene: one ShaderMaterial per
 * pattern plus a solid fallback, all sharing one uniforms object. The block
 * creates/positions the wall mesh, swaps `wall.material` by pattern index, and
 * drives the uniforms (uTime/uBass/uMid/uTreble/uSpeed/uScale/uColA-C) each frame.
 */
export function buildWallpaper(THREE) {
  const uniforms = {
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
  const patternMats = PATTERNS.map((pat) => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WALLPAPER_VERTEX,
    fragmentShader: WALLPAPER_FRAGMENT_TEMPLATE.replace('__FIELD__', pat.glsl),
  }));
  const solidMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WALLPAPER_VERTEX,
    fragmentShader: WALLPAPER_SOLID_FRAGMENT,
  });
  return { uniforms, patternMats, solidMat };
}

/*
 * Procedural desk/table grain — long wandering streaks plus speckle, drawn once
 * on a canvas. Grayscale so the room palette can tint it via material.color.
 * Shared by the turntable's desk and the yunost's floor.
 */
export function makeDeskGrain() {
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
