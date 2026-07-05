/* Six-fold mandala — the angle from centre is folded into a single repeating
   wedge (mirror-and-repeat, like a real kaleidoscope tube) and a small radial/
   angular sine field is sampled inside that wedge. Mid drives the rotation of
   the fold, bass pulses the radius for a zoom-pump on the beat, and treble
   adds a fast radial shimmer. */
export default {
  name: 'kaleidoscope',
  glsl: /* glsl */`
    const float KALEIDO_TAU = 6.2831853;

    float kaleido_wedge(vec2 d, float rot, float segments) {
      float angle = atan(d.y, d.x) + rot;
      float wedgeAngle = KALEIDO_TAU / segments;
      return abs(mod(angle, wedgeAngle) - wedgeAngle * 0.5);
    }

    float field(vec2 p, float t) {
      vec2 centre = vec2(1.07, 0.5);
      vec2 d = p - centre;

      float radius = length(d) * (1.0 + uBass * 0.6);
      float rot = t * (0.15 + uMid * 1.5);
      float angle = kaleido_wedge(d, rot, 6.0);

      vec2 fp = vec2(cos(angle), sin(angle)) * radius;

      float v = sin(radius * uScale * 3.0 - t * 1.4);
      v += sin(angle * 10.0 + t * 0.8) * 0.6;
      v += sin((fp.x + fp.y) * uScale * 2.0 + t) * 0.4;
      v += sin(radius * uScale * 8.0 - t * 3.0) * uTreble * 0.5;

      return clamp(v / 2.5, -1.0, 1.0);
    }
  `,
};
