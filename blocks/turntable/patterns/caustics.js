/* Swimming-pool caustics — a domain-warped accumulator whose troughs (where the
   warped sine/cosine sum collapses toward zero) are pushed back up into thin
   bright filaments, the way refracted sunlight nets the floor of a pool. Bass
   swells the spatial scale (the net looks like it's surging closer), mid adds
   a touch of shimmer, and treble sharpens the filaments into thinner, hotter
   threads. */
export default {
  name: 'caustics',
  glsl: /* glsl */`
    float field(vec2 p, float t) {
      float scale = uScale * (0.6 + uBass * 0.8);
      vec2 w = (p - vec2(1.07, 0.5)) * scale;
      float t2 = t * 0.5;

      float v = 0.0;
      for (int i = 0; i < 5; i++) {
        w += (0.4 + uMid * 0.3) * vec2(sin(w.y + t2 * 1.3), cos(w.x - t2));
        v += abs(sin(w.x) + cos(w.y));
        t2 += 0.35;
      }
      v *= 0.2;

      float sharp = mix(2.0, 6.0, uTreble);
      float bright = pow(max(0.0, 1.0 - v * 0.6), sharp);
      bright = min(1.0, bright * (1.0 + uMid * 0.15));

      return bright * 2.0 - 1.0;
    }
  `,
};
