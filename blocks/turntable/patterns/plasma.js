/* Classic demoscene plasma — four superimposed sine fields (axis-aligned,
   diagonal, and radial) summed and re-wrapped. Bass shoves the diagonal term so
   the blobs surge on the beat. */
export default {
  name: 'plasma',
  glsl: /* glsl */`
    float field(vec2 p, float t) {
      float v = sin(p.x * uScale + t);
      v += sin((p.y * uScale + t) * 0.7);
      v += sin((p.x + p.y) * uScale * 0.6 + t * 1.3 + uBass * 3.0);
      v += sin(length(p - 0.5) * uScale * 1.5 - t);
      return sin(v * 1.5708);
    }
  `,
};
