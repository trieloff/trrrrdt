/* Two counter-rotating checkerboard grids XOR'd together — the interference
   throws up moiré roses that crawl as the grids turn. Bass swells one grid so the
   beat pumps the pattern. Returns a hard 0/1 field, remapped to [-1, 1]. */
export default {
  name: 'moire',
  glsl: /* glsl */`
    float field(vec2 p, float t) {
      float a = t * 0.08;
      mat2 r1 = mat2(cos(a), -sin(a), sin(a), cos(a));
      mat2 r2 = mat2(cos(-a * 1.3), -sin(-a * 1.3), sin(-a * 1.3), cos(-a * 1.3));
      vec2 q1 = r1 * (p - 0.5) * (uScale * 2.0 + uBass * 3.0);
      vec2 q2 = r2 * (p - 0.5) * (uScale * 2.0);
      float c1 = step(0.0, sin(q1.x * 6.2831) * sin(q1.y * 6.2831));
      float c2 = step(0.0, sin(q2.x * 6.2831) * sin(q2.y * 6.2831));
      float m = c1 * (1.0 - c2) + c2 * (1.0 - c1);
      return m * 2.0 - 1.0;
    }
  `,
};
