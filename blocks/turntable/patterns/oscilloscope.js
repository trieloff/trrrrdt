/* CRT oscilloscope trace — three horizontal sine curves rendered as thin glowing
   lines on a dark screen. Bass swings the amplitude, mid scrolls the phase, and
   treble tightens the frequency and sharpens the line glow. */
export default {
  name: 'oscilloscope',
  glsl: /* glsl */`
    float scope_dist(vec2 p, float t, float freq, float amp, float centreY, float phase) {
      float y = centreY + amp * sin(p.x * freq + t + phase);
      return abs(p.y - y);
    }

    float field(vec2 p, float t) {
      float amp = 0.12 + uBass * 0.28;
      float freq = uScale * (1.3 + uTreble * 2.0);
      float scroll = t * (0.6 + uMid * 2.0);
      float lineWidth = 0.006 + uTreble * 0.01;

      float d1 = scope_dist(p, scroll, freq, amp, 0.5, 0.0);
      float d2 = scope_dist(p, scroll * 1.15, freq * 1.37, amp * 0.6, 0.3, 2.094);
      float d3 = scope_dist(p, scroll * 0.85, freq * 0.73, amp * 0.8, 0.72, 4.188);

      float core = max(smoothstep(lineWidth, 0.0, d1),
                   max(smoothstep(lineWidth, 0.0, d2),
                       smoothstep(lineWidth, 0.0, d3)));

      float glow = max(smoothstep(lineWidth * 5.0, 0.0, d1),
                   max(smoothstep(lineWidth * 5.0, 0.0, d2),
                       smoothstep(lineWidth * 5.0, 0.0, d3))) * 0.35;

      float trace = max(core, glow);

      float scan = sin(p.y * 180.0) * 0.015;

      return -1.0 + trace * 2.0 + scan;
    }
  `,
};
