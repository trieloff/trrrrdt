/* Concentric rings radiating from a point right-of-centre — a stone dropped in a
   pond, or a speaker cone seen head-on. Rings travel outward with time and pump
   on the bass. */
export default {
  name: 'rings',
  glsl: /* glsl */`
    float field(vec2 p, float t) {
      float d = length(p - vec2(1.07, 0.5));
      return sin(d * uScale * 6.0 - t * 2.0 - uBass * 4.0);
    }
  `,
};
