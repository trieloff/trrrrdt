/* A honeycomb of hexagonal cells with a travelling brightness wave rolling
   across the lattice like a hex-shaped equalizer. Cells are found via exact
   axial hex-grid rounding (cube-coordinate method), and a faint hexagon SDF
   traces the cell edges so the honeycomb structure reads. Bass speeds up and
   pushes the wave phase, mid pumps its amplitude, and treble jitters
   individual cells via a per-cell hash re-seeded over time. */
export default {
  name: 'hexflow',
  glsl: /* glsl */`
    float hex_hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float hex_sdHexagon(vec2 p, float r) {
      vec3 k = vec3(-0.8660254, 0.5, 0.5773503);
      p = abs(p);
      p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
      p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
      return length(p) * sign(p.y);
    }

    // Nearest hex cell (pointy-top, unit circumradius) via cube rounding.
    // Returns axial (q, r) as a vec2 "cell id".
    vec2 hex_cellId(vec2 q) {
      float xf = 0.5773503 * q.x - 0.3333333 * q.y;
      float zf = 0.6666667 * q.y;
      float yf = -xf - zf;

      float rx = floor(xf + 0.5);
      float ry = floor(yf + 0.5);
      float rz = floor(zf + 0.5);

      float xd = abs(rx - xf);
      float yd = abs(ry - yf);
      float zd = abs(rz - zf);

      if (xd > yd && xd > zd) {
        rx = -ry - rz;
      } else if (yd > zd) {
        ry = -rx - rz;
      } else {
        rz = -rx - ry;
      }

      return vec2(rx, rz);
    }

    vec2 hex_cellCenter(vec2 id) {
      return vec2(1.7320508 * (id.x + id.y * 0.5), 1.5 * id.y);
    }

    float field(vec2 p, float t) {
      vec2 hp = p * uScale * 0.9;

      vec2 id = hex_cellId(hp);
      vec2 center = hex_cellCenter(id);
      vec2 local = hp - center;

      float edgeD = hex_sdHexagon(local, 1.0);
      float edge = 1.0 - smoothstep(0.0, 0.08 + uBass * 0.05, abs(edgeD));

      vec2 dir = normalize(vec2(1.0, 0.62));
      float speed = 1.0 + uBass * 3.0;
      float wave = sin(dot(id, dir) * 0.9 - t * speed - uBass * 2.5);
      wave *= 0.55 + 0.45 * uMid;

      float spark = hex_hash(id + floor(t * 2.2));
      wave += (spark - 0.5) * uTreble * 0.9;

      float v = mix(wave, 1.0, edge * 0.6);
      return clamp(v, -1.0, 1.0);
    }
  `,
};
