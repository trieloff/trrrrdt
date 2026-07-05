/* Liquid stripes — vertical bands warped by a sine of the vertical axis, so the
   whole field wobbles like tape stretched over a capstan. Bass widens the warp. */
export default {
  name: 'wave',
  glsl: /* glsl */`
    float field(vec2 p, float t) {
      float x = p.x * uScale + sin(p.y * 2.5 + t) * (0.35 + uBass * 1.2);
      return sin(x * 6.2831);
    }
  `,
};
