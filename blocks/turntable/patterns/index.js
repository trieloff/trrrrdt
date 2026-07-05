/*
 * Visualizer pattern registry. Each entry is `{ name, glsl }` where glsl defines
 * `float field(vec2 p, float t)` — see README.md for the full contract. The
 * turntable compiles one shader per entry and the style hash picks
 * `index % patterns.length`, so appending here widens the variety automatically.
 */
import wave from './wave.js';
import rings from './rings.js';
import plasma from './plasma.js';
import moire from './moire.js';
import rays from './rays.js';
import voronoi from './voronoi.js';
import tunnel from './tunnel.js';
import kaleidoscope from './kaleidoscope.js';
import caustics from './caustics.js';
import oscilloscope from './oscilloscope.js';
import hexflow from './hexflow.js';

export default [
  wave, rings, plasma, moire, rays,
  voronoi, tunnel, kaleidoscope, caustics, oscilloscope, hexflow,
];
