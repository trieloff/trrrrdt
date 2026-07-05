/* Organic Voronoi cells drifting like a lava lamp colony — each cell's seed
   point is jittered over time (treble nudges the jitter amount, mid nudges its
   speed), and the field returns the distance to the nearest cell EDGE so the
   borders read as glowing seams. Bass swells the overall cell scale so the
   whole colony breathes on the beat. */
export default {
  name: 'voronoi',
  glsl: /* glsl */`
    vec2 voronoi_hash2(vec2 p) {
      float n1 = dot(p, vec2(127.1, 311.7));
      float n2 = dot(p, vec2(269.5, 183.3));
      return fract(sin(vec2(n1, n2)) * 43758.5453123);
    }

    float field(vec2 p, float t) {
      float cellScale = uScale * 0.7 + uBass * 2.5;
      vec2 pp = p * cellScale;
      vec2 ip = floor(pp);
      vec2 fp = fract(pp);

      float jitterAmt = (0.55 + uTreble * 0.4) * 0.5;
      float wiggleSpeed = 0.35 + uMid * 0.4;

      vec2 mr = vec2(0.0);
      float md = 8.0;

      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = voronoi_hash2(ip + g);
          vec2 wiggle = vec2(
            sin(t * wiggleSpeed + o.x * 6.2831),
            cos(t * wiggleSpeed * 0.85 + o.y * 6.2831)
          ) * jitterAmt;
          vec2 r = g + o + wiggle - fp;
          float d = dot(r, r);
          if (d < md) {
            md = d;
            mr = r;
          }
        }
      }

      float edge = 8.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = voronoi_hash2(ip + g);
          vec2 wiggle = vec2(
            sin(t * wiggleSpeed + o.x * 6.2831),
            cos(t * wiggleSpeed * 0.85 + o.y * 6.2831)
          ) * jitterAmt;
          vec2 r = g + o + wiggle - fp;
          vec2 diff = r - mr;
          if (dot(diff, diff) > 0.0001) {
            float distToEdge = dot(0.5 * (mr + r), normalize(diff));
            edge = min(edge, distToEdge);
          }
        }
      }

      float glow = 1.0 - smoothstep(0.0, 0.4, edge);
      return glow * 2.0 - 1.0;
    }
  `,
};
