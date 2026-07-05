/* Hypnotic infinite-zoom tunnel — polar remap around the vanishing point at
   the plane's centre. Depth is 1/radius so rings rush toward infinity there;
   bass accelerates the forward scroll, mid twists the tunnel's rotation, and
   treble adds a fast shimmer riding on the rings. */
export default {
  name: 'tunnel',
  glsl: /* glsl */`
    float field(vec2 p, float t) {
      vec2 tunnel_centre = vec2(1.07, 0.5);
      vec2 tunnel_d = p - tunnel_centre;
      float tunnel_radius = length(tunnel_d) + 0.001;
      float tunnel_angle = atan(tunnel_d.y, tunnel_d.x);

      // twist the tunnel with the mid band
      tunnel_angle += t * uMid * 0.6;

      // depth rushes toward infinity at the centre; bass accelerates the scroll
      float tunnel_depth = 1.0 / tunnel_radius;
      float tunnel_scroll = t * (1.0 + uBass * 2.5);
      float tunnel_rings = sin(tunnel_depth * uScale * 0.5 - tunnel_scroll * 3.0);

      // angular stripes, density scaled by uScale
      float tunnel_stripeCount = 8.0 + uScale;
      float tunnel_stripes = sin(tunnel_angle * tunnel_stripeCount);

      // treble shimmer riding on the rings
      float tunnel_shimmer = sin(tunnel_depth * uScale * 2.0 - tunnel_scroll * 6.0) * uTreble * 0.3;

      float v = tunnel_rings * 0.6 + tunnel_stripes * 0.4 + tunnel_shimmer;
      return clamp(v, -1.0, 1.0);
    }
  `,
};
