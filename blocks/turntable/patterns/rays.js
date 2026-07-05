/* Angular rays fanning out of a point up-and-right — a lighthouse sweep or the
   spokes of a spinning record seen edge-on. The radial term bends the spokes;
   bass makes them churn. */
export default {
  name: 'rays',
  glsl: /* glsl */`
    float field(vec2 p, float t) {
      vec2 d = p - vec2(1.07, 0.42);
      float ang = atan(d.y, d.x);
      return sin(ang * uScale + t + uBass * 2.0 + length(d) * 3.0);
    }
  `,
};
